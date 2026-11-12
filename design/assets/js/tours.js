'use strict';

/**
 * Product tours — port of production `app/tours/index.ts` + `useTour.ts`.
 *
 * Spotlight walkthroughs built on driver.js (vendored in assets/vendor, same
 * version as production). Steps anchor to `data-tour="…"` attributes, not
 * class names. A step whose element is not shown is dropped (Request Pro is
 * Basic-only; Manage Users shows a no-permission card to Users).
 *
 * A tour auto-starts once its page has finished loading — no skeletons or
 * `aria-busy` regions left, no open dialog, no loading overlay — either on
 * the first visit (recorded as `cmuzoom.tour.<id>` in localStorage) or when
 * the page was opened with `?tour=<id>`. `[data-start-tour="<id>"]` buttons
 * (navbar User Guide menu, guide page) replay a tour from any page.
 *
 * Load after app.js and the page script, with `defer`.
 */
(function () {
  const SEEN_KEY_PREFIX = 'cmuzoom.tour.';
  const SEEN_VALUE = '1';
  const QUERY_PARAM = 'tour';
  // Give up waiting for a page to settle after this long rather than watch forever.
  const READY_TIMEOUT_MS = 10000;
  const BUSY_SELECTOR = 'main [aria-busy="true"], main .skeleton, main [data-skeleton]';
  const BLOCKING_SELECTOR = 'dialog[open], .loading-overlay.is-active';
  const DRIVER_OPTIONS = Object.freeze({
    smoothScroll: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: 'tour-popover',
    showProgress: true
  });

  /** `profile-card` -> `profileCard`: anchors are kebab-case, i18n keys camelCase. */
  const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  /** A step anchored to `data-tour="<name>"`, with text under `tour.<tour>.<name>`. */
  const step = (tour, name, side) => ({
    element: `[data-tour="${name}"]`,
    titleKey: `tour.${tour}.${camel(name)}.title`,
    bodyKey: `tour.${tour}.${camel(name)}.body`,
    side
  });

  /** `page` is the prototype file; `bodyPage` matches `<body data-page>`. */
  const TOURS = Object.freeze({
    profile: {
      page: 'profile.html',
      bodyPage: 'profile',
      steps: [
        step('profile', 'profile-card', 'right'),
        step('profile', 'request-pro', 'top'),
        step('profile', 'recording-sync', 'top'),
        step('profile', 'zoom-panel', 'left')
      ]
    },
    booking: {
      page: 'booking.html',
      bodyPage: 'booking',
      steps: [
        step('booking', 'my-bookings', 'right'),
        step('booking', 'booking-license', 'left'),
        step('booking', 'booking-date', 'left'),
        step('booking', 'booking-details', 'left')
      ]
    },
    // Admin and Global Admin only; the navbar hides it from everyone else.
    manageUsers: {
      page: 'manage-users.html',
      bodyPage: 'manage-users',
      steps: [
        step('manageUsers', 'quota', 'right'),
        step('manageUsers', 'expiry', 'right'),
        step('manageUsers', 'user-search', 'bottom'),
        step('manageUsers', 'users-table', 'top')
      ]
    }
  });

  /** One tour at a time. */
  let active = null;

  const isTourId = (value) => typeof value === 'string' && Object.hasOwn(TOURS, value);

  function readSeen(id) {
    try {
      return localStorage.getItem(SEEN_KEY_PREFIX + id) === SEEN_VALUE;
    } catch (error) {
      // Blocked storage: treat as unseen rather than fail.
      console.warn('[tour] could not read seen flag', error);
      return false;
    }
  }

  function writeSeen(id) {
    try {
      localStorage.setItem(SEEN_KEY_PREFIX + id, SEEN_VALUE);
    } catch (error) {
      console.warn('[tour] could not store seen flag', error);
    }
  }

  /** Shown on screen — the prototype hides with `hidden` where production uses v-if. */
  function isShown(selector) {
    const element = document.querySelector(selector);
    return element !== null && element.getClientRects().length > 0;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  function stop() {
    active?.destroy();
    active = null;
  }

  function run(id) {
    stop();
    const steps = TOURS[id].steps.filter((s) => !s.element || isShown(s.element));
    if (steps.length === 0) {
      return;
    }
    const driverFactory = window.driver?.js?.driver;
    if (typeof driverFactory !== 'function') {
      console.error('[tour] driver.js is not loaded');
      return;
    }
    const t = window.App.t;
    const instance = driverFactory({
      ...DRIVER_OPTIONS,
      animate: !prefersReducedMotion(),
      progressText: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      closeBtnLabel: t('tour.close'),
      steps: steps.map((s) => ({
        element: s.element,
        popover: { title: t(s.titleKey), description: t(s.bodyKey), side: s.side, align: 'center' }
      })),
      onDestroyed: () => {
        writeSeen(id);
        if (active === instance) {
          active = null;
        }
      }
    });
    active = instance;
    instance.drive();
  }

  /** Replays a tour; off its page, navigates there with `?tour=`. */
  function start(id) {
    if (!isTourId(id)) {
      console.error('[tour] unknown tour', id);
      return;
    }
    const tour = TOURS[id];
    if (document.body.dataset.page !== tour.bodyPage) {
      window.location.href = `${tour.page}?${QUERY_PARAM}=${encodeURIComponent(id)}`;
      return;
    }
    run(id);
  }

  const isReady = () => !document.querySelector(BUSY_SELECTOR) && !document.querySelector(BLOCKING_SELECTOR);

  /** Resolves true once the page has settled, false on timeout. */
  function whenReady() {
    return new Promise((resolve) => {
      if (isReady()) {
        resolve(true);
        return;
      }
      let frame = 0;
      const observer = new MutationObserver(() => {
        if (frame) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (isReady()) {
            finish(true);
          }
        });
      });
      const timer = window.setTimeout(() => finish(false), READY_TIMEOUT_MS);
      function finish(ready) {
        observer.disconnect();
        window.clearTimeout(timer);
        if (frame) {
          window.cancelAnimationFrame(frame);
        }
        resolve(ready);
      }
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'class', 'open', 'hidden'] });
    });
  }

  async function autoStart() {
    const id = Object.keys(TOURS).find((key) => TOURS[key].bodyPage === document.body.dataset.page);
    if (!id) {
      return;
    }
    const url = new URL(window.location.href);
    const requested = url.searchParams.get(QUERY_PARAM) === id;
    if (requested) {
      url.searchParams.delete(QUERY_PARAM);
      window.history.replaceState(window.history.state, '', url);
    }
    if (!requested && readSeen(id)) {
      return;
    }
    if (!(await whenReady())) {
      console.warn('[tour] page did not settle; not starting', id);
      return;
    }
    run(id);
  }

  function closeDropdownOf(element) {
    const dropdown = element.closest('[data-dropdown]');
    if (!dropdown) {
      return;
    }
    dropdown.querySelector('[data-dropdown-menu]').hidden = true;
    dropdown.querySelector('[data-dropdown-toggle]').setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-start-tour]');
    if (!button) {
      return;
    }
    closeDropdownOf(button);
    start(button.dataset.startTour);
  });

  document.addEventListener('DOMContentLoaded', () => {
    autoStart().catch((error) => console.error('[tour] could not start', error));
  });

  window.Tours = Object.freeze({ TOURS, start, stop });
})();
