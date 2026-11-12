'use strict';

/**
 * Shared prototype behaviour: theme, language, demo role, account dropdown,
 * dialogs and toasts. Loaded synchronously in <head> (after i18n.js) so theme
 * and role attributes are set before first paint; DOM wiring waits for
 * DOMContentLoaded.
 */
(function () {
  const STORAGE_KEYS = Object.freeze({
    theme: 'cmuzoom.theme',
    lang: 'cmuzoom.lang',
    role: 'cmuzoom.role',
    auth: 'cmuzoom.auth',
    demoDock: 'cmuzoom.demoDock'
  });
  // Demo dock state: open (pills shown) or minimized to a floating button.
  const DEMO_DOCK = Object.freeze({ OPEN: 'open', MINIMIZED: 'minimized' });

  const AUTH = Object.freeze({ IN: 'in', OUT: 'out' });
  const THEMES = Object.freeze({ LIGHT: 'light', DARK: 'dark' });
  const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', GLOBAL: 'global' });
  /**
   * Every license type. i18n labels live at `license.<value>`; badges use `.badge-<value>`.
   * Production names Emergency Pro `emergPro` (see PROD_LICENSE_SLUGS); both spellings have a label and badge.
   */
  const LICENSES = Object.freeze({
    BASIC: 'basic',
    PRO: 'pro',
    TEMP_PRO: 'tempPro',
    EMERGENCY_PRO: 'emergencyPro',
    LARGE_MEETING: 'largeMeeting',
    RESERVED_PRO: 'reservedPro'
  });
  /** A user holds exactly one main license; Pro, Temporary Pro and Emergency Pro are mutually exclusive. */
  const MAIN_LICENSES = Object.freeze([LICENSES.BASIC, LICENSES.PRO, LICENSES.TEMP_PRO, LICENSES.EMERGENCY_PRO]);
  /** Held on top of the main license. */
  const ADDON_LICENSES = Object.freeze([LICENSES.LARGE_MEETING]);
  /** Quotas the CMU organization holds for everyone (production `SHARED_POOL`). Reserved Pro is quota only. */
  const SHARED_POOL_LICENSES = Object.freeze([LICENSES.TEMP_PRO, LICENSES.LARGE_MEETING, LICENSES.RESERVED_PRO, LICENSES.EMERGENCY_PRO]);
  /** Row order of production's license modal (`ROW_ORDER` in LicenseModal.vue). */
  const HELD_LICENSE_ORDER = Object.freeze([LICENSES.PRO, LICENSES.TEMP_PRO, LICENSES.EMERGENCY_PRO, LICENSES.LARGE_MEETING]);
  /** Prototype key -> production slug, where they differ. */
  const PROD_LICENSE_SLUGS = Object.freeze({ [LICENSES.EMERGENCY_PRO]: 'emergPro' });
  const EVENTS = Object.freeze({ LANG: 'app:langchange', ROLE: 'app:rolechange' });
  const DATE_LOCALES = Object.freeze({ en: 'en-GB', th: 'th-TH' });
  const TOAST_DURATION_MS = 3200;
  const DEFAULT_ROLE = ROLES.ADMIN;

  // License expiry (production useLicenseExpiry.ts): warn at <= 60 min left (under a day) or <= 7 days left.
  const MINUTE_MS = 60 * 1000;
  const HOUR_MINUTES = 60;
  const DAY_MS = 24 * HOUR_MINUTES * MINUTE_MS;
  const EXPIRY_SOON_MINUTES = 60;
  const EXPIRY_SOON_DAYS = 7;
  const EXPIRY_NEVER = 'never';
  const EXPIRY_TONES = Object.freeze({ NORMAL: 'normal', WARN: 'warn', DANGER: 'danger' });
  // The production classes for each tone (`.license-action-expiry` / `.license-countdown` modifiers).
  const EXPIRY_TONE_CLASSES = Object.freeze({ normal: '', warn: 'is-soon', danger: 'is-overdue' });

  // Table pagination (production TablePagination.vue): the backend caps a page at 100 rows.
  const PAGE_SIZES = Object.freeze([20, 50, 100]);
  const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

  const root = document.documentElement;

  // Line icons (Lucide-style, 24px grid). Referenced in markup via <use href="#i-name">.
  const ICONS = {
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.76-.43L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>',
    external: '<path d="M7 17 17 7M7 7h10v10"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7M19 12H5"/>',
    'id-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h6M14 14h4"/>',
    'calendar-check': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    'arrow-up-down': '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    // Production additions (app/utils/icons.ts).
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'
  };

  /* ---------- storage ---------- */

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.error('[app] Unable to read localStorage key', key, error);
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      console.error('[app] Unable to write localStorage key', key, error);
    }
  }

  /* ---------- state ---------- */

  function systemTheme() {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? THEMES.DARK : THEMES.LIGHT;
  }

  function pick(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  const state = {
    theme: pick(readStorage(STORAGE_KEYS.theme), Object.values(THEMES), systemTheme()),
    lang: pick(readStorage(STORAGE_KEYS.lang), window.I18N.LANGS, window.I18N.FALLBACK_LANG),
    role: pick(readStorage(STORAGE_KEYS.role), Object.values(ROLES), DEFAULT_ROLE),
    auth: pick(readStorage(STORAGE_KEYS.auth), Object.values(AUTH), AUTH.OUT)
  };

  window.I18N.setLang(state.lang);
  root.dataset.theme = state.theme;
  root.dataset.role = state.role;
  root.dataset.auth = state.auth;
  root.lang = state.lang;

  /* ---------- setters ---------- */

  function syncPressed(attribute, value) {
    document.querySelectorAll(`[${attribute}]`).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === value));
    });
  }

  function setTheme(theme) {
    state.theme = pick(theme, Object.values(THEMES), state.theme);
    root.dataset.theme = state.theme;
    writeStorage(STORAGE_KEYS.theme, state.theme);
    syncPressed('data-set-theme', state.theme);
  }

  function setLang(lang) {
    state.lang = pick(lang, window.I18N.LANGS, state.lang);
    window.I18N.setLang(state.lang);
    root.lang = state.lang;
    writeStorage(STORAGE_KEYS.lang, state.lang);
    window.I18N.apply(document);
    syncPressed('data-set-lang', state.lang);
    rerenderPaginations();
    document.dispatchEvent(new CustomEvent(EVENTS.LANG, { detail: { lang: state.lang } }));
  }

  function setRole(role) {
    state.role = pick(role, Object.values(ROLES), state.role);
    root.dataset.role = state.role;
    writeStorage(STORAGE_KEYS.role, state.role);
    syncPressed('data-set-role', state.role);
    document.dispatchEvent(new CustomEvent(EVENTS.ROLE, { detail: { role: state.role } }));
  }

  /** @param {boolean} signedIn */
  function setSignedIn(signedIn) {
    state.auth = signedIn ? AUTH.IN : AUTH.OUT;
    root.dataset.auth = state.auth;
    writeStorage(STORAGE_KEYS.auth, state.auth);
  }

  /* ---------- formatting ---------- */

  /** @param {Date} date */
  function formatDate(date) {
    try {
      return new Intl.DateTimeFormat(DATE_LOCALES[state.lang], { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    } catch (error) {
      console.error('[app] Unable to format date', date, error);
      return date.toISOString().slice(0, 10);
    }
  }

  /** @param {Date} date */
  function formatDateTime(date) {
    try {
      return new Intl.DateTimeFormat(DATE_LOCALES[state.lang], {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch (error) {
      console.error('[app] Unable to format date/time', date, error);
      return date.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  /** @param {Date} date Localized clock time, e.g. "05:30" (two-digit hour, as production's useFormat). */
  function formatTime(date) {
    try {
      return new Intl.DateTimeFormat(DATE_LOCALES[state.lang], { hour: '2-digit', minute: '2-digit' }).format(date);
    } catch (error) {
      console.error('[app] Unable to format time', date, error);
      return date.toISOString().slice(11, 16);
    }
  }

  /* ---------- license expiry ---------- */

  /** The demo clock (MockData's fixed date with the real time of day) when loaded, else the real clock. */
  function defaultNow() {
    const mock = window.MockData;
    return mock && typeof mock.mockNow === 'function' ? mock.mockNow() : new Date();
  }

  /**
   * "Expires in …" for a held license, as production's useLicenseExpiry: under a day it counts
   * hours and minutes (shared-pool licenses last one booking slot); beyond that, whole days.
   * @param {Date|string|number|'never'|null|undefined} expiry the instant it lapses, or 'never'
   * @param {Date|number} [now] defaults to the demo clock
   * @returns {{text: string, tone: 'normal'|'warn'|'danger', className: ''|'is-soon'|'is-overdue', title: string}|null}
   *   null when there is no expiry to show; `title` is the exact date/time for a tooltip
   */
  function formatExpiry(expiry, now) {
    if (expiry === null || expiry === undefined) {
      return null;
    }
    const result = (text, tone, title) => ({ text, tone, className: EXPIRY_TONE_CLASSES[tone], title });
    if (expiry === EXPIRY_NEVER) {
      return result(window.I18N.t('licenseModal.expiresNever'), EXPIRY_TONES.NORMAL, '');
    }
    const at = expiry instanceof Date ? expiry : new Date(expiry);
    const nowMs = now === undefined ? defaultNow().getTime() : new Date(now).getTime();
    const msLeft = at.getTime() - nowMs;
    if (Number.isNaN(msLeft)) {
      console.error('[app] formatExpiry got an invalid date', expiry, now);
      return null;
    }
    const title = formatDateTime(at);
    if (msLeft <= 0) {
      return result(window.I18N.t('licenseModal.expired'), EXPIRY_TONES.DANGER, title);
    }
    if (msLeft < DAY_MS) {
      const minutesLeft = Math.ceil(msLeft / MINUTE_MS);
      const hours = Math.floor(minutesLeft / HOUR_MINUTES);
      const minutes = minutesLeft % HOUR_MINUTES;
      const tone = minutesLeft <= EXPIRY_SOON_MINUTES ? EXPIRY_TONES.WARN : EXPIRY_TONES.NORMAL;
      if (hours === 0) {
        return result(window.I18N.t('licenseModal.expiresInMin', { minutes }), tone, title);
      }
      const key = minutes === 0 ? 'licenseModal.expiresInHours' : 'licenseModal.expiresInHm';
      return result(window.I18N.t(key, { hours, minutes }), tone, title);
    }
    const days = Math.floor(msLeft / DAY_MS);
    const tone = days <= EXPIRY_SOON_DAYS ? EXPIRY_TONES.WARN : EXPIRY_TONES.NORMAL;
    const text = days === 1
      ? window.I18N.t('licenseModal.expiresOne')
      : window.I18N.t('licenseModal.expiresIn', { count: days });
    return result(text, tone, title);
  }

  /** @param {string} license one of LICENSES */
  function licenseLabel(license) {
    return window.I18N.t(`license.${license}`);
  }

  /* ---------- dropdowns ---------- */

  function closeDropdown(dropdown) {
    const toggle = dropdown.querySelector('[data-dropdown-toggle]');
    const menu = dropdown.querySelector('[data-dropdown-menu]');
    if (!toggle || !menu || menu.hidden) {
      return;
    }
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function closeAllDropdowns(except) {
    document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
      if (dropdown !== except) {
        closeDropdown(dropdown);
      }
    });
  }

  function initDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
      const toggle = dropdown.querySelector('[data-dropdown-toggle]');
      const menu = dropdown.querySelector('[data-dropdown-menu]');
      if (!toggle || !menu) {
        console.error('[app] Dropdown is missing toggle or menu', dropdown);
        return;
      }
      toggle.addEventListener('click', () => {
        const willOpen = menu.hidden;
        closeAllDropdowns(dropdown);
        menu.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
      });
    });

    document.addEventListener('click', (event) => {
      const insideDropdown = event.target.closest('[data-dropdown]');
      closeAllDropdowns(insideDropdown);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      const openDropdown = document.querySelector('[data-dropdown] [data-dropdown-menu]:not([hidden])');
      if (openDropdown) {
        const dropdown = openDropdown.closest('[data-dropdown]');
        closeDropdown(dropdown);
        dropdown.querySelector('[data-dropdown-toggle]').focus();
      }
    });
  }

  /* ---------- dialogs ---------- */

  function openModal(id) {
    const dialog = document.getElementById(id);
    if (!dialog || typeof dialog.showModal !== 'function') {
      console.error('[app] Dialog not found or unsupported:', id);
      return;
    }
    closeAllDropdowns(null);
    dialog.showModal();
    raiseToasts();
  }

  function closeModal(dialog) {
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function initModals() {
    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-modal-open]');
      if (opener) {
        event.preventDefault();
        openModal(opener.dataset.modalOpen);
        return;
      }
      const closer = event.target.closest('[data-modal-close]');
      if (closer) {
        closeModal(closer.closest('dialog'));
      }
    });

    // Clicking the backdrop (the dialog element itself, outside its panel) closes it.
    document.querySelectorAll('dialog.modal').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
          closeModal(dialog);
        }
      });
    });
  }

  /* ---------- toasts ---------- */

  function toastRegion() {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('popover', 'manual');
      document.body.appendChild(region);
    }
    return region;
  }

  /**
   * Modal dialogs live in the browser's top layer, which no z-index can beat. The toast region is a
   * manual popover, and re-showing it moves it above whatever entered the top layer before it.
   */
  function raiseToasts() {
    const region = document.querySelector('.toast-region');
    if (!region || typeof region.showPopover !== 'function') {
      return;
    }
    try {
      if (region.matches(':popover-open')) {
        region.hidePopover();
      }
      region.showPopover();
    } catch (error) {
      console.error('[app] Unable to raise the toast region', error);
    }
  }

  /**
   * @param {string} message
   * @param {'info'|'success'|'error'} [tone]
   */
  function showToast(message, tone = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.textContent = message;
    toastRegion().appendChild(toast);
    raiseToasts();
    window.setTimeout(() => toast.remove(), TOAST_DURATION_MS);
  }

  /** Mirrors production's useToast(): show(message, tone), success(message), error(message). */
  const toast = Object.freeze({
    show: showToast,
    success: (message) => showToast(message, 'success'),
    error: (message) => showToast(message, 'error')
  });

  /* ---------- loading overlay (production AppLoadingOverlay + useLoadingOverlay) ---------- */

  // A counter, not a flag: nested/overlapping calls keep the overlay up until the last one ends.
  let loadingCount = 0;
  let focusBeforeBusy = null;
  const DEFAULT_LOADING_MS = 700;

  function loadingOverlay() {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.setAttribute('popover', 'manual');
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  /**
   * An open modal <dialog> makes everything outside it inert, the overlay included, so the
   * page itself is made inert to block clicks and Enter; focus is put back afterwards.
   * @param {HTMLElement} overlay
   * @param {boolean} inert
   */
  function setPageInert(overlay, inert) {
    if (inert) {
      focusBeforeBusy = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    Array.from(document.body.children).forEach((child) => {
      if (child !== overlay && !child.classList.contains('toast-region')) {
        child.inert = inert;
      }
    });
    if (!inert && focusBeforeBusy && focusBeforeBusy.isConnected) {
      focusBeforeBusy.focus();
    }
    if (!inert) {
      focusBeforeBusy = null;
    }
  }

  /** @param {HTMLElement} overlay @param {boolean} shown */
  function togglePopover(overlay, shown) {
    if (typeof overlay.showPopover !== 'function') {
      return;
    }
    try {
      const open = overlay.matches(':popover-open');
      if (shown && !open) {
        overlay.showPopover();
      } else if (!shown && open) {
        overlay.hidePopover();
      }
    } catch (error) {
      // Popover unsupported; the CSS z-index fallback still covers the page outside modals.
      console.error('[app] Unable to toggle the loading overlay', error);
    }
  }

  /** Shows the full-screen "Please wait…" overlay (the panel fades in after 150 ms, as in production). */
  function showLoading() {
    loadingCount += 1;
    if (loadingCount > 1) {
      return;
    }
    const overlay = loadingOverlay();
    overlay.innerHTML = `
      <div class="loading-overlay-panel">
        <svg class="icon spinner" aria-hidden="true"><use href="#i-loader"></use></svg>
        <span data-i18n="loading.working">${window.I18N.t('loading.working')}</span>
      </div>`;
    overlay.classList.add('is-active');
    setPageInert(overlay, true);
    togglePopover(overlay, true);
  }

  /** Hides the overlay once every showLoading() call has been matched. */
  function hideLoading() {
    if (loadingCount === 0) {
      return;
    }
    loadingCount -= 1;
    if (loadingCount > 0) {
      return;
    }
    const overlay = loadingOverlay();
    overlay.classList.remove('is-active');
    overlay.innerHTML = '';
    togglePopover(overlay, false);
    setPageInert(overlay, false);
    raiseToasts();
  }

  /**
   * Fakes an in-flight change: shows the overlay, waits, runs `task`, hides it (even if it throws).
   * @template T
   * @param {() => T|Promise<T>} task
   * @param {number} [delayMs]
   * @returns {Promise<T>}
   */
  async function withLoading(task, delayMs = DEFAULT_LOADING_MS) {
    showLoading();
    try {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      return await task();
    } catch (error) {
      console.error('[app] Task under the loading overlay failed', error);
      throw error;
    } finally {
      hideLoading();
    }
  }

  /* ---------- table pagination (production TablePagination.vue) ---------- */

  let paginationCount = 0;
  const PAGINATION_ATTR = 'data-pagination';
  const paginationOptions = new WeakMap();

  /**
   * Renders the pagination footer into `container` ("1–20 of 345", "Rows per page", prev/next).
   * Renders nothing when total is 0. Changing the page size returns to page 1. Re-renders itself
   * on language change. Call again with new options to update it.
   * @param {HTMLElement} container
   * @param {{page: number, pageSize: number, total: number, pageSizes?: number[],
   *   onChange?: (next: {page: number, pageSize: number}) => void}} options
   */
  function renderPagination(container, options) {
    if (!container) {
      console.error('[app] renderPagination needs a container');
      return;
    }
    const pageSizes = options.pageSizes || PAGE_SIZES;
    const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
    const total = Math.max(0, options.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, options.page || 1), totalPages);
    const current = { ...options, page, pageSize, total, pageSizes };
    paginationOptions.set(container, current);
    container.setAttribute(PAGINATION_ATTR, '');

    if (total === 0) {
      container.innerHTML = '';
      return;
    }
    if (!container.dataset.paginationId) {
      paginationCount += 1;
      container.dataset.paginationId = String(paginationCount);
    }
    const selectId = `pagination-size-${container.dataset.paginationId}`;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const t = window.I18N.t;
    const prev = t('pagination.previous');
    const next = t('pagination.next');

    container.innerHTML = `
      <div class="pagination">
        <span class="pagination-range num">${t('pagination.range', { from, to, total })}</span>
        <div class="pagination-size">
          <label for="${selectId}">${t('pagination.perPage')}</label>
          <select id="${selectId}" class="select" data-pagination-size>
            ${pageSizes.map((size) => `<option value="${size}"${size === pageSize ? ' selected' : ''}>${size}</option>`).join('')}
          </select>
        </div>
        <div class="pagination-nav">
          <button type="button" class="icon-button" data-pagination-step="-1" aria-label="${prev}" title="${prev}"${page <= 1 ? ' disabled' : ''}>
            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-left"></use></svg>
          </button>
          <span class="num" aria-live="polite">${t('pagination.pageOf', { page, total: totalPages })}</span>
          <button type="button" class="icon-button" data-pagination-step="1" aria-label="${next}" title="${next}"${page >= totalPages ? ' disabled' : ''}>
            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-right"></use></svg>
          </button>
        </div>
      </div>`;

    const notify = (nextPage, nextSize) => {
      renderPagination(container, { ...current, page: nextPage, pageSize: nextSize });
      if (typeof current.onChange === 'function') {
        try {
          current.onChange({ page: nextPage, pageSize: nextSize });
        } catch (error) {
          console.error('[app] Pagination onChange failed', error);
        }
      }
    };
    container.querySelector('[data-pagination-size]').addEventListener('change', (event) => {
      notify(1, Number(event.target.value));
    });
    container.querySelectorAll('[data-pagination-step]').forEach((button) => {
      button.addEventListener('click', () => notify(page + Number(button.dataset.paginationStep), pageSize));
    });
  }

  function rerenderPaginations() {
    document.querySelectorAll(`[${PAGINATION_ATTR}]`).forEach((container) => {
      const options = paginationOptions.get(container);
      if (options) {
        renderPagination(container, options);
      }
    });
  }

  /* ---------- icon sprite ---------- */

  function injectIconSprite() {
    const symbols = Object.entries(ICONS)
      .map(([name, paths]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${paths}</symbol>`)
      .join('');
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`
    );
  }

  /* ---------- demo role switcher ---------- */

  function initDemoSwitcher() {
    if (!document.body.hasAttribute('data-demo-switcher')) {
      return;
    }
    // Bottom-left dock holding the role switcher and any page-specific demo controls.
    const dock = document.createElement('div');
    dock.className = 'demo-dock';
    const switcher = document.createElement('div');
    switcher.className = 'demo-switcher demo-role-switcher';
    switcher.innerHTML = `
      <span class="demo-label" data-i18n="demo.label">Demo view</span>
      <div class="segmented" role="group" data-i18n-aria-label="demo.label">
        <button type="button" data-set-role="${ROLES.USER}" data-i18n="role.user">User</button>
        <button type="button" data-set-role="${ROLES.ADMIN}" data-i18n="role.admin">Admin</button>
        <button type="button" data-set-role="${ROLES.GLOBAL}" data-i18n="role.global">Global Admin</button>
      </div>`;
    dock.appendChild(switcher);

    // The X stays last, so page pills mounted later go in front of it.
    const minimizeButton = document.createElement('button');
    minimizeButton.type = 'button';
    minimizeButton.className = 'demo-dock-minimize';
    minimizeButton.setAttribute('data-i18n-aria-label', 'demo.hide');
    minimizeButton.setAttribute('data-i18n-title', 'demo.hide');
    minimizeButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg>';
    dock.appendChild(minimizeButton);

    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'demo-dock-restore';
    restoreButton.setAttribute('data-i18n-aria-label', 'demo.show');
    restoreButton.setAttribute('data-i18n-title', 'demo.show');
    restoreButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg>';

    const setDockState = (dockState, { focus = false } = {}) => {
      const minimized = dockState === DEMO_DOCK.MINIMIZED;
      dock.hidden = minimized;
      restoreButton.hidden = !minimized;
      document.body.classList.toggle('demo-dock-minimized', minimized);
      writeStorage(STORAGE_KEYS.demoDock, dockState);
      if (focus) {
        (minimized ? restoreButton : minimizeButton).focus();
      }
    };
    minimizeButton.addEventListener('click', () => setDockState(DEMO_DOCK.MINIMIZED, { focus: true }));
    restoreButton.addEventListener('click', () => setDockState(DEMO_DOCK.OPEN, { focus: true }));

    document.body.appendChild(dock);
    document.body.appendChild(restoreButton);
    setDockState(pick(readStorage(STORAGE_KEYS.demoDock), Object.values(DEMO_DOCK), DEMO_DOCK.OPEN));
  }

  /**
   * Place a page-specific demo control next to the Demo view switcher.
   * @param {HTMLElement} element
   * @returns {boolean} false when the page has no demo dock
   */
  function mountDemoControl(element) {
    const dock = document.querySelector('.demo-dock');
    if (!dock) {
      console.error('[app] No demo dock to mount control into', element);
      return false;
    }
    dock.insertBefore(element, dock.querySelector('.demo-dock-minimize'));
    element.hidden = false;
    return true;
  }

  /* ---------- controls ---------- */

  function initControls() {
    document.addEventListener('click', (event) => {
      const langButton = event.target.closest('[data-set-lang]');
      if (langButton) {
        setLang(langButton.dataset.setLang);
        return;
      }
      const themeButton = event.target.closest('[data-set-theme]');
      if (themeButton) {
        setTheme(themeButton.dataset.setTheme);
        return;
      }
      const themeToggle = event.target.closest('[data-toggle-theme]');
      if (themeToggle) {
        setTheme(state.theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
        return;
      }
      const roleButton = event.target.closest('[data-set-role]');
      if (roleButton) {
        setRole(roleButton.dataset.setRole);
        return;
      }
      const loginButton = event.target.closest('[data-login]');
      if (loginButton) {
        // The link's href (profile.html) performs the redirect once the mock session is stored.
        setSignedIn(true);
        return;
      }
      const logoutButton = event.target.closest('[data-logout]');
      if (logoutButton) {
        setSignedIn(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      injectIconSprite();
      initDemoSwitcher();
      window.I18N.apply(document);
      syncPressed('data-set-lang', state.lang);
      syncPressed('data-set-theme', state.theme);
      syncPressed('data-set-role', state.role);
      initDropdowns();
      initModals();
      initControls();
    } catch (error) {
      console.error('[app] Initialisation failed', error);
    }
  });

  window.App = Object.freeze({
    ROLES,
    LICENSES,
    MAIN_LICENSES,
    ADDON_LICENSES,
    SHARED_POOL_LICENSES,
    HELD_LICENSE_ORDER,
    PROD_LICENSE_SLUGS,
    EXPIRY_NEVER,
    EXPIRY_TONES,
    PAGE_SIZES,
    DEFAULT_PAGE_SIZE,
    THEMES,
    EVENTS,
    t: (key, vars) => window.I18N.t(key, vars),
    getRole: () => state.role,
    getLang: () => state.lang,
    isSignedIn: () => state.auth === AUTH.IN,
    setSignedIn,
    formatDate,
    formatDateTime,
    formatTime,
    formatExpiry,
    licenseLabel,
    mountDemoControl,
    openModal,
    closeModal,
    showToast,
    toast,
    showLoading,
    hideLoading,
    withLoading,
    renderPagination
  });
})();
