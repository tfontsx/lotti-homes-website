/* Logo intro: the Lotti Homes mark sweeps in, holds, then the screen opens as a circle from the logo. */
(function () {
  'use strict';
  var root = document.documentElement, el = document.getElementById('intro');
  if (!el) return;
  if (!root.classList.contains('intro-on')) { el.remove(); return; }
  try { sessionStorage.setItem('lh-intro', '1'); } catch (e) { /* private mode */ }

  var finished = false, revealed = false, skipNow;
  var skipped = new Promise(function (r) { skipNow = r; });
  function finish() { if (finished) return; finished = true; root.classList.remove('intro-on', 'intro-reveal'); el.remove(); }
  var holder = el.querySelector('.intro-logo');
  if (!window.LH_MARK || !holder) { finish(); return; }

  function wait(ms) { return Promise.race([new Promise(function (r) { setTimeout(r, ms); }), skipped]); }
  function tween(ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      (function step(now) { var t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(step); else res(); })(t0);
    });
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function booted() { var a = document.getElementById('app'), l = document.getElementById('login'); return (a && !a.hidden) || (l && !l.hidden); }
  async function gate() { var t0 = Date.now(); while (!booted() && Date.now() - t0 < 4000) await wait(100); }

  holder.innerHTML = window.LH_MARK;
  var mark = holder.firstElementChild;
  (async function () {
    el.addEventListener('click', function () { if (!revealed) skipNow(); });
    mark.style.opacity = '0';
    await wait(120);
    await tween(900, function (t) {
      var e = easeOut(t);
      mark.style.opacity = String(Math.min(1, e * 1.6));
      mark.style.clipPath = 'inset(0 ' + ((1 - e) * 100) + '% 0 0)';
    });
    await wait(850);
    await gate();
    revealed = true;
    var cx = innerWidth / 2, cy = innerHeight * 0.44;
    var R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 90, feather = 80;
    function mask(r) { var g = 'radial-gradient(circle at 50% 44%, transparent ' + r + 'px, #000 ' + (r + feather) + 'px)'; el.style.webkitMaskImage = g; el.style.maskImage = g; }
    mask(-feather);
    root.classList.add('intro-reveal');
    document.dispatchEvent(new Event('lh-reveal'));
    el.classList.add('out');
    await tween(1150, function (t) { mask(-feather + easeInOut(t) * (R + feather)); });
    finish();
  })();
})();
