'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);
const { createWheel } = require('./wheel.cjs');

const SHORTCUTS = { leftPanel: 'B', rightPanel: 'L', confirm: 'Return', cancel: 'Escape', dictation: 'E', newAgent: 'Alt+T' };

const MAC_CLI = '/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/index.js';

function createNavigator({ platform = process.platform, invoke = execute,
  nativePath = platform === 'darwin' && process.arch === 'arm64' ? path.join(__dirname, 'native/mac-navigation') : null, wheel = createWheel(nativePath) } = {}) {
  let busy = false;
  return async function navigate(scope, direction, settings = {}, signal) {
    if (!(scope === 'shortcut' && Object.hasOwn(SHORTCUTS, direction)) && !(scope === 'app' && direction === 'open') &&
      !(['workspace', 'chat', 'wheel'].includes(scope) && ['previous', 'next'].includes(direction))) {
      throw new Error('알 수 없는 탐색 동작입니다.');
    }
    if (!['darwin', 'win32'].includes(platform)) throw new Error('macOS·Windows 대상 플러그인입니다.');
    if (platform === 'win32' && scope === 'shortcut' && direction === 'newAgent') throw new Error('새 에이전트 탭 기본 단축키는 macOS에서만 지원합니다.');
    if (scope === 'wheel' && platform === 'darwin' && nativePath) return wheel(direction, signal);
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
            { timeout: 10000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false, signal });
        } catch {
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
      const key = (chord) => call(['computer', 'hotkey', '--key', chord, ...target, ...foreground, '--full-tree']);
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

module.exports = { createNavigator, MAC_CLI };
