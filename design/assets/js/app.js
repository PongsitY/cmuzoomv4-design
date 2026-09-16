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
    auth: 'cmuzoom.auth'
  });

  const AUTH = Object.freeze({ IN: 'in', OUT: 'out' });
  const THEMES = Object.freeze({ LIGHT: 'light', DARK: 'dark' });
  const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', GLOBAL: 'global' });
  const LICENSES = Object.freeze({ BASIC: 'basic', PRO: 'pro', TEMP_PRO: 'tempPro' });
  const EVENTS = Object.freeze({ LANG: 'app:langchange', ROLE: 'app:rolechange' });
  const DATE_LOCALES = Object.freeze({ en: 'en-GB', th: 'th-TH' });
  const TOAST_DURATION_MS = 3200;
  const DEFAULT_ROLE = ROLES.ADMIN;

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
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
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
      document.body.appendChild(region);
    }
    return region;
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
    window.setTimeout(() => toast.remove(), TOAST_DURATION_MS);
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
    document.body.appendChild(dock);
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
    dock.appendChild(element);
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
        event.preventDefault();
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
    THEMES,
    EVENTS,
    t: (key, vars) => window.I18N.t(key, vars),
    getRole: () => state.role,
    getLang: () => state.lang,
    isSignedIn: () => state.auth === AUTH.IN,
    setSignedIn,
    formatDate,
    formatDateTime,
    mountDemoControl,
    openModal,
    closeModal,
    showToast
  });
})();
