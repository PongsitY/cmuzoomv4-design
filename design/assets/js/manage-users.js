'use strict';

/**
 * 2. Manage Users — mock organisations/users, quota bars, search, and a
 * per-user license modal (30-day usage log + assign/revoke controls).
 *
 * License ownership:
 * - Every organization (CMU included) holds its own Pro quota, managed by its Admin and Global Admin.
 * - The CMU organization additionally holds the Temp. Pro and Large Meeting quotas on behalf of
 *   everyone. They can be given to users in any organization, but only Global Admin can assign or
 *   revoke them. Org Admins see them read-only and cannot make Pro changes that would break them.
 *
 * All data is in-memory (resets on reload).
 */
(function () {
  const { ROLES, LICENSES, EVENTS, t, formatDate, formatDateTime, showToast, getRole, openModal, closeModal } = window.App;

  const ADDON_LARGE_MEETING = 'largeMeeting';
  const LICENSE_TYPES = Object.freeze([LICENSES.PRO, LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  // Shared Pool: every license type held by CMU except Pro (CMU's Pro quota is its own),
  // lent to users in any organization.
  const CMU_HELD_TYPES = Object.freeze([LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  const CMU_ORG_ID = 'cmu';
  const ACTIONS = Object.freeze({ ASSIGN: 'assign', REVOKE: 'revoke' });
  const LICENSE_MODAL_ID = 'license-modal';
  // The signed-in demo user (shown on profile.html) is an admin of the Faculty of Engineering.
  const SIGNED_IN_USER = Object.freeze({ name: 'Anong Srisuk', email: 'anong.s@cmu.ac.th', orgId: 'eng' });
  const ADMIN_ORG_ID = SIGNED_IN_USER.orgId;
  const USERS_PER_ORG = 15;
  const LAST_USE_WINDOW_DAYS = 45;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PERCENT = 100;
  // Fixed "today" keeps the generated demo data stable between visits.
  const REFERENCE_DATE = new Date(2026, 8, 14);

  // Mock license distribution: every 2nd user gets Pro while the org quota allows.
  const PRO_EVERY = 2;
  // Users (by generated id) who currently borrow CMU-held licenses; kept below the CMU quotas
  // so assigning can still be demoed. eng-0 is the signed-in admin, Anong Srisuk.
  const CMU_LOANS = Object.freeze({
    tempPro: Object.freeze(['ou-1', 'eng-1']),
    largeMeeting: Object.freeze(['eng-0'])
  });

  // Usage log generation
  const USAGE_WINDOW_DAYS = 30;
  const MAX_MEETINGS = 8;
  const MAX_DAY_GAP = 4;
  const WORK_DAY_START_HOUR = 8;
  const WORK_HOURS = 9;
  const HALF_HOUR = 30;
  const BASIC_MAX_MINUTES = 40;
  const DURATION_STEPS = [15, 30, 45, 60, 90, 120];
  const PARTICIPANT_STEPS = [2, 4, 7, 12, 18, 25, 40, 65];

  // Each organization holds a Pro quota; CMU also holds the Temp. Pro / Large Meeting quotas for everyone.
  // `seed` keeps each organization's generated mock data stable regardless of list order.
  const ORGANIZATIONS = [
    { id: CMU_ORG_ID, seed: 4, name: { en: 'CMU', th: 'CMU' }, quotas: { pro: 12, tempPro: 3, largeMeeting: 2 } },
    { id: 'ou', seed: 0, name: { en: 'Office of the University', th: 'สำนักงานมหาวิทยาลัย' }, quotas: { pro: 10 } },
    { id: 'med', seed: 1, name: { en: 'Faculty of Medicine', th: 'คณะแพทยศาสตร์' }, quotas: { pro: 20 } },
    { id: 'eng', seed: 2, name: { en: 'Faculty of Engineering', th: 'คณะวิศวกรรมศาสตร์' }, quotas: { pro: 8 } },
    { id: 'hum', seed: 3, name: { en: 'Faculty of Humanities', th: 'คณะมนุษยศาสตร์' }, quotas: { pro: 6 } }
  ];
  const CMU_ORG = ORGANIZATIONS.find((org) => org.id === CMU_ORG_ID);

  const FIRST_NAMES = ['Nareerat', 'Somchai', 'Kanya', 'Nattapong', 'Pimchanok', 'Thanawat', 'Supaporn', 'Kittisak', 'Wilaiwan', 'Chaiwat', 'Siriporn', 'Pongsakorn', 'Rattana', 'Apichat', 'Duangjai', 'Teerapat', 'Jiraporn', 'Worawut', 'Malee', 'Sakda'];
  const LAST_NAMES = ['Srisuk', 'Kaewmanee', 'Boonmee', 'Chaiyaporn', 'Thongdee', 'Wongsawat', 'Inthapan', 'Saengchai', 'Phrommin', 'Rattanakul', 'Jantarasri', 'Kongkaew', 'Suwannarat', 'Panyawong', 'Yodsuwan', 'Meechai', 'Sangthong', 'Kaewkham', 'Prasertsin', 'Nakprasit'];

  /* ---------- mock data ---------- */

  /**
   * Deterministic pseudo-random pick so every org gets a different but stable mix.
   * @param {number} orgIndex
   * @param {number} userIndex
   * @param {number} salt
   * @param {number} modulo
   */
  function spread(orgIndex, userIndex, salt, modulo) {
    return (orgIndex * salt + userIndex * (salt + 2)) % modulo;
  }

  /**
   * Meetings in the last 30 days, newest first. The newest one falls on the user's last-use day.
   * @param {number} orgIndex
   * @param {number} userIndex
   * @param {number|null} lastUseDaysAgo
   * @param {string} license
   */
  function buildUsageLog(orgIndex, userIndex, lastUseDaysAgo, license) {
    if (lastUseDaysAgo === null || lastUseDaysAgo >= USAGE_WINDOW_DAYS) {
      return [];
    }
    const count = 1 + spread(orgIndex, userIndex, 5, MAX_MEETINGS);
    const log = [];
    let daysAgo = lastUseDaysAgo;
    for (let n = 0; n < count && daysAgo < USAGE_WINDOW_DAYS; n += 1) {
      const seed = orgIndex * 31 + userIndex * 17 + n * 7;
      const start = new Date(REFERENCE_DATE.getTime() - daysAgo * DAY_MS);
      start.setHours(WORK_DAY_START_HOUR + (seed % WORK_HOURS), (seed % 2) * HALF_HOUR, 0, 0);
      const minutes = DURATION_STEPS[seed % DURATION_STEPS.length];
      log.push({
        start,
        // Basic accounts are cut off at 40 minutes by Zoom.
        minutes: license === LICENSES.BASIC ? Math.min(minutes, BASIC_MAX_MINUTES) : minutes,
        participants: PARTICIPANT_STEPS[(seed * 3) % PARTICIPANT_STEPS.length]
      });
      daysAgo += 1 + (seed % MAX_DAY_GAP);
    }
    return log;
  }

  function pickLicense(org, userId, userIndex, orgProAssigned) {
    if (CMU_LOANS.tempPro.includes(userId)) {
      return LICENSES.TEMP_PRO;
    }
    if (userIndex % PRO_EVERY === 0 && orgProAssigned < org.quotas.pro) {
      return LICENSES.PRO;
    }
    return LICENSES.BASIC;
  }

  function buildUsers(org) {
    const orgIndex = org.seed;
    let orgProAssigned = 0;
    return Array.from({ length: USERS_PER_ORG }, (_, i) => {
      const first = FIRST_NAMES[spread(orgIndex, i, 7, FIRST_NAMES.length)];
      const last = LAST_NAMES[spread(orgIndex, i, 11, LAST_NAMES.length)];

      const userId = `${org.id}-${i}`;
      const license = pickLicense(org, userId, i, orgProAssigned);
      if (license === LICENSES.PRO) {
        orgProAssigned += 1;
      }
      // Large Meeting requires a paid license.
      const largeMeeting = license !== LICENSES.BASIC && CMU_LOANS.largeMeeting.includes(userId);

      const neverUsed = spread(orgIndex, i, 3, 6) === 5;
      const daysAgo = neverUsed ? null : spread(orgIndex, i, 13, LAST_USE_WINDOW_DAYS);
      const isSignedInUser = org.id === SIGNED_IN_USER.orgId && i === 0;

      return {
        id: userId,
        name: isSignedInUser ? SIGNED_IN_USER.name : `${first} ${last}`,
        email: isSignedInUser ? SIGNED_IN_USER.email : `${first}.${last.charAt(0)}@cmu.ac.th`.toLowerCase(),
        lastUse: daysAgo === null ? null : new Date(REFERENCE_DATE.getTime() - daysAgo * DAY_MS),
        license,
        largeMeeting,
        usageLog: buildUsageLog(orgIndex, i, daysAgo, license)
      };
    });
  }

  const usersByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, buildUsers(org)]));

  /* ---------- state & helpers ---------- */

  const view = {
    orgId: ADMIN_ORG_ID,
    query: '',
    modalUserId: null
  };

  const els = {};

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentOrg() {
    return ORGANIZATIONS.find((org) => org.id === view.orgId) || ORGANIZATIONS[0];
  }

  function orgName(org) {
    return org.name[window.App.getLang()] || org.name.en;
  }

  function initials(name) {
    return name.split(' ').map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
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
    renderTable(org);
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

    document.addEventListener(EVENTS.LANG, () => {
      render();
      renderLicenseModal();
    });
    document.addEventListener(EVENTS.ROLE, () => {
      closeModal(els.modal);
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
      modalUsageCount: '[data-lm-usage-count]'
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
