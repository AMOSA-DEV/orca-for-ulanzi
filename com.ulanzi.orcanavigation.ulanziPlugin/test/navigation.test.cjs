const test = require('node:test');
const assert = require('node:assert/strict');
const { createNavigator, createWinSession } = require('../navigation.cjs');

function harness(overrides = {}) {
  const calls = [];
  const invoke = async (file, args, options) => {
    calls.push({ file, args, options });
    let result;
    if (args.includes('list-windows')) result = { windows: [{ id: 42 }] };
    else if (args.includes('get-app-state')) result = { snapshot: { treeText: '12 container 대화' } };
    else if (args.includes('hotkey')) result = { snapshot: { focusedElementId: 7, treeText: '7 메뉴 항목, Value: 선택되지 않음' } };
    else result = {};
    if (overrides.result) result = overrides.result(args, result);
    return { stdout: JSON.stringify({ ok: true, result }) };
  };
  return { calls, navigate: createNavigator({ nativePath: null, winNativePath: null, platform: 'darwin', ...overrides, invoke: overrides.invoke || invoke }) };
}

test('Mac direct input runs one helper without CLI or screen queries', async () => {
  const calls = [];
  const navigate = createNavigator({ platform: 'darwin', nativePath: '/plugin/native/mac-navigation',
    invoke: async (...args) => { calls.push(args); return { stdout: '{"ok":true,"delivered":true}' }; } });
  await navigate('workspace', 'next'); await navigate('chat', 'previous');
  assert.deepEqual(calls.map(c => c[1]), [['workspace', 'next'], ['chat', 'previous']]);
  assert.ok(calls.every(c => c[0] === '/plugin/native/mac-navigation' && c[2].shell === false));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(navigate('workspace', 'next', {}, controller.signal), /중단/);
  assert.equal(calls.length, 2);
  const failed = createNavigator({ platform: 'darwin', nativePath: '/helper', invoke: async () => ({ stdout: '{"ok":false,"error":"failed"}' }) });
  await assert.rejects(failed('chat', 'next'), /failed/);
  const denied = createNavigator({ platform: 'darwin', nativePath: '/helper', invoke: async () => {
    throw Object.assign(new Error('exit 1'), { stdout: '{"ok":false,"error":"키 입력 권한 필요"}' });
  } });
  await assert.rejects(denied('workspace', 'next'), /키 입력 권한 필요/);
});

test('workspace move refocuses before each arrow; no shell or screenshots', async () => {
  const { navigate, calls } = harness();
  await navigate('workspace', 'previous'); await navigate('workspace', 'next');
  const input = calls.filter(x => x.args.includes('hotkey') || x.args.includes('press-key'));
  assert.deepEqual(input.map(x => x.args[x.args.indexOf('--key') + 1]), ['Cmd+Shift+0', 'Up', 'Cmd+Shift+0', 'Down']);
  for (const c of input) { assert.equal(c.options.shell, false); assert.ok(c.args.includes('--window-id')); assert.ok(c.args.includes('--no-screenshot')); }
  assert.equal(calls.length, 6);
  assert.ok(calls.every(c => !c.args.includes('--restore-window')));
});

test('background focus is re-read once before an arrow; hidden Mac windows are restored', async () => {
  const { navigate, calls } = harness({ result: (args, result) => {
    if (args.includes('hotkey')) return { snapshot: { focusedElementId: 4, treeText: '4 text field composer' } };
    if (args.includes('get-app-state')) return { snapshot: { focusedElementId: 7, treeText: '7 menu item workspace' } };
    return result;
  } });
  await navigate('workspace', 'next');
  assert.deepEqual(calls.map(c => c.args[2]), ['list-windows', 'hotkey', 'get-app-state', 'press-key']);
  const hidden = harness({ result: (args, result) => args.includes('list-windows') ? { windows: [{ id: 42, isMinimized: true }] } : result });
  await hidden.navigate('workspace', 'next');
  assert.ok(hidden.calls.filter(c => c.args.includes('--key')).every(c => c.args.includes('--restore-window')));
});

test('tab navigation uses Shift brackets without querying the active tab type', async () => {
  const { navigate, calls } = harness();
  await navigate('chat', 'next');
  assert.ok(calls.at(-1).args.includes('Cmd+Shift+]'));
  assert.equal(calls.length, 2);
  assert.ok(!calls.some(c => c.args.includes('get-app-state')));
});

test('unknown focus or multiple windows never sends an arrow', async () => {
  for (const change of [
    (args, result) => args.includes('hotkey') ? { snapshot: { focusedElementId: 4, treeText: '4 text field composer' } } : result,
    (args, result) => args.includes('list-windows') ? { windows: [{ id: 1 }, { id: 2 }] } : result
  ]) {
    const { navigate, calls } = harness({ result: change });
    await assert.rejects(navigate('workspace', 'next'));
    assert.ok(!calls.some(x => x.args.includes('press-key')));
  }
});

test('Windows uses Ctrl and preserves a path with spaces as one argument', async () => {
  const { navigate, calls } = harness({ platform: 'win32' });
  const cliPath = 'C:\\Program Files\\Orca 한국어\\out\\cli\\index.js';
  await navigate('workspace', 'next', { cliPath });
  assert.ok(calls.every(x => x.args[0] === cliPath));
  assert.ok(calls.some(x => x.args.includes('Ctrl+Shift+0')));
  assert.ok(calls.filter(c => c.args.includes('--key')).every(c => c.args.includes('--restore-window')));
  await assert.rejects(navigate('workspace', 'next', { cliPath: 'C:\\orca.cmd' }), /index.js/);
  await assert.rejects(navigate('workspace', 'next'), /절대 경로/);
});

test('busy inputs are rejected rather than replayed later', async () => {
  let release;
  const navigate = createNavigator({ platform: 'darwin', nativePath: null, invoke: () => new Promise(resolve => { release = resolve; }) });
  const pending = navigate('workspace', 'next');
  await assert.rejects(navigate('workspace', 'previous'), /처리 중/);
  release({ stdout: '{"ok":false,"error":{"code":"app_not_found"}}' });
  await assert.rejects(pending, /app_not_found/);
});

test('disconnect aborts before directional input, errors do not retry', async () => {
  const controller = new AbortController();
  const { navigate, calls } = harness({ result: (args, result) => {
    if (args.includes('hotkey')) controller.abort(); return result;
  } });
  await assert.rejects(navigate('workspace', 'next', {}, controller.signal), /연결이 끊겨/);
  assert.ok(!calls.some(x => x.args.includes('press-key')));
  const invalid = harness({ invoke: async () => ({ stdout: 'not json' }) });
  await assert.rejects(invalid.navigate('workspace', 'next'), /응답/);
});

test('launch opens Orca without navigation queries, rejects invalid pairs and propagates cancellation', async () => {
  const calls = [];
  const navigate = createNavigator({ platform: 'darwin', invoke: async (...args) => { calls.push(args); return { stdout: '' }; } });
  await navigate('app', 'open');
  assert.deepEqual(calls.map(c => c.slice(0,2)), [['/usr/bin/open', ['-b', 'com.stablyai.orca']]]);
  assert.equal(calls[0][2].shell, false);
  await assert.rejects(navigate('app', 'next'), /알 수 없는/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(navigate('app', 'open', {}, controller.signal), /중단/);
  assert.equal(calls.length, 1);
  const failed = createNavigator({ platform: 'darwin', invoke: async () => { throw new Error('launch failed'); } });
  await assert.rejects(failed('app', 'open'), /launch failed/);
  await assert.rejects(failed('app', 'open'), /launch failed/);
  const windows = harness({ platform: 'win32' });
  await windows.navigate('app', 'open', { cliPath: 'C:\\Orca\\index.js' });
  assert.deepEqual(windows.calls[0].args, ['C:\\Orca\\index.js', 'open', '--json']);
  assert.equal(windows.calls.length, 1);
});

test('shortcut actions use one native call and reject unknown names before invocation', async () => {
  const calls = [];
  const navigate = createNavigator({ platform: 'darwin', nativePath: '/helper', invoke: async (_file, args) => {
    calls.push(args); return { stdout: '{"ok":true,"delivered":true}' };
  } });
  for (const name of ['leftPanel', 'rightPanel', 'confirm', 'cancel', 'dictation', 'newAgent']) await navigate('shortcut', name);
  assert.deepEqual(calls, ['leftPanel','rightPanel','confirm','cancel','dictation','newAgent'].map(name => ['shortcut',name]));
  await assert.rejects(navigate('shortcut', 'arbitrary'), /알 수 없는/);
  assert.equal(calls.length, 6);
});

test('CLI shortcuts preserve bare Enter/Escape and platform chords without extra focus keys', async () => {
  for (const platform of ['darwin', 'win32']) {
    const { navigate, calls } = harness({ platform });
    const settings = platform === 'win32' ? { cliPath: 'C:\\Orca\\index.js' } : {};
    for (const name of ['confirm','cancel','leftPanel','rightPanel','dictation']) await navigate('shortcut', name, settings);
    const mod = platform === 'darwin' ? 'Cmd' : 'Ctrl';
    assert.deepEqual(calls.filter(c => c.args.includes('--key')).map(c => c.args[c.args.indexOf('--key')+1]),
      ['Return','Escape',`${mod}+B`,`${mod}+L`,`${mod}+E`]);
    assert.ok(!calls.some(c => c.args.includes('get-app-state')));
    if (platform === 'win32') {
      const before = calls.length;
      await assert.rejects(navigate('shortcut', 'newAgent', settings), /macOS/);
      assert.equal(calls.length, before);
    } else {
      await navigate('shortcut', 'newAgent');
      assert.ok(calls.at(-1).args.includes('Cmd+Alt+T'));
    }
  }
});


test('wheel uses native directions or Windows wheel helper without querying Orca', async () => {
  for (const platform of ['darwin', 'win32']) {
    const calls = [];
    const navigate = createNavigator({ platform, nativePath: platform === 'darwin' ? '/helper' : null,
      wheel: async (direction, signal) => {
        if (signal?.aborted) throw new Error('중단');
        calls.push(['/helper', ['wheel', direction]]); return { delivered: true };
      },
      invoke: async (...args) => { calls.push(args); return { stdout: '{"ok":true,"delivered":true}' }; } });
    await navigate('wheel', 'previous'); await navigate('wheel', 'next');
    assert.equal(calls.length, 2);
    if (platform === 'darwin') assert.deepEqual(calls.map(c => c[1]), [['wheel','previous'],['wheel','next']]);
    else {
      assert.ok(calls.every(c => c[0] === 'powershell.exe' && c[1].includes('-NoProfile') && c[2].shell === false));
      assert.deepEqual(calls.map(c => c[1].at(-1)), ['up','down']);
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(navigate('wheel','next',{},controller.signal), /중단/);
    await assert.rejects(navigate('wheel','invalid'), /알 수 없는/);
    assert.equal(calls.length, 2);
  }
  const intel = createNavigator({ platform: 'darwin', nativePath: null });
  await assert.rejects(intel('wheel', 'next'), /Apple Silicon/);
});

test('Windows direct input runs one native helper without CLI or screen queries', async () => {
  const calls = [];
  const navigate = createNavigator({ platform: 'win32', winNativePath: 'C:\plugin\native\windows-navigation.exe',
    invoke: async (...args) => { calls.push(args); return { stdout: '{"ok":true,"delivered":true}' }; } });
  await navigate('shortcut', 'cancel'); await navigate('workspace', 'next'); await navigate('chat', 'previous'); await navigate('app', 'open'); await navigate('pane', 'next');
  assert.deepEqual(calls.map(c => c[1]), [['shortcut', 'cancel'], ['workspace', 'next'], ['chat', 'previous'], ['app', 'open'], ['pane', 'next']]);
  assert.ok(calls.every(c => c[0] === 'C:\plugin\native\windows-navigation.exe' && c[2].shell === false));
  await navigate('shortcut', 'newAgent'); await navigate('shortcut', 'closePane');
  assert.deepEqual(calls.slice(-2).map(c => c[1]), [['shortcut', 'newAgent'], ['shortcut', 'closePane']]);
  const failed = createNavigator({ platform: 'win32', winNativePath: 'x.exe', invoke: async () => {
    throw Object.assign(new Error('exit 1'), { stdout: '{"ok":false,"error":"Orca를 활성화하지 못했습니다."}' });
  } });
  await assert.rejects(failed('chat', 'next'), /활성화/);
});

test('split pane navigation is Windows-only', async () => {
  const mac = createNavigator({ platform: 'darwin', nativePath: '/helper', invoke: async () => ({ stdout: '{"ok":true,"delivered":true}' }) });
  await assert.rejects(mac('pane', 'next'), /Windows/);
});

test('resident Windows helper answers many commands over one process and recovers from a crash', async () => {
  const { EventEmitter } = require('node:events');
  const spawned = [];
  const fakeSpawn = () => {
    const c = new EventEmitter();
    c.exitCode = null; c.killed = false; c.kill = () => { c.killed = true; };
    c.stdout = new EventEmitter(); c.stdout.setEncoding = () => {};
    c.stdin = new EventEmitter();
    c.stdin.write = (line) => { c.lines = [...(c.lines || []), line.trim()];
      setImmediate(() => c.stdout.emit('data', '{"ok":true,"delivered":true}\n')); };
    spawned.push(c); return c;
  };
  const request = createWinSession('x.exe', fakeSpawn, 200);
  const navigate = createNavigator({ platform: 'win32', winNativePath: 'x.exe', winSession: request, invoke: async () => { throw new Error('unused'); } });
  await navigate('shortcut', 'cancel'); await navigate('chat', 'next'); await navigate('wheel', 'next');
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].lines, ['shortcut cancel', 'chat next', 'wheel next']);
  spawned[0].exitCode = 1; spawned[0].emit('exit');
  await navigate('pane', 'previous');
  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned[1].lines, ['pane previous']);
});
