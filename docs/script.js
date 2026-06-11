/* Why this exists:
   Handles all dynamic interactivity on the marketing website.
   Specifically coordinates the light/dark mode switch, scroll-linked animations,
   FAQ accordion dynamics, and the interactive HTML5 video sandbox simulating 
   the extension's overlay and keyboard speed controls.
*/

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initScrollAnimations();
  initFAQAccordion();
  initInteractiveSandbox();
});

/**
 * Initializes the Light/Dark mode toggle based on local storage or system preferences.
 * @returns {void}
 */
function initThemeToggle() {
  const themeBtn = document.querySelector('.theme-btn');
  if (!themeBtn) return;

  // Why this exists: Checks persistent storage first so user choices survive refreshes
  const storedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

  if (storedTheme === 'light' || (!storedTheme && prefersLight)) {
    document.body.classList.add('light-theme');
  }

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });
}

/**
 * Sets up the Intersection Observer to fade in components as the page scrolls.
 * @returns {void}
 */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Why this exists: Unobserve once visible to improve scroll performance
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.05,
    rootMargin: '0px 0px -30px 0px'
  });

  document.querySelectorAll('.fade-in').forEach(element => {
    observer.observe(element);
  });
}

/**
 * Sets up FAQ accordion question clicks.
 * @returns {void}
 */
function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      
      // Close other open accordion items
      faqItems.forEach(other => {
        if (other !== item) other.classList.remove('open');
      });

      item.classList.toggle('open', !isOpen);
    });
  });
}

/**
 * Handles the interactive sandbox HTML5 speed player controls.
 * It simulates shortcuts, wheel gestures, presets, and overlays.
 * @returns {void}
 */
function initInteractiveSandbox() {
  const video = document.querySelector('#sandbox-video');
  if (!video) return;

  const overlay = document.querySelector('.sandbox-overlay');
  const overlayText = overlay?.querySelector('span');
  const overlayFill = overlay?.querySelector('.sandbox-overlay-fill');
  const widgetSpeedText = document.querySelector('.sandbox-widget .speed-pill');
  const presetButtons = document.querySelectorAll('.sandbox-presets button');
  const widgetMinus = document.querySelector('.sandbox-widget .btn-minus');
  const widgetPlus = document.querySelector('.sandbox-widget .btn-plus');

  let overlayTimeout = null;
  let normalSpeedBeforeBoost = 1.0;
  let isBoosting = false;

  /**
   * Applies the speed to the video and updates the UI representation.
   * @param {number} rate - The target playback rate (between 0.25 and 10)
   * @param {boolean} showToast - Whether to trigger the central speed indicator toast
   * @returns {void}
   */
  function setSpeed(rate, showToast = true) {
    // Keep speed within boundaries
    const clampedRate = Math.max(0.25, Math.min(10.0, rate));
    video.playbackRate = clampedRate;

    // Format speed presentation (e.g. 2x, 0.75x)
    const displayRate = clampedRate % 1 === 0 ? `${clampedRate}x` : `${clampedRate.toFixed(2)}x`;

    // Update floating widget speed pill text
    if (widgetSpeedText) {
      widgetSpeedText.textContent = displayRate;
    }

    // Highlight active preset button if match exists
    presetButtons.forEach(btn => {
      const val = parseFloat(btn.dataset.speed);
      btn.classList.toggle('active', val === clampedRate);
    });

    if (showToast && overlay && overlayText && overlayFill) {
      overlayText.textContent = displayRate;
      
      // Math details: calculates slider percentage width relative to max 10.0x rate
      const percentage = ((clampedRate - 0.25) / (10.0 - 0.25)) * 100;
      overlayFill.style.width = `${percentage}%`;

      overlay.classList.add('show');
      clearTimeout(overlayTimeout);

      overlayTimeout = setTimeout(() => {
        overlay.classList.remove('show');
      }, 1000);
    }
  }

  // Preset button clicks
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      setSpeed(speed);
    });
  });

  // Floating widget minus click
  widgetMinus?.addEventListener('click', () => {
    setSpeed(video.playbackRate - 0.25);
  });

  // Floating widget plus click
  widgetPlus?.addEventListener('click', () => {
    setSpeed(video.playbackRate + 0.25);
  });

  // Widget speed pill click resets to 1x or cycles speed
  widgetSpeedText?.addEventListener('click', () => {
    setSpeed(1.0);
  });

  // Keyboard shortcut listener (only intercepts if user isn't in forms/inputs)
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return;
    }

    // Support keyboard shortcut simulation for Sandbox demo
    if (e.key === ']') {
      e.preventDefault();
      setSpeed(video.playbackRate + 0.25);
    } else if (e.key === '[') {
      e.preventDefault();
      setSpeed(video.playbackRate - 0.25);
    } else if (e.key === '\\') {
      e.preventDefault();
      setSpeed(1.0);
    } else if (e.key.toLowerCase() === 'x' && !isBoosting) {
      // Why this exists: Simulates the temporary boost key modifier feature
      e.preventDefault();
      isBoosting = true;
      normalSpeedBeforeBoost = video.playbackRate;
      setSpeed(2.0); // Boost target
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'x' && isBoosting) {
      isBoosting = false;
      setSpeed(normalSpeedBeforeBoost);
    }
  });

  // Mouse Wheel Gesture Control (Ctrl + scroll wheels) over video
  video.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      // Why this exists: Override native page zooming when hover scrolling over video
      e.preventDefault();
      const change = e.deltaY < 0 ? 0.25 : -0.25;
      setSpeed(video.playbackRate + change);
    }
  }, { passive: false });
}
