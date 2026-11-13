const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTranslator } = require('../i18n.js');
const { createHandler, UUID } = require('../app.js');
const root = path.resolve(__dirname, '..');

test('all four host catalogs preserve manifest action order and translated state names', () => {
  const manifest = require('../manifest.json');
  for (const locale of ['ko_KR', 'en', 'zh_CN', 'ja_JP']) {
    const catalog = require(`../${locale}.json`);
    assert.equal(catalog.Actions.length, manifest.Actions.length);
    for (const field of ['Name', 'Category', 'Description']) assert.ok(catalog[field]);
    catalog.Actions.forEach((action, i) => {
      assert.ok(action.Name && action.Tooltip);
      assert.equal(action.States.length, manifest.Actions[i].States.length);
      assert.equal(action.States[0].Name, action.Name);
    });
    assert.equal(catalog.Actions[0].States[0].Title, 'Orca');
  }
});

test('every user message from JS, HTML and native helper has translations', () => {
  const sources = ['navigation.cjs', 'app.js', 'inspector.js', 'native/mac-navigation.swift']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const messages = [...sources.matchAll(/(?:new Error\(|fail\(|textContent = t\(|msg: t\()['"]([^'"\n]*[가-힣][^'"\n]*)['"]/g)].map(match => match[1]);
  const html = fs.readFileSync(path.join(root, 'inspector.html'), 'utf8');
  for (const match of html.matchAll(/<(?:p|label|button|summary|title)\b[^>]*>([^<]+)</g)) messages.push(match[1]);
  messages.push('설정을 저장하지 못했습니다.', '저장 응답을 받았습니다. 재선택해 설정을 확인하세요.', 'Orca 제어 실패: ');
  assert.ok(messages.length >= 25, 'message extraction must cover the runtime and inspector');
  for (const language of ['en', 'zh_CN', 'ja-JP']) {
    const t = createTranslator(language);
    for (const message of messages) {
      assert.notEqual(t(message), message, `${language}: ${message}`);
      assert.doesNotMatch(t(message), /[가-힣]/);
    }
  }
  assert.equal(createTranslator('de-DE')('저장'), 'Save');
  assert.equal(createTranslator('EN_us')('저장'), 'Save');
  assert.equal(createTranslator('ja-JP')('Orca 제어 실패: app_not_found'), 'Orca の操作に失敗しました: app_not_found');
});

test('runtime error toasts use the Studio startup language', async () => {
  for (const [lang, expected] of [['en-US', 'Exactly one Orca window must be open.'],
    ['zh-CN', '请仅打开一个 Orca 窗口。'], ['ja-JP', 'Orca のウィンドウを1つだけ開いてください。'],
    ['ko-KR', 'Orca 창이 하나 열려 있어야 합니다.']]) {
    const sent = [];
    const receive = createHandler(message => sent.push(message), async () => { throw new Error('Orca 창이 하나 열려 있어야 합니다.'); }, undefined, lang);
    const route = { uuid: `${UUID}.workspaceNext`, actionid: 'one' };
    await receive({ cmd: 'add', ...route });
    await receive({ cmd: 'keydown', ...route });
    assert.equal(sent.at(-1).msg, expected);
  }
});
