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

  const currentUser = {
    license: LICENSES.PRO,
    // Matches the user's row (Anong Srisuk, Faculty of Engineering) in manage-users.js,
    // where she also holds Large Meeting from the Shared Pool.
    largeMeeting: true,
    // Only used when license is Temp. Pro.
    tempProExpires: null
  };

  // Whether the user's organization has a free Pro license. Switchable from the
  // "Org Pro quota" demo pill next to the Demo view switcher to preview both Request Pro states.
  const orgProQuota = { state: QUOTA_STATES.AVAILABLE };

  const els = {};

  function hasFreeProLicense() {
    return orgProQuota.state === QUOTA_STATES.AVAILABLE;
  }

  function renderLicense() {
    const isBasic = currentUser.license === LICENSES.BASIC;
    els.licenseName.textContent = t(`licenseLabel.${currentUser.license}`);

    els.licenseBadges.innerHTML = '';
    if (currentUser.largeMeeting) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-largeMeeting';
      badge.textContent = t('license.largeMeeting');
      els.licenseBadges.appendChild(badge);
    }

    const showExpiry = currentUser.license === LICENSES.TEMP_PRO && currentUser.tempProExpires instanceof Date;
    els.licenseExpiry.hidden = !showExpiry;
    if (showExpiry) {
      els.licenseExpiry.textContent = t('profile.expires', { date: formatDate(currentUser.tempProExpires) });
    }

    // Paid users can return their license; Basic users can request Pro instead.
    const canRequest = isBasic && hasFreeProLicense();
    els.returnButton.hidden = isBasic;
    els.requestButton.hidden = !isBasic;
    els.requestButton.disabled = !canRequest;
    els.requestHint.hidden = !isBasic || canRequest;
    els.quotaDemo.querySelectorAll('[data-set-quota]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.setQuota === orgProQuota.state));
    });
  }

  function onConfirmReturn(event) {
    currentUser.license = LICENSES.BASIC;
    currentUser.largeMeeting = false;
    currentUser.tempProExpires = null;
    closeModal(event.target.closest('dialog'));
    renderLicense();
    showToast(t('profile.returned'), 'success');
  }

  function onConfirmRequest(event) {
    closeModal(event.target.closest('dialog'));
    if (!hasFreeProLicense()) {
      showToast(t('profile.requestUnavailable'), 'error');
      renderLicense();
      return;
    }
    currentUser.license = LICENSES.PRO;
    renderLicense();
    showToast(t('profile.proAssigned'), 'success');
    els.returnButton.focus();
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
      licenseName: '[data-license-name]',
      licenseBadges: '[data-license-badges]',
      licenseExpiry: '[data-license-expiry]',
      returnButton: '[data-return-button]',
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
