'use strict';

/**
 * 1. User Profile — a port of production's app/pages/profile.vue: identity block, one license
 * card per held license (main license, then the Large Meeting add-on) with a live "Expires in …"
 * countdown, Return / Request Pro flows, the OneDrive cloud-recording switch and meeting shortcuts.
 *
 * Request Pro: while the organization still has Pro quota, confirming assigns Pro at once (no
 * admin approval); with the quota full the button is disabled and a hint explains why.
 * Mock state is in-memory; the demo pills next to the Demo view switcher cycle the user's license,
 * the Large Meeting add-on and the organization's quota so every state can be previewed.
 */
(function () {
  const { LICENSES, EVENTS, t, formatExpiry, licenseLabel, toast, withLoading, closeModal } = window.App;
  const MockData = window.MockData;

  const QUOTA_STATES = Object.freeze({ AVAILABLE: 'available', FULL: 'full' });
  const DEMO_LICENSES = Object.freeze([LICENSES.BASIC, LICENSES.PRO, LICENSES.TEMP_PRO, LICENSES.EMERGENCY_PRO]);

  const MINUTE_MS = 60 * 1000;
  // Production loads /api/me lazily and shows skeletons meanwhile; mimic a short fetch.
  const SKELETON_MS = 450;
  // Stand-in for the Microsoft consent popup when switching OneDrive sync on.
  const CONSENT_MS = 1200;
  // Production's useLicenseExpiry re-reads the clock once a minute.
  const COUNTDOWN_TICK_MS = MINUTE_MS;
  // Demo expiries: Pro last used 15 days ago in a 60-day org (45 days left); Emergency Pro was
  // assigned 4 of its 7 days ago (3 days left, warning tone).
  const PRO_DAYS_LEFT = 45;
  const EMERGENCY_PRO_DAYS_LEFT = 3;
  const PAGE_TITLE_SUFFIX = ' · CMU ZOOM';

  const user = MockData.SIGNED_IN_USER;

  const state = {
    loaded: false,
    // Matches the signed-in user's row (eng-0) in Manage Users: Pro + Large Meeting.
    license: LICENSES.PRO,
    largeMeeting: true,
    // When each held license lapses (Date), keyed by license; see seedExpiry().
    expiry: {},
    quota: QUOTA_STATES.AVAILABLE,
    recordingEnabled: true,
    syncBusy: false,
    returning: false,
    requesting: false
  };

  // Which license the return dialog is confirming; the id alone, so its label follows the language.
  let pendingReturnId = null;

  const els = {};

  /* ---------- mock expiries ---------- */

  /**
   * 23:59 on the day `days` after today, so whole-day countdowns read exactly `days` at any
   * time of day (formatExpiry floors to whole days).
   */
  function endOfDayIn(days) {
    const now = MockData.mockNow();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days + 1, 0, -1);
  }

  /** A fresh expiry for `license`, as if it had just been seeded or assigned. */
  function seedExpiry(license, proDays = PRO_DAYS_LEFT) {
    switch (license) {
      case LICENSES.PRO:
        return endOfDayIn(proDays);
      case LICENSES.EMERGENCY_PRO:
        return endOfDayIn(EMERGENCY_PRO_DAYS_LEFT);
      // Shared Pool loans lapse at the end of the booking slot they were granted in.
      case LICENSES.TEMP_PRO:
      case LICENSES.LARGE_MEETING:
        return MockData.nextSlotBoundary(MockData.mockNow());
      default:
        return null;
    }
  }

  function setMainLicense(license, proDays) {
    state.license = license;
    state.expiry[license] = seedExpiry(license, proDays);
  }

  function setLargeMeeting(held) {
    state.largeMeeting = held;
    state.expiry[LICENSES.LARGE_MEETING] = held ? seedExpiry(LICENSES.LARGE_MEETING) : null;
  }

  /* ---------- identity ---------- */

  function renderIdentity() {
    const org = MockData.ORGANIZATIONS.find((item) => item.id === user.orgId);
    els.initials.textContent = MockData.initials(user.name);
    els.name.textContent = MockData.displayName(user);
    els.email.textContent = user.email;
    els.org.textContent = org ? MockData.orgName(org) : '';
    els.org.parentElement.hidden = !org;
  }

  function renderTitle() {
    document.title = `${t('menu.editProfile')}${PAGE_TITLE_SUFFIX}`;
  }

  /* ---------- license cards ---------- */

  function isBasic() {
    return state.license === LICENSES.BASIC;
  }

  function proAvailable() {
    return state.quota === QUOTA_STATES.AVAILABLE;
  }

  /** The main license (Basic included, as production), then the Large Meeting add-on if held. */
  function heldLicenses() {
    const main = state.license;
    const boxes = [{
      id: main,
      caption: t('profile.license'),
      name: licenseLabel(main),
      expiry: main === LICENSES.BASIC ? null : formatExpiry(state.expiry[main]),
      canReturn: main !== LICENSES.BASIC
    }];
    if (state.largeMeeting) {
      boxes.push({
        id: LICENSES.LARGE_MEETING,
        caption: t('profile.addon'),
        name: licenseLabel(LICENSES.LARGE_MEETING),
        expiry: formatExpiry(state.expiry[LICENSES.LARGE_MEETING]),
        canReturn: true
      });
    }
    return boxes;
  }

  function lineOf(className, text) {
    const line = document.createElement('p');
    line.className = className;
    line.textContent = text;
    return line;
  }

  /** @param {{text: string, className: string, title: string}} expiry */
  function applyExpiry(line, expiry) {
    line.className = ['license-expiry', 'license-countdown', expiry.className].filter(Boolean).join(' ');
    line.textContent = expiry.text;
    if (expiry.title) {
      line.title = expiry.title;
    } else {
      line.removeAttribute('title');
    }
  }

  /** Each card returns only its own license, so the button carries which one it belongs to. */
  function returnButton(license) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-button license-return';
    button.dataset.returnLicense = license.id;
    // app.js opens the dialog from this attribute; the list's click listener fills its text first.
    button.dataset.modalOpen = 'return-modal';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', t('profile.returnLabel', { license: license.name }));
    button.textContent = t('profile.return');
    return button;
  }

  function licenseBox(license) {
    const box = document.createElement('div');
    box.className = 'license-box';
    box.appendChild(lineOf('license-caption', license.caption));
    // badge-{id} is the same per-license colour Manage Users puts on its bubbles.
    box.appendChild(lineOf(`license-name badge-${license.id}`, license.name));
    if (license.expiry || license.canReturn) {
      const footer = document.createElement('div');
      footer.className = 'license-footer';
      if (license.expiry) {
        const line = document.createElement('p');
        line.dataset.countdown = license.id;
        applyExpiry(line, license.expiry);
        footer.appendChild(line);
      }
      if (license.canReturn) {
        footer.appendChild(returnButton(license));
      }
      box.appendChild(footer);
    }
    return box;
  }

  function renderLicense() {
    if (!state.loaded) {
      return;
    }
    els.licenseList.replaceChildren(...heldLicenses().map(licenseBox));
    renderReturnModal();

    els.requestButton.hidden = !isBasic();
    els.requestButton.disabled = !proAvailable() || state.requesting;
    els.requestHint.hidden = !isBasic() || proAvailable();
  }

  /** Minute tick: refresh the countdown text in place, so focus on a Return link is kept. */
  function updateCountdowns() {
    if (!state.loaded) {
      return;
    }
    heldLicenses().forEach((license) => {
      const line = els.licenseList.querySelector(`[data-countdown="${license.id}"]`);
      if (line && license.expiry) {
        applyExpiry(line, license.expiry);
      }
    });
  }

  function renderDemoControls() {
    els.licenseDemo.querySelectorAll('[data-set-license]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.setLicense === state.license));
    });
    els.largeMeetingDemo.setAttribute('aria-pressed', String(state.largeMeeting));
    els.quotaDemo.querySelectorAll('[data-set-quota]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.setQuota === state.quota));
    });
  }

  function render() {
    renderLicense();
    renderDemoControls();
  }

  /* ---------- returning ---------- */

  function pendingReturnLicense() {
    return heldLicenses().find((license) => license.id === pendingReturnId) || null;
  }

  /** Re-read from the current dictionary so the dialog follows a language switch. */
  function renderReturnModal() {
    const license = pendingReturnLicense();
    if (!license) {
      return;
    }
    els.returnTitle.textContent = t('return.title', { license: license.name });
    els.returnBody.textContent = license.id === LICENSES.LARGE_MEETING
      ? t('return.bodyAddon', { license: license.name })
      : t('return.body');
  }

  function onReturnClick(event) {
    const button = event.target.closest('[data-return-license]');
    if (!button) {
      return;
    }
    pendingReturnId = button.dataset.returnLicense;
    renderReturnModal();
  }

  async function onConfirmReturn(event) {
    const dialog = event.target.closest('dialog');
    // Read the license before mutating, so the toast can still name what was returned.
    const returned = pendingReturnLicense();
    if (!returned || state.returning) {
      return;
    }
    state.returning = true;
    els.confirmReturn.disabled = true;
    try {
      await withLoading(() => {
        if (returned.id === LICENSES.LARGE_MEETING) {
          setLargeMeeting(false);
          toast.success(t('profile.returnedAddon', { license: returned.name }));
        } else {
          // Clearing the main license; Large Meeting is left untouched.
          setMainLicense(LICENSES.BASIC);
          toast.success(t('profile.returned'));
        }
        render();
      });
    } catch (error) {
      console.error('[profile] Return failed', error);
      toast.error(t('common.error'));
    } finally {
      state.returning = false;
      els.confirmReturn.disabled = false;
      closeModal(dialog);
      pendingReturnId = null;
    }
  }

  /* ---------- requesting ---------- */

  async function onConfirmRequest(event) {
    const dialog = event.target.closest('dialog');
    if (state.requesting) {
      return;
    }
    state.requesting = true;
    els.confirmRequest.disabled = true;
    try {
      await withLoading(() => {
        if (!proAvailable()) {
          // Production's PUT fails with the server's message; the prototype names the reason.
          toast.error(t('profile.requestUnavailable'));
          return;
        }
        // A freshly assigned Pro has no use yet, so the org's whole interval lies ahead.
        setMainLicense(LICENSES.PRO, MockData.proExpiryDays(user.orgId));
        toast.success(t('profile.proAssigned'));
      });
    } catch (error) {
      console.error('[profile] Request Pro failed', error);
      toast.error(t('common.error'));
    } finally {
      state.requesting = false;
      els.confirmRequest.disabled = false;
      closeModal(dialog);
      render();
    }
  }

  /* ---------- OneDrive recording sync ---------- */

  function syncToggleToState() {
    els.recordingToggle.checked = state.recordingEnabled;
    els.recordingToggle.disabled = state.syncBusy;
  }

  async function onRecordingToggle() {
    const wantEnabled = els.recordingToggle.checked;
    // Nothing changes until the (mock) server confirms, so the switch snaps back meanwhile.
    syncToggleToState();
    if (state.syncBusy) {
      return;
    }
    state.syncBusy = true;
    syncToggleToState();
    try {
      if (wantEnabled) {
        // Production opens a Microsoft consent popup; the switch stays off until it reports back.
        await withLoading(() => {
          state.recordingEnabled = true;
          toast.success(t('profile.recordingEnabled'));
        }, CONSENT_MS);
      } else {
        await withLoading(() => {
          state.recordingEnabled = false;
          toast.success(t('profile.recordingDisabled'));
        });
      }
    } catch (error) {
      console.error('[profile] Recording sync change failed', error);
      toast.error(t('common.error'));
    } finally {
      state.syncBusy = false;
      syncToggleToState();
    }
  }

  /* ---------- demo controls ---------- */

  function onLicenseDemo(event) {
    const licenseButton = event.target.closest('[data-set-license]');
    if (licenseButton && DEMO_LICENSES.includes(licenseButton.dataset.setLicense)) {
      setMainLicense(licenseButton.dataset.setLicense);
      render();
      return;
    }
    if (event.target.closest('[data-toggle-large-meeting]')) {
      setLargeMeeting(!state.largeMeeting);
      render();
    }
  }

  function onQuotaDemo(event) {
    const button = event.target.closest('[data-set-quota]');
    if (!button) {
      return;
    }
    state.quota = Object.values(QUOTA_STATES).includes(button.dataset.setQuota)
      ? button.dataset.setQuota
      : QUOTA_STATES.AVAILABLE;
    render();
  }

  /* ---------- loading ---------- */

  /** Swap the skeleton blocks for the real content, as production does once /api/me lands. */
  function finishLoading() {
    state.loaded = true;
    document.querySelectorAll('[data-skeleton]').forEach((el) => el.remove());
    document.querySelectorAll('[data-loaded]').forEach((el) => {
      el.hidden = false;
    });
    els.profileCard.setAttribute('aria-busy', 'false');
    els.recordingSetting.setAttribute('aria-busy', 'false');
    renderIdentity();
    syncToggleToState();
    render();
  }

  function onLangChange() {
    renderTitle();
    if (state.loaded) {
      renderIdentity();
    }
    renderLicense();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      profileCard: '[data-profile-card]',
      initials: '[data-profile-initials]',
      name: '[data-profile-name]',
      email: '[data-profile-email]',
      org: '[data-profile-org]',
      licenseList: '[data-license-list]',
      returnTitle: '[data-return-title]',
      returnBody: '[data-return-body]',
      confirmReturn: '[data-confirm-return]',
      requestButton: '[data-request-button]',
      requestHint: '[data-request-hint]',
      confirmRequest: '[data-confirm-request]',
      licenseDemo: '[data-license-demo]',
      largeMeetingDemo: '[data-toggle-large-meeting]',
      quotaDemo: '[data-quota-demo]',
      recordingSetting: '[data-recording-setting]',
      recordingToggle: '[data-recording-toggle]'
    };
    try {
      Object.entries(selectors).forEach(([key, selector]) => {
        const el = document.querySelector(selector);
        if (!el) {
          throw new Error(`Missing element ${selector}`);
        }
        els[key] = el;
      });
      setMainLicense(state.license);
      setLargeMeeting(state.largeMeeting);

      // Runs before app.js's document-level handler opens the dialog, so its text is ready.
      els.licenseList.addEventListener('click', onReturnClick);
      els.confirmReturn.addEventListener('click', onConfirmReturn);
      els.confirmRequest.addEventListener('click', onConfirmRequest);
      els.recordingToggle.addEventListener('change', onRecordingToggle);
      window.App.mountDemoControl(els.licenseDemo);
      window.App.mountDemoControl(els.quotaDemo);
      els.licenseDemo.addEventListener('click', onLicenseDemo);
      els.quotaDemo.addEventListener('click', onQuotaDemo);
      document.addEventListener(EVENTS.LANG, onLangChange);

      renderTitle();
      renderDemoControls();
      window.setTimeout(finishLoading, SKELETON_MS);
      window.setInterval(updateCountdowns, COUNTDOWN_TICK_MS);
    } catch (error) {
      console.error('[profile] Initialisation failed', error);
    }
  });
})();
