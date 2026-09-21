'use strict';

/**
 * 2. Manage Users — mock organisations/users, quota bars, search, and a
 * per-user license modal (30-day usage log + assign/revoke controls).
 *
 * Pro is managed by the organization's Admin and Global Admin. Shared Pool licenses (Temp. Pro,
 * Large Meeting) can be given to users in any organization, but only Global Admin can assign or
 * revoke them. Org Admins see them read-only. Large Meeting can go to any user: each one uses a
 * "Reserved Pro for Large Meeting" from its own quota, so it needs no Pro or Temp. Pro of its own.
 *
 * Mock organizations/users come from mock-data.js; all data is in-memory (resets on reload).
 */
(function () {
  const { ROLES, LICENSES, EVENTS, t, formatDate, formatDateTime, formatTime, showToast, getRole, openModal, closeModal } = window.App;
  const { ADDON_LARGE_MEETING, RESERVED_PRO, CMU_ORG_ID, TODAY, TIME_SLOTS, mockNow, nextSlotBoundary, SIGNED_IN_USER, ORGANIZATIONS, createUsersByOrg, escapeHtml, initials, orgName } = window.MockData;

  const LICENSE_TYPES = Object.freeze([LICENSES.PRO, LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  // Shared Pool: every license type held by CMU except Pro (CMU's Pro quota is its own),
  // lent to users in any organization.
  const CMU_HELD_TYPES = Object.freeze([LICENSES.TEMP_PRO, ADDON_LARGE_MEETING]);
  // Quotas CMU holds for everyone: the Shared Pool licenses plus the Pro reserved for Large Meeting.
  const POOL_QUOTA_TYPES = Object.freeze([...CMU_HELD_TYPES, RESERVED_PRO]);
  const ACTIONS = Object.freeze({ ASSIGN: 'assign', REVOKE: 'revoke' });
  const LICENSE_MODAL_ID = 'license-modal';
  const EXPIRY_MODAL_ID = 'expiry-modal';
  const CONFIRM_MODAL_ID = 'confirm-license-modal';
  // Pro is returned to the org quota after this many days without use (per organization).
  // 0 = never expires.
  const EXPIRY_NEVER = 0;
  const EXPIRY_PRESET_DAYS = Object.freeze([30, 60, 90, 180, EXPIRY_NEVER]);
  const DEFAULT_EXPIRY_DAYS = 60;
  const ADMIN_ORG_ID = SIGNED_IN_USER.orgId;
  const PERCENT = 100;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;
  const MINUTES_PER_HOUR = 60;
  // "Expires in" turns to a warning at or below this many days (Pro) or minutes (Shared Pool).
  const EXPIRY_WARNING_DAYS = 7;
  const SLOT_EXPIRY_WARNING_MINUTES = 60;

  const CMU_ORG = ORGANIZATIONS.find((org) => org.id === CMU_ORG_ID);
  const usersByOrg = createUsersByOrg();
  const expiryDaysByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, org.expiryDays ?? DEFAULT_EXPIRY_DAYS]));

  /* ---------- state & helpers ---------- */

  const SORT_KEYS = Object.freeze({ NAME: 'name', LAST_USE: 'lastUse', LICENSE: 'license' });
  const SORT_DIRECTIONS = Object.freeze({ ASC: 'ascending', DESC: 'descending' });
  // Pro first, then Temp. Pro, then Basic (a user with Large Meeting ranks ahead of the same license without).
  const LICENSE_RANK = Object.freeze({ [LICENSES.PRO]: 0, [LICENSES.TEMP_PRO]: 1, [LICENSES.BASIC]: 2 });

  const view = {
    orgId: ADMIN_ORG_ID,
    query: '',
    // null = the original order; clicking a header sorts by it, clicking again reverses.
    sort: null,
    modalUserId: null,
    pendingAction: null
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

  function isPoolQuota(type) {
    return POOL_QUOTA_TYPES.includes(type);
  }

  function holdsLicense(user, type) {
    if (type === RESERVED_PRO) {
      // Only a Large Meeting user without Pro / Temp. Pro of their own needs a reserved Pro.
      return user.largeMeeting && user.license === LICENSES.BASIC;
    }
    return type === ADDON_LARGE_MEETING ? user.largeMeeting : user.license === type;
  }

  /** Assigned count: Pro within the organization; CMU-held types across every organization. */
  function usedCount(org, type) {
    const users = isPoolQuota(type) ? [...usersByOrg.values()].flat() : usersByOrg.get(org.id);
    return users.filter((user) => holdsLicense(user, type)).length;
  }

  function quotaTotal(org, type) {
    return isPoolQuota(type) ? CMU_ORG.quotas[type] : org.quotas.pro;
  }

  function remaining(org, type) {
    return quotaTotal(org, type) - usedCount(org, type);
  }

  /**
   * The quota that stops an action because it is used up, or null. Large Meeting needs a reserved Pro
   * only for a user with no Pro / Temp. Pro, so that user also needs one free to assign it, and to
   * revoke their Pro / Temp. Pro while holding it.
   */
  function blockingQuota(org, user, type, action) {
    const needsReserved = user.license === LICENSES.BASIC;
    if (action === ACTIONS.REVOKE) {
      return type !== ADDON_LARGE_MEETING && user.largeMeeting && remaining(org, RESERVED_PRO) <= 0 ? RESERVED_PRO : null;
    }
    if (type === ADDON_LARGE_MEETING && needsReserved && remaining(org, RESERVED_PRO) <= 0) {
      return RESERVED_PRO;
    }
    return remaining(org, type) <= 0 ? type : null;
  }

  function findUser(userId) {
    return usersByOrg.get(view.orgId).find((user) => user.id === userId);
  }

  /**
   * Why the current role may not perform an action (i18n key), or null when allowed.
   * Global Admin can do everything; org Admins only manage Pro (assigning it to a Temp. Pro user
   * releases their Temp. Pro automatically) and cannot touch the CMU-held licenses directly.
   */
  function lockReason(type) {
    return !isGlobalAdmin() && isCmuHeldType(type) ? 'licenseModal.managedByGlobal' : null;
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
        ${POOL_QUOTA_TYPES.map((type) => renderQuotaItem(org, type)).join('')}
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

  /** Ascending comparison of two users on one column; users who never hosted count as the oldest. */
  function compareUsers(a, b, key, collator) {
    if (key === SORT_KEYS.LAST_USE) {
      return (a.lastUse ? a.lastUse.getTime() : -Infinity) - (b.lastUse ? b.lastUse.getTime() : -Infinity);
    }
    if (key === SORT_KEYS.LICENSE) {
      const rank = (user) => LICENSE_RANK[user.license] * 2 + (user.largeMeeting ? 0 : 1);
      return rank(a) - rank(b);
    }
    return collator.compare(a.name, b.name);
  }

  function sortUsers(users) {
    if (!view.sort) {
      return users;
    }
    const { key, direction } = view.sort;
    const collator = new Intl.Collator(window.App.getLang());
    const sign = direction === SORT_DIRECTIONS.ASC ? 1 : -1;
    // Ties fall back to the name so the order is stable and predictable in both directions.
    return [...users].sort((a, b) =>
      sign * compareUsers(a, b, key, collator) || collator.compare(a.name, b.name)
    );
  }

  /** Mirrors the sort state on the headers (aria-sort drives the icon and its colour). */
  function renderSortHeaders() {
    document.querySelectorAll('[data-sort-header]').forEach((header) => {
      if (view.sort && view.sort.key === header.dataset.sortHeader) {
        header.setAttribute('aria-sort', view.sort.direction);
      } else {
        header.removeAttribute('aria-sort');
      }
    });
  }

  function toggleSort(key) {
    const sameColumn = view.sort && view.sort.key === key;
    const direction = sameColumn && view.sort.direction === SORT_DIRECTIONS.ASC ? SORT_DIRECTIONS.DESC : SORT_DIRECTIONS.ASC;
    view.sort = { key, direction };
    renderSortHeaders();
    renderTable(currentOrg());
  }

  function renderTable(org) {
    const query = view.query.trim().toLowerCase();
    const users = sortUsers(usersByOrg.get(org.id).filter((user) =>
      !query || user.name.toLowerCase().includes(query) || user.email.includes(query)
    ));
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
    return t('licenseModal.quotaLeft', { left: Math.max(remaining(org, type), 0), total: quotaTotal(org, type) });
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

  /**
   * Shared Pool licenses (Temp. Pro, Large Meeting) last until the next Booking Center time slot boundary
   * after they were assigned, e.g. assigned at 9:00 AM expires at 11:00 AM.
   * @returns {{text: string, tone: string}}
   */
  function slotExpiryInfo(user, type) {
    const assignedAt = user.assignedAt[type];
    if (!assignedAt) {
      return { text: t('licenseModal.expiresNextSlot'), tone: '' };
    }
    const minutesLeft = Math.ceil((nextSlotBoundary(assignedAt).getTime() - mockNow().getTime()) / MINUTE_MS);
    if (minutesLeft <= 0) {
      return { text: t('licenseModal.expired'), tone: 'is-overdue' };
    }
    const tone = minutesLeft <= SLOT_EXPIRY_WARNING_MINUTES ? 'is-soon' : '';
    const hours = Math.floor(minutesLeft / MINUTES_PER_HOUR);
    const minutes = minutesLeft % MINUTES_PER_HOUR;
    if (hours === 0) {
      return { text: t('licenseModal.expiresInMin', { minutes }), tone };
    }
    return { text: t(minutes === 0 ? 'licenseModal.expiresInHours' : 'licenseModal.expiresInHm', { hours, minutes }), tone };
  }

  /**
   * "Expires in ..." for a held license, or null when the user does not hold it. Pro is counted from the
   * user's last use (or the license's creation date if never used) plus the organization's expiration
   * interval; Shared Pool licenses follow the time slots.
   * @returns {{text: string, tone: string}|null}
   */
  function expiryInfo(org, user, type) {
    if (!holdsLicense(user, type)) {
      return null;
    }
    if (isCmuHeldType(type)) {
      return slotExpiryInfo(user, type);
    }
    const interval = expiryDaysByOrg.get(org.id);
    if (interval === EXPIRY_NEVER) {
      return { text: t('licenseModal.expiresNever'), tone: '' };
    }
    // Counted from the last use, or from when the license was created if the user never used it.
    const countedFrom = user.lastUse || user.licenseCreatedAt;
    const expiresAt = new Date(countedFrom.getTime() + interval * DAY_MS);
    const daysLeft = Math.round((expiresAt.getTime() - TODAY.getTime()) / DAY_MS);
    if (daysLeft < 0) {
      return { text: t('licenseModal.expired'), tone: 'is-overdue' };
    }
    const tone = daysLeft <= EXPIRY_WARNING_DAYS ? 'is-soon' : '';
    if (daysLeft === 0) {
      return { text: t('licenseModal.expiresToday'), tone };
    }
    return { text: t(daysLeft === 1 ? 'licenseModal.expiresOne' : 'licenseModal.expiresIn', { count: daysLeft }), tone };
  }

  /** One row per license type with an Assign/Revoke button, or a read-only lock for CMU licenses. */
  function renderLicenseAction(org, user, type) {
    const isCurrent = holdsLicense(user, type);
    const action = isCurrent ? ACTIONS.REVOKE : ACTIONS.ASSIGN;
    const lock = lockReason(type);
    const blocked = blockingQuota(org, user, type, action);
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
      // The highlighted row and its Revoke button already mark the current license, so only the
      // licenses the user does not hold show how many are left.
      meta = isCurrent ? '' : quotaMeta(org, type);
      if (blocked && blocked !== type) {
        meta = t(isCurrent ? 'licenseModal.needsReservedPro' : 'manage.overQuota', { license: licenseLabel(blocked) });
      }
      if (lock) {
        meta = t(lock);
      }
      control = actionButton(type, action, lock !== null || blocked !== null);
    }

    const expiry = expiryInfo(org, user, type);
    const expiryLine = expiry
      ? `<span class="license-action-expiry ${expiry.tone}">${escapeHtml(expiry.text)}</span>`
      : '';

    return `
      <div class="license-action${isCurrent ? ' is-current' : ''}">
        <div class="license-action-info">
          <span class="badge badge-${type}">${escapeHtml(licenseLabel(type))}</span>
          ${meta ? `<span class="license-action-meta">${escapeHtml(meta)}</span>` : ''}
          ${expiryLine}
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
    // Shared Pool rows are Global Admin's to manage; an org Admin only sees the ones the user holds (read-only).
    const visibleTypes = LICENSE_TYPES.filter((type) => isGlobalAdmin() || !isCmuHeldType(type) || holdsLicense(user, type));
    els.modalActions.innerHTML = visibleTypes.map((type) => renderLicenseAction(org, user, type)).join('');
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
    const blocked = blockingQuota(org, user, type, ACTIONS.ASSIGN);
    if (blocked) {
      showToast(t('manage.overQuota', { license: licenseLabel(blocked) }), 'error');
      return;
    }
    if (type === ADDON_LARGE_MEETING) {
      user.largeMeeting = true;
    } else {
      // Pro and Temp. Pro are exclusive: assigning one replaces (and releases) the other.
      user.license = type;
      user.licenseCreatedAt = mockNow();
      delete user.assignedAt[LICENSES.TEMP_PRO];
    }
    if (isCmuHeldType(type)) {
      user.assignedAt[type] = mockNow();
    }
    showToast(t('manage.assigned', { license: licenseLabel(type), name: user.name }), 'success');
  }

  function revokeLicense(user, type) {
    if (blockingQuota(currentOrg(), user, type, ACTIONS.REVOKE)) {
      showToast(t('licenseModal.needsReservedPro'), 'error');
      return;
    }
    if (type === ADDON_LARGE_MEETING) {
      user.largeMeeting = false;
      delete user.assignedAt[ADDON_LARGE_MEETING];
    } else {
      user.license = LICENSES.BASIC;
      delete user.assignedAt[LICENSES.TEMP_PRO];
    }
    showToast(t('manage.revoked', { license: licenseLabel(type), name: user.name }), 'success');
  }

  /* ---------- assign/revoke confirmation ---------- */

  /**
   * For a Shared Pool assignment: the time slot it is given in and when it expires (the end of that
   * slot, or the start of the next one outside booking hours).
   */
  function slotNote() {
    const now = mockNow();
    const expiresAt = nextSlotBoundary(now);
    const minutes = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
    const slot = TIME_SLOTS.find((item) =>
      minutes >= item.startHour * MINUTES_PER_HOUR + item.startMinute && minutes < item.endHour * MINUTES_PER_HOUR + item.endMinute
    );
    if (!slot) {
      return t('confirmLicense.slotNext', { time: formatTime(expiresAt) });
    }
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.startHour, slot.startMinute);
    return t('confirmLicense.slotCurrent', { start: formatTime(start), end: formatTime(expiresAt) });
  }

  function renderConfirmModal() {
    const pending = view.pendingAction;
    const user = pending && findUser(pending.userId);
    if (!user) {
      return;
    }
    const isRevoke = pending.action === ACTIONS.REVOKE;
    const license = licenseLabel(pending.type);
    // Pro replaces a Temp. Pro the user holds, which frees it for someone else.
    const releasesTempPro = !isRevoke && pending.type === LICENSES.PRO && user.license === LICENSES.TEMP_PRO;
    const message = [
      t(isRevoke ? 'confirmLicense.revokeBody' : 'confirmLicense.assignBody', { license, name: user.name }),
      releasesTempPro ? t('confirmLicense.releasesTempPro', { license: licenseLabel(LICENSES.TEMP_PRO) }) : ''
    ].filter(Boolean).join(' ');
    // The time slot goes on its own line (the body keeps line breaks, see .confirm-body).
    const body = [message, !isRevoke && isCmuHeldType(pending.type) ? slotNote() : ''].filter(Boolean).join('\n');

    els.confirmIcon.classList.toggle('modal-icon-danger', isRevoke);
    els.confirmTitle.textContent = t(isRevoke ? 'confirmLicense.revokeTitle' : 'confirmLicense.assignTitle', { license });
    els.confirmBody.textContent = body;
    els.confirmButton.className = `btn ${isRevoke ? 'btn-danger' : 'btn-primary'}`;
    els.confirmButton.textContent = t(isRevoke ? 'licenseModal.revoke' : 'licenseModal.assign');
  }

  function onModalAction(button) {
    const user = view.modalUserId && findUser(view.modalUserId);
    if (!user) {
      console.error('[manage-users] License action without a selected user');
      return;
    }
    const { licenseAction, type } = button.dataset;
    if (!Object.values(ACTIONS).includes(licenseAction)) {
      console.error('[manage-users] Unknown license action', licenseAction);
      return;
    }
    const lock = lockReason(type);
    if (lock) {
      showToast(t(lock), 'error');
      return;
    }
    view.pendingAction = { userId: user.id, type, action: licenseAction };
    renderConfirmModal();
    openModal(CONFIRM_MODAL_ID);
    els.confirmButton.focus();
  }

  function confirmModalAction() {
    const pending = view.pendingAction;
    const user = pending && findUser(pending.userId);
    closeModal(els.confirmModal);
    if (!user) {
      console.error('[manage-users] Confirmed a license action without a valid user', pending);
      return;
    }
    // The role may have changed while the confirmation was open, so check the lock again.
    const lock = lockReason(pending.type);
    if (lock) {
      showToast(t(lock), 'error');
      return;
    }
    if (pending.action === ACTIONS.ASSIGN) {
      assignLicense(user, pending.type);
    } else {
      revokeLicense(user, pending.type);
    }
    render();
    renderLicenseModal(pending.type);
  }

  function bindEvents() {
    els.table.addEventListener('click', (event) => {
      const sortButton = event.target.closest('[data-sort]');
      if (sortButton) {
        toggleSort(sortButton.dataset.sort);
      }
    });

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

    els.confirmButton.addEventListener('click', confirmModalAction);
    els.confirmModal.addEventListener('close', () => {
      view.pendingAction = null;
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
      if (els.confirmModal.open) {
        renderConfirmModal();
      }
      if (els.expiryModal.open) {
        // Keep the unsaved selection while relabelling.
        renderExpiryOptions(currentOrg(), checkedExpiryDays());
      }
    });
    document.addEventListener(EVENTS.ROLE, () => {
      closeModal(els.confirmModal);
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
      table: '.users-table',
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
      confirmModal: `#${CONFIRM_MODAL_ID}`,
      confirmIcon: '[data-cl-icon]',
      confirmTitle: '[data-cl-title]',
      confirmBody: '[data-cl-body]',
      confirmButton: '[data-cl-confirm]',
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
