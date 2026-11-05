'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const legacy = require('../../app/src/js/legacy38');
const acorn = require('../vendor/acorn');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('ok   ' + name); }
check('legacy adapter parses as ES5', () => acorn.parse(fs.readFileSync(path.join(__dirname, '../../app/src/js/legacy38.js'), 'utf8'), {ecmaVersion: 5}));
check('nested fallback and rgb commas', () => assert.strictEqual(legacy.resolve('rgba(var(--rgb, 1,2,3),var(--alpha, .5))', {}), 'rgba(1,2,3,.5)'));
check('dependent variables preserve expressions', () => assert.strictEqual(legacy.resolve('calc(2 * var(--unit))', {'--unit': 'var(--size)', '--size': '12px'}), 'calc(2 * 12px)'));
check('cycles terminate', () => assert.strictEqual(legacy.resolve('var(--a)', {'--a': 'var(--b)', '--b': 'var(--a)'}), null));
check('missing variable discards declaration', () => assert.strictEqual(legacy.resolve('var(--missing)', {}), null));
check('cycle can use external fallback', () => assert.strictEqual(legacy.resolve('var(--a, red)', {'--a': 'var(--a)'}), 'red'));
check('quoted semicolon stays inside declaration', () => assert.deepStrictEqual(legacy.declarations('background:url("data:x;a:b");color:red'), [['background', 'url("data:x;a:b")'], ['color', 'red']]));
check('unadapted nested CSS fails explicitly', () => assert.throws(() => legacy.parse('@media screen{.tile{color:var(--ink)}}'), /explicit adapter/));
check('native animations do not become element selectors', () => assert.deepStrictEqual(legacy.parse('@keyframes spin{to{transform:rotate(360deg)}}'), []));
check('original flat styles can be inventoried', () => {
  for (const f of ['home', 'menus', 'addons', 'rtl']) assert(legacy.parse(fs.readFileSync(path.join(__dirname, '../../app/src/css/' + f + '.css'), 'utf8')).length > 0);
  for (const f of ['../../manager/src/css/manager.css', '../../helper/addons-bundled/iptv/src/css/base.css', '../../helper/addons-bundled/iptv/src/css/live.css'])
    assert(legacy.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')).length > 0);
});
check('browser path retains theme changes, tile colours and pseudo rules', () => {
  function Style() { this.values = {}; }
  Style.prototype.setProperty = function(k, v) { this.values[k] = v; };
  Style.prototype.getPropertyValue = function(k) { return this.values[k] || ''; };
  Style.prototype.removeProperty = function(k) { const old = this.values[k]; delete this.values[k]; return old; };
  const rootEl = {nodeType: 1, style: new Style(), parentNode: null};
  const tile = {nodeType: 1, style: new Style(), parentNode: rootEl, setAttribute() {}};
  rootEl.setAttribute = function() {};
  rootEl.matches = s => s === ':root';
  tile.matches = s => s === '.tile' || s === '.snap .tile';
  const sheet = {textContent: ':root{--ink:white;--cols:4;--gap-x:20px}.tile{--rgb:1,2,3;color:var(--ink);background:rgb(var(--rgb));transition:color 1s}.snap .tile{transition:none}.tile::before{border-color:var(--ink)}'};
  const styles = [sheet];
  const doc = {
    documentElement: rootEl,
    head: {appendChild(el) { styles.push(el); }},
    createElement() { return {textContent: ''}; },
    querySelectorAll(s) { if (s === 'style') return styles; if(s === '*') return [rootEl, tile]; if(s === ':root') return [rootEl]; return [tile]; }
  };
  const win = {document: doc, CSSStyleDeclaration: Style, setTimeout() { return 1; },
    fetch() {}, getComputedStyle() { return new Style(); }, console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../app/src/js/legacy38.js'), 'utf8'), {window: win});
  const api = win.CYTV_LEGACY38;
  assert.strictEqual(api.lastError, '');
  assert(styles[1].textContent.includes('background:rgb(1,2,3)'));
  assert(styles[1].textContent.includes('::before{border-color:white}'));
  assert(styles[1].textContent.includes('transition:none'));
  rootEl.style.setProperty('--ink', 'orange');
  tile.style.setProperty('--rgb', '9,8,7');
  api.refresh();
  assert(styles[1].textContent.includes('color:orange'));
  assert(styles[1].textContent.includes('background:rgb(9,8,7)'));
  assert.strictEqual(tile.style.getPropertyValue('--rgb'), '9,8,7');
  assert(styles[1].textContent.includes('nth-child(4n+1)'));
  rootEl.style.removeProperty('--ink'); api.refresh();
  assert(styles[1].textContent.includes('color:white'));
});
async function networkTests() {
  async function rejects(promise) {
    let rejected = false;
    try { await promise; } catch (_) { rejected = true; }
    assert(rejected, 'promise must reject');
  }
  const source = fs.readFileSync(path.join(__dirname, '../../app/src/js/legacy38.js'), 'utf8');
  let request;
  function XHR() { request = this; }
  XHR.prototype.open = function (...args) { this.opened = args; };
  XHR.prototype.setRequestHeader = function () {};
  XHR.prototype.send = function (body) { this.body = body; };
  const win = {Promise, XMLHttpRequest: XHR};
  vm.runInNewContext(source, {window: win});
  const result = win.fetch('/api/apps');
  assert.strictEqual(request.body, null);
  request.status = 200; request.responseText = '{"apps":[]}'; request.onload();
  assert.strictEqual(JSON.stringify(await (await result).json()), '{"apps":[]}'); checks++;
  const invalid = win.fetch('/api/config'); request.status = 500; request.responseText = 'not json'; request.onload();
  const response = await invalid; assert.strictEqual(response.ok, false); await rejects(response.json()); checks++;
  for (const event of ['onerror', 'ontimeout', 'onabort']) {
    const failed = win.fetch('/api/apps'); request[event](); await rejects(failed); checks++;
  }
  const nativeFetch = function () {};
  const native = {fetch: nativeFetch, CSS: {supports: () => true}};
  vm.runInNewContext(source, {window: native});
  assert.strictEqual(native.fetch, nativeFetch); assert.strictEqual(native.CYTV_LEGACY38, undefined); checks++;
  console.log('ok   network errors, invalid JSON, and native engine bypass');
  console.log(checks + ' checks passed (Node VM; not Chromium 38 or TV)');
}
networkTests().catch(e => { console.error(e); process.exitCode = 1; });
