/* =========================================================================
   TOOL PAGE SCROLL REVEAL
   Same pattern as the site-wide .reveal engine in js/main.js, run
   standalone here since these QR-accessed tool pages don't load main.js.
   Cards are generated dynamically by site-induction.js / daily-checkin.js,
   so this runs after them and picks up whatever exists in the DOM.
   ========================================================================= */

(function () {
  const revealEls = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window) || !revealEls.length) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.revealDelay || 0;
        setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, delay);
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px',
  });

  revealEls.forEach((el) => revealObserver.observe(el));
})();
