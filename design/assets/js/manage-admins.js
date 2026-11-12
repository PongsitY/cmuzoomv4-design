'use strict';

/**
 * Admin Console — production app/pages/manage-admins.vue. Global Admin only; other roles get the
 * no-permission card.
 *
 * Four tabs: Stats (usage summary + per-organization Pro quotas), Admin Management, Booked
 * Licenses (admin-bookings.js) and Action Log (action-logs.js). Stat cards and quota rows open
 * the Pool Holders modal (pool-holders.js) when it is loaded.
 *
 * Mock data comes from mock-data.js and lives in memory (resets on reload).
 */
(function () {
  const { ROLES, LICENSES, SHARED_POOL_LICENSES, EVENTS, t, toast, getRole, openModal, closeModal, withLoading } = window.App;
  const { ORGANIZATIONS, SHARED_POOL_QUOTAS, createUsersByOrg, createAdminsByOrg, listHolders, escapeHtml, initials, orgName, displayName } = window.MockData;

  const QUOTA_MODAL_ID = 'quota-modal';
  const ADD_MODAL_ID = 'add-admin-modal';
  const REVOKE_MODAL_ID = 'revoke-admin-modal';

  const QUOTA_MAX = 999;
  const PERCENT = 100;
  /** Production fetches 20 candidates at a time (perPage: 20). */
  const CANDIDATE_PAGE_SIZE = 20;

  const TABS = Object.freeze(['stats', 'admins', 'bookings', 'logs']);
  /** Production stat order is the backend license id: Pro, Temporary Pro, Large Meeting, Reserved Pro, Emergency Pro. */
  const STAT_LICENSES = Object.freeze([LICENSES.PRO, ...SHARED_POOL_LICENSES]);

  const usersByOrg = createUsersByOrg();
  const adminsByOrg = createAdminsByOrg();
  // Page-local quota edits: the shared ORGANIZATIONS list stays untouched for other pages.
  const proQuotaByOrg = new Map(ORGANIZATIONS.map((org) => [org.id, org.quotas.pro]));

  const view = {
    tab: TABS[0],
    orgId: ORGANIZATIONS[0].id,
    appliedCandidateQuery: '',
    pendingRevokeId: null,
    pendingQuotaOrgId: null
  };

  const els = {};

  /* ---------- helpers ---------- */

  function isGlobalAdmin() {
    return getRole() === ROLES.GLOBAL;
  }

  function findOrg(orgId) {
    return ORGANIZATIONS.find((org) => org.id === orgId) || null;
  }

  function currentOrg() {
    return findOrg(view.orgId) || ORGANIZATIONS[0];
  }

  function orgUsers(orgId) {
    return usersByOrg.get(orgId) || [];
  }

  function proUsed(orgId) {
    return orgUsers(orgId).filter((user) => user.license === LICENSES.PRO).length;
  }

  function proLimit(orgId) {
    return proQuotaByOrg.get(orgId);
  }

  /** As production: capped at 100, 0 when there is no quota. */
  function percentOf(used, total) {
    return total > 0 ? Math.min(PERCENT, Math.round((used / total) * PERCENT)) : 0;
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name);
  }

  function userCell(user) {
    return `
      <div class="user-cell">
        <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
        <div>
          <span class="user-name">${escapeHtml(displayName(user))}</span>
          <span class="user-email">${escapeHtml(user.email)}</span>
        </div>
      </div>`;
  }

  function progressBar(used, total, license, label) {
    const isFull = total > 0 && used >= total;
    return `
      <div class="progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}">
        <div class="progress-bar${isFull ? ' is-full' : ''}" data-license="${license}" style="width:${percentOf(used, total)}%"></div>
      </div>`;
  }

  /** Opens the Pool Holders modal (built separately in pool-holders.js) when it is available. */
  function openPoolHolders(license, orgId) {
    if (!window.PoolHolders || typeof window.PoolHolders.open !== 'function') {
      console.error('[manage-admins] PoolHolders modal is not loaded');
      return;
    }
    try {
      window.PoolHolders.open({ license, orgId, role: getRole(), usersByOrg, onChanged: render });
    } catch (error) {
      console.error('[manage-admins] Unable to open the pool holders modal', error);
      toast.error(t('common.error'));
    }
  }

  /* ---------- Stats tab ---------- */

  function statFor(license) {
    if (license === LICENSES.PRO) {
      return {
        license,
        scope: t('table.organization'),
        used: ORGANIZATIONS.reduce((sum, org) => sum + proUsed(org.id), 0),
        total: ORGANIZATIONS.reduce((sum, org) => sum + proLimit(org.id), 0)
      };
    }
    return {
      license,
      scope: t('manage.quotaGroupCmu'),
      used: listHolders(usersByOrg, license).length,
      total: SHARED_POOL_QUOTAS[license] || 0
    };
  }

  function renderStatCard({ license, scope, used, total }) {
    const label = t(`license.${license}`);
    const holdersLabel = t('poolHolders.view', { license: label });
    return `
      <div class="stat is-clickable" role="button" tabindex="0" aria-haspopup="dialog" data-stat-license="${license}"
        aria-label="${escapeHtml(holdersLabel)}" title="${escapeHtml(holdersLabel)}">
        <div class="stat-head">
          <span class="badge badge-${license}">${escapeHtml(label)}</span>
          <span class="stat-left">${escapeHtml(t('manage.left', { count: Math.max(total - used, 0) }))}</span>
        </div>
        <p class="stat-label">${escapeHtml(scope)}</p>
        <div class="stat-figures">
          <p class="stat-value">${escapeHtml(t('stats.ofTotal', { used, total }))}</p>
          <span class="stat-percent">${percentOf(used, total)}%</span>
        </div>
        ${progressBar(used, total, license, label)}
      </div>`;
  }

  function renderQuotaRow(org) {
    const used = proUsed(org.id);
    const total = proLimit(org.id);
    const name = orgName(org);
    const rowLabel = t('poolHolders.orgView', { license: t('license.pro'), org: name });
    return `
      <tr class="is-clickable" tabindex="0" aria-haspopup="dialog" data-org-id="${org.id}"
        aria-label="${escapeHtml(rowLabel)}" title="${escapeHtml(rowLabel)}">
        <td>${escapeHtml(name)}</td>
        <td data-label="${escapeHtml(t('adminQuota.colUsage'))}">
          ${progressBar(used, total, LICENSES.PRO, t('adminQuota.barLabel', { org: name }))}
          <span class="num">${escapeHtml(t('stats.ofTotal', { used, total }))}</span>
        </td>
        <td class="col-action">
          <button type="button" class="icon-button" aria-haspopup="dialog" data-edit-quota="${org.id}"
            aria-label="${escapeHtml(t('adminQuota.editLabel', { org: name }))}" title="${escapeHtml(t('adminQuota.edit'))}">
            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-settings"></use></svg>
          </button>
        </td>
      </tr>`;
  }

  function renderStats() {
    els.statGrid.innerHTML = STAT_LICENSES.map((license) => renderStatCard(statFor(license))).join('');
    els.quotaRows.innerHTML = ORGANIZATIONS.map(renderQuotaRow).join('');
    const total = ORGANIZATIONS.reduce((sum, org) => sum + proLimit(org.id), 0);
    els.quotaTotal.textContent = t('adminQuota.total', { count: total });
  }

  /* ---------- Admin Management tab ---------- */

  function admins() {
    const ids = adminsByOrg.get(view.orgId);
    return orgUsers(view.orgId).filter((user) => ids.has(user.id)).sort(byName);
  }

  function renderOrgSelect() {
    els.orgSelect.innerHTML = ORGANIZATIONS.map((org) =>
      `<option value="${org.id}"${org.id === view.orgId ? ' selected' : ''}>${escapeHtml(orgName(org))}</option>`
    ).join('');
    els.orgSelect.title = orgName(currentOrg());
  }

  function renderAdmins() {
    renderOrgSelect();
    const list = admins();
    els.adminRows.innerHTML = list.map((user) => `
      <tr>
        <td>${userCell(user)}</td>
        <td class="col-action" data-label="${escapeHtml(t('table.action'))}">
          <button type="button" class="btn btn-sm btn-outline-danger" data-revoke-admin="${user.id}"
            aria-label="${escapeHtml(t('admins.revokeLabel', { name: displayName(user) }))}">${escapeHtml(t('admins.revoke'))}</button>
        </td>
      </tr>`).join('');
    els.adminsEmpty.hidden = list.length > 0;
  }

  /* ---------- tabs ---------- */

  function renderTabs() {
    els.tabs.querySelectorAll('[data-tab]').forEach((tab) => {
      const selected = tab.dataset.tab === view.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== view.tab;
    });
  }

  function selectTab(tab, focus) {
    if (!TABS.includes(tab)) {
      console.error('[manage-admins] Unknown tab', tab);
      return;
    }
    view.tab = tab;
    renderTabs();
    if (focus) {
      els.tabs.querySelector(`[data-tab="${tab}"]`).focus();
    }
  }

  function render() {
    const allowed = isGlobalAdmin();
    els.noPermission.hidden = allowed;
    els.console.hidden = !allowed;
    if (!allowed) {
      return;
    }
    renderTabs();
    renderStats();
    renderAdmins();
  }

  /* ---------- Edit Pro quota modal ---------- */

  function quotaError(org) {
    const raw = els.quotaInput.value.trim();
    const value = Number(raw);
    const used = proUsed(org.id);
    if (raw === '' || !Number.isInteger(value) || value < used || value > QUOTA_MAX) {
      return t('adminQuota.invalid', { used, max: QUOTA_MAX });
    }
    return null;
  }

  function renderQuotaModal() {
    const org = findOrg(view.pendingQuotaOrgId);
    if (!org) {
      return;
    }
    const used = proUsed(org.id);
    els.quotaInput.min = String(used);
    els.quotaHint.textContent = t('adminQuota.inUse', { used, max: QUOTA_MAX });
    const error = quotaError(org);
    els.quotaError.hidden = !error;
    els.quotaError.textContent = error || '';
    els.quotaSave.disabled = Boolean(error);
  }

  function openQuotaModal(orgId) {
    const org = findOrg(orgId);
    if (!org) {
      console.error('[manage-admins] Organization not found for quota edit', orgId);
      toast.error(t('adminQuota.orgNotFound'));
      return;
    }
    view.pendingQuotaOrgId = org.id;
    els.quotaInput.value = String(proLimit(org.id));
    renderQuotaModal();
    openModal(QUOTA_MODAL_ID);
  }

  async function saveQuota() {
    const org = findOrg(view.pendingQuotaOrgId);
    if (!org || quotaError(org)) {
      return;
    }
    const count = Number(els.quotaInput.value.trim());
    els.quotaSave.disabled = true;
    try {
      await withLoading(() => {
        proQuotaByOrg.set(org.id, count);
        toast.success(t('adminQuota.saved', { org: orgName(org), count }));
        render();
      });
    } catch (error) {
      console.error('[manage-admins] Saving the Pro quota failed', error);
      toast.error(t('common.error'));
    } finally {
      closeModal(els.quotaModal);
    }
  }

  /* ---------- Add admin modal ---------- */

  function candidates() {
    const ids = adminsByOrg.get(view.orgId);
    const query = view.appliedCandidateQuery.toLowerCase();
    return orgUsers(view.orgId)
      .filter((user) => !ids.has(user.id))
      .filter((user) => !query
        || user.name.toLowerCase().includes(query)
        || user.nameTh.includes(query)
        || user.email.toLowerCase().includes(query))
      .sort(byName)
      .slice(0, CANDIDATE_PAGE_SIZE);
  }

  function renderCandidates() {
    const list = candidates();
    if (list.length === 0) {
      els.candidates.innerHTML = `<div class="empty-state"><p>${escapeHtml(t('admins.noCandidates'))}</p></div>`;
      return;
    }
    els.candidates.innerHTML = list.map((user) => `
      <div class="admin-candidate">
        ${userCell(user)}
        <button type="button" class="btn btn-sm btn-primary" data-assign-admin="${user.id}"
          aria-label="${escapeHtml(t('admins.assignLabel', { name: displayName(user) }))}">${escapeHtml(t('admins.assign'))}</button>
      </div>`).join('');
  }

  function openAddModal() {
    els.candidateSearch.value = '';
    view.appliedCandidateQuery = '';
    renderCandidates();
    openModal(ADD_MODAL_ID);
  }

  /** Runs on Enter or the search button only, never per keystroke (production). */
  function applyCandidateSearch() {
    view.appliedCandidateQuery = els.candidateSearch.value.trim();
    renderCandidates();
  }

  async function assignAdmin(userId) {
    const org = currentOrg();
    const user = orgUsers(org.id).find((item) => item.id === userId);
    if (!user) {
      console.error('[manage-admins] User not found for assign', userId);
      toast.error(t('admins.notFound'));
      return;
    }
    els.candidates.querySelectorAll('[data-assign-admin]').forEach((button) => { button.disabled = true; });
    try {
      await withLoading(() => {
        adminsByOrg.get(org.id).add(user.id);
        toast.success(t('admins.assigned', { name: displayName(user), org: orgName(org) }));
        renderAdmins();
      });
      closeModal(els.addModal);
    } catch (error) {
      console.error('[manage-admins] Assigning an admin failed', error);
      toast.error(t('common.error'));
      renderCandidates();
    }
  }

  /* ---------- Revoke modal ---------- */

  function pendingRevokeUser() {
    return orgUsers(view.orgId).find((user) => user.id === view.pendingRevokeId) || null;
  }

  function renderRevokeBody() {
    const user = pendingRevokeUser();
    els.revokeBody.textContent = user
      ? t('admins.revokeBody', { name: displayName(user), org: orgName(currentOrg()) })
      : '';
  }

  function openRevokeModal(userId) {
    view.pendingRevokeId = userId;
    if (!pendingRevokeUser()) {
      console.error('[manage-admins] User not found for revoke', userId);
      toast.error(t('admins.notFound'));
      view.pendingRevokeId = null;
      return;
    }
    renderRevokeBody();
    els.confirmRevoke.disabled = false;
    openModal(REVOKE_MODAL_ID);
  }

  async function confirmRevoke() {
    const user = pendingRevokeUser();
    if (!user) {
      closeModal(els.revokeModal);
      return;
    }
    els.confirmRevoke.disabled = true;
    try {
      await withLoading(() => {
        adminsByOrg.get(view.orgId).delete(user.id);
        toast.success(t('admins.revoked', { name: displayName(user) }));
        renderAdmins();
      });
    } catch (error) {
      console.error('[manage-admins] Revoking an admin failed', error);
      toast.error(t('common.error'));
    } finally {
      closeModal(els.revokeModal);
      view.pendingRevokeId = null;
    }
  }

  /* ---------- events ---------- */

  function onActivate(element, handler) {
    element.addEventListener('click', handler);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handler(event);
      }
    });
  }

  function bindEvents() {
    els.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        selectTab(tab.dataset.tab, false);
      }
    });

    // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern, as production).
    els.tabs.addEventListener('keydown', (event) => {
      const index = TABS.indexOf(view.tab);
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
      if (next === undefined) {
        return;
      }
      event.preventDefault();
      selectTab(TABS[(next + TABS.length) % TABS.length], true);
    });

    onActivate(els.statGrid, (event) => {
      const card = event.target.closest('[data-stat-license]');
      if (card) {
        event.preventDefault();
        openPoolHolders(card.dataset.statLicense);
      }
    });

    els.quotaRows.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-quota]');
      if (edit) {
        openQuotaModal(edit.dataset.editQuota);
        return;
      }
      const row = event.target.closest('tr[data-org-id]');
      if (row) {
        openPoolHolders(LICENSES.PRO, row.dataset.orgId);
      }
    });
    els.quotaRows.addEventListener('keydown', (event) => {
      // Only the row itself (not its Edit button) opens the holders list.
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-org-id]')) {
        event.preventDefault();
        openPoolHolders(LICENSES.PRO, event.target.dataset.orgId);
      }
    });

    els.quotaInput.addEventListener('input', renderQuotaModal);
    els.quotaSave.addEventListener('click', saveQuota);
    els.quotaModal.addEventListener('close', () => {
      view.pendingQuotaOrgId = null;
    });

    els.orgSelect.addEventListener('change', () => {
      view.orgId = els.orgSelect.value;
      renderAdmins();
    });

    els.addAdmin.addEventListener('click', openAddModal);
    els.candidateForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applyCandidateSearch();
    });
    // The native clear (×) on a search input is an explicit reset, so apply it.
    els.candidateSearch.addEventListener('search', () => {
      if (els.candidateSearch.value === '') {
        applyCandidateSearch();
      }
    });
    els.candidates.addEventListener('click', (event) => {
      const button = event.target.closest('[data-assign-admin]');
      if (button) {
        assignAdmin(button.dataset.assignAdmin);
      }
    });

    els.adminRows.addEventListener('click', (event) => {
      const button = event.target.closest('[data-revoke-admin]');
      if (button) {
        openRevokeModal(button.dataset.revokeAdmin);
      }
    });
    els.confirmRevoke.addEventListener('click', confirmRevoke);

    document.addEventListener(EVENTS.LANG, () => {
      render();
      if (els.addModal.open) {
        renderCandidates();
      }
      renderQuotaModal();
      renderRevokeBody();
    });
    document.addEventListener(EVENTS.ROLE, () => {
      [els.quotaModal, els.addModal, els.revokeModal].forEach(closeModal);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      noPermission: '[data-no-permission]',
      console: '[data-console]',
      tabs: '[data-tabs]',
      statGrid: '[data-stat-grid]',
      quotaRows: '[data-quota-rows]',
      quotaTotal: '[data-quota-total]',
      quotaModal: `#${QUOTA_MODAL_ID}`,
      quotaInput: '[data-quota-input]',
      quotaHint: '[data-quota-hint]',
      quotaError: '[data-quota-error]',
      quotaSave: '[data-quota-save]',
      orgSelect: '[data-org-select]',
      addAdmin: '[data-add-admin]',
      adminRows: '[data-admin-rows]',
      adminsEmpty: '[data-admins-empty]',
      addModal: `#${ADD_MODAL_ID}`,
      candidateForm: '[data-candidate-form]',
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
      els.panels = [...document.querySelectorAll('[data-panel]')];
      bindEvents();
      render();
    } catch (error) {
      console.error('[manage-admins] Initialisation failed', error);
    }
  });
})();
