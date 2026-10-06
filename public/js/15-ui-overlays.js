/* RAT RACE · 15-ui-overlays.js · RR.ui.overlays {toast, modal, tooltip, announce, settings, glossary, logModal, receiptModal, consequence} · RR.ui.receipt
   Toast + modal contracts: §2.8.3. Receipt presenter: §1.12.11 — the ONLY place that turns EffectReceipts into toasts/strips/modals.
   Every string shown comes from textContent (R19). Overlays live inside #stage so they scale with the canvas. */
(function (RR) {
  'use strict';

  var U = RR.util, dom = RR.ui.dom, h = dom.h;
  var O = RR.ui.overlays = {};
  var roots = { toast: null, modal: null, tooltip: null, announcer: null };

  function icon(name, size) { return RR.ui.icon ? RR.ui.icon(name, { size: size || 20 }) : document.createElement('span'); }
  function animOn() { return !!(RR.settings && RR.settings.get('animations')); }
  function setInert(el, on) { if (!el) { return; } if (on) { el.setAttribute('inert', ''); } else { el.removeAttribute('inert'); } }

  // ═════════════════════════════════════ announcer ═════════════════════════════════════
  O.announce = function (text) {
    var a = roots.announcer;
    if (!a) { return; }
    a.textContent = '';
    setTimeout(function () { a.textContent = String(text || ''); }, 30);
  };

  // ═══════════════════════════════════════ toast ═══════════════════════════════════════
  var T = O.toast = {};
  var visible = [], queued = [], tseq = 0, lastOutsideFocus = null;
  var TONES = {
    info:    { icon: 'ic_info',    sr: 'Info' },
    pos:     { icon: 'ic_check',   sr: 'Success' },
    neg:     { icon: 'ic_alert',   sr: 'Problem' },
    warn:    { icon: 'ic_warning', sr: 'Warning' },
    gold:    { icon: 'ic_star',    sr: 'Milestone' },
    premium: { icon: 'ic_crown',   sr: 'Premium' }
  };
  function tcfg() { return RR.config.ui.toast; }
  function findBy(list, pred) { for (var i = 0; i < list.length; i++) { if (pred(list[i])) { return list[i]; } } return null; }

  function renderCount(item) {
    if (!item.el) { return; }
    var badge = item.el.querySelector('.toast__count');
    if (item.count > 1) {
      if (!badge) { badge = h('span', { class: 'toast__count' }); item.el.querySelector('.toast__msg').appendChild(badge); }
      badge.textContent = '\u00d7' + item.count;
    }
  }
  function startTimer(item, ms) {
    clearTimeout(item.timer);
    if (item.sticky) { item.timer = null; return; }
    item.remaining = ms; item.startedAt = Date.now();
    item.timer = setTimeout(function () { T.dismiss(item.id); }, ms);
  }
  function duration(item) { return typeof item.durationMs === 'number' ? item.durationMs : tcfg().durationMs[item.tone]; }
  function pause(item) {
    if (!item.timer) { return; }
    clearTimeout(item.timer); item.timer = null;
    item.remaining = Math.max(400, item.remaining - (Date.now() - item.startedAt));
  }
  function resume(item) { if (!item.sticky && !item.timer && item.remaining > 0 && !item.el.matches(':hover') && !item.el.contains(document.activeElement)) { startTimer(item, item.remaining); } }

  function mount(item) {
    var spec = TONES[item.tone];
    var msgBox = h('div', { class: 'toast__msg' }, h('span', { class: 'sr-only', text: spec.sr + ': ' }), item.msg);
    if (item.action && item.action.label) {
      msgBox.appendChild(h('div', { class: 'toast__action' }, h('button', { class: 'btn btn--sm', text: item.action.label, attrs: { type: 'button' }, on: { click: function () {
        try { if (typeof item.action.onClick === 'function') { item.action.onClick(); } } finally { T.dismiss(item.id); }
      } } })));
    }
    var el = h('div', { class: 'toast toast--' + item.tone + (animOn() ? ' is-anim-in' : ''), data: { toastId: item.id }, attrs: item.tone === 'neg' ? { role: 'alert' } : {} },
      h('span', { class: 'toast__icon', attrs: { 'aria-hidden': 'true' } }, icon(item.icon || spec.icon, 22)),
      msgBox,
      h('button', { class: 'toast__x', attrs: { type: 'button', 'aria-label': 'Dismiss notification' }, on: { click: function () { T.dismiss(item.id); } } }, icon('ic_close', 16))
    );
    item.el = el;
    el.addEventListener('mouseenter', function () { pause(item); });
    el.addEventListener('mouseleave', function () { resume(item); });
    el.addEventListener('focusin', function () { pause(item); });
    el.addEventListener('focusout', function () { setTimeout(function () { if (item.el && item.el.isConnected) { resume(item); } }, 0); });
    roots.toast.insertBefore(el, roots.toast.firstChild);                    // newest on top
    visible.unshift(item);
    renderCount(item);
    startTimer(item, duration(item));
  }
  function pump() { while (queued.length && visible.length < tcfg().maxVisible) { mount(queued.shift()); } }

  // show(msg, { tone, icon, key, durationMs, action:{label,onClick}, sticky }) → id | null
  T.show = function (msg, opts) {
    if (!roots.toast) { return null; }
    opts = opts || {};
    var tone = TONES[opts.tone] ? opts.tone : 'info';
    if (RR.settings && RR.settings.get('toasts') === false && tone !== 'neg' && tone !== 'warn') { return null; }
    var text = U.cleanString(msg, 400, '');
    if (!text) { return null; }
    var nowMs = Date.now();
    if (opts.key) {
      var same = findBy(visible, function (t) { return t.key === opts.key; }) || findBy(queued, function (t) { return t.key === opts.key; });
      if (same && nowMs - same.lastAt <= tcfg().dedupeMs) {
        same.count++; same.lastAt = nowMs; renderCount(same);
        if (same.el) { startTimer(same, duration(same)); }
        return same.id;
      }
    }
    var item = { id: 't' + (++tseq), key: opts.key || null, tone: tone, msg: text, icon: opts.icon, sticky: !!opts.sticky, durationMs: opts.durationMs,
                 action: opts.action || null, count: 1, lastAt: nowMs, el: null, timer: null, remaining: 0, startedAt: 0 };
    if (visible.length < tcfg().maxVisible) { mount(item); } else { queued.push(item); }
    return item.id;
  };

  T.dismiss = function (id) {
    var q = findBy(queued, function (t) { return t.id === id; });
    if (q) { queued.splice(queued.indexOf(q), 1); return true; }
    var item = findBy(visible, function (t) { return t.id === id; });
    if (!item) { return false; }
    visible.splice(visible.indexOf(item), 1);
    clearTimeout(item.timer);
    var el = item.el, hadFocus = el && el.contains(document.activeElement);
    if (el) {
      if (animOn()) { el.classList.remove('is-anim-in'); el.classList.add('is-anim-out'); setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, RR.config.ui.fx.toastMs + 20); }
      else if (el.parentNode) { el.parentNode.removeChild(el); }
    }
    if (hadFocus && lastOutsideFocus && lastOutsideFocus.isConnected) { try { lastOutsideFocus.focus(); } catch (e) { /* ignore */ } }
    pump();
    return true;
  };
  T.clear = function () { queued.length = 0; visible.slice().forEach(function (t) { T.dismiss(t.id); }); };
  T.state = function () {
    return { visible: visible.map(function (t) { return { id: t.id, key: t.key, tone: t.tone, count: t.count, msg: t.msg }; }),
             queued: queued.map(function (t) { return { id: t.id, key: t.key, tone: t.tone, count: t.count, msg: t.msg }; }) };
  };

  // ═══════════════════════════════════════ modal ═══════════════════════════════════════
  var M = O.modal = {};
  var stack = [], mqueue = [], mseq = 0;

  function mcfg() { return RR.config.ui.modal; }
  function updateInert() {
    var any = stack.length > 0;
    setInert(document.getElementById('app'), any);
    setInert(document.getElementById('screens'), any);
    stack.forEach(function (e, i) { setInert(e.el, i < stack.length - 1); });
  }
  function firstFocusable(root) { var f = dom.focusable(root); return f.length ? f[0] : null; }

  function initialFocus(entry) {
    var s = entry.spec, buttons = entry.el.querySelectorAll('.modal__foot .btn'), target = null;
    var acts = s.actions || [];
    if (s.role === 'alertdialog') {
      for (var i = 0; i < acts.length; i++) { if (acts[i].safe) { target = buttons[i]; break; } }
      if (!target) { for (var j = 0; j < acts.length; j++) { if (acts[j].tone !== 'danger') { target = buttons[j]; break; } } }
    } else {
      for (var k = 0; k < acts.length; k++) { if (acts[k].primary) { target = buttons[k]; break; } }
    }
    target = target || firstFocusable(entry.el.querySelector('.modal')) || entry.el.querySelector('.modal');
    try { target.focus(); } catch (e) { /* ignore */ }
  }

  function trapTab(entry, ev) {
    var modal = entry.el.querySelector('.modal'), items = dom.focusable(modal);
    if (!items.length) { ev.preventDefault(); modal.focus(); return; }
    var first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (!modal.contains(active)) { ev.preventDefault(); first.focus(); return; }
    if (ev.shiftKey && (active === first || active === modal)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
  }

  function build(entry) {
    var s = entry.spec, n = ++mseq, titleId = 'mt' + n, bodyId = 'mb' + n;
    var role = s.role === 'alertdialog' ? 'alertdialog' : 'dialog';
    var dismissible = s.dismissible !== false;
    var acts = (s.actions && s.actions.length) ? s.actions : (dismissible ? [] : [{ id: 'ok', label: 'OK', primary: true }]);
    var head = h('div', { class: 'modal__head' },
      s.icon ? h('span', { class: 'modal__icon', attrs: { 'aria-hidden': 'true' } }, icon(s.icon, 26)) : null,
      h('h2', { class: 'modal__title', id: titleId, text: s.title || '' }),
      dismissible ? h('button', { class: 'btn btn--ghost btn--icon btn--sm', attrs: { type: 'button', 'aria-label': 'Close dialog' }, on: { click: function () { M.close(entry.id, 'dismissed'); } } }, icon('ic_close', 18)) : null
    );
    var body = h('div', { class: 'modal__body', id: bodyId });
    if (typeof s.body === 'string') { s.body.split(/\n{2,}/).forEach(function (p) { body.appendChild(h('p', { text: p })); }); }
    else if (s.body && s.body.nodeType) { body.appendChild(s.body); }
    var foot = null;
    if (acts.length) {
      foot = h('div', { class: 'modal__foot' }, acts.map(function (a) {
        var cls = 'btn' + (a.primary ? ' btn--primary' : '') + (a.tone === 'danger' ? ' btn--danger' : '') + (a.tone === 'ghost' ? ' btn--ghost' : '');
        return h('button', { class: cls, text: a.label, attrs: { type: 'button' }, data: { modalAction: a.id }, on: { click: function () { M.close(entry.id, a.id); } } });
      }));
    }
    var size = ['sm', 'md', 'lg', 'full'].indexOf(s.size) >= 0 ? s.size : 'md';
    var modal = h('div', { class: 'modal modal--' + size + (role === 'alertdialog' ? ' modal--alert' : '') + (animOn() ? ' is-anim-in' : ''),
      attrs: { role: role, 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': bodyId, tabindex: '-1' } }, head, body, foot);
    var scrim = h('div', { class: 'modal-layer__scrim' });
    scrim.addEventListener('mousedown', function () { if (dismissible && stack[stack.length - 1] === entry) { M.close(entry.id, 'dismissed'); } });
    var layer = h('div', { class: 'modal-layer' + (animOn() ? ' is-anim-in' : ''), data: { modalId: entry.id } }, scrim, modal);
    layer.addEventListener('keydown', function (ev) { if (ev.key === 'Tab') { trapTab(entry, ev); } });
    entry.el = layer; entry.dismissible = dismissible;
  }

  function show(entry) {
    build(entry);
    roots.modal.appendChild(entry.el);
    stack.push(entry);
    updateInert();
    initialFocus(entry);
    RR.bus.emit('ui:modal:opened', { id: entry.id });
  }

  // open({ id, title, body, size, actions:[{id,label,tone,primary,safe}], dismissible, role, icon }) → Promise<actionId|'dismissed'>
  M.open = function (spec) {
    spec = spec || {};
    if (!roots.modal) { return Promise.resolve('dismissed'); }
    var id = spec.id || ('modal_' + (mseq + mqueue.length + 1));
    var existing = findBy(stack, function (e) { return e.id === id; }) || findBy(mqueue, function (e) { return e.id === id; });
    if (existing) { return existing.promise; }                           // same id → same dialog (e.g. Settings opened twice)
    var entry = { id: id, spec: spec, opener: document.activeElement, el: null, resolve: null, promise: null, dismissible: spec.dismissible !== false };
    entry.promise = new Promise(function (resolve) { entry.resolve = resolve; });
    if (stack.length < mcfg().maxDepth) { show(entry); } else { mqueue.push(entry); }
    return entry.promise;
  };

  M.close = function (id, result) {
    var entry = id ? findBy(stack, function (e) { return e.id === id; }) : stack[stack.length - 1];
    if (!entry) {
      var q = id ? findBy(mqueue, function (e) { return e.id === id; }) : null;
      if (q) { mqueue.splice(mqueue.indexOf(q), 1); q.resolve('dismissed'); return true; }
      return false;
    }
    stack.splice(stack.indexOf(entry), 1);
    if (entry.el.parentNode) { entry.el.parentNode.removeChild(entry.el); }
    updateInert();
    var back = entry.opener && entry.opener.isConnected && !entry.opener.closest('[inert]') ? entry.opener : null;
    if (!back && stack.length) { back = firstFocusable(stack[stack.length - 1].el.querySelector('.modal')); }
    if (!back) { back = firstFocusable(document.getElementById('app') || document.body); }
    if (back) { try { back.focus(); } catch (e) { /* ignore */ } }
    var outcome = result === undefined ? 'dismissed' : result;
    entry.resolve(outcome);
    RR.bus.emit('ui:modal:closed', { id: entry.id, result: outcome });
    while (mqueue.length && stack.length < mcfg().maxDepth) { show(mqueue.shift()); }
    return true;
  };
  M.closeAll = function () { mqueue.splice(0).forEach(function (e) { e.resolve('dismissed'); }); while (stack.length) { M.close(null, 'dismissed'); } };
  M.isOpen = function (id) { return !!findBy(stack, function (e) { return e.id === id; }); };
  M.element = function (id) { var e = findBy(stack, function (x) { return x.id === id; }); return e ? e.el.querySelector('.modal') : null; };
  M.state = function () { return { open: stack.map(function (e) { return e.id; }), queued: mqueue.map(function (e) { return e.id; }) }; };

  // confirm({ title, body, confirmLabel, cancelLabel, tone:'danger'|'primary', id }) → Promise<boolean>
  M.confirm = function (o) {
    o = o || {};
    var danger = o.tone === 'danger';
    return M.open({
      id: o.id || 'confirm', title: o.title || 'Are you sure?', body: o.body || '', size: 'sm', icon: o.icon || (danger ? 'ic_warning' : 'ic_help'),
      role: danger ? 'alertdialog' : 'dialog',
      actions: [{ id: 'cancel', label: o.cancelLabel || 'Cancel', tone: 'ghost', safe: true },
                { id: 'confirm', label: o.confirmLabel || 'Confirm', tone: danger ? 'danger' : undefined, primary: !danger }]
    }).then(function (r) { return r === 'confirm'; });
  };

  // ═════════════════════════════════════ tooltip ═════════════════════════════════════
  var tip = O.tooltip = {};
  var tipEl = null, tipFor = null, attached = [];

  function showTip(target) {
    var g = RR.data.glossaryById[target.getAttribute('data-glossary')];
    if (!g || !tipEl) { return; }
    tipFor = target;
    dom.clear(tipEl);
    tipEl.appendChild(h('b', { text: g.term }));
    tipEl.appendChild(document.createTextNode(g.short));
    tipEl.hidden = false;
    target.setAttribute('aria-describedby', 'tooltip');
    var r = RR.ui.stage.toStage(target.getBoundingClientRect()), w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
    var left = Math.min(RR.config.stage.w - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    var top = r.top + r.height + 8;
    if (top + ht > RR.config.stage.h - 12) { top = r.top - ht - 8; }
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  }
  function hideTip() {
    if (tipFor) { tipFor.removeAttribute('aria-describedby'); }
    tipFor = null;
    if (tipEl) { tipEl.hidden = true; }
  }
  tip.hide = hideTip;
  tip.visibleFor = function () { return tipFor ? tipFor.getAttribute('data-glossary') : null; };

  // attach(root): idempotent per root; also (re)marks glossary terms keyboard-focusable.
  tip.attach = function (root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('[data-glossary]') : [], function (el) { if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); } });
    if (attached.indexOf(root) >= 0 || root === document) { return; }
    attached.push(root);
    var find = function (e) { return e.target && e.target.closest ? e.target.closest('[data-glossary]') : null; };
    root.addEventListener('mouseover', function (e) { var t = find(e); if (t) { showTip(t); } });
    root.addEventListener('mouseout', function (e) { if (find(e)) { hideTip(); } });
    root.addEventListener('focusin', function (e) { var t = find(e); if (t) { showTip(t); } });
    root.addEventListener('focusout', function (e) { if (find(e)) { hideTip(); } });
    root.addEventListener('click', function (e) {
      var t = find(e);
      if (t && !t.closest('button, [data-action]')) { O.glossary.open(t.getAttribute('data-glossary')); }
    });
  };

  // ═════════════════════════════ catalogue modals (Phase 1) ═════════════════════════════
  // settings ─────────────────────────────────────────────────────────────────────────
  O.settings = {};
  O.settings.open = function () {
    var S = RR.settings, st = RR.store.get();
    var inGame = !!(st && st.loop.status !== 'TITLE');
    var forced = S.prefersReducedMotion();
    var body = h('div', { class: 'stack' });
    function row(key, title, sub, extra) {
      var checked = key === 'animations' && forced ? false : (key === 'reducedFx' && forced ? true : !!S.all()[key]);
      var input = h('input', { class: 'switch', attrs: { type: 'checkbox', role: 'switch', id: 'set-' + key, checked: checked ? true : undefined, disabled: (extra && extra.disabled) ? true : undefined }, data: { setting: key } });
      input.checked = checked;
      input.addEventListener('change', function () { S.set(key, input.checked); });
      var lab = h('label', { class: 'setting', attrs: { for: 'set-' + key } }, h('span', { class: 'setting__text' }, h('b', { text: title }), h('small', { text: sub })), input);
      body.appendChild(lab);
    }
    row('autosave', 'Auto-save', 'Save your game in this browser after every change.');
    row('toasts', 'Notifications', 'Show pop-up messages. Warnings and problems always show.');
    row('animations', 'Animations', forced ? 'Off because your device asks for reduced motion.' : 'Number tweening, flashes and slide-ins.', { disabled: forced });
    row('reducedFx', 'Reduced effects', forced ? 'On because your device asks for reduced motion.' : 'Turn off coin bursts, confetti and screen shake.', { disabled: forced });
    row('tutorialHints', 'Tutorial hints', 'Show first-time tips from your mentor.');
    row('sound', 'Sound', 'Audio arrives in a later update.', { disabled: true });

    var cur = h('select', { class: 'input', id: 'set-currency', attrs: { 'aria-label': 'Currency symbol' }, style: { width: '110px', height: '40px' } },
      ['$', '\u20ac', '\u00a3', '\u20b1', '\u00a5'].map(function (c) { return h('option', { text: c, attrs: { value: c, selected: S.all().currencySymbol === c ? true : undefined } }); }));
    cur.value = S.all().currencySymbol;
    cur.addEventListener('change', function () { S.set('currencySymbol', cur.value); });
    body.appendChild(h('div', { class: 'setting' }, h('label', { class: 'setting__text', attrs: { for: 'set-currency' } }, h('b', { text: 'Currency symbol' }), h('small', { text: 'Display only. Amounts are not converted.' })), cur));

    var data = h('div', { class: 'stack', style: { marginTop: '14px' } },
      h('div', { class: 'eyebrow', text: 'Your data' }),
      h('div', { class: 'split' },
        h('button', { class: 'btn', attrs: { type: 'button', 'data-action': 'game.export', 'aria-disabled': inGame ? undefined : 'true', title: inGame ? undefined : 'Start a game first' } }, icon('ic_download', 18), 'Export game'),
        h('button', { class: 'btn', attrs: { type: 'button', 'data-action': 'game.import' } }, icon('ic_upload', 18), 'Import game')),
      inGame ? h('div', { class: 'split' }, h('button', { class: 'btn', attrs: { type: 'button', 'data-action': 'game.toTitle' } }, icon('ic_logout', 18), 'Quit to title'),
        h('span', { class: 'field__hint', text: 'Your game is saved first.' })) : null,
      h('div', { class: 'split' },
        h('button', { class: 'btn btn--ghost', attrs: { type: 'button' }, on: { click: function () { S.reset(); M.close('settings'); setTimeout(O.settings.open, 0); } } }, 'Reset settings'),
        h('button', { class: 'btn btn--danger', attrs: { type: 'button', 'data-action': 'game.deleteSave' } }, icon('ic_trash', 18), 'Delete saved game')),
      h('p', { class: 'field__hint', text: 'Version ' + RR.version + (RR.env.mode === 'ONLINE' ? ' \u00b7 online features arrive in a later phase' : ' \u00b7 offline mode: everything stays in this browser') })
    );
    body.appendChild(data);
    return M.open({ id: 'settings', title: 'Settings', icon: 'ic_settings', size: 'md', body: body, actions: [{ id: 'done', label: 'Done', primary: true }] });
  };

  // glossary ─────────────────────────────────────────────────────────────────────────
  O.glossary = {};
  O.glossary.open = function (termId) {
    var list = RR.data.glossary.slice().sort(function (a, b) { return a.term.localeCompare(b.term); });
    var search = h('input', { class: 'input', attrs: { type: 'search', placeholder: 'Search terms', 'aria-label': 'Search glossary' } });
    var items = h('div', { class: 'stack', style: { marginTop: '12px' } });
    var els = list.map(function (g) {
      var el = h('div', { class: 'glossary-item', id: 'gl-' + g.id, data: { term: g.id } }, h('h3', { text: g.term }), h('p', { text: g.long }));
      items.appendChild(el); return { g: g, el: el };
    });
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      els.forEach(function (x) { x.el.hidden = !!q && (x.g.term + ' ' + x.g.long).toLowerCase().indexOf(q) < 0; });
    });
    var p = M.open({ id: 'glossary', title: 'Glossary', icon: 'ic_book', size: 'md', body: h('div', null, search, items), actions: [{ id: 'close', label: 'Close', primary: true }] });
    var hit = termId && findBy(els, function (x) { return x.g.id === termId; });
    if (hit) { hit.el.classList.add('is-focus'); hit.el.scrollIntoView({ block: 'center' }); }
    return p;
  };

  // full log ─────────────────────────────────────────────────────────────────────────
  O.logModal = {};
  O.logModal.open = function () {
    var st = RR.store.get(), body = h('div');
    var rows = st ? st.log.slice().reverse() : [];
    if (!rows.length) { body.appendChild(h('p', { text: 'Nothing has happened yet. Your story will appear here.' })); }
    rows.forEach(function (e) {
      body.appendChild(h('div', { class: 'log-row' },
        h('span', { class: 'log-row__turn', text: U.fmt.date(e.turn) }),
        h('span', { class: 'chip', text: e.kind.charAt(0) + e.kind.slice(1).toLowerCase() }),
        h('span', { class: 'log-row__text', text: e.text }),
        h('b', { class: 'val ' + (e.delta > 0 ? 'is-pos' : (e.delta < 0 ? 'is-neg' : '')), text: U.isNum(e.delta) ? U.fmt.money(e.delta, { signed: true }) : '' })));
    });
    return M.open({ id: 'log', title: 'Log', icon: 'ic_journal', size: 'lg', body: body, actions: [{ id: 'close', label: 'Close', primary: true }] });
  };

  // ═════════════════════════════════ receipt presenter ═════════════════════════════════
  var R = RR.ui.receipt = {};
  var KIND_ICON = { CASH: 'ic_cash', HEALTH: 'ic_heart', NPC: 'ic_users', CREDIT: 'ic_card', DEBT: 'ic_loan', DEPOSIT: 'ic_piggy', ASSET: 'ic_house',
                    MARKET: 'ic_chart_up', STORY: 'ic_journal', SALARY: 'ic_briefcase', EXPENSE: 'ic_receipt', LOG: 'ic_journal' };
  var MONEY_KINDS = { CASH: 1, DEBT: 1, DEPOSIT: 1, ASSET: 1, SALARY: 1, EXPENSE: 1 };

  function norm(r) {
    if (!r || typeof r !== 'object') { return null; }
    var delta = U.isNum(r.delta) ? r.delta : null;
    var tone = ['pos', 'neg', 'warn', 'info'].indexOf(r.tone) >= 0 ? r.tone : (delta > 0 ? 'pos' : (delta < 0 ? 'neg' : 'info'));
    return { kind: r.kind || 'LOG', label: U.cleanString(r.label, 60, 'Update'), delta: delta, tone: tone, icon: r.icon || KIND_ICON[r.kind] || 'ic_info', detail: U.cleanString(r.detail, 120, '') };
  }
  function deltaText(r) {
    if (r.delta === null) { return ''; }
    return MONEY_KINDS[r.kind] ? U.fmt.money(r.delta, { signed: true }) : U.fmt.signed(r.delta);
  }
  function plainText(r) { var d = deltaText(r); return r.label + (d ? ' ' + d : '') + (r.detail ? ' \u00b7 ' + r.detail : ''); }

  // chip(receipt) → element (icon + label + delta: tone is never the only cue)
  R.chip = function (raw) {
    var r = norm(raw);
    if (!r) { return document.createElement('span'); }
    var d = deltaText(r);
    return h('span', { class: 'chip chip--' + (r.tone === 'info' ? 'accent' : r.tone), attrs: { title: r.detail || undefined } }, icon(r.icon, 14), r.label + (d ? ' ' + d : ''));
  };
  // strip(receipts) → element with ≤ stripMax chips (embedded by the Phase 2 Event Card for MAJOR results)
  R.strip = function (receipts) {
    var list = (receipts || []).map(norm).filter(Boolean).slice(0, RR.config.ui.receipts.stripMax);
    return h('div', { class: 'stack', attrs: { role: 'list', 'aria-label': 'Results' }, style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, list.map(function (r) {
      var c = R.chip(r); c.setAttribute('role', 'listitem'); return c;
    }));
  };
  R.modalBody = function (receipts) {
    return h('div', { class: 'stack' }, (receipts || []).map(norm).filter(Boolean).map(function (r) {
      return h('div', { class: 'receipt receipt--' + r.tone }, icon(r.icon, 20),
        h('span', { class: 'receipt__label' }, r.label, r.detail ? h('span', { class: 'receipt__detail', text: r.detail }) : null),
        h('b', { class: 'receipt__delta', text: deltaText(r) }));
    }));
  };
  O.receiptModal = { open: function (receipts) {
    return M.open({ id: 'receipt', title: 'What happened', icon: 'ic_receipt', size: 'md', body: R.modalBody(receipts), actions: [{ id: 'close', label: 'Close', primary: true }] });
  } };

  // consequence (CRISIS): alertdialog, not dismissible, focus on Acknowledge, one shake unless reduced motion.
  O.consequence = { show: function (o) {
    o = o || {};
    var body = h('div', { class: 'stack' }, o.body ? h('p', { text: o.body }) : null, o.receipts && o.receipts.length ? R.modalBody(o.receipts) : null);
    var p = M.open({ id: 'consequence', title: o.title || 'This is serious', icon: 'ic_alert', size: 'md', role: 'alertdialog', dismissible: false, body: body,
      actions: [{ id: 'ack', label: 'Acknowledge', primary: true, safe: true }] });
    setTimeout(function () {
      var el = M.element('consequence');
      if (el) { el.classList.remove('is-anim-in'); if (RR.ui.fx) { RR.ui.fx.shake(el); } }
    }, RR.config.ui.fx.modalMs + 20);
    return p;
  } };

  // present(receipts, { source, severity: 'MINOR'|'MAJOR'|'CRISIS' }) — §1.12.11
  R.present = function (receipts, opts) {
    opts = opts || {};
    var list = (receipts || []).map(norm).filter(function (r) { return r && r.kind !== 'LOG'; });
    var severity = ['MINOR', 'MAJOR', 'CRISIS'].indexOf(opts.severity) >= 0 ? opts.severity : 'MINOR';
    var out = { toasts: 0, strip: null, modal: null };
    if (!list.length) { return out; }
    var byImpact = list.slice().sort(function (a, b) { return Math.abs(b.delta || 0) - Math.abs(a.delta || 0); });
    function toast(r, extra) { var id = T.show(plainText(r), Object.assign({ tone: r.tone, icon: r.icon }, extra || {})); if (id) { out.toasts++; } }

    if (severity === 'CRISIS') {
      out.modal = O.consequence.show({ title: opts.title, body: opts.body, receipts: list });
    } else if (severity === 'MAJOR') {
      out.strip = R.strip(list);                          // the Event Card (Phase 2) embeds this and keeps it until Continue
      toast(byImpact[0]);
    } else if (list.length <= RR.config.ui.receipts.toastMax) {
      list.forEach(function (r) { toast(r); });
    } else {
      var top = byImpact.slice(0, 2), more = list.length - top.length;
      top.forEach(function (r) { toast(r); });
      var id = T.show('+' + more + ' more change' + (more === 1 ? '' : 's'), { tone: 'info', icon: 'ic_receipt', action: { label: 'View all', onClick: function () { O.receiptModal.open(list); } } });
      if (id) { out.toasts++; }
    }
    return out;
  };

  // ═══════════════════════════════════════ init ═══════════════════════════════════════
  var inited = false;
  O.init = function () {
    roots.toast = document.getElementById('toast-root');
    roots.modal = document.getElementById('modal-root');
    roots.announcer = document.getElementById('announcer');
    tipEl = document.getElementById('tooltip');
    if (!roots.toast || !roots.modal) { throw new Error('RR.ui.overlays.init: #toast-root / #modal-root missing'); }
    if (inited) { return; }
    inited = true;

    document.addEventListener('focusin', function (e) { if (!e.target.closest || !e.target.closest('#toast-root')) { lastOutsideFocus = e.target; } });
    roots.toast.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      var el = e.target.closest && e.target.closest('.toast');
      if (el) { e.preventDefault(); e.stopPropagation(); T.dismiss(el.getAttribute('data-toast-id')); }
    });
    // Esc: close the top modal if dismissible (capture so drawers underneath don't also react); Esc also hides a tooltip.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      if (tipFor) { hideTip(); }
      var top = stack[stack.length - 1];
      if (top && top.dismissible) { e.preventDefault(); e.stopPropagation(); M.close(top.id, 'dismissed'); }
    }, true);
    RR.bus.on('ui:toast', function (p) { if (p && p.msg) { T.show(p.msg, p); } });     // engines request toasts by emitting data (R2)
  };
  O._reset = function () { T.clear(); M.closeAll(); };                                  // tests
})(window.RR);
