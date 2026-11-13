const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { UUID, start } = require('../app.js');

test('reject invalid startup endpoints', () => {
  assert.throws(() => start('example.com', '3906'), /Local connection/);
  assert.throws(() => start('127.0.0.1', '70000'), /Local connection/);
});

test('Node main connects and acknowledges a Studio lifecycle message', { timeout: 5000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const connection = once(server, 'connection');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../app.js'), '127.0.0.1', String(server.address().port), 'ko_KR'], { stdio: 'ignore' });
  try {
    const [socket] = await connection;
    const [raw] = await once(socket, 'message');
    assert.deepEqual(JSON.parse(raw), { code: 0, cmd: 'connected', uuid: UUID });
    const response = once(socket, 'message');
    socket.send(JSON.stringify({ cmd: 'add', uuid: `${UUID}.chatDial`, actionid: 'test', key: '0_1', param: {} }));
    const [ack] = await response;
    assert.equal(JSON.parse(ack).cmd, 'add'); assert.equal(JSON.parse(ack).actionid, 'test');
  } finally {
    child.kill();
    await once(child, 'exit');
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  }
});

test('main reconnects, registers again, and discards old connection instances', { timeout: 7000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const connection = once(server, 'connection');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../app.js'), '127.0.0.1', String(server.address().port)], { stdio: 'ignore' });
  try {
    const [first] = await connection; await once(first, 'message');
    const added = once(first, 'message');
    first.send(JSON.stringify({ cmd: 'add', uuid: `${UUID}.chatDial`, actionid: 'old', key: '0_1' }));
    await added;
    const next = once(server, 'connection'); first.close();
    const [second] = await next;
    const [registered] = await once(second, 'message');
    assert.deepEqual(JSON.parse(registered), { code: 0, cmd: 'connected', uuid: UUID });
    const replies = [];
    second.on('message', data => replies.push(JSON.parse(data)));
    second.send('not json');
    second.send(JSON.stringify({ cmd: 'setactive', uuid: `${UUID}.chatDial`, actionid: 'old', active: false }));
    const ack = once(second, 'message');
    second.send(JSON.stringify({ cmd: 'add', uuid: `${UUID}.chatDial`, actionid: 'new', key: '0_1' }));
    await ack;
    // The add round trip follows malformed and stale messages in WebSocket order.
    assert.deepEqual(replies.map(x => [x.cmd, x.actionid]), [['add', 'new']]);
  } finally {
    child.kill(); await once(child, 'exit');
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  }
});
