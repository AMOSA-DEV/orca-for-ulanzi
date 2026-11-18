'use strict';
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);
const { createWheel } = require('./wheel.cjs');

const SHORTCUTS = { leftPanel: 'B', rightPanel: 'L', confirm: 'Return', cancel: 'Escape', dictation: 'E', newAgent: 'Alt+T', closePane: 'W' };

const MAC_CLI = '/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/index.js';

// Resident Windows helper. Starting a process costs 1s+ on machines with endpoint scanners, so one
// `windows-navigation.exe serve` stays alive and answers "scope direction" lines one at a time.
function createWinSession(exe, spawnFn = spawn, timeoutMs = 5000) {
  let child = null;
  let queue = Promise.resolve();
  function ensure() {
    if (child && !child.killed && child.exitCode === null) return child;
    const c = spawnFn(exe, ['serve'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    c.pending = null;
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const waiting = c.pending;
        c.pending = null;
        if (waiting) waiting.resolve(line);
      }
    });
    const fail = () => { const waiting = c.pending; c.pending = null; if (child === c) child = null; if (waiting) waiting.reject(new Error('helper exited')); };
    c.on('exit', fail);
    c.on('error', fail);
    c.stdin.on('error', () => {});
    child = c;
    return c;
  }
  return function request(command, signal) {
    const run = () => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('aborted'));
      const c = ensure();
      const timer = setTimeout(() => { c.pending = null; if (child === c) child = null; c.kill(); reject(new Error('timeout')); }, timeoutMs);
      c.pending = { resolve: (line) => { clearTimeout(timer); resolve(line); }, reject: (error) => { clearTimeout(timer); reject(error); } };
      c.stdin.write(command + '\n');
    });
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  };
}

function createNavigator({ platform = process.platform, invoke = execute,
  nativePath = platform === 'darwin' && process.arch === 'arm64' ? path.join(__dirname, 'native/mac-navigation') : null, wheel = createWheel(nativePath),
  winNativePath = platform === 'win32' ? path.join(__dirname, 'native/windows-navigation.exe') : null,
  winSession = platform === 'win32' && winNativePath && invoke === execute ? createWinSession(winNativePath) : null } = {}) {
  let busy = false;
  async function sessionCall(scope, direction, signal) {
    let line;
    try { line = await winSession(`${scope} ${direction}`, signal); }
    catch (error) {
      if (signal?.aborted) throw new Error('Studio 연결이 끊겨 이동을 중단했습니다.');
      throw new Error('키 입력 실행 실패. Orca 실행 상태를 확인하세요.');
    }
    let result;
    try { result = JSON.parse(line); } catch { throw new Error('키 입력 전달 실패'); }
    if (result.ok !== true || result.delivered !== true) throw new Error(result.error || '키 입력 전달 실패');
    return { delivered: true };
  }
  return async function navigate(scope, direction, settings = {}, signal) {
    if (!(scope === 'shortcut' && Object.hasOwn(SHORTCUTS, direction)) && !(scope === 'app' && direction === 'open') &&
      !(['workspace', 'chat', 'pane', 'wheel'].includes(scope) && ['previous', 'next'].includes(direction))) {
      throw new Error('알 수 없는 탐색 동작입니다.');
    }
    if (!['darwin', 'win32'].includes(platform)) throw new Error('macOS·Windows 대상 플러그인입니다.');
    if (platform === 'darwin' && scope === 'pane') throw new Error('분할 창 이동은 Windows에서만 지원합니다.');
    if (platform === 'darwin' && scope === 'shortcut' && direction === 'closePane') throw new Error('분할 창 닫기는 Windows에서만 지원합니다.');
    if (platform === 'win32' && !winNativePath && scope === 'shortcut' && direction === 'newAgent') throw new Error('새 에이전트 탭 기본 단축키는 macOS에서만 지원합니다.');
    if (scope === 'wheel' && platform === 'darwin' && nativePath) return wheel(direction, signal);
    if (scope === 'wheel' && platform === 'win32' && winSession) return sessionCall(scope, direction, signal);
    if (busy) throw new Error('이동 처리 중입니다. 잠시 후 다시 조작하세요.');
    if (platform === 'darwin' && scope === 'app') {
      busy = true;
      try {
        if (signal?.aborted) throw new Error('Studio 연결이 끊겨 실행을 중단했습니다.');
        await invoke('/usr/bin/open', ['-b', 'com.stablyai.orca'], { timeout: 5000, shell: false, signal });
        return { delivered: true };
      } finally { busy = false; }
    }
    if (platform === 'darwin' && nativePath) {
      busy = true;
      try {
        if (signal?.aborted) throw new Error('Studio 연결이 끊겨 이동을 중단했습니다.');
        let output;
        try {
          output = await invoke(nativePath, [scope, direction], { timeout: 2000, maxBuffer: 4096, shell: false, signal });
        } catch (error) {
          let detail;
          try { detail = JSON.parse(error.stdout).error; } catch {}
          throw new Error(detail || '빠른 키 입력 실행 실패. Orca 실행 상태를 확인하세요.');
        }
        const result = JSON.parse(output.stdout);
        if (result.ok !== true || result.delivered !== true) throw new Error(result.error || '키 입력 전달 실패');
        return { delivered: true };
      } finally { busy = false; }
    }
    if (platform === 'win32' && scope !== 'wheel' && winNativePath) {
      busy = true;
      try {
        if (signal?.aborted) throw new Error('Studio 연결이 끊겨 이동을 중단했습니다.');
        if (winSession) return await sessionCall(scope, direction, signal);
        let output;
        try {
          output = await invoke(winNativePath, [scope, direction], { timeout: 5000, maxBuffer: 4096, windowsHide: true, shell: false, signal });
        } catch (error) {
          let detail;
          try { detail = JSON.parse(error.stdout).error; } catch {}
          throw new Error(detail || '키 입력 실행 실패. Orca 실행 상태를 확인하세요.');
        }
        const result = JSON.parse(output.stdout);
        if (result.ok !== true || result.delivered !== true) throw new Error(result.error || '키 입력 전달 실패');
        return { delivered: true };
      } finally { busy = false; }
    }
    if (scope === 'wheel') {
      if (platform !== 'win32') throw new Error('마우스 휠은 Apple Silicon Mac·Windows에서 사용할 수 있습니다.');
      busy = true;
      try {
        if (signal?.aborted) throw new Error('Studio 연결이 끊겨 이동을 중단했습니다.');
        await invoke('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
          path.join(__dirname, 'native/windows-wheel.ps1'), direction === 'previous' ? 'up' : 'down'],
          { timeout: 5000, windowsHide: true, shell: false, signal });
        return { delivered: true };
      } finally { busy = false; }
    }
    const cli = settings.cliPath || (platform === 'darwin' ? MAC_CLI : '');
    if (typeof cli !== 'string' || !(platform === 'win32' ? path.win32 : path.posix).isAbsolute(cli)) throw new Error('설정에서 Orca CLI의 절대 경로를 지정하세요.');
    // shortcut: Windows command shims are not executed through a shell; use the shipped CLI index.js or a native .exe.
    if (!/\.(js|exe)$/i.test(cli)) throw new Error('Orca CLI index.js 또는 실행 파일(.exe)을 지정하세요.');
    busy = true;
    try {
      const call = async (args) => {
        if (signal?.aborted) throw new Error('Studio 연결이 끊겨 이동을 중단했습니다.');
        let output;
        try {
          output = await invoke(/\.js$/i.test(cli) ? process.execPath : cli,
            [...(/\.js$/i.test(cli) ? [cli] : []), ...args, '--json'],
            { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false, signal });
        } catch (e) {
          throw new Error('Orca CLI 실행 실패. 경로·앱 실행 상태를 확인하세요.');
        }
        let response;
        try { response = JSON.parse(output.stdout); } catch { throw new Error('Orca 응답을 읽지 못했습니다.'); }
        if (!response.ok) throw new Error(`Orca 제어 실패: ${response.error?.code || 'unknown'}`);
        return response.result;
      };
      if (scope === 'app') { await call(['open']); return { delivered: true }; }
      const { windows } = await call(['computer', 'list-windows', '--app', 'Orca']);
      if (!Array.isArray(windows) || windows.length !== 1 || !Number.isInteger(windows[0].id)) {
        throw new Error('Orca 창이 하나 열려 있어야 합니다.');
      }
      const target = ['--app', platform === 'darwin' ? 'com.stablyai.orca' : 'Orca',
        '--window-id', String(windows[0].id), '--no-screenshot'];
      const snapshot = () => call(['computer', 'get-app-state', ...target]);
      const foreground = platform === 'win32' || windows[0].isMinimized || windows[0].isOffscreen ? ['--restore-window'] : [];
      const mod = platform === 'darwin' ? 'Cmd' : 'Ctrl';
      const key = (chord) => call(['computer', /\+/.test(chord) ? 'hotkey' : 'press-key', '--key', chord, ...target, ...foreground, '--full-tree']);
      if (scope === 'shortcut') {
        const chord = ['confirm', 'cancel'].includes(direction) ? SHORTCUTS[direction] : `${mod}+${SHORTCUTS[direction]}`;
        await key(chord);
      } else if (scope === 'chat') {
        await key(`${mod}+Shift+${direction === 'previous' ? '[' : ']'}`);
      } else {
        const isListFocused = (state) => {
          if (state?.truncation?.truncated) return false;
          const line = state?.treeText?.split('\n').find(x => new RegExp(`^\\s*${state.focusedElementId} `).test(x));
          return !!line && /(메뉴 항목|목록 상자|menu item|menuitem|list box|listbox)/i.test(line);
        };
        let focused = await key(`${mod}+Shift+0`);
        // Background input can return before the renderer updates accessibility focus.
        if (!isListFocused(focused?.snapshot)) focused = await snapshot();
        if (!isListFocused(focused?.snapshot)) {
          throw new Error('왼쪽 목록에 포커스를 옮기지 못했습니다. 단축키 설정을 확인하세요.');
        }
        await call(['computer', 'press-key', '--key', direction === 'previous' ? 'Up' : 'Down',
          ...target, ...foreground, '--full-tree']);
      }
      // Input delivery is not an assertion that the active session changed.
      return { delivered: true };
    } finally { busy = false; }
  };
}

module.exports = { createNavigator, createWinSession, MAC_CLI };
