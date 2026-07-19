/* ==========================================================================
   LOTTI HOMES — MAIN JS
   Shared across all pages: scroll-reveal animation + nav background state.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* -----------------------------------------------------------------------
     INTRO PRELOADER
     Only plays on the visitor's first page load of the session — uses
     sessionStorage so it doesn't replay on every refresh or when
     navigating between pages. Clears when the browser tab/window closes.
     The SVG's own animation runs for 3.0s total (draw + hold + fade to
     transparent). Once that's done we remove the overlay from the DOM —
     until then it sits on top of everything and would otherwise block
     clicks even after it's visually faded out. CHANGE HERE
     (PRELOADER_DURATION_MS) if the SVG's timing is ever edited.
     ----------------------------------------------------------------------- */
  const preloader = document.getElementById('intro-preloader');
  if (preloader) {
    const hasPlayed = sessionStorage.getItem('lotti_preloader_played');
    if (hasPlayed) {
      preloader.classList.add('is-done'); // skip instantly, no replay
    } else {
      sessionStorage.setItem('lotti_preloader_played', 'true');
      const PRELOADER_DURATION_MS = 2600; // small buffer past the SVG's 2.5s runtime
      setTimeout(() => {
        preloader.classList.add('is-done');
      }, PRELOADER_DURATION_MS);
    }
  }

  /* -----------------------------------------------------------------------
     HOME HERO VIDEO
     Do not reveal the video element until the browser has decoded a real
     frame. This avoids a poster/stale-image flash on refresh and back-nav.
     ----------------------------------------------------------------------- */
  const heroVideo = document.querySelector('.hero--fullscreen video.hero__media');

  if (heroVideo) {
    const revealHeroVideo = () => {
      requestAnimationFrame(() => {
        heroVideo.classList.add('is-video-ready');
      });
    };

    if (heroVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      revealHeroVideo();
    } else {
      heroVideo.addEventListener('loadeddata', revealHeroVideo, { once: true });
    }

    // Resume autoplay when returning through the browser's back/forward cache.
    window.addEventListener('pageshow', () => {
      document.body.classList.remove('is-leaving');

      if (heroVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        revealHeroVideo();
      }

      heroVideo.play().catch(() => {
        // Muted autoplay can still be blocked by browser/device settings.
      });
    });
  } else {
    window.addEventListener('pageshow', () => {
      document.body.classList.remove('is-leaving');
    });
  }

  /* -----------------------------------------------------------------------
     SCROLL REVEAL
     Any element with class="reveal" fades/slides in once it enters the
     viewport. Add [data-reveal-delay="150"] (ms) to an element for a
     staggered entrance, e.g. across a row of cards.
     ----------------------------------------------------------------------- */
  const revealEls = document.querySelectorAll('.reveal, .reveal-scale, .reveal-clip');

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
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
  });

  revealEls.forEach((el) => revealObserver.observe(el));

  /* -----------------------------------------------------------------------
     OUR PROCESS PAGE — ACTIVE STEP SPY
     Highlights whichever step is centred in the viewport as you scroll,
     driving the numeral-brighten + badge-pop treatment in styles.css.
     Guarded so it's a no-op on every page except Our Process.
     ----------------------------------------------------------------------- */
  const processSteps = document.querySelectorAll('.process-step');

  if (processSteps.length) {
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-active', entry.isIntersecting);
      });
    }, {
      threshold: 0,
      rootMargin: '-45% 0px -45% 0px' // active once a step crosses the vertical centre band
    });

    processSteps.forEach((step) => stepObserver.observe(step));
  }

  /* -----------------------------------------------------------------------
     SA OUTLINE DRAW-ON
     The map outline's stroke-draw animation is set to begin="indefinite" in
     the SVG itself (see images/home/sa-outline-animated.svg / the inlined
     copy in index.html), so it does nothing until this JS explicitly starts
     it via .beginElement() — this is what makes it wait for scroll instead
     of firing the moment the page loads. CHANGE HERE (threshold/rootMargin)
     to adjust exactly when it triggers relative to the element entering view.
     ----------------------------------------------------------------------- */
  const saDrawAnim = document.getElementById('sa-outline-draw');
  if (saDrawAnim) {
    const saMapEl = document.querySelector('.story__map');
    const saObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          saDrawAnim.beginElement();
          saObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.3,
      rootMargin: '0px 0px -80px 0px'
    });
    if (saMapEl) saObserver.observe(saMapEl);
  }

  /* -----------------------------------------------------------------------
     PAGE TRANSITIONS
     Fade-in on load is pure CSS (see body's page-fade-in animation in
     styles.css) so the page is never stuck invisible even if this JS fails
     to run. This part just handles the fade-OUT: intercepts clicks on
     internal same-site links, fades the page out, then navigates — instead
     of the current hard, instant cut between pages. External links,
     mailto/tel links, anchor links, new-tab links, and modifier-key clicks
     (ctrl/cmd+click) are left completely alone.
     CHANGE HERE (PAGE_TRANSITION_MS) — must match the body.is-leaving
     transition duration in styles.css.
     ----------------------------------------------------------------------- */
  const PAGE_TRANSITION_MS = 50;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const isInternal = link.hostname === window.location.hostname;
    const isHtmlPage = href.endsWith('.html') || href === '/' || (!href.includes('.') && !href.startsWith('#'));
    const isSpecialLink = href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:');
    const opensNewTab = link.target === '_blank';
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

    if (!isInternal || !isHtmlPage || isSpecialLink || opensNewTab || isModifiedClick) {
      return; // let the browser handle it normally
    }

    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(() => {
      window.location.href = link.href;
    }, PAGE_TRANSITION_MS);
  });

  /* -----------------------------------------------------------------------
     PROJECTS PAGE — IMAGE SLIDER PER CARD
     Each .portfolio-card can hold multiple .portfolio-card__img elements;
     dots cycle which one has .is-active (crossfade handled by CSS
     transition on opacity). The bottom-right button also advances to the
     next image. Cards with only one image have both the dots and that
     button hidden automatically — add more <img> + matching dot in the
     HTML and they'll appear on their own, no JS changes needed.
     ----------------------------------------------------------------------- */
  const portfolioCards = document.querySelectorAll('.portfolio-card');

  portfolioCards.forEach((card) => {
    const images = card.querySelectorAll('.portfolio-card__img');
    const dots = card.querySelectorAll('.portfolio-dot');
    const controls = card.querySelector('.portfolio-card__controls');
    const viewBtn = card.querySelector('.portfolio-card__view');
    let current = 0;

    if (images.length <= 1) {
      if (controls) controls.style.display = 'none';
      if (viewBtn) viewBtn.style.display = 'none';
      return; // nothing to cycle
    }

    const showSlide = (index) => {
      images[current].classList.remove('is-active');
      dots[current].classList.remove('is-active');
      current = (index + images.length) % images.length;
      images[current].classList.add('is-active');
      dots[current].classList.add('is-active');
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSlide(i);
      });
    });

    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSlide(current + 1);
      });
    }
  });

  /* -----------------------------------------------------------------------
     NAV — solid background once the user scrolls past the hero
     CHANGE HERE (SCROLL_THRESHOLD) to adjust when the nav background kicks in
     ----------------------------------------------------------------------- */
  const nav = document.querySelector('.nav');
  const SCROLL_THRESHOLD = 80;

  if (nav) {
    const setNavState = () => {
      if (window.scrollY > SCROLL_THRESHOLD) {
        nav.classList.add('nav--scrolled');
      } else {
        nav.classList.remove('nav--scrolled');
      }
    };
    setNavState();
    window.addEventListener('scroll', setNavState, { passive: true });
  }

  /* -----------------------------------------------------------------------
     CONTACT PAGE — INLINE PRIVACY POLICY TOGGLE
     "View Privacy Policy" expands a short policy blurb inline instead of
     linking to a separate page. Guarded so it's a no-op on every other page.
     ----------------------------------------------------------------------- */
  const privacyToggle = document.getElementById('privacyToggle');
  const privacyPanel = document.getElementById('privacyPanel');

  if (privacyToggle && privacyPanel) {
    privacyToggle.addEventListener('click', () => {
      const isOpen = privacyPanel.classList.toggle('is-open');
      privacyToggle.setAttribute('aria-expanded', isOpen);
    });
  }
  
});