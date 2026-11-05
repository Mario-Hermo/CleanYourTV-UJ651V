/* Compatibility only. Original pages, themes and APIs remain the source of truth.
   No work is performed on engines with native custom properties and fetch. */
(function (w) {
  'use strict';
  function resolve(value, vars, trail) {
    trail = trail || [];
    var start = value.indexOf('var('), end, depth, i, quote, body, split, name, replacement;
    while (start >= 0) {
      depth = 1; quote = '';
      for (end = start + 4; end < value.length && depth; end++) {
        var c = value.charAt(end);
        if (quote) { if (c === quote && value.charAt(end - 1) !== '\\') quote = ''; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      if (depth) return null;
      body = value.slice(start + 4, end - 1); split = -1; depth = 0;
      for (i = 0; i < body.length; i++) {
        if (body.charAt(i) === '(') depth++;
        if (body.charAt(i) === ')') depth--;
        if (body.charAt(i) === ',' && !depth) { split = i; break; }
      }
      name = (split < 0 ? body : body.slice(0, split)).trim();
      replacement = Object.prototype.hasOwnProperty.call(vars, name) && trail.indexOf(name) < 0
        ? resolve(String(vars[name]), vars, trail.concat(name)) : null;
      if (replacement === null && split >= 0) replacement = resolve(body.slice(split + 1).trim(), vars, trail);
      if (replacement === null) return null;
      value = value.slice(0, start) + replacement + value.slice(end);
      start = value.indexOf('var(');
    }
    return value;
  }
  function declarations(text) {
    var out = [], begin = 0, depth = 0, quote = '', i, c;
    text += ';';
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (quote) { if (c === quote && text.charAt(i - 1) !== '\\') quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && !depth) {
        var item = text.slice(begin, i), colon = item.indexOf(':');
        if (colon >= 0) out.push([item.slice(0, colon).trim(), item.slice(colon + 1).trim()]);
        begin = i + 1;
      }
    }
    return out;
  }
  // The original bundled styles contain flat selectors; nested at-rules are
  // explicitly rejected rather than silently producing a different theme.
  function parse(css) {
    var rules = [], re = /([^{}]+)\{([^{}]*)\}/g, match;
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    var at = /@(?:media|supports|keyframes|-[a-z]+-keyframes)\b/.exec(css);
    while (at) {
      var open = css.indexOf('{', at.index), pos = open + 1, level = 1, q = '';
      if (open < 0) throw new Error('legacy38: malformed at-rule');
      for (; pos < css.length && level; pos++) {
        var ch = css.charAt(pos);
        if (q) { if (ch === q && css.charAt(pos - 1) !== '\\') q = ''; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '{') level++;
        else if (ch === '}') level--;
      }
      if (level || /var\(--|--[\w-]+\s*:/.test(css.slice(open, pos)))
        throw new Error('legacy38: nested CSS needs an explicit adapter');
      // Native keyframes/media without custom properties remain in the original
      // stylesheet; do not treat frame selectors as document selectors.
      css = css.slice(0, at.index) + css.slice(pos);
      at = /@(?:media|supports|keyframes|-[a-z]+-keyframes)\b/.exec(css);
    }
    while ((match = re.exec(css))) {
      var selector = match[1].trim();
      if (selector.charAt(0) === '@') continue;
      rules.push({ selector: selector, declarations: declarations(match[2]) });
    }
    return rules;
  }
  function xhrFetch(url, options) {
    options = options || {};
    return new w.Promise(function (yes, no) {
      var x = new w.XMLHttpRequest();
      x.open(options.method || 'GET', url, true); x.timeout = 15000;
      var headers = options.headers || {}, key;
      for (key in headers) if (Object.prototype.hasOwnProperty.call(headers, key)) x.setRequestHeader(key, headers[key]);
      x.onload = function () {
        yes({ ok: x.status >= 200 && x.status < 300, status: x.status,
          text: function () { return w.Promise.resolve(x.responseText); },
          json: function () { return new w.Promise(function (res, rej) {
            try { res(JSON.parse(x.responseText)); } catch (e) { rej(e); }
          }); } });
      };
      x.onerror = x.ontimeout = x.onabort = function () { no(new TypeError('Network request failed')); };
      x.send(options.body === undefined ? null : options.body);
    });
  }
  function specificity(selector) {
    var ids = (selector.match(/#[\w-]+/g) || []).length;
    var classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:|not\()[\w-]+(?:\([^)]*\))?/g) || []).length;
    var tags = (selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?/g, '').match(/[a-zA-Z][\w-]*/g) || []).length;
    return ids * 1000000 + classes * 1000 + tags;
  }
  function installStyles() {
    var doc = w.document, proto = w.CSSStyleDeclaration.prototype;
    var nativeSet = proto.setProperty, nativeGet = proto.getPropertyValue, nativeRemove = proto.removeProperty;
    var output = doc.createElement('style'), serial = 0, timer = null, observer, current = [], customRules = [], lastSource = '';
    output.id = 'cytv-legacy38-style';
    doc.head.appendChild(output);
    function schedule() {
      if (timer === null) timer = w.setTimeout(function () { timer = null; refresh(); }, 16);
    }
    // Old engines discard unknown custom properties. Retain them on the style
    // object so the original theme/colour code can keep using its exact API.
    proto.setProperty = function (key, value, priority) {
      if (key.indexOf('--') === 0) {
        if (!this._cytvVars) this._cytvVars = {};
        this._cytvVars[key] = String(value); schedule(); return;
      }
      return nativeSet.call(this, key, value, priority);
    };
    proto.getPropertyValue = function (key) {
      if (key.indexOf('--') === 0 && this._cytvVars && Object.prototype.hasOwnProperty.call(this._cytvVars, key)) return this._cytvVars[key];
      return nativeGet.call(this, key);
    };
    proto.removeProperty = function (key) {
      if (key.indexOf('--') === 0 && this._cytvVars) {
        var old = this._cytvVars[key] || ''; delete this._cytvVars[key]; schedule(); return old;
      }
      return nativeRemove.call(this, key);
    };
    function matches(el, selector) {
      var fn = el.matches || el.webkitMatchesSelector;
      return !!fn && fn.call(el, selector);
    }
    function variables(el) {
      if (!el || el.nodeType !== 1) return {};
      if (el._cytvVarCache) return el._cytvVarCache;
      var values = {}, ranks = {}, inherited = variables(el.parentNode), key, i, j;
      for (key in inherited) values[key] = inherited[key];
      for (i = 0; i < customRules.length; i++) {
        var rule = customRules[i];
        if (rule.pseudo || !matches(el, rule.base)) continue;
        for (j = 0; j < rule.declarations.length; j++) {
          var d = rule.declarations[j];
          if (d[0].indexOf('--') !== 0) continue;
          var important = /!important\s*$/.test(d[1]);
          var rank = rule.rank + (important ? 1000000000 : 0);
          if (ranks[d[0]] === undefined || rank >= ranks[d[0]]) {
            ranks[d[0]] = rank; values[d[0]] = d[1].replace(/\s*!important\s*$/, '');
          }
        }
      }
      var inline = el.style && el.style._cytvVars || {};
      for (key in inline) if (!ranks[key] || ranks[key] < 1000000000) values[key] = inline[key];
      el._cytvVarCache = values;
      return values;
    }
    function observe() {
      if (observer) observer.observe(doc.documentElement, {subtree: true, childList: true, characterData: true, attributes: true});
    }
    function refresh() {
      if (observer) observer.disconnect();
      try {
        var styles = doc.querySelectorAll('style'), i, j, k, sources = [];
        for (i = 0; i < styles.length; i++) if (styles[i] !== output) sources.push(styles[i].textContent);
        var source = sources.join('\n');
        if (source !== lastSource) {
          var sheets = parse(source), next = [];
          for (i = 0; i < sheets.length; i++) {
          var selectors = sheets[i].selector.split(',');
          for (j = 0; j < selectors.length; j++) {
            var selector = selectors[j].trim(), pseudo = /::?(before|after|selection|first-letter|first-line)\s*$/.exec(selector);
            next.push({selector: selector, base: pseudo ? selector.slice(0, pseudo.index) || '*' : selector,
              pseudo: pseudo ? pseudo[0] : '', rank: specificity(selector), declarations: sheets[i].declarations,
              hasVars: sheets[i].declarations.some(function (d) { return d[1].indexOf('var(') >= 0; }),
              hasCustom: sheets[i].declarations.some(function (d) { return d[0].indexOf('--') === 0; })});
          }
          }
          current = next; customRules = current.filter(function (r) { return r.hasCustom; }); lastSource = source;
        }
        var all = doc.querySelectorAll('*');
        for (i = 0; i < all.length; i++) all[i]._cytvVarCache = null;
        var css = [];
        for (i = 0; i < current.length; i++) {
          var rule = current[i], needed = rule.declarations.some(function (d) { return d[0].indexOf('--') !== 0; });
          if (!needed) continue;
          if (!rule.hasVars) {
            // Same added specificity as the per-element selector, without
            // enumerating every node for declarations the engine already knows.
            var nativeBody = rule.declarations.filter(function (d) { return d[0].indexOf('--') !== 0; })
              .map(function (d) { return d[0] + ':' + d[1]; }).join(';');
            css.push(rule.base + ':not([data-cytv-legacy-ignore])' + rule.pseudo + '{' + nativeBody + '}');
            continue;
          }
          var elements = doc.querySelectorAll(rule.base);
          for (j = 0; j < elements.length; j++) {
            var el = elements[j], vars = variables(el), body = [];
            if (!el._cytvLegacyId) { el._cytvLegacyId = String(++serial); el.setAttribute('data-cytv-legacy', el._cytvLegacyId); }
            for (k = 0; k < rule.declarations.length; k++) {
              var decl = rule.declarations[k];
              if (decl[0].indexOf('--') === 0) continue;
              var value = resolve(decl[1], vars);
              if (value !== null) body.push(decl[0] + ':' + value);
            }
            if (body.length) css.push(rule.base + '[data-cytv-legacy="' + el._cytvLegacyId + '"]' + rule.pseudo + '{' + body.join(';') + '}');
          }
        }
        var rootVars = variables(doc.documentElement);
        // Match CSS Grid's fractional column sizing and gaps, retaining the
        // original centred-last-row rule, theme dimensions and RTL direction.
        var cols = Math.max(1, parseInt(rootVars['--cols'], 10) || 10);
        var gapX = rootVars['--gap-x'] || '24px', gapY = rootVars['--gap-y'] || '26px';
        var gridW = rootVars['--grid-w'] || '1728px';
        css.push('body:not([data-galign="center"]) #grid{display:flex;flex-wrap:wrap;justify-content:flex-start}');
        css.push('body:not([data-galign="center"]) #grid{gap:0}');
        css.push('body:not([data-galign="center"]) #grid>.tile{width:calc((' + gridW + ' - ' + (cols - 1) + ' * ' + gapX + ')/' + cols + ');margin:0 0 ' + gapY + ' ' + gapX + '}');
        css.push('body:not([data-galign="center"]) #grid>.tile:nth-child(' + cols + 'n+1){margin-left:0}');
        css.push('html[dir="rtl"] body:not([data-galign="center"]) #grid>.tile{margin-left:0;margin-right:' + gapX + '}html[dir="rtl"] body:not([data-galign="center"]) #grid>.tile:nth-child(' + cols + 'n+1){margin-right:0}');
        var text = css.join('\n');
        if (output.textContent !== text) output.textContent = text;
        api.lastError = '';
      } catch (e) {
        api.lastError = String(e.message || e);
        if (w.console) w.console.error(api.lastError);
      } finally { observe(); }
    }
    api.variables = variables; api.refresh = refresh;
    // Preserve direct access to custom values in cards/add-on theme exports.
    var getComputed = w.getComputedStyle;
    w.getComputedStyle = function (el, pseudo) {
      var style = getComputed.call(w, el, pseudo), get = style.getPropertyValue;
      style.getPropertyValue = function (key) {
        if (key.indexOf('--') === 0) return variables(el)[key] || '';
        return get.call(style, key);
      };
      return style;
    };
    if (w.MutationObserver) observer = new w.MutationObserver(schedule);
    refresh();
  }
  var api = { resolve: resolve, declarations: declarations, parse: parse, xhrFetch: xhrFetch, specificity: specificity };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (!w.fetch) w.fetch = xhrFetch;
  if (w.Element && !w.Element.prototype.remove) w.Element.prototype.remove = function () {
    if (this.parentNode) this.parentNode.removeChild(this);
  };
  if (w.CSS && w.CSS.supports && w.CSS.supports('color', 'var(--cytv-probe)')) return;
  w.CYTV_LEGACY38 = api;
  if (w.document && w.CSSStyleDeclaration) installStyles();
})(typeof window === 'undefined' ? {} : window);
