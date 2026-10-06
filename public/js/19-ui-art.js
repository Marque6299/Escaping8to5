/* RAT RACE · 19-ui-art.js · RR.ui.icon · RR.ui.avatar · RR.ui.scene (Appendix F).
   Everything is SVG built with createElementNS — no innerHTML, no network, works on file://.
   Avatars use their OWN mulberry32 seeded from lookSeed and never touch RR.rng, so art cannot disturb game determinism (F.4). */
(function (RR) {
  'use strict';

  var U = RR.util;
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, children) {
    var el = document.createElementNS(NS, tag), k;
    if (attrs) { for (k in attrs) { if (attrs[k] !== undefined && attrs[k] !== null) { el.setAttribute(k, String(attrs[k])); } } }
    if (children) { children.forEach(function (c) { if (c) { el.appendChild(c); } }); }
    return el;
  }

  // ═════════════════════════════════════ icons ═════════════════════════════════════
  var iconSet = null;
  var TONE_VAR = { pos: 'var(--pos)', neg: 'var(--neg)', warn: 'var(--warn)', passive: 'var(--passive)', accent: 'var(--accent)', health: 'var(--health)', npc: 'var(--npc)', asset: 'var(--asset)', premium: 'var(--premium)', gold: 'var(--gold)', muted: 'var(--text-md)' };

  // icon(name, { size = 20, tone, label }) → <svg class="ic"><use href="#ic_name"/></svg>. Unknown name → ic_help + one dev warning.
  RR.ui.icon = function (name, o) {
    o = o || {};
    if (!iconSet) { iconSet = {}; (RR.data.iconNames || []).forEach(function (n) { iconSet[n] = true; }); }
    var id = String(name || '');
    if (id.indexOf('ic_') !== 0) { id = 'ic_' + id; }
    if (!iconSet[id]) { RR.warnOnce('icon:' + id, 'RR.ui.icon: unknown icon "' + name + '" — showing ic_help'); id = 'ic_help'; }
    var size = o.size || 20;
    var el = svg('svg', { 'class': 'ic', viewBox: '0 0 24 24', width: size, height: size, focusable: 'false' }, [svg('use', { href: '#' + id })]);
    el.style.width = size + 'px'; el.style.height = size + 'px';
    if (o.tone && TONE_VAR[o.tone]) { el.style.color = TONE_VAR[o.tone]; }
    if (o.label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', o.label); } else { el.setAttribute('aria-hidden', 'true'); }
    return el;
  };
  RR.ui.icon.has = function (name) { var id = String(name); if (id.indexOf('ic_') !== 0) { id = 'ic_' + id; } return (RR.data.iconNames || []).indexOf(id) >= 0; };
  // inject the sprite once (never fetched: file:// safe). Parsed with DOMParser as an image/svg+xml document, then adopted.
  RR.ui.icon.inject = function () {
    if (document.querySelector('.ic-sprite')) { return; }
    var doc = new DOMParser().parseFromString(RR.data.iconSprite, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) { throw new Error('icon sprite failed to parse'); }
    document.body.insertBefore(document.importNode(doc.documentElement, true), document.body.firstChild);
  };

  // ═════════════════════════════════════ avatars ═════════════════════════════════════
  var SKIN = ['#f7dcc8', '#ebbd93', '#d49c6c', '#b87c50', '#8c5b3b', '#5f3d29'];                                   // ×6, equal weight, wide range
  var HAIR = ['#18130f', '#3c2b20', '#6d4626', '#a96d35', '#dcb76d', '#8d2f20', '#a1a9b3', '#2d3d6b'];            // ×8
  var BG = ['#1f2b4d', '#2b2142', '#1e3d3b', '#3b2c22', '#2b303b', '#36283c'];                                      // ×6
  var PALETTES = {                                                                                                  // outfit colours per role family
    casual:  ['#5b7cfa', '#34a889', '#d9695f', '#8b6fd1', '#e0a43a', '#4a9bc0'],
    knit:    ['#a4624a', '#6e8f5e', '#8b6f9e', '#c28a4e', '#58779c', '#9c5469'],
    office:  ['#44546f', '#5a6b84', '#3d6a74', '#6a5a82', '#4b6a50', '#7a5b4b'],
    finance: ['#23304f', '#2e3b3a', '#3a2f46', '#4a3b32', '#1f3a52', '#34373f'],
    agent:   ['#2f5d7c', '#7a3f4f', '#3d6b5a', '#5a4a86', '#8a6a2f', '#33506b'],
    mentor:  ['#6b5a42', '#52676f', '#76574b', '#4c6b57', '#6f6a82', '#7c6a3a'],
    trade:   ['#c2761f', '#35588a', '#3e7a58', '#8a4a3a', '#4a5568', '#b6932a'],
    smart:   ['#3f5f8f', '#5f4f87', '#3f7f77', '#8a5a4f', '#4a5a6f', '#6f5f3f'],
    sporty:  ['#d1543f', '#2f8fbf', '#3fa860', '#8a5fd0', '#d9a21f', '#2f6f9f'],
    player:  ['#7c9cff', '#34d399', '#f5c451', '#fb7185', '#a78bfa', '#22d3ee']
  };
  var ROLE_FAMILY = { FAMILY: 'knit', BOSS: 'office', FRIEND: 'casual', BANKER: 'finance', AGENT: 'agent', MENTOR: 'mentor', HANDYMAN: 'trade', TENANT: 'casual', ADVISOR: 'smart', PLAYER: 'player' };
  var ROLE_LABEL = { FAMILY: 'family', BOSS: 'boss', FRIEND: 'friend', BANKER: 'banker', AGENT: 'real-estate agent', MENTOR: 'mentor', HANDYMAN: 'handyman', TENANT: 'tenant', ADVISOR: 'advisor', PLAYER: 'you' };

  function prng(seed) {                       // local mulberry32 — never RR.rng (F.4)
    var s = U.fnv1a32('av:' + (seed >>> 0)) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shade(hex, amt) {                  // amt −1…1 (darken/lighten) → #rrggbb
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function ch(c) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt))); }
    return '#' + ((1 << 24) + (ch(r) << 16) + (ch(g) << 8) + ch(b)).toString(16).slice(1);
  }

  // Hair styles: { back, front } path lists (back = volume/length behind or beside the head, front = fringe/top over the forehead).
  var HAIR_STYLES = [
    { back: [], front: ['M21.2 26.5Q20.5 15 32 14.4Q43.5 15 42.8 26.5Q40.5 20.5 32 20.3Q23.5 20.5 21.2 26.5Z'] },                                              // 0 buzz cut
    { back: [], front: ['M20.6 27.5Q18.8 12.5 33 13.6Q45.6 14.6 43.4 27.5Q41.5 20.4 34.5 19.6Q26.5 22.6 20.6 27.5Z'] },                                         // 1 short, side part
    { back: ['M32 5.5a13.5 13.5 0 0 1 12.8 9.6 7 7 0 0 1 3.3 9.4 6.5 6.5 0 0 1-3.6 8.4L42 22H22l-2.5 10.9A6.5 6.5 0 0 1 16 24.5a7 7 0 0 1 3.2-9.4A13.5 13.5 0 0 1 32 5.5Z'],
             front: ['M22 24Q23 17.4 32 17Q41 17.4 42 24Q38.5 20.8 32 20.8Q25.5 20.8 22 24Z'] },                                                                  // 2 curly volume
    { back: ['M21.5 22Q16.5 38 19 54L25 54Q23.4 40 25 30Z', 'M42.5 22Q47.5 38 45 54L39 54Q40.6 40 39 30Z'],
      front: ['M20.8 27Q19 13 32 13.2Q45 13 43.2 27Q38.5 18.8 32 18.8Q25.5 18.8 20.8 27Z'] },                                                                  // 3 long straight
    { back: ['M32 6.2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z'], front: ['M21 26.5Q20 14.6 32 14.2Q44 14.6 43 26.5Q40 19.6 32 19.4Q24 19.6 21 26.5Z'] },                // 4 top bun
    { back: ['M43 18Q53 20 52 34Q50.5 28.5 44.5 25Z'], front: ['M20.8 27Q19.5 13.4 32 13.4Q44.5 13.4 43.2 27Q39.5 19.4 32 19.2Q24.5 19.4 20.8 27Z'] },          // 5 ponytail
    { back: ['M20.8 24Q19 34 22 41L26 41Q24 34 25 28Z', 'M43.2 24Q45 34 42 41L38 41Q40 34 39 28Z'],
      front: ['M20.4 27Q18.8 13 32 13Q45.2 13 43.6 27Q39 19 32 19.4Q25 19 20.4 27Z'] },                                                                         // 6 bob
    { back: [], front: ['M21 26Q19.5 16 24 13.5L26 8.4 29 14 32 7.2 35 14 38 8.4 40 13.5Q44.5 16 43 26Q40 20 32 19.6Q24 20 21 26Z'] },                        // 7 spiky
    { back: [], front: ['M20.4 28Q17.8 11.6 33.5 12.6Q47 13.6 43.6 28Q42.6 22.2 36.4 19.2Q27.4 23.4 20.4 28Z'] },                                               // 8 long fringe
    { back: [], front: [] }                                                                                                                                       // 9 bald
  ];

  // Outfit bodies (10 variants). Each returns an array of SVG nodes drawn over the shoulders. c = outfit colour, d = darker, l = lighter, sk = skin.
  var BODY = 'M6 64C6 50.5 17 44 32 44S58 50.5 58 64Z';
  function P(d, fill, extra) { var a = { d: d, fill: fill }; if (extra) { for (var k in extra) { a[k] = extra[k]; } } return svg('path', a); }
  var OUTFITS = [
    function (c, d, l, sk) { return [P(BODY, c), P('M24.5 44.2Q32 53 39.5 44.2Z', sk)]; },                                                                         // 0 crew
    function (c, d, l, sk) { return [P(BODY, c), P('M25 44.2L32 55 39 44.2Z', sk)]; },                                                                              // 1 v-neck
    function (c, d, l, sk) { return [P(BODY, c), P('M25.5 44.2L32 54 38.5 44.2Z', '#f1f4fb'), P('M25 44L31 53 28.5 56 22.5 48Z', l), P('M39 44L33 53 35.5 56 41.5 48Z', l)]; },   // 2 collared shirt
    function (c, d, l, sk) { return [P(BODY, c), P('M22 47Q32 40 42 47Q32 56 22 47Z', d), P('M30 50V60M34 50V60', 'none', { stroke: l, 'stroke-width': 1.4, 'stroke-linecap': 'round' })]; },   // 3 hoodie
    function (c, d, l, sk) { return [P(BODY, c), P('M24.6 41.6H39.4V47.4Q32 50 24.6 47.4Z', d)]; },                                                                // 4 turtleneck
    function (c, d, l, sk) { return [P(BODY, d), P('M26 44.2L32 62 38 44.2Z', '#f1f4fb'), P('M25 44.2L32 62 27 64H19Z', c), P('M39 44.2L32 62 37 64H45Z', c)]; },     // 5 blazer
    function (c, d, l, sk) { return [P(BODY, c), P('M24.5 44.2Q32 53 39.5 44.2Z', sk), P('M8 54H56M7 59H57', 'none', { stroke: l, 'stroke-width': 2.2, opacity: '.55' })]; },       // 6 stripe tee
    function (c, d, l, sk) { return [P(BODY, '#e8ecf5'), P('M20 53H44V64H20Z', c), P('M22 53L25 44.4M42 53L39 44.4', 'none', { stroke: c, 'stroke-width': 2.4 }), P('M25.5 44.2Q32 50 38.5 44.2Z', sk)]; },   // 7 overalls
    function (c, d, l, sk) { return [P(BODY, c), P('M25 44.2L32 56 39 44.2Z', '#f1f4fb'), P('M32 50V64', 'none', { stroke: d, 'stroke-width': 1.4 }), svg('circle', { cx: 32, cy: 56, r: 1, fill: d }), svg('circle', { cx: 32, cy: 60.5, r: 1, fill: d })]; },   // 8 cardigan
    function (c, d, l, sk) { return [P(BODY, c), P('M22 44.4Q32 52 42 44.4V49.6Q32 57 22 49.6Z', l), P('M36 52L38 60', 'none', { stroke: l, 'stroke-width': 3, 'stroke-linecap': 'round' })]; }   // 9 scarf
  ];
  // Role signature details (role-driven, not demographic-driven).
  var SIGNATURE = {
    finance: function (c, d, l) { return [P('M32 47.6L29.6 51.6 32 63 34.4 51.6Z', l), P('M30 47.2H34L32 49.6Z', l)]; },                                                  // tie
    agent:   function () { return [P('M41.6 53H50V58.6H41.6Z', '#f1f4fb'), P('M43.2 55.4H48.4', 'none', { stroke: '#7a8aa8', 'stroke-width': 1 })]; },                  // name badge
    office:  function () { return [P('M26.4 44.6L30 60', 'none', { stroke: '#e8ecf5', 'stroke-width': 1.1 }), P('M28.4 58.6H34V63H28.4Z', '#e8ecf5')]; },                // lanyard + badge
    trade:   function () { return [P('M8.4 57.4H55.6M9 61.2H55', 'none', { stroke: '#f5d25a', 'stroke-width': 2, opacity: '.9' })]; },                                   // reflective stripes
    mentor:  function (c, d) { return [svg('circle', { cx: 18, cy: 56, r: 1, fill: d }), svg('circle', { cx: 46, cy: 58, r: 1, fill: d }), svg('circle', { cx: 24, cy: 61, r: 1, fill: d })]; },
    sporty:  function () { return [P('M7.8 52L12 64M56.2 52L52 64', 'none', { stroke: '#f1f4fb', 'stroke-width': 2.2, opacity: '.8' })]; }
  };

  // resolve(lookOrSeed, role) → look parameters. Draw order is FIXED: never reorder (it would change every saved avatar).
  function resolveLook(look, role) {
    var seed = typeof look === 'object' && look ? (look.seed >>> 0) : (look >>> 0);
    var r = prng(seed), pick = function (n) { return Math.floor(r() * n); };
    var fam = ROLE_FAMILY[role] || 'casual';
    var out = {
      skin: pick(6), hairStyle: pick(10), hairColor: pick(8), outfit: pick(10), outfitColor: pick(6), accessory: pick(6), bg: pick(6),
      eyes: pick(4), brows: pick(3), mouth: pick(4), nose: pick(3), head: pick(2), accBias: r(), family: fam
    };
    if (typeof look === 'object' && look) {                                    // explicit overrides (premium cosmetics, Phase 6)
      ['skin', 'hairStyle', 'hairColor', 'outfit', 'outfitColor', 'accessory', 'bg', 'eyes', 'brows', 'mouth', 'nose', 'head'].forEach(function (k) { if (U.isInt(look[k])) { out[k] = look[k]; } });
    }
    if (fam === 'trade' && out.accBias < 0.45) { out.accessory = 4; }           // work cap
    if ((fam === 'finance' || fam === 'smart' || fam === 'office') && out.accBias > 0.6 && out.accessory === 0) { out.accessory = 1 + (out.accBias > 0.8 ? 1 : 0); }   // glasses
    return out;
  }

  function renderAvatar(look, o) {
    o = o || {};
    var role = o.role || 'FRIEND', size = o.size || 64;
    var p = resolveLook(look, role), fam = o.outfit && PALETTES[o.outfit] ? o.outfit : p.family;
    var skin = SKIN[p.skin], skinD = shade(skin, -0.14), hair = HAIR[p.hairColor], hairD = shade(hair, -0.25);
    var oc = PALETTES[fam][p.outfitColor], od = shade(oc, -0.28), ol = shade(oc, 0.35), ink = '#1b1b24';
    var style = HAIR_STYLES[p.hairStyle], n = [];
    var rx = p.head ? 11.6 : 10.8, ry = p.head ? 13.2 : 13.8;

    n.push(svg('rect', { width: 64, height: 64, rx: 12, fill: BG[p.bg] }));                                       // background
    n.push(svg('circle', { cx: 32, cy: 26, r: 25, fill: '#ffffff', opacity: '.07' }));
    OUTFITS[p.outfit](oc, od, ol, skin).forEach(function (x) { n.push(x); });                                     // body / outfit
    if (SIGNATURE[fam]) { SIGNATURE[fam](oc, od, ol).forEach(function (x) { n.push(x); }); }
    n.push(svg('rect', { x: 28, y: 36, width: 8, height: 11, rx: 3, fill: skinD }));                              // neck
    n.push(svg('circle', { cx: 20.6, cy: 29, r: 2.5, fill: skin })); n.push(svg('circle', { cx: 43.4, cy: 29, r: 2.5, fill: skin }));   // ears
    n.push(svg('ellipse', { cx: 32, cy: 28, rx: rx, ry: ry, fill: skin }));                                       // head
    style.back.forEach(function (d) { n.push(P(d, hair)); });                                                     // hair-back
    // face
    var eyeY = 28.4, ex = [26.8, 37.2];
    ex.forEach(function (x, i) {
      if (p.eyes === 0) { n.push(svg('circle', { cx: x, cy: eyeY, r: 1.45, fill: ink })); }
      else if (p.eyes === 1) { n.push(svg('ellipse', { cx: x, cy: eyeY, rx: 1.6, ry: 2.1, fill: ink })); }
      else if (p.eyes === 2) { n.push(P('M' + (x - 2) + ' ' + (eyeY + 0.7) + 'Q' + x + ' ' + (eyeY - 2.2) + ' ' + (x + 2) + ' ' + (eyeY + 0.7), 'none', { stroke: ink, 'stroke-width': 1.5, 'stroke-linecap': 'round' })); }
      else { n.push(P('M' + (x - 2) + ' ' + eyeY + 'H' + (x + 2), 'none', { stroke: ink, 'stroke-width': 1.7, 'stroke-linecap': 'round' })); }
      var by = 24.4, bx = x - 2.4, bw = 4.8;
      var bd = p.brows === 0 ? 'M' + bx + ' ' + by + 'H' + (bx + bw)
             : (p.brows === 1 ? 'M' + bx + ' ' + (by + 0.6) + 'Q' + x + ' ' + (by - 1.6) + ' ' + (bx + bw) + ' ' + (by + 0.6)
                              : 'M' + bx + ' ' + (i === 0 ? by + 1 : by - 0.4) + 'L' + (bx + bw) + ' ' + (i === 0 ? by - 0.4 : by + 1));
      n.push(P(bd, 'none', { stroke: hairD, 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: '.85' }));
    });
    var nose = p.nose === 0 ? 'M32 29.6Q30.8 33 32.8 33.4' : (p.nose === 1 ? 'M32 29.6V33.2' : 'M31 33.2Q32 34.2 33 33.2');
    n.push(P(nose, 'none', { stroke: shade(skin, -0.28), 'stroke-width': 1.1, 'stroke-linecap': 'round' }));
    var mouths = ['M28.4 36.6Q32 39.8 35.6 36.6', 'M29 37H35', 'M28 36.2Q32 41.4 36 36.2Z', 'M30 37.2Q32 38.6 34 37.2'];
    n.push(P(mouths[p.mouth], p.mouth === 2 ? '#fdfdfd' : 'none', { stroke: '#7a3b3b', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    style.front.forEach(function (d) { n.push(P(d, hair)); });                                                    // hair-front
    // accessory
    var acc = p.accessory;
    if (acc === 1) { n.push(svg('circle', { cx: 26.8, cy: eyeY, r: 3.6, fill: 'none', stroke: ink, 'stroke-width': 1.1 })); n.push(svg('circle', { cx: 37.2, cy: eyeY, r: 3.6, fill: 'none', stroke: ink, 'stroke-width': 1.1 })); n.push(P('M30.4 28.2H33.6', 'none', { stroke: ink, 'stroke-width': 1.1 })); }
    else if (acc === 2) { n.push(svg('rect', { x: 23, y: 25.6, width: 7.6, height: 5.8, rx: 1.4, fill: 'none', stroke: ink, 'stroke-width': 1.1 })); n.push(svg('rect', { x: 33.4, y: 25.6, width: 7.6, height: 5.8, rx: 1.4, fill: 'none', stroke: ink, 'stroke-width': 1.1 })); n.push(P('M30.6 28H33.4', 'none', { stroke: ink, 'stroke-width': 1.1 })); }
    else if (acc === 3) { n.push(svg('circle', { cx: 20.6, cy: 33, r: 1.3, fill: '#f5c451' })); n.push(svg('circle', { cx: 43.4, cy: 33, r: 1.3, fill: '#f5c451' })); }
    else if (acc === 4) { n.push(P('M20.6 21.6Q21 11.6 32 11.4Q43 11.6 43.4 21.6Z', oc)); n.push(P('M19.4 21.4H46.4Q47.4 23.8 44 23.8H19.8Z', od)); }
    else if (acc === 5) { n.push(P('M19.6 29Q19 11.4 32 11.4Q45 11.4 44.4 29', 'none', { stroke: '#2a2f3d', 'stroke-width': 2.2, 'stroke-linecap': 'round' })); n.push(svg('rect', { x: 17.6, y: 26.6, width: 4.4, height: 8, rx: 2, fill: '#2a2f3d' })); n.push(svg('rect', { x: 42, y: 26.6, width: 4.4, height: 8, rx: 2, fill: '#2a2f3d' })); }

    var roleText = ROLE_LABEL[role] || String(role).toLowerCase();
    var label = o.decorative ? null : 'Portrait of ' + (o.name ? U.cleanString(o.name, 60, 'a person') + ', ' : '') + roleText;
    var attrs = { 'class': 'avatar', viewBox: '0 0 64 64', width: size, height: size };
    if (label) { attrs.role = 'img'; attrs['aria-label'] = label; } else { attrs['aria-hidden'] = 'true'; }
    return svg('svg', attrs, n);
  }
  RR.ui.avatar = { render: renderAvatar, resolve: resolveLook, roleFamily: function (role) { return ROLE_FAMILY[role] || 'casual'; },
                   playerSeed: function (name, professionId) { return U.fnv1a32('player:' + name + ':' + professionId) % 99999 + 1; } };

  // ═════════════════════════════════════ scenes ═════════════════════════════════════
  var TINT = { DEAL: 'var(--cat-deal)', DOODAD: 'var(--cat-doodad)', LIFE: 'var(--cat-life)', MARKET: 'var(--cat-market)', QUIET: 'var(--cat-quiet)', NPC: 'var(--cat-npc)', ASSET: 'var(--cat-asset)' };
  var FILL = { k: '#050912', w: '#eef3ff', g: '#fbbf24' };

  function shapeEl(s, tint) {
    var t = s[0], fillKey, op, el;
    if (t === 'l') {
      el = svg('path', { d: s[1], fill: 'none', 'stroke-width': s[3], 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      if (s[2] === 't') { el.style.stroke = tint; } else { el.setAttribute('stroke', FILL[s[2]]); }
      op = s[4];
    } else {
      if (t === 'r') { el = svg('rect', { x: s[1], y: s[2], width: s[3], height: s[4] }); fillKey = s[5]; op = s[6]; if (s[7]) { el.setAttribute('rx', s[7]); } }
      else if (t === 'c') { el = svg('circle', { cx: s[1], cy: s[2], r: s[3] }); fillKey = s[4]; op = s[5]; }
      else if (t === 'e') { el = svg('ellipse', { cx: s[1], cy: s[2], rx: s[3], ry: s[4] }); fillKey = s[5]; op = s[6]; }
      else { el = svg('path', { d: s[1] }); fillKey = s[2]; op = s[3]; }
      if (fillKey === 't') { el.style.fill = tint; } else { el.setAttribute('fill', FILL[fillKey]); }
    }
    if (op !== undefined && op !== 1) { el.setAttribute('opacity', op); }
    return el;
  }

  // render(sceneId, { palette:{tint}|tint, category, width, height, decorative }) → <svg viewBox="0 0 480 270">
  RR.ui.scene = {
    ids: function () { return (RR.data.sceneIds || []).slice(); },
    tintFor: function (category) { return TINT[category] || 'var(--accent)'; },
    render: function (sceneId, o) {
      o = o || {};
      var id = String(sceneId || '').indexOf('scene_') === 0 ? sceneId : 'scene_' + sceneId;
      var def = RR.data.scenes[id];
      if (!def) { RR.warnOnce('scene:' + id, 'RR.ui.scene: unknown scene "' + sceneId + '" — drawing a plain backdrop'); def = { label: 'Backdrop', alt: 'A plain backdrop', shapes: [] }; }
      var tint = (o.palette && o.palette.tint) || (typeof o.palette === 'string' ? o.palette : null) || TINT[o.category] || 'var(--accent)';
      var gid = 'sg' + U.fnv1a32(id + '|' + tint).toString(36);
      var top = svg('stop', { offset: '0' }); top.style.stopColor = tint; top.style.stopOpacity = '0.62';
      var mid = svg('stop', { offset: '0.62' }); mid.style.stopColor = tint; mid.style.stopOpacity = '0.14';
      var bot = svg('stop', { offset: '1', 'stop-color': '#0d1424' });
      var grad = svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [top, mid, bot]);
      var kids = [svg('defs', null, [grad]), svg('rect', { width: 480, height: 270, fill: 'url(#' + gid + ')' })];
      def.shapes.forEach(function (s) { kids.push(shapeEl(s, tint)); });
      var attrs = { 'class': 'scene', viewBox: '0 0 480 270', width: o.width || '100%', height: o.height || '100%', preserveAspectRatio: 'xMidYMid slice' };
      if (o.decorative === false) { attrs.role = 'img'; attrs['aria-label'] = def.alt; } else { attrs['aria-hidden'] = 'true'; }
      return svg('svg', attrs, kids);
    }
  };
})(window.RR);
