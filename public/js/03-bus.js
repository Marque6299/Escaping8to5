/* RAT RACE · 03-bus.js · RR.bus — tiny pub/sub. Engines emit DATA; UI subscribes (R2). */
(function (RR) {
  'use strict';

  // Canonical topics: §1.4 + §1.12.10, plus Phase 1 additions (settings:changed, save:written, save:error).
  var TOPICS = [
    'state:committed', 'turn:phase', 'turn:started', 'payday:done', 'card:drawn', 'card:resolved', 'market:ticked',
    'asset:bought', 'asset:sold', 'debt:taken', 'debt:paid', 'shortfall:opened', 'liquidation:done', 'mode:changed',
    'game:ended', 'ui:toast',
    'effects:applied', 'npc:changed', 'health:changed', 'consequence:scheduled', 'consequence:fired', 'deposit:changed',
    'property:changed', 'auth:changed', 'sync:status', 'sync:conflict', 'entitlement:changed', 'ui:modal:opened', 'ui:modal:closed',
    // Phase 1 additions
    'settings:changed', 'save:written', 'save:error'
  ];

  var handlers = Object.create(null);   // topic → [{fn, once}]
  var known = Object.create(null);
  TOPICS.forEach(function (t) { known[t] = true; });

  var bus = RR.bus = {};
  bus.topics = TOPICS.slice();
  bus.errors = [];                       // listener exceptions are collected (and logged) — a bad listener never breaks the emitter

  function checkTopic(topic, verb) {
    if (typeof topic !== 'string' || !topic) { throw new TypeError('RR.bus.' + verb + ': topic must be a non-empty string'); }
    if (!known[topic]) { RR.warnOnce('bus:' + topic, 'RR.bus.' + verb + ': "' + topic + '" is not a canonical topic (add it to 03-bus.js and the plan)'); }
  }

  bus.on = function (topic, fn) {
    checkTopic(topic, 'on');
    if (typeof fn !== 'function') { throw new TypeError('RR.bus.on: handler must be a function'); }
    var entry = { fn: fn, once: false };
    (handlers[topic] || (handlers[topic] = [])).push(entry);
    return function unsubscribe() { remove(topic, entry); };
  };

  bus.once = function (topic, fn) {
    checkTopic(topic, 'once');
    if (typeof fn !== 'function') { throw new TypeError('RR.bus.once: handler must be a function'); }
    var entry = { fn: fn, once: true };
    (handlers[topic] || (handlers[topic] = [])).push(entry);
    return function unsubscribe() { remove(topic, entry); };
  };

  function remove(topic, entry) {
    var list = handlers[topic];
    if (!list) { return; }
    var i = list.indexOf(entry);
    if (i >= 0) { list.splice(i, 1); }
  }

  bus.emit = function (topic, payload) {
    checkTopic(topic, 'emit');
    var list = handlers[topic];
    if (!list || !list.length) { return 0; }
    var snapshot = list.slice();                       // listeners added/removed during emit don't affect this round
    var called = 0;
    for (var i = 0; i < snapshot.length; i++) {
      var entry = snapshot[i];
      if (entry.once) { remove(topic, entry); }
      try { entry.fn(payload, topic); called++; }
      catch (err) {
        bus.errors.push({ topic: topic, error: err });
        if (bus.errors.length > 50) { bus.errors.shift(); }
        if (typeof console !== 'undefined' && console.error) { console.error('[RR.bus] listener for "' + topic + '" threw:', err); }
      }
    }
    return called;
  };

  bus.listenerCount = function (topic) { return handlers[topic] ? handlers[topic].length : 0; };
  bus.off = function (topic) { if (topic) { delete handlers[topic]; } else { handlers = Object.create(null); } };   // tests only
})(window.RR);
