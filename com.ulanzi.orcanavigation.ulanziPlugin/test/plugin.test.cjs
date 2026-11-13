const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHandler, UUID, actions } = require('../app.js');

function event(cmd, name = 'workspacePrevious', extra = {}) {
  return { cmd, uuid: `${UUID}.${name}`, actionid: 'instance-1', key: '0_1', ...extra };
}
test('press/release and legacy duplicate execute only once', async () => {
  const moves = []; const receive = createHandler(() => {}, async (...args) => moves.push(args));
  await receive(event('add', undefined, { param: { cliPath: '/tmp/orca.js' } }));
  await receive(event('keydown')); await receive(event('keyup')); await receive(event('run'));
  assert.equal(moves.length, 1); assert.deepEqual(moves[0].slice(0, 3), ['workspace', 'previous', { cliPath: '/tmp/orca.js' }]);
});
test('rotation maps each scope; press and held rotation do nothing', async () => {
  for (const name of ['workspaceDial', 'chatDial', 'wheelDial']) {
    const moves = []; const receive = createHandler(() => {}, async (...args) => moves.push(args));
    await receive(event('add', name));
    for (const rotateEvent of ['left', 'right', 'hold-left', 'hold—right']) await receive(event('dialrotate', name, { rotateEvent }));
    await receive(event('dialdown', name));
    assert.deepEqual(moves.map(x => x.slice(0, 2)), [[actions[name][0], 'previous'], [actions[name][0], 'next']]);
  }
});
test('inactive, removed, unknown and malformed instances do not execute', async () => {
  const moves = []; const receive = createHandler(() => {}, async (...args) => moves.push(args));
  await receive(event('add')); await receive(event('setactive', undefined, { active: false }));
  await receive(event('keydown')); await receive({ cmd: 'clear', param: [{ actionid: 'instance-1' }] });
  await receive(event('keydown')); await receive(event('keydown', 'unknown')); await receive({ cmd: 'run', uuid: 10 });
  assert.equal(moves.length, 0);
});
test('navigation failure produces alert without claiming success', async () => {
  const sent = []; const receive = createHandler(x => sent.push(x), async () => { throw new Error('대상 없음'); });
  await receive(event('add')); sent.length = 0; await receive(event('keydown'));
  assert.deepEqual(sent.map(x => x.cmd), ['showAlert', 'toast']); assert.equal(sent[1].msg, '대상 없음');
});
test('removing an instance cancels its pending operation', async () => {
  let signal; let finish;
  const receive = createHandler(() => {}, async (_scope, _direction, _settings, cancel) => {
    signal = cancel; await new Promise(resolve => { finish = resolve; });
  });
  await receive(event('add')); const pending = receive(event('keydown'));
  await receive({ cmd: 'clear', param: [{ actionid: 'instance-1' }] });
  assert.equal(signal.aborted, true); finish(); await pending;
});
test('manifest actions and shipped entrypoints/assets agree', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.UUID, UUID); assert.equal(manifest.Actions.length, Object.keys(actions).length);
  for (const file of [manifest.CodePath, manifest.Icon, 'inspector.html', 'inspector.js']) assert.ok(fs.existsSync(path.join(root, file)));
  for (const action of manifest.Actions) {
    assert.ok(actions[action.UUID.slice(UUID.length + 1)]); assert.ok(action.States.length >= 1 && action.States.length <= 2);
    for (const file of [action.Icon, ...action.States.map(x => x.Image)]) assert.ok(fs.existsSync(path.join(root, file)));
  }
});

test('deactivation cancels a move; reactivation uses a fresh signal without replay', async () => {
  const signals = []; const sent = []; let finish;
  const receive = createHandler(x => sent.push(x), async (_scope, _direction, _settings, signal) => {
    signals.push(signal);
    if (signals.length === 1) await new Promise(resolve => { finish = resolve; });
  });
  await receive(event('add', 'chatDial'));
  const pending = receive(event('dialrotate', 'chatDial', { rotateEvent: 'left' }));
  await receive(event('setactive', 'chatDial', { active: false }));
  assert.equal(signals[0].aborted, true);
  sent.length = 0; finish(); await pending;
  assert.deepEqual(sent, []);
  await receive(event('setactive', 'chatDial', { active: true }));
  await receive(event('dialrotate', 'chatDial', { rotateEvent: 'right' }));
  assert.equal(signals.length, 2); assert.equal(signals[1].aborted, false);
});

test('settings updates apply to the next move and remain isolated by action instance', async () => {
  const moves = []; const receive = createHandler(() => {}, async (...args) => moves.push(args));
  await receive(event('add', 'chatDial', { param: { cliPath: '/old.js' } }));
  await receive(event('add', 'chatDial', { actionid: 'other', param: { cliPath: '/other.js' } }));
  await receive(event('paramfromapp', 'chatDial', { param: { cliPath: '/new.js' } }));
  await receive(event('dialrotate', 'chatDial', { rotateEvent: 'left' }));
  await receive(event('dialrotate', 'chatDial', { actionid: 'other', rotateEvent: 'right' }));
  assert.deepEqual(moves.map(x => x[2].cliPath), ['/new.js', '/other.js']);
});

test('connection cancellation reaches in-flight navigation', async () => {
  const connection = new AbortController(); let signal; let finish;
  const receive = createHandler(() => {}, async (_s, _d, _settings, cancel) => {
    signal = cancel; await new Promise(resolve => { finish = resolve; });
  }, connection.signal);
  await receive(event('add', 'chatDial'));
  const pending = receive(event('dialrotate', 'chatDial', { rotateEvent: 'right' }));
  connection.abort(); assert.equal(signal.aborted, true);
  finish(); await pending;
});

test('a burst across two dials executes one move and never replays discarded rotations', async () => {
  const { createNavigator } = require('../navigation.cjs');
  let release; const commands = []; const sent = [];
  const navigate = createNavigator({ nativePath: null, platform: 'darwin', invoke: async (_file, args) => {
    commands.push(args);
    if (args.includes('list-windows')) {
      if (commands.length === 1) await new Promise(resolve => { release = resolve; });
      return { stdout: JSON.stringify({ ok: true, result: { windows: [{ id: 42 }] } }) };
    }
    return { stdout: JSON.stringify({ ok: true, result: { snapshot: { treeText: '12 container 대화' } } }) };
  } });
  const receive = createHandler(x => sent.push(x), navigate);
  await receive(event('add', 'chatDial'));
  await receive(event('add', 'chatDial', { actionid: 'other' }));
  const first = receive(event('dialrotate', 'chatDial', { rotateEvent: 'right' }));
  await Promise.all(Array.from({ length: 40 }, (_, i) => receive(event('dialrotate', 'chatDial', {
    actionid: i % 2 ? 'other' : 'instance-1', rotateEvent: i % 2 ? 'left' : 'right'
  }))));
  assert.equal(commands.length, 1);
  release(); await first; await new Promise(resolve => setImmediate(resolve));
  assert.equal(commands.filter(x => x.includes('hotkey')).length, 1);
  assert.equal(sent.filter(x => x.cmd === 'toast').length, 40);
  await receive(event('dialrotate', 'chatDial', { rotateEvent: 'left' }));
  assert.equal(commands.filter(x => x.includes('hotkey')).length, 2);
});

test('malformed clear entries do not prevent removal of a valid instance', async () => {
  const moves = []; const receive = createHandler(() => {}, async (...args) => moves.push(args));
  await receive(event('add', 'chatDial'));
  await receive({ cmd: 'clear', param: [null, 7, {}, { actionid: 'instance-1' }] });
  await receive(event('dialrotate', 'chatDial', { rotateEvent: 'left' }));
  assert.equal(moves.length, 0);
});

test('new keypad shortcuts route once per press, preserve settings, and ignore dial events', async () => {
  for (const name of ['leftPanel','rightPanel','confirm','cancel','dictation','newAgent']) {
    const calls = []; const receive = createHandler(() => {}, async (...args) => calls.push(args));
    await receive(event('add',name,{param:{cliPath:'/orca.js'}}));
    await receive(event('keydown',name)); await receive(event('keyup',name));
    await receive(event('run',name)); await receive(event('dialrotate',name,{rotateEvent:'left'}));
    assert.deepEqual(calls.map(c => c.slice(0,3)), [['shortcut',name,{cliPath:'/orca.js'}]]);
  }
});
