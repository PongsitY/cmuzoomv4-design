'use strict';

/**
 * Admin Console — Global Admin picks an organization (or "All organizations") and gets a usage
 * summary, the Pro license quota of every organization (editable), and the admins of the selected
 * organization, which can be assigned (via the Add admin modal) or revoked (with confirmation).
 * Admin and User roles get the no-access notice.
 *
 * Mock organizations/users/admins come from mock-data.js; all data is in-memory (resets on reload).
 */
(function () {
  const { ROLES, LICENSES, EVENTS, t, showToast, getRole, openModal, closeModal } = window.App;
  const { ADDON_LARGE_MEETING, RESERVED_PRO, CMU_ORG_ID, ORGANIZATIONS, createUsersByOrg, createAdminsByOrg, escapeHtml, initials, orgName } = window.MockData;

  const ADD_MODAL_ID = 'add-admin-modal';
  const REVOKE_MODAL_ID = 'revoke-admin-modal';
  const QUOTA_MODAL_ID = 'quota-modal';

  const QUOTA_MAX = 999;
  const PERCENT = 100;

  // Temp. Pro and Large Meeting are lent from CMU's shared pool, so they are counted university-wide.
  const CMU_ORG = ORGANIZATIONS.find((org) => org.id === CMU_ORG_ID);

  const usersByOrg = createUsersByOrg();
  const adminsByOrg = createAdminsByOrg();
  // Page-local quota edits, like the Pro expiration interval on Manage Users: the shared
  // ORGANIZATIONS list stays untouched, so other pages keep their own mock numbers.
  const proQuotaByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, org.quotas.pro]));

  const TABS = Object.freeze({ STATS: 'stats', ADMINS: 'admins' });

  const view = {
    tab: TABS.STATS,
    orgId: ORGANIZATIONS[0].id,
    candidateQuery: '',
    pendingRevoke: null,
    pendingQuotaOrgId: null
  };

  const els = {};

  /* ---------- helpers ---------- */

  /** The organization picked in the Admin Management filter. */
  function currentOrg() {
    return ORGANIZATIONS.find((org) => org.id === view.orgId) || ORGANIZATIONS[0];
  }

  function isGlobalAdmin() {
    return getRole() === ROLES.GLOBAL;
  }

  function orgUsers(org) {
    return usersByOrg.get(org.id) || [];
  }

  function allUsers() {
    return [...usersByOrg.values()].flat();
  }

  function orgAdminIds(org) {
    return adminsByOrg.get(org.id);
  }

  function findOrg(orgId) {
    return ORGANIZATIONS.find((org) => org.id === orgId) || null;
  }

  function findUser(org, userId) {
    return org ? orgUsers(org).find((user) => user.id === userId) : undefined;
  }

  function holdsLicense(user, type) {
    if (type === RESERVED_PRO) {
      // Only a Large Meeting user without Pro / Temp. Pro of their own needs a reserved Pro.
      return user.largeMeeting && user.license === LICENSES.BASIC;
    }
    return type === ADDON_LARGE_MEETING ? user.largeMeeting : user.license === type;
  }

  function proUsed(org) {
    return orgUsers(org).filter((user) => user.license === LICENSES.PRO).length;
  }

  function proQuota(org) {
    return proQuotaByOrg.get(org.id);
  }

  function percentOf(used, total) {
    return total > 0 ? Math.round((used / total) * PERCENT) : PERCENT;
  }

  function userCell(user) {
    return `
      <div class="user-cell">
        <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
        <div>
          <span class="user-name">${escapeHtml(user.name)}</span>
          <span class="user-email">${escapeHtml(user.email)}</span>
        </div>
      </div>`;
  }

  /* ---------- rendering: filter ---------- */

  function renderFilter() {
    els.orgSelect.innerHTML = ORGANIZATIONS.map((org) =>
      `<option value="${org.id}"${org.id === view.orgId ? ' selected' : ''}>${escapeHtml(orgName(org))}</option>`
    ).join('');
  }

  /* ---------- rendering: usage summary ---------- */

  /** Pro is summed over the organizations in view; the shared pool always counts university-wide. */
  function licenseUsage(type, isPool) {
    if (isPool) {
      return {
        used: allUsers().filter((user) => holdsLicense(user, type)).length,
        total: CMU_ORG.quotas[type]
      };
    }
    // The Stats tab always covers every organization; the organization filter only drives Admin Management.
    return {
      used: ORGANIZATIONS.reduce((sum, org) => sum + proUsed(org), 0),
      total: ORGANIZATIONS.reduce((sum, org) => sum + proQuota(org), 0)
    };
  }

  /** The organizations a count covers: the shared pool is university-wide, Pro follows the filter. */
  function scopeLabel(isPool) {
    if (isPool) {
      return t('manage.quotaGroupCmu');
    }
    return t('admins.allOrgs');
  }

  /** One license per tile: its badge in the license colour, the count, a bar and the scope. */
  function licenseStat(type, isPool) {
    const { used, total } = licenseUsage(type, isPool);
    const percent = percentOf(used, total);
    const isFull = used >= total;
    const label = scopeLabel(isPool);
    return `
      <div class="stat">
        <div class="stat-head">
          <span class="badge badge-${type}">${escapeHtml(t(`license.${type}`))}</span>
          <span class="stat-left">${escapeHtml(t('manage.left', { count: Math.max(total - used, 0) }))}</span>
        </div>
        <p class="stat-label">${escapeHtml(label)}</p>
        <div class="stat-figures">
          <p class="stat-value">${escapeHtml(t('stats.ofTotal', { used, total }))}</p>
          <span class="stat-percent">${percent}%</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}">
          <div class="progress-bar${isFull ? ' is-full' : ''}" data-license="${type}" style="width:${Math.min(percent, PERCENT)}%"></div>
        </div>
      </div>`;
  }

  function renderStats() {
    els.statGrid.innerHTML = [
      licenseStat(LICENSES.PRO, false),
      licenseStat(LICENSES.TEMP_PRO, true),
      licenseStat(ADDON_LARGE_MEETING, true),
      licenseStat(RESERVED_PRO, true)
    ].join('');
  }

  /* ---------- rendering: Pro quota table ---------- */

  function renderQuotaRow(org) {
    const used = proUsed(org);
    const total = proQuota(org);
    const percent = percentOf(used, total);
    const isFull = used >= total;
    const label = orgName(org);
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td data-label="${escapeHtml(t('adminQuota.colUsage'))}">
          <div class="quota-cell">
            <div class="progress" role="progressbar" aria-label="${escapeHtml(t('adminQuota.barLabel', { org: label }))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}">
              <div class="progress-bar${isFull ? ' is-full' : ''}" data-license="pro" style="width:${Math.min(percent, PERCENT)}%"></div>
            </div>
            <span class="quota-numbers">${escapeHtml(t('manage.used', { used, total, percent }))}</span>
          </div>
        </td>
        <td class="col-action">
          <button type="button" class="btn btn-sm btn-ghost" data-edit-quota data-org-id="${org.id}" aria-haspopup="dialog"
            aria-label="${escapeHtml(t('adminQuota.editLabel', { org: label }))}">
            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-pencil"></use></svg>
            <span>${escapeHtml(t('adminQuota.edit'))}</span>
          </button>
        </td>
      </tr>`;
  }

  function renderQuotaTable() {
    els.quotaRows.innerHTML = ORGANIZATIONS.map(renderQuotaRow).join('');
    const total = ORGANIZATIONS.reduce((sum, org) => sum + proQuota(org), 0);
    els.quotaTotal.textContent = t('adminQuota.total', { count: total });
  }

  /* ---------- rendering: admins table ---------- */

  function renderRow(org, user) {
    return `
      <tr>
        <td>${userCell(user)}</td>
        <td class="col-action">
          <button type="button" class="btn btn-sm btn-outline-danger" data-revoke-admin data-user-id="${user.id}" data-org-id="${org.id}"
            aria-haspopup="dialog" aria-label="${escapeHtml(t('admins.revokeLabel', { name: user.name }))}">${escapeHtml(t('admins.revoke'))}</button>
        </td>
      </tr>`;
  }

  function renderTable() {
    const org = currentOrg();
    const adminIds = orgAdminIds(org);
    const rows = orgUsers(org).filter((user) => adminIds.has(user.id)).map((user) => renderRow(org, user));
    els.rows.innerHTML = rows.join('');
    els.empty.hidden = rows.length > 0;
    els.emptyText.textContent = t('admins.empty');
    return rows.length;
  }

  function renderAdminsHeader(count) {
    els.adminCount.textContent = count === 1 ? t('admins.countOne') : t('admins.count', { count });
    els.addAdmin.setAttribute('aria-label', t('admins.addLabel', { org: orgName(currentOrg()) }));
  }

  function renderTabs() {
    els.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
      const selected = tab.dataset.tab === view.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function selectTab(tab, focus) {
    if (!Object.values(TABS).includes(tab)) {
      console.error('[manage-admins] Unknown tab', tab);
      return;
    }
    view.tab = tab;
    render();
    if (focus) {
      els.tabs.querySelector(`[data-tab="${tab}"]`).focus();
    }
  }

  function render() {
    const allowed = isGlobalAdmin();
    els.noPermission.hidden = allowed;
    els.pageHead.hidden = !allowed;
    els.tabs.hidden = !allowed;
    els.stats.hidden = !allowed || view.tab !== TABS.STATS;
    els.admins.hidden = !allowed || view.tab !== TABS.ADMINS;
    if (!allowed) {
      return;
    }
    renderTabs();
    renderFilter();
    renderStats();
    renderQuotaTable();
    renderAdminsHeader(renderTable());
  }

  /* ---------- Pro quota modal ---------- */

  function pendingQuotaOrg() {
    return view.pendingQuotaOrgId ? findOrg(view.pendingQuotaOrgId) : null;
  }

  function renderQuotaModal(org) {
    els.quotaOrg.textContent = orgName(org);
    els.quotaHint.textContent = t('adminQuota.inUse', { used: proUsed(org), max: QUOTA_MAX });
    els.quotaInput.min = String(proUsed(org));
  }

  function openQuotaModal(orgId) {
    const org = findOrg(orgId);
    if (!org) {
      console.error('[manage-admins] Organization not found for quota edit', orgId);
      showToast(t('adminQuota.orgNotFound'), 'error');
      return;
    }
    view.pendingQuotaOrgId = org.id;
    renderQuotaModal(org);
    els.quotaInput.value = String(proQuota(org));
    openModal(QUOTA_MODAL_ID);
    els.quotaInput.focus();
    els.quotaInput.select();
  }

  function saveQuota() {
    const org = pendingQuotaOrg();
    if (!org) {
      console.error('[manage-admins] Quota saved without a valid organization', view.pendingQuotaOrgId);
      showToast(t('adminQuota.orgNotFound'), 'error');
      closeModal(els.quotaModal);
      return;
    }
    const entered = els.quotaInput.value.trim();
    const quota = Number(entered);
    const used = proUsed(org);
    // Digits only: an empty field would otherwise read as 0. A quota below the licenses already
    // handed out would leave the organization over its own limit.
    if (!/^\d+$/.test(entered) || quota < used || quota > QUOTA_MAX) {
      console.error('[manage-admins] Invalid Pro quota', els.quotaInput.value);
      showToast(t('adminQuota.invalid', { used, max: QUOTA_MAX }), 'error');
      return;
    }
    proQuotaByOrg.set(org.id, quota);
    closeModal(els.quotaModal);
    render();
    showToast(t('adminQuota.saved', { org: orgName(org), count: quota }), 'success');
  }

  /* ---------- add admin modal ---------- */

  function renderCandidates() {
    const org = currentOrg();
    const adminIds = orgAdminIds(org);
    const query = view.candidateQuery.trim().toLowerCase();
    const candidates = orgUsers(org).filter((user) =>
      !adminIds.has(user.id) && (!query || user.name.toLowerCase().includes(query) || user.email.includes(query))
    );
    els.addOrg.textContent = orgName(org);
    if (candidates.length === 0) {
      els.candidates.innerHTML = `<p class="usage-empty">${escapeHtml(t(query ? 'manage.empty' : 'admins.noCandidates'))}</p>`;
      return;
    }
    els.candidates.innerHTML = candidates.map((user) => `
      <div class="admin-candidate">
        ${userCell(user)}
        <button type="button" class="btn btn-sm btn-primary" data-assign-admin data-user-id="${user.id}"
          aria-label="${escapeHtml(t('admins.assignLabel', { name: user.name }))}">${escapeHtml(t('admins.assign'))}</button>
      </div>`).join('');
  }

  function openAddModal() {
    view.candidateQuery = '';
    els.candidateSearch.value = '';
    renderCandidates();
    openModal(ADD_MODAL_ID);
    els.candidateSearch.focus();
  }

  function assignAdmin(userId) {
    const org = currentOrg();
    const user = findUser(org, userId);
    if (!user) {
      console.error('[manage-admins] User not found for assign', userId);
      showToast(t('admins.notFound'), 'error');
      return;
    }
    orgAdminIds(org).add(user.id);
    render();
    renderCandidates();
    // Keep keyboard focus inside the modal after the assigned row disappears.
    const next = els.candidates.querySelector('button[data-assign-admin]') || els.candidateSearch;
    next.focus();
    showToast(t('admins.assigned', { name: user.name, org: orgName(org) }), 'success');
  }

  /* ---------- revoke modal ---------- */

  function pendingRevokeUser() {
    const pending = view.pendingRevoke;
    if (!pending) {
      return null;
    }
    const org = findOrg(pending.orgId);
    return org ? { org, user: findUser(org, pending.userId) } : null;
  }

  function renderRevokeBody() {
    const pending = pendingRevokeUser();
    if (pending && pending.user) {
      els.revokeBody.textContent = t('admins.revokeBody', { name: pending.user.name, org: orgName(pending.org) });
    }
  }

  function openRevokeModal(orgId, userId) {
    const org = findOrg(orgId);
    if (!findUser(org, userId)) {
      console.error('[manage-admins] User not found for revoke', orgId, userId);
      showToast(t('admins.notFound'), 'error');
      return;
    }
    view.pendingRevoke = { orgId, userId };
    renderRevokeBody();
    openModal(REVOKE_MODAL_ID);
  }

  function confirmRevoke() {
    const pending = pendingRevokeUser();
    if (!pending || !pending.user) {
      console.error('[manage-admins] Revoke confirmed without a valid user', view.pendingRevoke);
      showToast(t('admins.notFound'), 'error');
      closeModal(els.revokeModal);
      return;
    }
    orgAdminIds(pending.org).delete(pending.user.id);
    closeModal(els.revokeModal);
    render();
    showToast(t('admins.revoked', { name: pending.user.name }), 'success');
  }

  /* ---------- events ---------- */

  function bindEvents() {
    els.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        selectTab(tab.dataset.tab, false);
      }
    });

    // Arrow keys / Home / End move between tabs, as in the WAI-ARIA tabs pattern.
    els.tabs.addEventListener('keydown', (event) => {
      const order = Object.values(TABS);
      const index = order.indexOf(view.tab);
      const next = {
        ArrowRight: order[(index + 1) % order.length],
        ArrowLeft: order[(index - 1 + order.length) % order.length],
        Home: order[0],
        End: order[order.length - 1]
      }[event.key];
      if (next) {
        event.preventDefault();
        selectTab(next, true);
      }
    });

    els.orgSelect.addEventListener('change', () => {
      view.orgId = els.orgSelect.value;
      render();
    });

    els.quotaRows.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-edit-quota]');
      if (button) {
        openQuotaModal(button.dataset.orgId);
      }
    });

    els.quotaSave.addEventListener('click', saveQuota);
    els.quotaModal.addEventListener('close', () => {
      const orgId = view.pendingQuotaOrgId;
      view.pendingQuotaOrgId = null;
      const rowButton = orgId && els.quotaRows.querySelector(`[data-edit-quota][data-org-id="${orgId}"]`);
      if (rowButton) {
        rowButton.focus();
      }
    });

    els.addAdmin.addEventListener('click', openAddModal);
    els.addModal.addEventListener('close', () => {
      els.addAdmin.focus();
    });

    els.candidateSearch.addEventListener('input', () => {
      view.candidateQuery = els.candidateSearch.value;
      renderCandidates();
    });

    els.candidates.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-assign-admin]');
      if (button) {
        assignAdmin(button.dataset.userId);
      }
    });

    els.rows.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-revoke-admin]');
      if (button) {
        openRevokeModal(button.dataset.orgId, button.dataset.userId);
      }
    });

    els.confirmRevoke.addEventListener('click', confirmRevoke);
    els.revokeModal.addEventListener('close', () => {
      const pending = view.pendingRevoke;
      view.pendingRevoke = null;
      // Back to the row's Revoke button when cancelled; the Add admin button once the row is gone.
      const rowButton = pending && els.rows.querySelector(`[data-revoke-admin][data-user-id="${pending.userId}"]`);
      (rowButton || els.addAdmin).focus();
    });

    document.addEventListener(EVENTS.LANG, () => {
      render();
      if (els.addModal.open) {
        renderCandidates();
      }
      const quotaOrg = pendingQuotaOrg();
      if (quotaOrg) {
        renderQuotaModal(quotaOrg);
      }
      renderRevokeBody();
    });
    document.addEventListener(EVENTS.ROLE, () => {
      closeModal(els.addModal);
      closeModal(els.revokeModal);
      closeModal(els.quotaModal);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      noPermission: '[data-no-permission]',
      pageHead: '[data-page-head]',
      tabs: '[data-tabs]',
      stats: '[data-stats]',
      statGrid: '[data-stat-grid]',
      quotaRows: '[data-quota-rows]',
      quotaTotal: '[data-quota-total]',
      quotaModal: `#${QUOTA_MODAL_ID}`,
      quotaOrg: '[data-quota-org]',
      quotaInput: '[data-quota-input]',
      quotaHint: '[data-quota-hint]',
      quotaSave: '[data-quota-save]',
      admins: '[data-admins]',
      orgSelect: '[data-org-select]',
      adminCount: '[data-admin-count]',
      addAdmin: '[data-add-admin]',
      rows: '[data-admin-rows]',
      empty: '[data-empty]',
      emptyText: '[data-empty-text]',
      addModal: `#${ADD_MODAL_ID}`,
      addOrg: '[data-add-org]',
      candidateSearch: '[data-candidate-search]',
      candidates: '[data-candidates]',
      revokeModal: `#${REVOKE_MODAL_ID}`,
      revokeBody: '[data-revoke-body]',
      confirmRevoke: '[data-confirm-revoke]'
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
      console.error('[manage-admins] Initialisation failed', error);
    }
  });
})();
