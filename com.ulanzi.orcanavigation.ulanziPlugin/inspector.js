'use strict';
const params = new URLSearchParams(location.search);
const t = createTranslator(params.get('language') || 'en');
const locale = String(params.get('language') || 'en').toLowerCase().split(/[-_]/)[0];
document.documentElement.lang = ({ ko: 'ko', en: 'en', zh: 'zh-CN', ja: 'ja' })[locale] || 'en';
for (const element of document.querySelectorAll('title, p, label, button, summary')) {
  element.textContent = t(element.textContent);
}
const cliInput = document.getElementById('cli');
cliInput.placeholder = t(cliInput.placeholder);
const status = document.getElementById('status');
const save = document.getElementById('save');
const field = document.getElementById('cli');
const address = params.get('address');
const port = params.get('port');
const route = Object.fromEntries(['uuid', 'actionid', 'key'].map(key => [key, params.get(key)]));
if (!['127.0.0.1', 'localhost', '::1'].includes(address) || !/^\d+$/.test(port || '') || +port < 1 || +port > 65535 || !route.uuid || !route.actionid) {
  status.textContent = t('Studio에서 이 동작의 설정을 다시 여세요.');
} else {
  const ws = new WebSocket(`ws://${address === '::1' ? '[::1]' : address}:${port}`);
  const send = message => ws.send(JSON.stringify(message));
  ws.onopen = () => {
    send({ code: 0, cmd: 'connected', ...route });
    send({ cmd: 'getSettings', ...route });
    save.disabled = false;
    status.textContent = t('연결됨. 저장한 설정을 읽는 중…');
  };
  ws.onmessage = ({ data }) => {
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (!event || typeof event !== 'object') return;
    if (event.actionid && event.actionid !== route.actionid) return;
    if (['add', 'paramfromapp', 'didReceiveSettings'].includes(event.cmd)) {
      const settings = event.settings || event.param || {};
      field.value = typeof settings.cliPath === 'string' ? settings.cliPath : '';
      status.textContent = t('저장된 설정을 불러왔습니다.');
    }
    if (event.cmd === 'setSettings' && event.code !== undefined) {
      status.textContent = t(event.code === 0 ? '저장 응답을 받았습니다. 재선택해 설정을 확인하세요.' : '설정을 저장하지 못했습니다.');
    }
  };
  save.onclick = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    send({ cmd: 'setSettings', ...route, settings: { cliPath: field.value.trim() } });
    status.textContent = t('저장 요청을 보냈습니다.');
  };
  ws.onerror = () => { status.textContent = t('Studio 연결 실패. 설정을 다시 여세요.'); };
  ws.onclose = () => { save.disabled = true; status.textContent = t('연결이 끊겼습니다. 설정을 다시 여세요.'); };
}
