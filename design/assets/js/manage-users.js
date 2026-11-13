'use strict';

/**
 * 2. Manage Users — mirrors production app/pages/manage-users.vue with LicenseModal.vue,
 * QuotaBar.vue, SortIndicator.vue and TablePagination (App.renderPagination).
 *
 * - Org Admin: their organization's Pro quota and Pro expiration interval editor; manages Pro only
 *   (shared-pool rows are locked).
 * - Global Admin: any organization (select), plus the Shared Pool quota bars (each opens
 *   PoolHolders), and every license.
 * - User: the no-permission card.
 *
 * Search, sort and paging run here on the in-memory mock data (production delegates them to the
 * server with the same rules: server/utils/userSort.ts). All data resets on reload.
 * Demo: add `?usage=error` to the URL to show the usage log's "could not be loaded" state.
 */
(function () {
  const {
    ROLES, LICENSES, HELD_LICENSE_ORDER, SHARED_POOL_LICENSES, EVENTS, DEFAULT_PAGE_SIZE,
    t, toast, formatDate, formatDateTime, formatTime, formatExpiry, getRole,
    openModal, closeModal, withLoading, renderPagination
  } = window.App;
  const {
    SHARED_POOL_QUOTAS, TIME_SLOTS, SIGNED_IN_USER, ORGANIZATIONS, mockNow, slotAt,
    createUsersByOrg, proExpiryDays, licenseExpiries, escapeHtml, initials, orgName, displayName
  } = window.MockData;

  const LICENSE_MODAL_ID = 'license-modal';
  const CONFIRM_MODAL_ID = 'confirm-license-modal';
  const EXPIRY_MODAL_ID = 'expiry-modal';
  const ACTIONS = Object.freeze({ ASSIGN: 'assign', REVOKE: 'revoke' });
  // Production EXPIRY_PRESETS; 0 = never.
  const EXPIRY_NEVER = 0;
  const EXPIRY_PRESETS = Object.freeze([30, 60, 90, 180, EXPIRY_NEVER]);
  const PERCENT = 100;
  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  // Emergency Pro lasts this long from assignment (production sharedExpiry.emergPro).
  const EMERGENCY_PRO_DAYS = window.MockData.EMERGENCY_PRO_DURATION_DAYS;

  /* ---------- sorting (production toggleSort + server/utils/userSort.ts) ---------- */

  const SORT_KEYS = Object.freeze({ NAME: 'name', ACCOUNT_TYPE: 'accountType', LAST_USE: 'lastUse', LICENSE: 'license' });
  const SORT_ORDERS = Object.freeze({ ASC: 'asc', DESC: 'desc' });
  const MAX_SORTS = 3;
  const DEFAULT_SORTS = Object.freeze([
    Object.freeze({ key: SORT_KEYS.LICENSE, order: SORT_ORDERS.ASC }),
    Object.freeze({ key: SORT_KEYS.LAST_USE, order: SORT_ORDERS.ASC })
  ]);
  // Pro, then Temporary Pro, then Emergency Pro, then no license (production LICENSE_RANK).
  const LICENSE_RANK = Object.freeze({
    [LICENSES.PRO]: 0,
    [LICENSES.TEMP_PRO]: 1,
    [LICENSES.EMERGENCY_PRO]: 2,
    [LICENSES.BASIC]: 3
  });
  const SORT_COLUMN_LABELS = Object.freeze({
    [SORT_KEYS.NAME]: 'table.name',
    [SORT_KEYS.ACCOUNT_TYPE]: 'table.accountType',
    [SORT_KEYS.LAST_USE]: 'table.lastUse',
    [SORT_KEYS.LICENSE]: 'table.license'
  });

  // Production useProvisionAccount: a CMU address, or a bare account name the domain is added to.
  const CMU_EMAIL_DOMAIN = '@cmu.ac.th';
  const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
  const PROVISIONED_ACCOUNT_TYPE = window.MockData.ACCOUNT_TYPES.EMPLOYEE;
  const PROVISIONED_ACCOUNT_ID_BASE = 90000;

  const ADMIN_ORG_ID = SIGNED_IN_USER.orgId;
  const usersByOrg = createUsersByOrg();
  const expiryDaysByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, proExpiryDays(org.id)]));
  const usageUnavailable = new URLSearchParams(window.location.search).get('usage') === 'error';
  let provisionedCount = 0;

  const view = {
    // A Global Admin can switch organizations; an org admin is pinned to theirs.
    orgId: ADMIN_ORG_ID,
    appliedSearch: '',
    sorts: DEFAULT_SORTS.map((sort) => ({ ...sort })),
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    modalUserId: null,
    pending: null,
    busy: false
  };

  const els = {};

  /* ---------- helpers ---------- */

  function isGlobal() {
    return getRole() === ROLES.GLOBAL;
  }

  function hasAccess() {
    return getRole() === ROLES.ADMIN || getRole() === ROLES.GLOBAL;
  }

  function currentOrg() {
    return ORGANIZATIONS.find((org) => org.id === view.orgId) || ORGANIZATIONS[0];
  }

  function licenseLabel(slug) {
    return t(`license.${slug}`);
  }

  function icon(name, small) {
    return `<svg class="icon${small ? ' icon-sm' : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  /** Known account types are translated; anything else is shown as-is. */
  function accountTypeOf(user) {
    if (!user.accountType) {
      return '—';
    }
    const key = `accountType.${user.accountType}`;
    return window.I18N.has(key) ? t(key) : user.accountType;
  }

  function allUsers() {
    return [...usersByOrg.values()].flat();
  }

  function findUser(userId) {
    return allUsers().find((user) => user.id === userId) || null;
  }

  function holds(user, slug) {
    switch (slug) {
      case LICENSES.LARGE_MEETING: return user.largeMeeting;
      case LICENSES.RESERVED_PRO: return user.largeMeeting && user.license === LICENSES.BASIC;
      default: return user.license === slug;
    }
  }

  /** Pro is capped per organization; the rest come from the university-wide shared pool. */
  function quotaFor(slug, org = currentOrg()) {
    if (slug === LICENSES.PRO) {
      return { used: usersByOrg.get(org.id).filter((user) => holds(user, slug)).length, total: org.quotas.pro };
    }
    return { used: allUsers().filter((user) => holds(user, slug)).length, total: SHARED_POOL_QUOTAS[slug] ?? 0 };
  }

  function expiriesOf(user) {
    return licenseExpiries(user, expiryDaysByOrg.get(user.orgId));
  }

  /* ---------- quotas (production QuotaBar.vue) ---------- */

  function renderQuotaBar(slug, actionLabel) {
    const { used, total } = quotaFor(slug);
    const label = licenseLabel(slug);
    const percent = total > 0 ? Math.min(PERCENT, Math.round((used / total) * PERCENT)) : 0;
    const isFull = total > 0 && used >= total;
    const left = Math.max(total - used, 0);
    // With an action label the whole row is a button that opens the holders list.
    const actionAttrs = actionLabel
      ? ` role="button" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(actionLabel)}" title="${escapeHtml(actionLabel)}" data-pool-license="${slug}"`
      : '';
    return `
      <div class="quota-item${actionLabel ? ' is-clickable' : ''}"${actionAttrs}>
        <div class="quota-item-head">
          <span class="badge badge-${slug}">${escapeHtml(label)}</span>
          <span class="quota-left">${escapeHtml(t('manage.left', { count: left }))}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}">
          <div class="progress-bar${isFull ? ' is-full' : ''}" data-license="${slug}" style="width: ${percent}%"></div>
        </div>
        <p class="quota-numbers">${escapeHtml(t('manage.used', { used, total, percent }))}</p>
      </div>`;
  }

  function renderQuotas() {
    els.quotaTitle.textContent = isGlobal() ? t('manage.licenseQuotas') : t('manage.quotas');
    const pro = renderQuotaBar(LICENSES.PRO);
    if (!isGlobal()) {
      els.quotaList.innerHTML = pro;
      return;
    }
    const pool = SHARED_POOL_LICENSES.map((slug) =>
      renderQuotaBar(slug, t('poolHolders.view', { license: licenseLabel(slug) }))
    ).join('');
    els.quotaList.innerHTML = `
      ${pro}
      <hr class="quota-divider">
      <p class="quota-group-label">${escapeHtml(t('manage.quotaGroupCmu'))}</p>
      ${pool}`;
  }

  function openPoolHolders(slug) {
    if (!window.PoolHolders) {
      console.error('[manage-users] pool-holders.js is not loaded');
      toast.error(t('common.error'));
      return;
    }
    window.PoolHolders.open({ license: slug, role: getRole(), usersByOrg, onChanged: render });
  }

  /* ---------- Pro expiration interval ---------- */

  function intervalLabel(days) {
    return days === EXPIRY_NEVER ? t('expiry.never') : t('expiry.days', { count: days });
  }

  function renderExpiry() {
    const days = expiryDaysByOrg.get(currentOrg().id);
    els.expiryValue.textContent = intervalLabel(days);
    els.expiryDesc.textContent = days === EXPIRY_NEVER ? t('expiry.descNever') : t('expiry.desc', { count: days });
    // Org Admins edit their own organization's interval; Global Admins edit the selected one.
    els.expiryEdit.hidden = !hasAccess();
  }

  function renderExpiryOptions(selectedDays) {
    els.expiryOptions.innerHTML = EXPIRY_PRESETS.map((days) => `
      <label>
        <input type="radio" name="expiry" value="${days}"${days === selectedDays ? ' checked' : ''}>
        <span>${escapeHtml(intervalLabel(days))}</span>
      </label>`).join('');
  }

  function checkedExpiryDays() {
    const checked = els.expiryOptions.querySelector('input[name="expiry"]:checked');
    return checked ? Number(checked.value) : null;
  }

  function openExpiry() {
    renderExpiryOptions(expiryDaysByOrg.get(currentOrg().id));
    openModal(EXPIRY_MODAL_ID);
  }

  async function saveExpiry() {
    const org = currentOrg();
    const days = checkedExpiryDays();
    els.expirySave.disabled = true;
    try {
      await withLoading(() => {
        if (!EXPIRY_PRESETS.includes(days)) {
          throw new Error(`Invalid Pro expiration interval: ${days}`);
        }
        expiryDaysByOrg.set(org.id, days);
        toast.success(t('expiry.saved', { org: orgName(org), interval: intervalLabel(days) }));
      });
    } catch (error) {
      console.error('[manage-users] Saving the Pro expiration interval failed', error);
      toast.error(t('common.error'));
    } finally {
      els.expirySave.disabled = false;
      closeModal(els.expiryModal);
      render();
    }
  }

  /* ---------- organization heading ---------- */

  function renderOrgHeading() {
    const org = currentOrg();
    const name = orgName(org);
    els.orgName.textContent = name;
    els.orgName.classList.toggle('visually-hidden', isGlobal());
    els.orgSelect.hidden = !isGlobal();
    els.orgSelect.title = name;
    els.orgSelect.innerHTML = ORGANIZATIONS.map((item) =>
      `<option value="${item.id}"${item.id === org.id ? ' selected' : ''}>${escapeHtml(orgName(item))}</option>`
    ).join('');
  }

  /* ---------- users table ---------- */

  function compareOne(a, b, sort) {
    const direction = sort.order === SORT_ORDERS.ASC ? 1 : -1;
    switch (sort.key) {
      case SORT_KEYS.NAME:
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) * direction;
      case SORT_KEYS.LICENSE:
        return (LICENSE_RANK[a.license] - LICENSE_RANK[b.license]) * direction;
      case SORT_KEYS.LAST_USE:
        // Accounts that have never hosted sort last in either direction.
        if (!a.lastUse && !b.lastUse) return 0;
        if (!a.lastUse) return 1;
        if (!b.lastUse) return -1;
        return (a.lastUse.getTime() - b.lastUse.getTime()) * direction;
      case SORT_KEYS.ACCOUNT_TYPE:
        if (!a.accountType && !b.accountType) return 0;
        if (!a.accountType) return 1;
        if (!b.accountType) return -1;
        return a.accountType.localeCompare(b.accountType, 'en', { sensitivity: 'base' }) * direction;
      default:
        console.error('[manage-users] Unknown sort key', sort.key);
        return 0;
    }
  }

  /** Each sort in priority order (the server's default is by name), then the account id. */
  function sortUsers(users) {
    const sorts = view.sorts.length ? view.sorts : [{ key: SORT_KEYS.NAME, order: SORT_ORDERS.ASC }];
    return [...users].sort((a, b) => {
      for (const sort of sorts) {
        const result = compareOne(a, b, sort);
        if (result !== 0) {
          return result;
        }
      }
      return Number(a.accountId) - Number(b.accountId);
    });
  }

  function matchesSearch(user, term) {
    if (!term) {
      return true;
    }
    const value = term.toLowerCase();
    return user.name.toLowerCase().includes(value)
      || (user.nameTh || '').toLowerCase().includes(value)
      || user.email.toLowerCase().includes(value);
  }

  function sortOf(key) {
    const index = view.sorts.findIndex((sort) => sort.key === key);
    return index === -1 ? null : { order: view.sorts[index].order, priority: index + 1 };
  }

  /**
   * Each click steps a column through ascending → descending → off. A column that is not sorted
   * yet joins as the lowest priority (at most three).
   */
  function toggleSort(key) {
    const current = view.sorts.find((sort) => sort.key === key);
    if (!current) {
      view.sorts = [...view.sorts, { key, order: SORT_ORDERS.ASC }].slice(-MAX_SORTS);
    } else if (current.order === SORT_ORDERS.ASC) {
      view.sorts = view.sorts.map((sort) => (sort.key === key ? { key, order: SORT_ORDERS.DESC } : sort));
    } else {
      view.sorts = view.sorts.filter((sort) => sort.key !== key);
    }
    view.page = 1;
    renderTable();
  }

  function sortLabel(key) {
    const column = t(SORT_COLUMN_LABELS[key]);
    const sort = sortOf(key);
    if (!sort) {
      return t('table.sortNone', { column });
    }
    const direction = t(sort.order === SORT_ORDERS.ASC ? 'table.sortAsc' : 'table.sortDesc');
    return view.sorts.length > 1
      ? t('table.sortStatePriority', { column, direction, priority: sort.priority })
      : t('table.sortState', { column, direction });
  }

  /** Production SortIndicator.vue. */
  function sortIndicatorHtml(sort) {
    if (!sort) {
      return icon('arrow-up-down', true);
    }
    const arrow = `<svg class="icon icon-sm sort-indicator-arrow${sort.order === SORT_ORDERS.ASC ? ' is-ascending' : ''}" aria-hidden="true"><use href="#i-chevron-down"></use></svg>`;
    const priority = view.sorts.length > 1 ? `<span class="sort-priority">${sort.priority}</span>` : '';
    return arrow + priority;
  }

  function renderSortHeaders() {
    els.sortHeaders.forEach((header) => {
      const key = header.dataset.sortHeader;
      const sort = sortOf(key);
      header.classList.toggle('is-sorted', Boolean(sort));
      // aria-sort belongs on the primary sort column only.
      if (sort && sort.priority === 1) {
        header.setAttribute('aria-sort', sort.order === SORT_ORDERS.ASC ? 'ascending' : 'descending');
      } else {
        header.removeAttribute('aria-sort');
      }
      header.querySelector('[data-sort]').setAttribute('aria-label', sortLabel(key));
      header.querySelector('[data-sort-indicator]').innerHTML = sortIndicatorHtml(sort);
    });
  }

  function licenseBadges(user) {
    const main = `<span class="badge badge-${user.license}">${escapeHtml(licenseLabel(user.license))}</span>`;
    const largeMeeting = user.largeMeeting
      ? `<span class="badge badge-largeMeeting">${escapeHtml(licenseLabel(LICENSES.LARGE_MEETING))}</span>`
      : '';
    return main + largeMeeting;
  }

  function renderRow(user) {
    const name = displayName(user);
    const lastUse = user.lastUse
      ? `<span class="last-use">${escapeHtml(formatDate(user.lastUse))}</span>`
      : `<span class="last-use is-never">${escapeHtml(t('manage.never'))}</span>`;
    const ariaLabel = t('licenseModal.open', { name, license: licenseLabel(user.license) });
    return `
      <tr class="is-clickable" tabindex="0" aria-haspopup="dialog" aria-label="${escapeHtml(ariaLabel)}" data-user-id="${escapeHtml(user.id)}">
        <td>
          <div class="user-cell">
            <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
            <div>
              <span class="user-name">${escapeHtml(name)}</span>
              <span class="user-email">${escapeHtml(user.email)}</span>
            </div>
          </div>
        </td>
        <td class="col-account-type">
          <span class="account-type">${escapeHtml(accountTypeOf(user))}</span>
        </td>
        <td class="col-last-use" data-label="${escapeHtml(t('table.lastUse'))}">${lastUse}</td>
        <td>
          <div class="license-cell">${licenseBadges(user)}</div>
        </td>
      </tr>`;
  }

  /** The CMU address a search term names, or null (production candidateEmail). */
  function candidateEmail(term) {
    const value = term.trim().toLowerCase();
    const local = value.endsWith(CMU_EMAIL_DOMAIN) ? value.slice(0, -CMU_EMAIL_DOMAIN.length) : value;
    if (local.includes('@') || !LOCAL_PART_PATTERN.test(local)) {
      return null;
    }
    return `${local}${CMU_EMAIL_DOMAIN}`;
  }

  function renderTable() {
    const matches = sortUsers(usersByOrg.get(currentOrg().id).filter((user) => matchesSearch(user, view.appliedSearch)));
    const totalPages = Math.max(1, Math.ceil(matches.length / view.pageSize));
    view.page = Math.min(Math.max(1, view.page), totalPages);
    const start = (view.page - 1) * view.pageSize;

    renderSortHeaders();
    els.rows.innerHTML = matches.slice(start, start + view.pageSize).map(renderRow).join('');

    const isEmpty = matches.length === 0;
    els.empty.hidden = !isEmpty;
    const email = isEmpty ? candidateEmail(view.appliedSearch) : null;
    els.provision.hidden = !email;
    els.provision.dataset.email = email || '';
    els.provision.textContent = email ? t('provision.add', { email }) : '';

    renderPagination(els.pagination, {
      page: view.page,
      pageSize: view.pageSize,
      total: matches.length,
      onChange: ({ page, pageSize }) => {
        view.page = page;
        view.pageSize = pageSize;
        renderTable();
      }
    });
  }

  /** Runs on Enter or the search button only, never per keystroke. */
  function applySearch() {
    view.appliedSearch = els.search.value.trim();
    view.page = 1;
    renderTable();
  }

  /** Display name for a provisioned account: "somchai.k" -> "Somchai K". */
  function nameFromEmail(email) {
    return email.split('@')[0].split(/[._-]+/).filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  /** Mock of production's "bring them in from the CMU directory" (POST /api/accounts/provision). */
  async function provisionSearchedUser() {
    const email = els.provision.dataset.email;
    if (!email) {
      return;
    }
    els.provision.disabled = true;
    try {
      await withLoading(() => {
        if (!allUsers().some((user) => user.email === email)) {
          const org = currentOrg();
          provisionedCount += 1;
          const name = nameFromEmail(email);
          usersByOrg.get(org.id).push({
            id: `${org.id}-new-${provisionedCount}`,
            orgId: org.id,
            accountId: String(PROVISIONED_ACCOUNT_ID_BASE + provisionedCount),
            name,
            nameTh: name,
            email,
            accountType: PROVISIONED_ACCOUNT_TYPE,
            lastUse: null,
            licenseCreatedAt: mockNow(),
            license: LICENSES.BASIC,
            largeMeeting: false,
            assignedAt: {},
            expiresAt: {},
            usageLog: []
          });
        }
        toast.success(t('provision.success', { email }));
      });
    } catch (error) {
      console.error('[manage-users] Provisioning failed for', email, error);
      toast.error(t('common.error'));
    } finally {
      els.provision.disabled = false;
      render();
    }
  }

  /* ---------- page ---------- */

  function render() {
    const access = hasAccess();
    els.noPermission.hidden = access;
    els.manage.hidden = !access;
    if (!access) {
      return;
    }
    if (!isGlobal()) {
      view.orgId = ADMIN_ORG_ID;
    }
    document.title = `${t('menu.manageUsers')} · CMU ZOOM`;
    renderOrgHeading();
    renderQuotas();
    renderExpiry();
    renderTable();
  }

  /* ---------- license modal (production LicenseModal.vue) ---------- */

  /** One row per assignable license, as production's `rows` computed. */
  function licenseRows(user) {
    const sharedPoolLocked = !isGlobal();
    const expiries = expiriesOf(user);
    return HELD_LICENSE_ORDER.map((slug) => {
      const isCurrent = holds(user, slug);
      const action = isCurrent ? ACTIONS.REVOKE : ACTIONS.ASSIGN;
      const { used, total } = quotaFor(slug);
      const isShared = SHARED_POOL_LICENSES.includes(slug);
      // An org admin may manage Pro only; the shared pool is Global Admin's.
      const lockReason = isShared && sharedPoolLocked ? t('licenseModal.managedByGlobal') : null;
      // A shared-pool type with no configured quota cannot be assigned.
      const unavailable = action === ACTIONS.ASSIGN && slug !== LICENSES.PRO && SHARED_POOL_QUOTAS[slug] === undefined;
      // Emergency Pro is only added, never swapped in over Pro or Temporary Pro.
      const emergencyBlocked = slug === LICENSES.EMERGENCY_PRO && action === ACTIONS.ASSIGN
        && (user.license === LICENSES.PRO || user.license === LICENSES.TEMP_PRO);

      let meta = '';
      if (lockReason) {
        meta = t(isCurrent ? 'licenseModal.assigned' : 'licenseModal.notAssigned');
      } else if (unavailable) {
        meta = t('licenseModal.notConfigured');
      } else if (emergencyBlocked) {
        meta = t('licenseModal.emergBlocked');
      } else if (!isCurrent) {
        meta = t('licenseModal.quotaLeft', { left: Math.max(0, total - used), total });
      }

      const quotaExhausted = action === ACTIONS.ASSIGN && total > 0 && used >= total;
      const disabled = Boolean(lockReason) || unavailable || emergencyBlocked || quotaExhausted;
      const expiry = isCurrent ? formatExpiry(expiries[slug]) : null;
      return { slug, label: licenseLabel(slug), isCurrent, action, meta, expiry, lockReason, disabled };
    });
  }

  function renderLicenseRow(row) {
    const expiry = row.expiry
      ? `<span class="license-action-expiry ${row.expiry.className}"${row.expiry.title ? ` title="${escapeHtml(row.expiry.title)}"` : ''}>${escapeHtml(row.expiry.text)}</span>`
      : '';
    let control;
    if (row.lockReason) {
      control = `
        <span class="license-lock">
          ${icon('lock', true)}
          ${escapeHtml(row.lockReason)}
        </span>`;
    } else {
      const isRevoke = row.action === ACTIONS.REVOKE;
      const ariaLabel = t(isRevoke ? 'licenseModal.revokeLabel' : 'licenseModal.assignLabel', { license: row.label });
      control = `
        <button type="button" class="btn btn-sm ${isRevoke ? 'btn-outline-danger' : 'btn-primary'}" data-license-action="${row.action}" data-type="${row.slug}"
          aria-label="${escapeHtml(ariaLabel)}"${row.disabled ? ' disabled' : ''}>${escapeHtml(t(isRevoke ? 'licenseModal.revoke' : 'licenseModal.assign'))}</button>`;
    }
    return `
      <div class="license-action${row.isCurrent ? ' is-current' : ''}">
        <div class="license-action-info">
          <span class="badge badge-${row.slug}">${escapeHtml(row.label)}</span>
          ${row.meta ? `<span class="license-action-meta">${escapeHtml(row.meta)}</span>` : ''}
          ${expiry}
        </div>
        ${control}
      </div>`;
  }

  function renderUsageLog(user) {
    const entries = usageUnavailable ? [] : user.usageLog;
    els.modalUsageCount.textContent = entries.length === 1
      ? t('licenseModal.meetingCountOne')
      : t('licenseModal.meetingCount', { count: entries.length });
    if (entries.length === 0) {
      const message = usageUnavailable ? t('usage.unavailable') : t('licenseModal.noUsage');
      els.modalUsage.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
      return;
    }
    els.modalUsage.innerHTML = `
      <table class="usage-table">
        <thead>
          <tr>
            <th scope="col">${escapeHtml(t('usage.dateTime'))}</th>
            <th scope="col">${escapeHtml(t('usage.duration'))}</th>
            <th scope="col">${escapeHtml(t('usage.ended'))}</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => {
            const minutes = typeof entry.minutes === 'number' ? entry.minutes : null;
            const end = minutes === null ? null : new Date(entry.start.getTime() + minutes * MINUTE_MS);
            return `
            <tr>
              <td>${escapeHtml(formatDateTime(entry.start))}</td>
              <td class="num">${minutes === null ? '—' : escapeHtml(t('usage.minutes', { count: minutes }))}</td>
              <td class="num">${end ? escapeHtml(formatTime(end)) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderLicenseModal(focusType) {
    const user = view.modalUserId && findUser(view.modalUserId);
    if (!user) {
      return;
    }
    els.modalInitials.textContent = initials(user.name);
    els.modalName.textContent = displayName(user);
    els.modalEmail.textContent = user.email;
    els.modalCurrent.innerHTML = licenseBadges(user);
    els.modalActions.innerHTML = licenseRows(user).map(renderLicenseRow).join('');
    renderUsageLog(user);
    if (focusType) {
      const target = els.modalActions.querySelector(`[data-type="${focusType}"]:not(:disabled)`);
      if (target) {
        target.focus();
      }
    }
  }

  function openLicenseModal(userId) {
    if (!findUser(userId)) {
      console.error('[manage-users] User not found for license modal', userId);
      toast.error(t('common.error'));
      return;
    }
    view.modalUserId = userId;
    renderLicenseModal();
    openModal(LICENSE_MODAL_ID);
  }

  /* ---------- confirmation ---------- */

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function slotTimeLabel(slot) {
    return {
      start: `${pad(slot.startHour)}:${pad(slot.startMinute)}`,
      end: `${pad(slot.endHour)}:${pad(slot.endMinute)}`
    };
  }

  /** The slot a Temporary Pro / Large Meeting being assigned will end with (production describeTempProWindow). */
  function describeSlotWindow(now) {
    const slot = slotAt(now);
    if (slot) {
      return t('confirmLicense.slotCurrent', slotTimeLabel(slot));
    }
    // Off-hours it lasts until the first slot of the next morning starts.
    return t('confirmLicense.slotNext', { time: slotTimeLabel(TIME_SLOTS[0]).start });
  }

  function renderConfirm() {
    const pending = view.pending;
    const user = pending && findUser(pending.userId);
    if (!user) {
      return;
    }
    const isRevoke = pending.action === ACTIONS.REVOKE;
    const name = displayName(user);
    const paragraphs = [
      t(isRevoke ? 'confirmLicense.revokeBody' : 'confirmLicense.assignBody', { name, license: pending.label })
    ];
    const slotBooked = pending.slug === LICENSES.TEMP_PRO || pending.slug === LICENSES.LARGE_MEETING;
    if (slotBooked && !isRevoke) {
      paragraphs.push(pending.slotNote);
    }
    // Main licenses are mutually exclusive: assigning one releases the one held.
    if (!isRevoke && pending.slug !== LICENSES.LARGE_MEETING && user.license !== LICENSES.BASIC && user.license !== pending.slug) {
      paragraphs.push(t('confirmLicense.releasesTempPro', { license: licenseLabel(user.license) }));
    }

    els.confirmIcon.classList.toggle('modal-icon-danger', isRevoke);
    els.confirmIcon.innerHTML = icon(isRevoke ? 'undo' : 'send');
    els.confirmTitle.textContent = t(isRevoke ? 'confirmLicense.revokeTitle' : 'confirmLicense.assignTitle', { license: pending.label });
    els.confirmBody.innerHTML = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('');
    els.confirmButton.className = `btn ${isRevoke ? 'btn-danger' : 'btn-primary'}`;
    els.confirmButton.textContent = t(isRevoke ? 'licenseModal.revoke' : 'licenseModal.assign');
    els.confirmButton.disabled = view.busy;
  }

  function ask(slug, action) {
    const user = view.modalUserId && findUser(view.modalUserId);
    if (!user || !Object.values(ACTIONS).includes(action)) {
      console.error('[manage-users] Invalid license action', slug, action);
      return;
    }
    view.pending = {
      userId: user.id,
      slug,
      action,
      label: licenseLabel(slug),
      // Worked out when the confirmation opens, as production does.
      slotNote: action === ACTIONS.ASSIGN ? describeSlotWindow(mockNow()) : ''
    };
    renderConfirm();
    openModal(CONFIRM_MODAL_ID);
    els.confirmButton.focus();
  }

  /** An error whose message is shown to the person, like the server's `data.message`. */
  function refusal(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
  }

  /** Applies a confirmed change to the mock data, refusing what production's server would. */
  function applyChange(user, pending) {
    const { slug, action } = pending;
    if (SHARED_POOL_LICENSES.includes(slug) && !isGlobal()) {
      throw refusal(t('licenseModal.managedByGlobal'));
    }
    if (action === ACTIONS.REVOKE) {
      if (slug === LICENSES.LARGE_MEETING) {
        user.largeMeeting = false;
        delete user.assignedAt[LICENSES.LARGE_MEETING];
      } else {
        delete user.assignedAt[user.license];
        delete user.expiresAt[user.license];
        user.license = LICENSES.BASIC;
      }
      return;
    }

    const { used, total } = quotaFor(slug);
    if (used >= total) {
      throw refusal(t('manage.overQuota', { license: licenseLabel(slug) }));
    }
    const now = mockNow();
    if (slug === LICENSES.LARGE_MEETING) {
      // A Large Meeting holder with no main license takes a Reserved Pro.
      const reserved = quotaFor(LICENSES.RESERVED_PRO);
      if (user.license === LICENSES.BASIC && reserved.used >= reserved.total) {
        throw refusal(t('manage.overQuota', { license: licenseLabel(LICENSES.RESERVED_PRO) }));
      }
      user.largeMeeting = true;
      user.assignedAt[LICENSES.LARGE_MEETING] = now;
      return;
    }
    if (slug === LICENSES.EMERGENCY_PRO && (user.license === LICENSES.PRO || user.license === LICENSES.TEMP_PRO)) {
      throw refusal(t('licenseModal.emergBlocked'));
    }
    // Pro, Temporary Pro and Emergency Pro are exclusive: the one held is released.
    delete user.assignedAt[user.license];
    delete user.expiresAt[user.license];
    user.license = slug;
    if (slug === LICENSES.PRO) {
      user.licenseCreatedAt = now;
    } else if (slug === LICENSES.TEMP_PRO) {
      user.assignedAt[LICENSES.TEMP_PRO] = now;
    } else if (slug === LICENSES.EMERGENCY_PRO) {
      user.assignedAt[LICENSES.EMERGENCY_PRO] = now;
      user.expiresAt[LICENSES.EMERGENCY_PRO] = new Date(now.getTime() + EMERGENCY_PRO_DAYS * DAY_MS);
    }
  }

  async function confirmPending() {
    const pending = view.pending;
    const user = pending && findUser(pending.userId);
    if (!user || view.busy) {
      return;
    }
    view.busy = true;
    els.confirmButton.disabled = true;
    try {
      await withLoading(() => {
        applyChange(user, pending);
        toast.success(t(pending.action === ACTIONS.ASSIGN ? 'manage.assigned' : 'manage.revoked', {
          license: pending.label,
          name: displayName(user)
        }));
      });
    } catch (error) {
      console.error('[manage-users] License change failed', pending, error);
      toast.error(error.userMessage || t('common.error'));
    } finally {
      view.busy = false;
      els.confirmButton.disabled = false;
      closeModal(els.confirmModal);
      view.pending = null;
      render();
      renderLicenseModal(pending.slug);
    }
  }

  /* ---------- events ---------- */

  function bindEvents() {
    els.sortHeaders.forEach((header) => {
      header.querySelector('[data-sort]').addEventListener('click', () => toggleSort(header.dataset.sortHeader));
    });

    els.rows.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-user-id]');
      if (row) {
        openLicenseModal(row.dataset.userId);
      }
    });
    els.rows.addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-user-id]');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openLicenseModal(row.dataset.userId);
      }
    });

    els.quotaList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-pool-license]');
      if (item) {
        openPoolHolders(item.dataset.poolLicense);
      }
    });
    els.quotaList.addEventListener('keydown', (event) => {
      const item = event.target.closest('[data-pool-license]');
      if (item && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openPoolHolders(item.dataset.poolLicense);
      }
    });

    els.searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applySearch();
    });
    // The native clear (×) on a search input is an explicit reset, so apply it.
    els.search.addEventListener('search', () => {
      if (els.search.value === '') {
        applySearch();
      }
    });
    els.provision.addEventListener('click', provisionSearchedUser);

    els.orgSelect.addEventListener('change', () => {
      view.orgId = els.orgSelect.value;
      view.page = 1;
      render();
    });

    els.modalActions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-license-action]');
      if (button && !button.disabled) {
        ask(button.dataset.type, button.dataset.licenseAction);
      }
    });
    els.confirmButton.addEventListener('click', confirmPending);
    els.confirmModal.addEventListener('close', () => {
      if (!view.busy) {
        view.pending = null;
      }
    });
    els.modal.addEventListener('close', () => {
      const userId = view.modalUserId;
      view.modalUserId = null;
      const row = userId && els.rows.querySelector(`tr[data-user-id="${CSS.escape(userId)}"]`);
      if (row) {
        row.focus();
      }
    });

    els.expiryEdit.addEventListener('click', openExpiry);
    els.expirySave.addEventListener('click', saveExpiry);

    document.addEventListener(EVENTS.LANG, () => {
      render();
      renderLicenseModal();
      if (els.confirmModal.open) {
        renderConfirm();
      }
      if (els.expiryModal.open) {
        // Keep the unsaved selection while relabelling.
        renderExpiryOptions(checkedExpiryDays());
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
      searchForm: '[data-search-form]',
      search: '[data-search]',
      rows: '[data-user-rows]',
      empty: '[data-empty]',
      provision: '[data-provision]',
      pagination: '[data-users-pagination]',
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
      els.sortHeaders = [...document.querySelectorAll('[data-sort-header]')];
      bindEvents();
      render();
    } catch (error) {
      console.error('[manage-users] Initialisation failed', error);
    }
  });

  // Read-only hooks for the prototype's own checks; not part of production.
  window.ManageUsers = Object.freeze({
    usersByOrg,
    getView: () => ({ ...view, sorts: view.sorts.map((sort) => ({ ...sort })) })
  });
})();
