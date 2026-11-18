/* Logo intro: the app's Lottie draws in, holds, then the screen opens as a circle from the logo. */
(function () {
  'use strict';
  var root = document.documentElement, el = document.getElementById('intro');
  if (!el) return;
  if (!root.classList.contains('intro-on')) { el.remove(); return; }
  try { sessionStorage.setItem('lh-intro', '1'); } catch (e) { /* private mode */ }

  var finished = false, revealed = false, skipNow;
  var skipped = new Promise(function (r) { skipNow = r; });
  function finish() { if (finished) return; finished = true; root.classList.remove('intro-on', 'intro-reveal'); el.remove(); }
  if (!window.lottie) { finish(); return; }

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

  var dark = root.getAttribute('data-theme') === 'dark';
  var anim = window.lottie.loadAnimation({ container: el.querySelector('.intro-logo'), renderer: 'svg', loop: false, autoplay: false, path: 'anim/lh_logo_intro_' + (dark ? 'dark' : 'light') + '.json' });
  var failTimer = setTimeout(finish, 5000);
  anim.addEventListener('data_failed', finish);
  anim.addEventListener('DOMLoaded', async function () {
    clearTimeout(failTimer);
    el.addEventListener('click', function () { if (!revealed) skipNow(); });
    var last = Math.max(1, Math.min(34, anim.totalFrames - 1));
    anim.goToAndStop(0, true);
    await tween(567, function (t) { anim.goToAndStop(last * easeOut(t), true); });
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
  });
})();
