'use strict';

/**
 * 1. User Profile — license summary, return-license flow (paid users),
 * request-Pro flow (Basic users) and the OneDrive cloud-recording toggle.
 *
 * Request Pro: if the user's organization still has Pro quota, confirming assigns Pro
 * immediately (no admin approval). If the quota is full, the button is disabled.
 * Mock user/quota state is in-memory.
 */
(function () {
  const { LICENSES, EVENTS, t, formatDate, showToast, closeModal } = window.App;

  const QUOTA_STATES = Object.freeze({ AVAILABLE: 'available', FULL: 'full' });
  // Matches ADDON_LARGE_MEETING in mock-data.js; held alongside a license rather than instead of one.
  const ADDON_LARGE_MEETING = 'largeMeeting';

  const DAY_MS = 24 * 60 * 60 * 1000;
  // Mirrors MockData.TODAY, so this page tells the same story as Manage Users.
  const MOCK_TODAY = new Date(2026, 8, 14);
  // Faculty of Engineering declares no expiryDays, so it uses DEFAULT_EXPIRY_DAYS (manage-users.js).
  const ORG_EXPIRY_DAYS = 60;
  // Her generated lastUse in mock-data.js: 26 days before the mock today.
  const LAST_USE_DAYS_AGO = 26;
  // Large Meeting is borrowed from the Shared Pool and lapses at the next Booking Center slot
  // boundary. Mocked as a fixed remainder here; manage-users.js derives the real countdown.
  const LARGE_MEETING_MINUTES_LEFT = 135;
  const MINUTES_PER_HOUR = 60;

  /** Pro is returned to the org quota once it goes unused for the organization's interval. */
  function proExpiryFrom(lastUse) {
    return new Date(lastUse.getTime() + ORG_EXPIRY_DAYS * DAY_MS);
  }

  const currentUser = {
    license: LICENSES.PRO,
    // Matches the user's row (Anong Srisuk, Faculty of Engineering) in manage-users.js,
    // where she also holds Large Meeting from the Shared Pool.
    largeMeeting: true,
    proExpires: proExpiryFrom(new Date(MOCK_TODAY.getTime() - LAST_USE_DAYS_AGO * DAY_MS)),
    // Only used when license is Temp. Pro.
    tempProExpires: null
  };

  // Whether the user's organization has a free Pro license. Switchable from the
  // "Org Pro quota" demo pill next to the Demo view switcher to preview both Request Pro states.
  const orgProQuota = { state: QUOTA_STATES.AVAILABLE };

  // Which license the return dialog is confirming; the id alone, so its label follows the language.
  let pendingReturnId = null;

  const els = {};

  function hasFreeProLicense() {
    return orgProQuota.state === QUOTA_STATES.AVAILABLE;
  }

  /** Temp. Pro expires on its date; Pro only expires if it stays unused until then. */
  function mainLicenseExpiry() {
    const { key, date } = currentUser.license === LICENSES.TEMP_PRO
      ? { key: 'profile.expires', date: currentUser.tempProExpires }
      : { key: 'profile.expiresUnused', date: currentUser.proExpires };
    return date instanceof Date ? t(key, { date: formatDate(date) }) : '';
  }

  /** The Zoom license itself, then any add-on held alongside it — one card each. */
  function heldLicenses() {
    const licenses = [{
      id: currentUser.license,
      caption: t('profile.license'),
      name: t(`license.${currentUser.license}`),
      expiry: mainLicenseExpiry(),
      canReturn: currentUser.license !== LICENSES.BASIC,
      canRequest: currentUser.license === LICENSES.BASIC
    }];
    if (currentUser.largeMeeting) {
      licenses.push({
        id: ADDON_LARGE_MEETING,
        caption: t('profile.addon'),
        name: t('license.largeMeeting'),
        // Shares the Manage Users countdown wording so both pages phrase it the same way.
        expiry: t('licenseModal.expiresInHm', {
          hours: Math.floor(LARGE_MEETING_MINUTES_LEFT / MINUTES_PER_HOUR),
          minutes: LARGE_MEETING_MINUTES_LEFT % MINUTES_PER_HOUR
        }),
        canReturn: true
      });
    }
    return licenses;
  }

  function licenseBox(license) {
    const box = document.createElement('div');
    box.className = 'license-box';
    box.appendChild(lineOf('license-caption', license.caption));
    // badge-{id} is the same per-license colour Manage Users puts on its bubbles.
    box.appendChild(lineOf(`license-name badge-${license.id}`, license.name));
    // Expiry and the Return link travel as one block at the foot of the card, split only by the
    // divider, so neither the card's spacing nor its space-around can open a gap between them.
    const footer = document.createElement('div');
    footer.className = 'license-footer';
    if (license.expiry) {
      footer.appendChild(lineOf('license-expiry', license.expiry));
    }
    if (license.canReturn) {
      footer.appendChild(returnButton(license));
    }
    if (footer.children.length) {
      box.appendChild(footer);
    }
    if (license.canRequest) {
      // Basic users ask for Pro from the same card that states what they hold today. appendChild
      // moves the markup in from the page, so its modal hook and aria wiring are preserved.
      box.appendChild(els.requestButton);
      box.appendChild(els.requestHint);
    }
    return box;
  }

  /** Each card returns only its own license, so the button carries which one it belongs to. */
  function returnButton(license) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-button license-return';
    button.dataset.returnLicense = license.id;
    // app.js opens the dialog from this attribute; the click listener below fills its text first.
    button.dataset.modalOpen = 'return-modal';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', t('profile.returnLabel', { license: license.name }));
    button.textContent = t('profile.return');
    return button;
  }

  function lineOf(className, text) {
    const line = document.createElement('p');
    line.className = className;
    line.textContent = text;
    return line;
  }

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
    els.returnBody.textContent = t(
      license.id === ADDON_LARGE_MEETING ? 'return.bodyAddon' : 'return.body',
      { license: license.name }
    );
  }

  function onReturnClick(event) {
    const button = event.target.closest('[data-return-license]');
    if (!button) {
      return;
    }
    pendingReturnId = button.dataset.returnLicense;
    renderReturnModal();
  }

  function renderLicense() {
    const isBasic = currentUser.license === LICENSES.BASIC;

    els.licenseList.replaceChildren(...heldLicenses().map(licenseBox));
    renderReturnModal();

    // Each license card carries its own Return button; Basic users can request Pro instead.
    const canRequest = isBasic && hasFreeProLicense();
    els.requestButton.hidden = !isBasic;
    els.requestButton.disabled = !canRequest;
    els.requestHint.hidden = !isBasic || canRequest;
    els.quotaDemo.querySelectorAll('[data-set-quota]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.setQuota === orgProQuota.state));
    });
  }

  function onConfirmReturn(event) {
    // Read the license before mutating, so the toast can still name what was returned.
    const returned = pendingReturnLicense();
    closeModal(event.target.closest('dialog'));
    if (!returned) {
      return;
    }
    const isAddon = returned.id === ADDON_LARGE_MEETING;
    if (isAddon) {
      // Large Meeting carries its own reserved Pro, so the main license is untouched.
      currentUser.largeMeeting = false;
    } else {
      currentUser.license = LICENSES.BASIC;
      currentUser.proExpires = null;
      currentUser.tempProExpires = null;
    }
    pendingReturnId = null;
    renderLicense();
    showToast(t(isAddon ? 'profile.returnedAddon' : 'profile.returned', { license: returned.name }), 'success');
  }

  function onConfirmRequest(event) {
    closeModal(event.target.closest('dialog'));
    if (!hasFreeProLicense()) {
      showToast(t('profile.requestUnavailable'), 'error');
      renderLicense();
      return;
    }
    currentUser.license = LICENSES.PRO;
    // A freshly assigned Pro has no use yet, so its interval runs from now.
    currentUser.proExpires = proExpiryFrom(MOCK_TODAY);
    renderLicense();
    showToast(t('profile.proAssigned'), 'success');
    els.licenseList.querySelector('[data-return-license]')?.focus();
  }

  function onQuotaDemo(event) {
    const button = event.target.closest('[data-set-quota]');
    if (!button) {
      return;
    }
    orgProQuota.state = Object.values(QUOTA_STATES).includes(button.dataset.setQuota)
      ? button.dataset.setQuota
      : QUOTA_STATES.AVAILABLE;
    renderLicense();
  }

  function onRecordingToggle() {
    showToast(t(els.recordingToggle.checked ? 'profile.recordingOn' : 'profile.recordingOff'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      licenseList: '[data-license-list]',
      returnTitle: '[data-return-title]',
      returnBody: '[data-return-body]',
      confirmReturn: '[data-confirm-return]',
      requestButton: '[data-request-button]',
      requestHint: '[data-request-hint]',
      confirmRequest: '[data-confirm-request]',
      quotaDemo: '[data-quota-demo]',
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
      // Runs before app.js's document-level handler opens the dialog, so its text is ready.
      els.licenseList.addEventListener('click', onReturnClick);
      els.confirmReturn.addEventListener('click', onConfirmReturn);
      els.confirmRequest.addEventListener('click', onConfirmRequest);
      window.App.mountDemoControl(els.quotaDemo);
      els.quotaDemo.addEventListener('click', onQuotaDemo);
      els.recordingToggle.addEventListener('change', onRecordingToggle);
      document.addEventListener(EVENTS.LANG, renderLicense);
      renderLicense();
    } catch (error) {
      console.error('[profile] Initialisation failed', error);
    }
  });
})();
