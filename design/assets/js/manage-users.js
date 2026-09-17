'use strict';

/**
 * 2. Manage Users — mock organisations/users, quota bars, search, and a
 * per-user license modal (30-day usage log + assign/revoke controls).
 *
 * Pro is managed by the organization's Admin and Global Admin. Shared Pool licenses (Temp. Pro,
 * Large Meeting) can be given to users in any organization, but only Global Admin can assign or
 * revoke them. Org Admins see them read-only and cannot make Pro changes that would break them.
 *
 * Mock organizations/users come from mock-data.js; all data is in-memory (resets on reload).
 */
(function () {
  const { ROLES, LICENSES, EVENTS, t, formatDate, formatDateTime, showToast, getRole, openModal, closeModal } = window.App;
  const { ADDON_LARGE_MEETING, CMU_ORG_ID, SIGNED_IN_USER, ORGANIZATIONS, createUsersByOrg, escapeHtml, initials, orgName } = window.MockData;

  const LICENSE_TYPES = Object.freeze([LICENSES.PRO, LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  // Shared Pool: every license type held by CMU except Pro (CMU's Pro quota is its own),
  // lent to users in any organization.
  const CMU_HELD_TYPES = Object.freeze([LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  const ACTIONS = Object.freeze({ ASSIGN: 'assign', REVOKE: 'revoke' });
  const LICENSE_MODAL_ID = 'license-modal';
  const EXPIRY_MODAL_ID = 'expiry-modal';
  // Pro is returned to the org quota after this many days without use (per organization).
  // 0 = never expires.
  const EXPIRY_NEVER = 0;
  const EXPIRY_PRESET_DAYS = Object.freeze([30, 60, 90, 180, EXPIRY_NEVER]);
  const DEFAULT_EXPIRY_DAYS = 60;
  const ADMIN_ORG_ID = SIGNED_IN_USER.orgId;
  const PERCENT = 100;

  const CMU_ORG = ORGANIZATIONS.find((org) => org.id === CMU_ORG_ID);
  const usersByOrg = createUsersByOrg();
  const expiryDaysByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, org.expiryDays ?? DEFAULT_EXPIRY_DAYS]));

  /* ---------- state & helpers ---------- */

  const view = {
    orgId: ADMIN_ORG_ID,
    query: '',
    modalUserId: null
  };

  const els = {};

  function currentOrg() {
    return ORGANIZATIONS.find((org) => org.id === view.orgId) || ORGANIZATIONS[0];
  }

  function licenseLabel(type) {
    return t(`license.${type}`);
  }

  function isGlobalAdmin() {
    return getRole() === ROLES.GLOBAL;
  }

  function isCmuHeldType(type) {
    return CMU_HELD_TYPES.includes(type);
  }

  function holdsLicense(user, type) {
    return type === ADDON_LARGE_MEETING ? user.largeMeeting : user.license === type;
  }

  /** Assigned count: Pro within the organization; CMU-held types across every organization. */
  function usedCount(org, type) {
    const users = isCmuHeldType(type) ? [...usersByOrg.values()].flat() : usersByOrg.get(org.id);
    return users.filter((user) => holdsLicense(user, type)).length;
  }

  function quotaTotal(org, type) {
    return isCmuHeldType(type) ? CMU_ORG.quotas[type] : org.quotas.pro;
  }

  function remaining(org, type) {
    return quotaTotal(org, type) - usedCount(org, type);
  }

  function findUser(userId) {
    return usersByOrg.get(view.orgId).find((user) => user.id === userId);
  }

  /**
   * Why the current role may not perform an action (i18n key), or null when allowed.
   * Global Admin can do everything; org Admins only manage Pro and must not disturb CMU licenses.
   */
  function lockReason(user, type, action) {
    if (isGlobalAdmin()) {
      return null;
    }
    if (isCmuHeldType(type)) {
      return 'licenseModal.managedByGlobal';
    }
    if (action === ACTIONS.ASSIGN && user.license === LICENSES.TEMP_PRO) {
      return 'licenseModal.lockedTempPro';
    }
    if (action === ACTIONS.REVOKE && user.largeMeeting) {
      return 'licenseModal.lockedLargeMeeting';
    }
    return null;
  }

  /* ---------- rendering: page ---------- */

  function renderQuotaItem(org, type) {
    const total = quotaTotal(org, type);
    const used = usedCount(org, type);
    const label = licenseLabel(type);
    const percent = Math.round((used / total) * PERCENT);
    const isFull = used >= total;
    return `
      <div class="quota-item">
        <div class="quota-item-head">
          <span class="badge badge-${type}">${escapeHtml(label)}</span>
          <span class="quota-left">${escapeHtml(t('manage.left', { count: Math.max(total - used, 0) }))}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}">
          <div class="progress-bar${isFull ? ' is-full' : ''}" data-license="${type}" style="width:${Math.min(percent, PERCENT)}%"></div>
        </div>
        <p class="quota-numbers">${escapeHtml(t('manage.used', { used, total, percent }))}</p>
      </div>`;
  }

  function renderQuotas(org) {
    if (!isGlobalAdmin()) {
      // Org Admins only see their organization's Pro quota.
      els.quotaTitle.textContent = t('manage.quotas');
      els.quotaList.innerHTML = renderQuotaItem(org, LICENSES.PRO);
      return;
    }
    els.quotaTitle.textContent = t('manage.licenseQuotas');
    els.quotaList.innerHTML = `
      <div class="quota-group">
        <p class="quota-group-label">${escapeHtml(orgName(org))}</p>
        ${renderQuotaItem(org, LICENSES.PRO)}
      </div>
      <div class="quota-group">
        <p class="quota-group-label">${escapeHtml(t('manage.quotaGroupCmu'))}</p>
        ${CMU_HELD_TYPES.map((type) => renderQuotaItem(org, type)).join('')}
      </div>`;
  }

  function renderOrgHeading(org) {
    const isGlobal = isGlobalAdmin();
    els.orgName.textContent = orgName(org);
    // Keep the heading for assistive tech when the org selector replaces it visually.
    els.orgName.classList.toggle('visually-hidden', isGlobal);
    els.orgSelect.hidden = !isGlobal;
    els.orgSelect.innerHTML = ORGANIZATIONS.map((item) =>
      `<option value="${item.id}"${item.id === org.id ? ' selected' : ''}>${escapeHtml(orgName(item))}</option>`
    ).join('');
    els.userCount.textContent = t('manage.userCount', { count: usersByOrg.get(org.id).length });
  }

  function largeMeetingBubble(user) {
    if (!user.largeMeeting) {
      return '';
    }
    return `<span class="badge badge-largeMeeting">${escapeHtml(licenseLabel(ADDON_LARGE_MEETING))}</span>`;
  }

  function renderRow(user) {
    const lastUse = user.lastUse
      ? `<span class="last-use">${escapeHtml(formatDate(user.lastUse))}</span>`
      : `<span class="last-use is-never">${escapeHtml(t('manage.never'))}</span>`;

    return `
      <tr>
        <td>
          <div class="user-cell">
            <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
            <div>
              <span class="user-name">${escapeHtml(user.name)}</span>
              <span class="user-email">${escapeHtml(user.email)}</span>
            </div>
          </div>
        </td>
        <td data-label="${escapeHtml(t('table.lastUse'))}">${lastUse}</td>
        <td>
          <div class="license-cell">
            <button type="button" class="license-bubble badge-${user.license}" data-open-license data-user-id="${user.id}"
              aria-haspopup="dialog" aria-label="${escapeHtml(t('licenseModal.open', { name: user.name, license: licenseLabel(user.license) }))}">
              <span>${escapeHtml(licenseLabel(user.license))}</span>
              <svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-right"></use></svg>
            </button>
            ${largeMeetingBubble(user)}
          </div>
        </td>
      </tr>`;
  }

  function renderTable(org) {
    const query = view.query.trim().toLowerCase();
    const users = usersByOrg.get(org.id).filter((user) =>
      !query || user.name.toLowerCase().includes(query) || user.email.includes(query)
    );
    els.rows.innerHTML = users.map(renderRow).join('');
    els.empty.hidden = users.length > 0;
  }

  function render() {
    const isUser = getRole() === ROLES.USER;
    els.noPermission.hidden = !isUser;
    els.manage.hidden = isUser;
    if (isUser) {
      return;
    }
    if (getRole() === ROLES.ADMIN) {
      view.orgId = ADMIN_ORG_ID;
    }
    const org = currentOrg();
    renderOrgHeading(org);
    renderQuotas(org);
    renderExpiry(org);
    renderTable(org);
  }

  /* ---------- Pro expiration interval ---------- */

  function expiryLabel(days) {
    return days === EXPIRY_NEVER ? t('expiry.never') : t('expiry.days', { count: days });
  }

  function renderExpiry(org) {
    const count = expiryDaysByOrg.get(org.id);
    els.expiryValue.textContent = expiryLabel(count);
    els.expiryDesc.textContent = count === EXPIRY_NEVER ? t('expiry.descNever') : t('expiry.desc', { count });
  }

  /** Radio tiles for the presets, with `selectedDays` checked. */
  function renderExpiryOptions(org, selectedDays) {
    els.expiryOrg.textContent = orgName(org);
    els.expiryOptions.innerHTML = EXPIRY_PRESET_DAYS.map((days) => `
      <label class="expiry-option${days === EXPIRY_NEVER ? ' is-never' : ''}">
        <input type="radio" name="expiry-days" value="${days}"${days === selectedDays ? ' checked' : ''}>
        <span>${escapeHtml(expiryLabel(days))}</span>
      </label>`).join('');
  }

  function checkedExpiryDays() {
    const checked = els.expiryOptions.querySelector('input[name="expiry-days"]:checked');
    return checked ? Number(checked.value) : null;
  }

  function openExpiryModal() {
    renderExpiryOptions(currentOrg(), expiryDaysByOrg.get(currentOrg().id));
    openModal(EXPIRY_MODAL_ID);
    const checked = els.expiryOptions.querySelector('input:checked');
    if (checked) {
      checked.focus();
    }
  }

  function saveExpiry() {
    const org = currentOrg();
    const days = checkedExpiryDays();
    if (!EXPIRY_PRESET_DAYS.includes(days)) {
      console.error('[manage-users] Invalid Pro expiration interval', days);
      showToast(t('expiry.invalid'), 'error');
      return;
    }
    expiryDaysByOrg.set(org.id, days);
    closeModal(els.expiryModal);
    renderExpiry(org);
    showToast(t('expiry.saved', { org: orgName(org), interval: expiryLabel(days) }), 'success');
  }

  /* ---------- rendering: license modal ---------- */

  function quotaMeta(org, type) {
    const params = { left: Math.max(remaining(org, type), 0), total: quotaTotal(org, type) };
    return t(isCmuHeldType(type) ? 'licenseModal.cmuQuotaLeft' : 'licenseModal.quotaLeft', params);
  }

  function actionButton(type, action, disabled) {
    const label = licenseLabel(type);
    const isRevoke = action === ACTIONS.REVOKE;
    const variant = isRevoke ? 'btn-outline-danger' : 'btn-primary';
    // Visible text is just Assign/Revoke; aria-label keeps the license type for screen readers.
    const ariaLabel = t(isRevoke ? 'licenseModal.revokeLabel' : 'licenseModal.assignLabel', { license: label });
    const text = t(isRevoke ? 'licenseModal.revoke' : 'licenseModal.assign');
    return `<button type="button" class="btn btn-sm ${variant}" data-license-action="${action}" data-type="${type}" aria-label="${escapeHtml(ariaLabel)}"${disabled ? ' disabled' : ''}>${escapeHtml(text)}</button>`;
  }

  /** One row per license type with an Assign/Revoke button, or a read-only lock for CMU licenses. */
  function renderLicenseAction(org, user, type) {
    const isCurrent = holdsLicense(user, type);
    const action = isCurrent ? ACTIONS.REVOKE : ACTIONS.ASSIGN;
    const lock = lockReason(user, type, action);
    // Large Meeting can only be added on top of a paid license.
    const needsPaid = type === ADDON_LARGE_MEETING && user.license === LICENSES.BASIC;
    const readOnly = isCmuHeldType(type) && lock !== null;

    let meta;
    let control;
    if (readOnly) {
      meta = t(isCurrent ? 'licenseModal.assigned' : 'licenseModal.notAssigned');
      control = `
        <span class="license-lock">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#i-lock"></use></svg>
          ${escapeHtml(t(lock))}
        </span>`;
    } else {
      meta = isCurrent ? `${t('licenseModal.assigned')} · ${quotaMeta(org, type)}` : quotaMeta(org, type);
      if (!isCurrent && needsPaid) {
        meta = t('manage.requiresPaid');
      }
      if (lock) {
        meta = t(lock);
      }
      const unavailable = !isCurrent && (remaining(org, type) <= 0 || needsPaid);
      control = actionButton(type, action, lock !== null || unavailable);
    }

    return `
      <div class="license-action${isCurrent ? ' is-current' : ''}">
        <div class="license-action-info">
          <span class="badge badge-${type}">${escapeHtml(licenseLabel(type))}</span>
          <span class="license-action-meta">${escapeHtml(meta)}</span>
        </div>
        ${control}
      </div>`;
  }

  function renderUsageLog(user) {
    const log = user.usageLog;
    els.modalUsageCount.textContent = log.length === 1
      ? t('licenseModal.meetingCountOne')
      : t('licenseModal.meetingCount', { count: log.length });
    if (log.length === 0) {
      els.modalUsage.innerHTML = `<p class="usage-empty">${escapeHtml(t('licenseModal.noUsage'))}</p>`;
      return;
    }
    els.modalUsage.innerHTML = `
      <table class="usage-table">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(t('usage.dateTime'))}</th>
            <th scope="col" class="num">${escapeHtml(t('usage.duration'))}</th>
            <th scope="col" class="num">${escapeHtml(t('usage.participants'))}</th>
          </tr>
        </thead>
        <tbody>
          ${log.map((meeting) => `
            <tr>
              <td>${escapeHtml(formatDateTime(meeting.start))}</td>
              <td class="num">${escapeHtml(t('usage.minutes', { count: meeting.minutes }))}</td>
              <td class="num">${meeting.participants}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderLicenseModal(focusType) {
    const user = view.modalUserId && findUser(view.modalUserId);
    if (!user) {
      return;
    }
    const org = currentOrg();
    els.modalInitials.textContent = initials(user.name);
    els.modalName.textContent = user.name;
    els.modalEmail.textContent = user.email;
    els.modalCurrent.innerHTML = `
      <span class="badge badge-${user.license}">${escapeHtml(licenseLabel(user.license))}</span>
      ${largeMeetingBubble(user)}`;
    els.modalActions.innerHTML = LICENSE_TYPES.map((type) => renderLicenseAction(org, user, type)).join('');
    renderUsageLog(user);

    if (focusType) {
      const target = els.modalActions.querySelector(`[data-type="${focusType}"]:not(:disabled)`);
      if (target) {
        target.focus();
      }
    }
  }

  /* ---------- actions ---------- */

  function openLicenseModal(userId) {
    if (!findUser(userId)) {
      console.error('[manage-users] User not found for license modal', userId);
      return;
    }
    view.modalUserId = userId;
    renderLicenseModal();
    openModal(LICENSE_MODAL_ID);
  }

  function assignLicense(user, type) {
    const org = currentOrg();
    if (remaining(org, type) <= 0) {
      showToast(t('manage.overQuota', { license: licenseLabel(type) }), 'error');
      return;
    }
    if (type === ADDON_LARGE_MEETING) {
      if (user.license === LICENSES.BASIC) {
        showToast(t('manage.requiresPaid'), 'error');
        return;
      }
      user.largeMeeting = true;
    } else {
      // Pro and Temp. Pro are exclusive: assigning one replaces (and releases) the other.
      user.license = type;
    }
    showToast(t('manage.assigned', { license: licenseLabel(type), name: user.name }), 'success');
  }

  function revokeLicense(user, type) {
    if (type === ADDON_LARGE_MEETING) {
      user.largeMeeting = false;
    } else {
      user.license = LICENSES.BASIC;
      // Large Meeting requires a paid license.
      user.largeMeeting = false;
    }
    showToast(t('manage.revoked', { license: licenseLabel(type), name: user.name }), 'success');
  }

  function onModalAction(button) {
    const user = view.modalUserId && findUser(view.modalUserId);
    if (!user) {
      console.error('[manage-users] License action without a selected user');
      return;
    }
    const { licenseAction, type } = button.dataset;
    const lock = lockReason(user, type, licenseAction);
    if (lock) {
      showToast(t(lock), 'error');
      return;
    }
    if (licenseAction === ACTIONS.ASSIGN) {
      assignLicense(user, type);
    } else if (licenseAction === ACTIONS.REVOKE) {
      revokeLicense(user, type);
    } else {
      console.error('[manage-users] Unknown license action', licenseAction);
      return;
    }
    render();
    renderLicenseModal(type);
  }

  function bindEvents() {
    els.rows.addEventListener('click', (event) => {
      const bubble = event.target.closest('[data-open-license]');
      if (bubble) {
        openLicenseModal(bubble.dataset.userId);
      }
    });

    els.modalActions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-license-action]');
      if (button) {
        onModalAction(button);
      }
    });

    els.modal.addEventListener('close', () => {
      const userId = view.modalUserId;
      view.modalUserId = null;
      const bubble = userId && els.rows.querySelector(`[data-open-license][data-user-id="${userId}"]`);
      if (bubble) {
        bubble.focus();
      }
    });

    els.search.addEventListener('input', () => {
      view.query = els.search.value;
      renderTable(currentOrg());
    });

    els.orgSelect.addEventListener('change', () => {
      view.orgId = els.orgSelect.value;
      render();
    });

    els.expiryEdit.addEventListener('click', openExpiryModal);
    els.expirySave.addEventListener('click', saveExpiry);

    els.expiryModal.addEventListener('close', () => {
      els.expiryEdit.focus();
    });

    document.addEventListener(EVENTS.LANG, () => {
      render();
      renderLicenseModal();
      if (els.expiryModal.open) {
        // Keep the unsaved selection while relabelling.
        renderExpiryOptions(currentOrg(), checkedExpiryDays());
      }
    });
    document.addEventListener(EVENTS.ROLE, () => {
      closeModal(els.modal);
      closeModal(els.expiryModal);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      noPermission: '[data-no-permission]',
      manage: '[data-manage]',
      quotaTitle: '[data-quota-title]',
      quotaList: '[data-quota-list]',
      orgName: '[data-org-name]',
      orgSelect: '[data-org-select]',
      userCount: '[data-user-count]',
      search: '[data-search]',
      rows: '[data-user-rows]',
      empty: '[data-empty]',
      modal: `#${LICENSE_MODAL_ID}`,
      modalInitials: '[data-lm-initials]',
      modalName: '[data-lm-name]',
      modalEmail: '[data-lm-email]',
      modalCurrent: '[data-lm-current]',
      modalActions: '[data-lm-actions]',
      modalUsage: '[data-lm-usage]',
      modalUsageCount: '[data-lm-usage-count]',
      expiryValue: '[data-expiry-value]',
      expiryDesc: '[data-expiry-desc]',
      expiryEdit: '[data-expiry-edit]',
      expiryModal: `#${EXPIRY_MODAL_ID}`,
      expiryOrg: '[data-expiry-org]',
      expiryOptions: '[data-expiry-options]',
      expirySave: '[data-expiry-save]'
    };
    try {
      Object.entries(selectors).forEach(([key, selector]) => {
        const el = document.querySelector(selector);
        if (!el) {
          throw new Error(`Missing element ${selector}`);
        }
        els[key] = el;
      });
      bindEvents();
      render();
    } catch (error) {
      console.error('[manage-users] Initialisation failed', error);
    }
  });
})();
