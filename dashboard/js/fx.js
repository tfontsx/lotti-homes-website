/* Motion: important values count up when a screen opens, and tween when live data changes. */
(function () {
  'use strict';
  var LH = window.LH, root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SEL = '.stat .v, .stat .bigv, .mini3 .serif, .est, .prob > .serif, .pg-num > .serif, .fin b, .rp-big, .prog > span, .rp-figs .serif, .rp-n';
  var MONTH = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/;
  var mem = {}, queue = [], raf = 0, scanning = false;

  function holding() { return root.classList.contains('intro-on') && !root.classList.contains('intro-reveal'); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function locate(el) {
    var all = el.textContent.trim();
    if (!all || all.length > 18 || MONTH.test(all) || /[:—]/.test(all) || /[A-Za-z]{5,}/.test(all)) return null;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType !== 3) continue;
      var m = /(\d[\d,]*)(\.\d+)?/.exec(n.nodeValue);
      if (m) {
        var dec = m[2] ? m[2].length - 1 : 0;
        return { node: n, text: n.nodeValue, pre: n.nodeValue.slice(0, m.index), post: n.nodeValue.slice(m.index + m[0].length),
          val: parseFloat((m[1] + (m[2] || '')).replace(/,/g, '')), dec: dec, comma: m[1].indexOf(',') !== -1 };
      }
    }
    return null;
  }
  function fmt(v, info) {
    return info.pre + new Intl.NumberFormat('en-AU', { minimumFractionDigits: info.dec, maximumFractionDigits: info.dec, useGrouping: info.comma }).format(v) + info.post;
  }

  function frame(now) {
    raf = 0;
    var live = 0;
    queue.forEach(function (q) {
      if (q.done) return;
      if (!q.node.isConnected) { q.done = true; return; }
      var t = (now - q.t0) / q.dur;
      if (t < 0) { live++; return; }
      if (t >= 1) { q.node.nodeValue = q.info.text; q.done = true; return; }
      q.node.nodeValue = fmt(q.from + (q.to - q.from) * ease(t), q.info);
      live++;
    });
    queue = queue.filter(function (q) { return !q.done; });
    if (live) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (holding()) return;
    var now = performance.now();
    queue.forEach(function (q) { if (q.t0 == null) q.t0 = now + q.delay; });
    if (!raf && queue.length) raf = requestAnimationFrame(frame);
  }

  function scan() {
    scanning = false;
    var view = LH.$('#view'); if (!view) return;
    var els = view.querySelectorAll(SEL), stag = 0;
    for (var i = 0; i < els.length; i++) {
      var info = locate(els[i]); if (!info) continue;
      var key = location.hash + '|' + i, prev = mem[key];
      if (prev && prev.text === info.text) continue;
      var from = prev ? prev.val : 0;
      mem[key] = { text: info.text, val: info.val };
      if (reduce || from === info.val) continue;
      var delay = prev ? 0 : Math.min(stag++ * 70, 420);
      info.node.nodeValue = fmt(from, info);
      queue.push({ node: info.node, info: info, from: from, to: info.val, dur: prev ? 650 : 1100, delay: delay, t0: null });
    }
    if (view.classList.contains('enter')) {
      var cards = view.querySelectorAll('.lh-card:not(.stat)'), n = 0;
      for (var c = 0; c < cards.length; c++) {
        if (cards[c].dataset.fx || cards[c].style.animationDelay) continue;
        cards[c].dataset.fx = '1'; cards[c].style.animationDelay = Math.min(n++ * 55, 440) + 'ms';
      }
    }
    start();
  }
  function schedule() { if (!scanning) { scanning = true; setTimeout(scan, 0); } }

  LH.fx = {
    reset: function () { mem = {}; queue = []; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
  var view = document.getElementById('view');
  if (view) new MutationObserver(schedule).observe(view, { childList: true, subtree: true });
  document.addEventListener('lh-reveal', start);
})();
