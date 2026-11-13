const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../inspector.js'), 'utf8');
function inspector(search = '?address=127.0.0.1&port=3906&uuid=com.potaler.orca.navigation.chatDial&actionid=one&key=0_1&language=ko-KR') {
  const elements = { status: { textContent: '' }, save: { disabled: true }, cli: { value: '', placeholder: 'Windows·Intel Mac용 CLI 경로' } };
  const sockets = [];
  class WebSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
  }
  const document = { documentElement: {}, getElementById: id => elements[id],
    querySelectorAll: () => [elements.save, elements.status] };
  elements.save.textContent = '저장'; elements.status.textContent = 'Studio 연결 중…';
  const context = vm.createContext({ URLSearchParams, location: { search }, document, WebSocket });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../i18n.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return { elements, sockets, message: value => sockets[0].onmessage({ data: JSON.stringify(value) }) };
}

test('inspector reads and saves only its own action settings', () => {
  const { elements, sockets: [socket], message } = inspector();
  socket.onopen();
  assert.deepEqual(socket.sent.map(x => x.cmd), ['connected', 'getSettings']);
  assert.equal(elements.save.disabled, false);
  message({ cmd: 'paramfromapp', actionid: 'other', param: { cliPath: '/wrong.js' } });
  assert.equal(elements.cli.value, '');
  message({ cmd: 'paramfromapp', actionid: 'one', param: { cliPath: 'C:\\Orca 한국어\\index.js' } });
  assert.equal(elements.cli.value, 'C:\\Orca 한국어\\index.js');
  elements.cli.value = ' /new.js '; elements.save.onclick();
  assert.deepEqual(socket.sent.at(-1), { cmd: 'setSettings', uuid: 'com.potaler.orca.navigation.chatDial', actionid: 'one', key: '0_1', settings: { cliPath: '/new.js' } });
  message({ cmd: 'setSettings', actionid: 'one', code: 0 });
  assert.match(elements.status.textContent, /재선택/);
});

test('inspector survives malformed messages and disables saving after disconnect', () => {
  const { elements, sockets: [socket], message } = inspector();
  socket.onopen();
  assert.doesNotThrow(() => socket.onmessage({ data: 'not json' }));
  for (const value of [null, 7, 'message']) assert.doesNotThrow(() => message(value));
  message({ cmd: 'setSettings', code: 1 }); assert.match(elements.status.textContent, /못했습니다/);
  socket.onerror(); assert.match(elements.status.textContent, /실패/);
  socket.readyState = 3; socket.onclose();
  assert.equal(elements.save.disabled, true);
  const count = socket.sent.length; elements.save.onclick(); assert.equal(socket.sent.length, count);
});

test('inspector rejects missing routing and non-local endpoints before connecting', () => {
  for (const search of ['', '?address=example.com&port=3906&uuid=x&actionid=y', '?address=127.0.0.1&port=70000&uuid=x&actionid=y']) {
    const { elements, sockets } = inspector(search);
    assert.equal(sockets.length, 0); assert.equal(elements.save.disabled, true);
  }
});


test('inspector follows Studio language for labels, status and save errors', () => {
  for (const [language, saveLabel, loaded, error] of [
    ['ko-KR', '저장', '저장된 설정을 불러왔습니다.', '설정을 저장하지 못했습니다.'],
    ['en-US', 'Save', 'Saved settings loaded.', 'Could not save settings.'],
    ['zh-CN', '保存', '已加载保存的设置。', '无法保存设置。'],
    ['ja-JP', '保存', '保存済みの設定を読み込みました。', '設定を保存できませんでした。'],
    ['fr-FR', 'Save', 'Saved settings loaded.', 'Could not save settings.']
  ]) {
    const { elements, sockets: [socket], message } = inspector(`?address=localhost&port=3906&uuid=x&actionid=one&language=${language}`);
    assert.equal(elements.save.textContent, saveLabel);
    socket.onopen();
    message({ cmd: 'didReceiveSettings', settings: {} });
    assert.equal(elements.status.textContent, loaded);
    message({ cmd: 'setSettings', code: 1 });
    assert.equal(elements.status.textContent, error);
  }
});
