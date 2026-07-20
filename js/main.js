/* ==========================================================================
   LOTTI HOMES — MAIN JS
   Shared across all pages: scroll-reveal animation + nav background state.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* -----------------------------------------------------------------------
     INTRO PRELOADER
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
     ----------------------------------------------------------------------- */
  const processSteps = document.querySelectorAll('.process-step');

  if (processSteps.length) {
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-active', entry.isIntersecting);
      });
    }, {
      threshold: 0,
      rootMargin: '-45% 0px -45% 0px' 
    });

    processSteps.forEach((step) => stepObserver.observe(step));
  }

  /* -----------------------------------------------------------------------
     SA OUTLINE DRAW-ON
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
      return; 
    }

    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(() => {
      window.location.href = link.href;
    }, PAGE_TRANSITION_MS);
  });

  /* -----------------------------------------------------------------------
     PROJECTS PAGE — IMAGE SLIDER PER CARD
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
     BURGER MENU — mobile nav drawer
     ----------------------------------------------------------------------- */
  const navBurger = document.getElementById('navBurger');
  const mobileNav = document.getElementById('mobileNav');
  const navOverlayEl = document.getElementById('navOverlay');

  if (navBurger && mobileNav && navOverlayEl) {
    const closeMobileNav = () => {
      navBurger.classList.remove('is-open');
      navBurger.setAttribute('aria-expanded', 'false');
      mobileNav.classList.remove('is-open');
      navOverlayEl.classList.remove('is-open');
      document.body.classList.remove('nav-open');
    };

    const openMobileNav = () => {
      navBurger.classList.add('is-open');
      navBurger.setAttribute('aria-expanded', 'true');
      mobileNav.classList.add('is-open');
      navOverlayEl.classList.add('is-open');
      document.body.classList.add('nav-open');
    };

    navBurger.addEventListener('click', () => {
      if (mobileNav.classList.contains('is-open')) {
        closeMobileNav();
      } else {
        openMobileNav();
      }
    });

    navOverlayEl.addEventListener('click', closeMobileNav);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileNav);
    });
  }

  /* -----------------------------------------------------------------------
     CONTACT PAGE — INLINE PRIVACY POLICY TOGGLE
     ----------------------------------------------------------------------- */
  const privacyToggle = document.getElementById('privacyToggle');
  const privacyPanel = document.getElementById('privacyPanel');

  if (privacyToggle && privacyPanel) {
    privacyToggle.addEventListener('click', () => {
      const isOpen = privacyPanel.classList.toggle('is-open');
      privacyToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  /* -----------------------------------------------------------------------
     CONTACT PAGE — ENQUIRY FORM SUBMISSION (Web3Forms)
     ----------------------------------------------------------------------- */
  const enquiryForm = document.getElementById('enquiryForm');
  const formNote = document.getElementById('formNote');

  if (enquiryForm) {
    const submitBtn = enquiryForm.querySelector('.form-submit-btn');
    const submitBtnLabel = submitBtn ? submitBtn.querySelector('span') : null;
    const defaultNoteText = formNote ? formNote.textContent : '';

    const setNote = (text, isError) => {
      if (!formNote) return;
      formNote.textContent = text;
      formNote.classList.toggle('form-note--error', !!isError);
      formNote.classList.toggle('form-note--success', !isError && text !== defaultNoteText);
    };

    enquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Honeypot check — if a bot filled this, silently pretend success.
      const honeypot = enquiryForm.querySelector('input[name="botcheck"]');
      if (honeypot && honeypot.checked) {
        enquiryForm.reset();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (submitBtnLabel) submitBtnLabel.textContent = 'Sending...';
      setNote('Sending your enquiry...', false);

      try {
        const formData = new FormData(enquiryForm);
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
          enquiryForm.reset();
          setNote("Thanks — your enquiry has been sent. We'll be in touch within one business day.", false);
        } else {
          setNote('Something went wrong sending your enquiry. Please try again or email us directly.', true);
        }
      } catch (err) {
        setNote('Something went wrong sending your enquiry. Please check your connection and try again.', true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnLabel) submitBtnLabel.textContent = 'Send Enquiry';
      }
    });
  }
  
});