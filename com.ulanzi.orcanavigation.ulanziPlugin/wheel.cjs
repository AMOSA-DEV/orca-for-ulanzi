'use strict';
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

// Keep a helper alive during a burst so rotations don't pay process startup costs.
function createWheel(nativePath, launch = spawn) {
  let current;
  return function wheel(direction, signal) {
    if (!['previous', 'next'].includes(direction)) return Promise.reject(new Error('알 수 없는 탐색 동작입니다.'));
    if (signal?.aborted) return Promise.reject(new Error('Studio 연결이 끊겨 이동을 중단했습니다.'));
    if (!current) {
      const child = launch(nativePath, ['wheel', 'stream'], { stdio: ['pipe', 'pipe', 'ignore'], shell: false });
      const state = { child, pending: [], signals: new Map(), idle: null };
      current = state;
      const stop = (error) => {
        if (current === state) current = null;
        clearTimeout(state.idle);
        for (const [signal, listener] of state.signals) signal.removeEventListener('abort', listener);
        state.signals.clear();
        for (const item of state.pending.splice(0)) { clearTimeout(item.timeout); item.reject(error); }
        child.kill();
      };
      state.stop = stop;
      child.on('error', stop);
      child.stdin.on('error', stop);
      child.on('close', () => stop(new Error('키 입력 전달 실패')));
      createInterface({ input: child.stdout }).on('line', line => {
        let result;
        try { result = JSON.parse(line); } catch { stop(new Error('키 입력 전달 실패')); return; }
        if (result.ok !== true || result.delivered !== true) { stop(new Error(result.error || '키 입력 전달 실패')); return; }
        const item = state.pending.shift();
        if (item) { clearTimeout(item.timeout); item.resolve({ delivered: true }); }
      });
    }
    const state = current;
    if (signal && !state.signals.has(signal)) {
      const cancel = () => state.stop(new Error('Studio 연결이 끊겨 이동을 중단했습니다.'));
      state.signals.set(signal, cancel);
      signal.addEventListener('abort', cancel, { once: true });
    }
    clearTimeout(state.idle);
    state.idle = setTimeout(() => {
      if (current === state) current = null;
      state.child.stdin.end();
    }, 1000);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => state.stop(new Error('키 입력 전달 실패')), 2000);
      state.pending.push({ resolve, reject, timeout });
      state.child.stdin.write(`${direction}\n`);
    });
  };
}
module.exports = { createWheel };
