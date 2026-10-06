/* RAT RACE · 13-ui-binder.js · RR.ui.dom (safe DOM builder) · RR.ui.binder (§2.3 grammar) · RR.ui.actions (R20 whitelist).
   The UI never mutates state (R2): binder.refresh only writes the DOM; actions call engines, which commit through RR.store.
   Untrusted strings are always set with textContent (R19). There is no innerHTML anywhere in the UI layer. */
(function (RR) {
  'use strict';

  var U = RR.util;

  // ═══════════════════════════════════ RR.ui.dom ═══════════════════════════════════
  // h('div', { class:'x', text:'…', attrs:{role:'status'}, data:{arg:'1'}, on:{click:fn}, style:{width:'10px'} }, child, child…)
  var dom = RR.ui.dom = {};
  dom.h = function (tag, props) {
    var el = document.createElement(tag), i, k;
    props = props || {};
    if (props.class) { el.className = props.class; }
    if (props.id) { el.id = props.id; }
    if (props.text !== undefined && props.text !== null) { el.textContent = String(props.text); }
    if (props.attrs) { for (k in props.attrs) { if (props.attrs[k] !== undefined && props.attrs[k] !== null && props.attrs[k] !== false) { el.setAttribute(k, props.attrs[k] === true ? '' : String(props.attrs[k])); } } }
    if (props.data) { for (k in props.data) { if (props.data[k] !== undefined && props.data[k] !== null) { el.setAttribute('data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), String(props.data[k])); } } }   // modalAction → data-modal-action
    if (props.style) { for (k in props.style) { el.style[k] = props.style[k]; } }
    if (props.on) { for (k in props.on) { el.addEventListener(k, props.on[k]); } }
    for (i = 2; i < arguments.length; i++) { dom.append(el, arguments[i]); }
    return el;
  };
  dom.append = function (el, child) {
    if (child === null || child === undefined || child === false) { return el; }
    if (Array.isArray(child)) { child.forEach(function (c) { dom.append(el, c); }); }
    else if (typeof child === 'string' || typeof child === 'number') { el.appendChild(document.createTextNode(String(child))); }
    else { el.appendChild(child); }
    return el;
  };
  dom.clear = function (el) { while (el.firstChild) { el.removeChild(el.firstChild); } return el; };
  dom.setText = function (el, text) { text = String(text); if (el.textContent !== text) { el.textContent = text; } };
  dom.setClass = function (el, cls, on) { if (el.classList.contains(cls) !== !!on) { el.classList.toggle(cls, !!on); } };
  dom.focusable = function (root) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) {
      return !el.closest('[inert]') && !el.hidden && !el.closest('[hidden]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    });
  };

  // ═════════════════════════════════ RR.ui.binder ══════════════════════════════════
  var binder = RR.ui.binder = {};
  var formatters = Object.create(null);
  var lists = Object.create(null);          // name → spec
  var nodes = [];                           // [{ el, path, fmt, tone, tween, width, last }]
  var conds = [];                           // [{ el, path, value, hide }]
  var listHosts = [];                       // [{ name, el, emptyEl }]
  var hooks = [];
  var subscribed = false;
  var scanned = typeof WeakSet === 'function' ? new WeakSet() : null;
  var refreshing = false;

  binder.registerFormatter = function (name, fn) { formatters[name] = fn; };
  binder.format = function (name, value) {
    var fn = formatters[name] || formatters.text;
    return fn(value);
  };

  binder.registerFormatter('text', function (v) { return v === undefined || v === null ? '\u2014' : String(v); });
  binder.registerFormatter('upper', function (v) { return v === undefined || v === null ? '\u2014' : String(v).toUpperCase(); });
  binder.registerFormatter('money', function (v) { return U.fmt.money(v); });
  binder.registerFormatter('moneySigned', function (v) { return U.fmt.money(v, { signed: true }); });
  binder.registerFormatter('pct', function (v) { return U.fmt.pct(v); });                          // fraction → percent (0.065 → 6.5%)
  binder.registerFormatter('pctPoints', function (v) {                                              // already a percent (0–100). Floors so 99.99 never shows as 100.
    if (!U.isNum(v)) { return '\u2014'; }
    return (v >= 100 ? '100' : (Math.floor(v * 10) / 10).toFixed(1)) + '%';
  });
  binder.registerFormatter('int', function (v) { return U.fmt.int(v); });
  binder.registerFormatter('ratio', function (v) { return U.fmt.ratio(v); });
  binder.registerFormatter('months', function (v) { return U.isNum(v) ? (v >= RR.config.ledger.ratioCap ? '99+' : (Math.round(v * 10) / 10).toFixed(1)) + ' mo' : '\u2014'; });
  binder.registerFormatter('date', function (v) { return U.fmt.date(v); });

  binder.addRefreshHook = function (fn) { hooks.push(fn); return function () { var i = hooks.indexOf(fn); if (i >= 0) { hooks.splice(i, 1); } }; };

  binder.registerList = function (name, spec) {
    if (!spec || typeof spec.items !== 'function' || typeof spec.key !== 'function' || typeof spec.bindRow !== 'function') {
      throw new TypeError('binder.registerList("' + name + '"): needs items(), key() and bindRow()');
    }
    lists[name] = spec;
    if (spec.container) {                                  // optional explicit container (otherwise the [data-list] element is used)
      var host = typeof spec.container === 'string' ? document.querySelector(spec.container) : spec.container;
      if (host) { addListHost(name, host); }
    }
  };

  function addListHost(name, el) {
    for (var i = 0; i < listHosts.length; i++) { if (listHosts[i].el === el) { return; } }
    var spec = lists[name], emptyEl = null;
    if (spec && spec.empty) {
      emptyEl = dom.h('div', { class: 'list-empty', text: spec.empty });
      el.appendChild(emptyEl);
    }
    listHosts.push({ name: name, el: el, emptyEl: emptyEl });
  }

  // scan(root): index every bound element once. Safe to call again after mounting new panels.
  binder.scan = function (root) {
    root = root || document;
    var found = root.querySelectorAll ? root.querySelectorAll('[data-bind],[data-width-pct],[data-show-if],[data-hide-if],[data-list]') : [];
    Array.prototype.forEach.call(found, function (el) {
      if (scanned && scanned.has(el)) { return; }
      if (scanned) { scanned.add(el); }
      var a = el.getAttribute.bind(el);
      if (a('data-bind')) {
        nodes.push({ el: el, path: a('data-bind'), fmt: a('data-fmt') || 'text', tone: a('data-tone') === 'auto', tween: el.hasAttribute('data-tween'), width: null, last: undefined });
      }
      if (a('data-width-pct')) { nodes.push({ el: el, path: null, width: a('data-width-pct'), last: undefined }); }
      ['data-show-if', 'data-hide-if'].forEach(function (attr) {
        var spec = a(attr);
        if (!spec) { return; }
        var eq = spec.indexOf('=');
        if (eq < 1) { RR.warnOnce('binder:' + spec, 'binder: ' + attr + '="' + spec + '" must look like path=VALUE'); return; }
        conds.push({ el: el, path: spec.slice(0, eq), value: spec.slice(eq + 1), hide: attr === 'data-hide-if' });
      });
      if (a('data-list')) { addListHost(a('data-list'), el); }
    });
    if (RR.ui.overlays && RR.ui.overlays.tooltip) { RR.ui.overlays.tooltip.attach(root); }
  };

  function prune() {
    nodes = nodes.filter(function (n) { return n.el.isConnected; });
    conds = conds.filter(function (c) { return c.el.isConnected; });
    listHosts = listHosts.filter(function (l) { return l.el.isConnected; });
  }

  function animationsOn() { return !!(RR.settings && RR.settings.get('animations')) && !!RR.ui.fx; }

  function applyNode(n, state, instant) {
    var value;
    if (n.width !== null && n.path === null) {
      value = U.getPath(state, n.width);
      var pct = U.isNum(value) ? U.clamp(value, 0, 100) : 0;
      if (n.last !== pct) { n.el.style.width = pct + '%'; n.last = pct; }
      return;
    }
    value = U.getPath(state, n.path);
    var prev = n.last;
    if (value === prev) { return; }
    n.last = value;
    var isNum = U.isNum(value);
    if (n.tone) {
      dom.setClass(n.el, 'is-pos', isNum && value > 0);
      dom.setClass(n.el, 'is-neg', isNum && value < 0);
      dom.setClass(n.el, 'is-zero', isNum && value === 0);
    }
    var animate = n.tween && !instant && isNum && U.isNum(prev) && animationsOn();
    if (animate) {
      RR.ui.fx.tweenNumber(n.el, prev, value, RR.config.ui.fx.tweenMs, n.fmt);
      RR.ui.fx.flashDelta(n.el, value - prev);
    } else {
      if (n.el.__rrTween && RR.ui.fx) { RR.ui.fx.cancelTween(n.el); }
      dom.setText(n.el, binder.format(n.fmt, value));
    }
    if (isNum) { n.el.setAttribute('data-value', String(value)); }
  }

  function applyCond(c, state) {
    var v = U.getPath(state, c.path);
    var eq = String(v) === c.value;
    var hidden = c.hide ? eq : !eq;
    if (c.el.hidden !== hidden) { c.el.hidden = hidden; }
  }

  function applyList(host, state) {
    var spec = lists[host.name];
    if (!spec) { RR.warnOnce('list:' + host.name, 'binder: no list registered for data-list="' + host.name + '"'); return; }
    var items = spec.items(state) || [], keys = items.map(spec.key), want = Object.create(null), i, el;
    keys.forEach(function (k) { want[k] = true; });
    var existing = Object.create(null);
    Array.prototype.slice.call(host.el.children).forEach(function (child) {
      if (child.__rrKey === undefined) { return; }
      if (want[child.__rrKey] && !existing[child.__rrKey]) { existing[child.__rrKey] = child; } else { host.el.removeChild(child); }
    });
    var cursor = host.emptyEl || null;
    for (i = 0; i < items.length; i++) {
      el = existing[keys[i]];
      if (!el) {
        el = createRow(spec, items[i]);
        el.__rrKey = keys[i];
        el.setAttribute('data-key', String(keys[i]));
      }
      spec.bindRow(el, items[i], state);
      var next = cursor ? cursor.nextElementSibling : host.el.firstElementChild;
      if (next !== el) { host.el.insertBefore(el, next); }
      cursor = el;
    }
    if (host.emptyEl) { host.emptyEl.hidden = items.length > 0; }
    host.el.classList.toggle('is-empty', items.length === 0);
  }

  function createRow(spec, item) {
    if (typeof spec.create === 'function') { return spec.create(item); }
    var tpl = typeof spec.template === 'string' ? document.querySelector(spec.template) : spec.template;
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) { throw new Error('binder: list template not found: ' + spec.template); }
    return tpl.content.firstElementChild.cloneNode(true);
  }

  // refresh(state, {instant}) — DOM only. Called on every 'state:committed'.
  binder.refresh = function (state, opts) {
    if (!state || refreshing) { return; }
    refreshing = true;
    try {
      var instant = !!(opts && opts.instant), i;
      prune();
      for (i = 0; i < nodes.length; i++) { applyNode(nodes[i], state, instant); }
      for (i = 0; i < conds.length; i++) { applyCond(conds[i], state); }
      for (i = 0; i < listHosts.length; i++) { applyList(listHosts[i], state); }
      for (i = 0; i < hooks.length; i++) { hooks[i](state, instant); }
    } finally { refreshing = false; }
  };

  binder.init = function (root) {
    binder.scan(root || document);
    if (!subscribed) {
      subscribed = true;
      RR.bus.on('state:committed', function (p) { binder.refresh(RR.store.get(), { instant: !!(p && p.replaced) }); });
    }
    if (RR.store.get()) { binder.refresh(RR.store.get(), { instant: true }); }
  };
  // invalidate(): forget every cached value so the next refresh rewrites all text (e.g. after the currency symbol changes).
  binder.invalidate = function () { nodes.forEach(function (n) { n.last = undefined; }); };
  binder.stats = function () { return { nodes: nodes.length, conds: conds.length, lists: listHosts.length, hooks: hooks.length }; };
  binder.nodesFor = function (path) { return nodes.filter(function (n) { return n.path === path; }).map(function (n) { return n.el; }); };

  // helper for row binders: set one child's text by class (rows are templates; classes are the hooks, not new attributes)
  binder.slot = function (row, cls, text) {
    var el = row.querySelector('.' + cls);
    if (el) { dom.setText(el, text); }
    return el;
  };

  // ═════════════════════════════════ RR.ui.actions ═════════════════════════════════
  // data-action="name" → only registered names run (R20). Handlers receive { name, el, event, arg } and return a Result (or a Promise of one).
  // register(name, fn, { mutates }) — mutates:true actions are reported to RR.replay.record (Phase 2) after a successful run.
  var actions = RR.ui.actions = {};
  var registry = Object.create(null);

  actions.register = function (name, fn, opts) {
    if (typeof name !== 'string' || !/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(name)) { throw new TypeError('actions.register: name must look like "module.action"'); }
    if (typeof fn !== 'function') { throw new TypeError('actions.register: handler must be a function'); }
    registry[name] = { fn: fn, mutates: !!(opts && opts.mutates) };
  };
  actions.has = function (name) { return !!registry[name]; };
  actions.names = function () { return Object.keys(registry).sort(); };

  var TONE_BY_REASON = { NOT_IMPLEMENTED: 'info', COOLDOWN: 'warn', LIMIT_REACHED: 'warn', WRONG_PHASE: 'warn', NOT_ONLINE: 'info', GAME_NOT_RUNNING: 'info' };

  function feedback(res, el) {
    var tone = TONE_BY_REASON[res.reason] || 'neg';
    if (RR.ui.overlays) { RR.ui.overlays.toast.show(res.message || 'That did not work.', { tone: tone, key: 'act:' + (res.reason || '') }); }
    var host = el && el.parentElement && el.parentElement.querySelector('.inline-reason');
    if (host) {
      dom.setText(host, res.message || '');
      clearTimeout(host.__t);
      host.__t = setTimeout(function () { dom.setText(host, ''); }, 5000);
    }
  }

  function clearReason(el) {
    var host = el && el.parentElement && el.parentElement.querySelector('.inline-reason');
    if (host && host.textContent) { dom.setText(host, ''); }
  }

  function settle(name, entry, res, ctx) {
    if (res && res.ok === false) { feedback(res, ctx.el); return res; }
    clearReason(ctx.el);
    if (entry.mutates && RR.replay && typeof RR.replay.record === 'function') { RR.replay.record({ name: name, arg: ctx.arg === undefined ? null : ctx.arg }); }
    return res;
  }

  // run(name, ctx?) → Result | Promise<Result>. Unknown names are ignored (and warned about in dev).
  actions.run = function (name, ctx) {
    var entry = registry[name];
    ctx = ctx || {};
    if (!entry) { RR.warnOnce('action:' + name, 'actions: "' + name + '" is not a registered action (ignored)'); return U.fail('NOT_FOUND', 'Unknown action.'); }
    var res;
    try { res = entry.fn({ name: name, el: ctx.el || null, event: ctx.event || null, arg: ctx.arg }); }
    catch (err) {
      RR.warnOnce('action-err:' + name, 'action "' + name + '" threw: ' + (err && err.message));
      var failed = U.fail('MUTATOR_ERROR', 'Something went wrong. Your game was not changed.');
      feedback(failed, ctx.el);
      return failed;
    }
    if (res && typeof res.then === 'function') { return res.then(function (r) { return settle(name, entry, r, ctx); }); }
    return settle(name, entry, res, ctx);
  };

  actions.init = function (root) {
    root = root || document;
    root.addEventListener('click', function (event) {
      var el = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
      if (!el || !root.contains(el)) { return; }
      var name = el.getAttribute('data-action');
      if (el.getAttribute('aria-disabled') === 'true' || el.disabled) {
        event.preventDefault();
        var why = el.getAttribute('title');
        if (why && RR.ui.overlays) { RR.ui.overlays.toast.show(why, { tone: 'info', key: 'disabled:' + why }); }
        return;
      }
      if (el.tagName === 'A') { event.preventDefault(); }
      actions.run(name, { el: el, event: event, arg: el.getAttribute('data-arg') === null ? undefined : el.getAttribute('data-arg') });
    });
  };
})(window.RR);
