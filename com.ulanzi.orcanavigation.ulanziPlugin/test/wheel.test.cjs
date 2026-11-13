const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createWheel } = require('../wheel.cjs');

test('wheel bursts share one helper, preserve directions, and cancel on disconnect', async () => {
  const children = []; const writes = [];
  const wheel = createWheel('/helper', (file, args, options) => {
    assert.equal(file, '/helper'); assert.deepEqual(args, ['wheel', 'stream']); assert.equal(options.shell, false);
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
    child.kill = () => { child.killed = true; };
    child.stdin.on('data', data => writes.push(data.toString()));
    children.push(child); return child;
  });
  const controller = new AbortController();
  const requests = ['previous', 'next', 'next'].map(direction => wheel(direction, controller.signal));
  assert.equal(children.length, 1); assert.deepEqual(writes, ['previous\n', 'next\n', 'next\n']);
  children[0].stdout.write('{"ok":true,"delivered":true}\n'.repeat(3));
  await Promise.all(requests);
  const pending = wheel('previous', controller.signal);
  controller.abort(); await assert.rejects(pending, /중단/); assert.equal(children[0].killed, true);
  await assert.rejects(wheel('next', controller.signal), /중단/);
  await assert.rejects(wheel('wrong'), /알 수 없는/);
  const restart = wheel('next');
  assert.equal(children.length, 2);
  children[1].stdout.write('{"ok":false,"error":"permission denied"}\n');
  await assert.rejects(restart, /permission denied/);
});

test('wheel is independent of navigation busy state', async () => {
  const { createNavigator } = require('../navigation.cjs');
  let finish; const directions = [];
  const navigate = createNavigator({ platform: 'darwin', nativePath: '/helper',
    invoke: async () => { await new Promise(resolve => { finish = resolve; }); return { stdout: '{"ok":true,"delivered":true}' }; },
    wheel: async direction => { directions.push(direction); return { delivered: true }; }
  });
  const tab = navigate('chat', 'next');
  await Promise.all(['previous','next','next'].map(direction => navigate('wheel', direction)));
  assert.deepEqual(directions, ['previous','next','next']); finish(); await tab;
});
