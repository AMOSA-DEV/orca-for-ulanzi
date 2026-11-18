'use strict';
const WebSocket = require('ws');
const { createTranslator } = require('./i18n.js');
const { createNavigator } = require('./navigation.cjs');
const UUID = 'com.potaler.orca.navigation';
const actions = {
  launch: ['app', 'open'],
  leftPanel: ['shortcut', 'leftPanel'], rightPanel: ['shortcut', 'rightPanel'],
  confirm: ['shortcut', 'confirm'], cancel: ['shortcut', 'cancel'],
  dictation: ['shortcut', 'dictation'], newAgent: ['shortcut', 'newAgent'],
  workspacePrevious: ['workspace', 'previous'], workspaceNext: ['workspace', 'next'],
  // Existing chat UUIDs remain stable so saved device assignments survive all-tab navigation.
  chatPrevious: ['chat', 'previous'], chatNext: ['chat', 'next'],
  panePrevious: ['pane', 'previous'], paneNext: ['pane', 'next'], closePane: ['shortcut', 'closePane'],
  workspaceDial: ['workspace'], chatDial: ['chat'], paneDial: ['pane'], wheelDial: ['wheel']
};

function createHandler(send, navigate = createNavigator(), signal, language = 'en') {
  const t = createTranslator(language);
  const instances = new Map();
  return async function receive(event) {
    if (!event || typeof event !== 'object') return;
    if (event.cmd === 'clear') {
      for (const item of Array.isArray(event.param) ? event.param : []) {
        if (!item || typeof item.actionid !== 'string') continue;
        instances.get(item.actionid)?.controller.abort();
        instances.delete(item.actionid);
      }
      send({ cmd: 'clear', code: 0, param: event.param });
      return;
    }
    if (typeof event.uuid !== 'string') return;
    const action = actions[event.uuid?.replace(`${UUID}.`, '')];
    if (!action || !event.uuid.startsWith(`${UUID}.`) || typeof event.actionid !== 'string' || !event.actionid) return;
    if (['add', 'paramfromapp', 'didReceiveSettings'].includes(event.cmd)) {
      const old = instances.get(event.actionid);
      instances.set(event.actionid, { uuid: event.uuid, active: old?.active ?? true,
        settings: event.settings || event.param || {}, lastPress: old?.lastPress || 0,
        controller: old?.controller || new AbortController() });
      if (event.cmd !== 'didReceiveSettings') send({ cmd: event.cmd, code: 0, uuid: event.uuid, actionid: event.actionid, key: event.key, param: {} });
      return;
    }
    const instance = instances.get(event.actionid);
    if (!instance || instance.uuid !== event.uuid) return;
    if (event.cmd === 'setactive') {
      instance.active = event.active === true;
      if (!instance.active) instance.controller.abort();
      else if (instance.controller.signal.aborted) instance.controller = new AbortController();
      send({ cmd: 'setactive', code: 0, uuid: event.uuid, actionid: event.actionid, key: event.key, active: instance.active });
      return;
    }
    if (!instance.active) return;
    let direction = action[1];
    if (event.cmd === 'dialrotate' && action.length === 1) {
      if (!['left', 'right'].includes(event.rotateEvent)) return;
      direction = event.rotateEvent === 'left' ? 'previous' : 'next';
    } else if (['keydown', 'run'].includes(event.cmd) && action.length === 2) {
      const now = Date.now();
      if (now - instance.lastPress < 200) return;
      instance.lastPress = now;
    } else return;
    try {
      await navigate(action[0], direction, instance.settings,
        AbortSignal.any([signal, instance.controller.signal].filter(Boolean)));
      if (instances.get(event.actionid) === instance && instance.active) {
        send({ cmd: event.cmd, code: 0, uuid: event.uuid, actionid: event.actionid, key: event.key, param: {} });
      }
    }
    catch (error) {
      if (instances.get(event.actionid) !== instance || !instance.active) return;
      send({ cmd: 'showAlert', uuid: event.uuid, actionid: event.actionid, key: event.key });
      send({ cmd: 'toast', msg: t(error.message) });
    }
  };
}

function start(address, port, language = 'en') {
  const t = createTranslator(language);
  if (!['127.0.0.1', 'localhost', '::1'].includes(address) || !/^\d+$/.test(port || '') || +port < 1 || +port > 65535) {
    throw new Error(t('Studio에서 전달한 로컬 연결 정보가 필요합니다.'));
  }
  let socket;
  const navigate = createNavigator();
  function connect() {
    socket = new WebSocket(`ws://${address === '::1' ? '[::1]' : address}:${port}`);
    const connection = socket;
    const controller = new AbortController();
    const send = message => { if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify(message)); };
    const receive = createHandler(send, navigate, controller.signal, language);
    socket.on('open', () => send({ code: 0, cmd: 'connected', uuid: UUID }));
    socket.on('message', data => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      receive(event).catch(() => send({ cmd: 'toast', msg: t('입력 처리 실패. 다시 시도하세요.') }));
    });
    socket.on('error', () => {});
    socket.on('close', () => { controller.abort(); setTimeout(connect, 1500); });
  }
  connect();
}

if (require.main === module) start(process.argv[2], process.argv[3], process.argv[4]);
module.exports = { createHandler, start, UUID, actions };
