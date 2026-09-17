'use strict';

/**
 * Manage Admin — Global Admin picks an organization, sees its admins, and assigns (via the
 * Add admin modal) or revokes (with confirmation) the Admin role. Admin and User roles get the
 * no-access notice.
 *
 * Mock organizations/users/admins come from mock-data.js; all data is in-memory (resets on reload).
 */
(function () {
  const { ROLES, EVENTS, t, showToast, getRole, openModal, closeModal } = window.App;
  const { SIGNED_IN_USER, ORGANIZATIONS, createUsersByOrg, createAdminsByOrg, escapeHtml, initials, orgName } = window.MockData;

  const ADD_MODAL_ID = 'add-admin-modal';
  const REVOKE_MODAL_ID = 'revoke-admin-modal';

  const usersByOrg = createUsersByOrg();
  const adminsByOrg = createAdminsByOrg();

  const view = {
    orgId: SIGNED_IN_USER.orgId,
    candidateQuery: '',
    pendingRevokeId: null
  };

  const els = {};

  /* ---------- helpers ---------- */

  function currentOrg() {
    return ORGANIZATIONS.find((org) => org.id === view.orgId) || ORGANIZATIONS[0];
  }

  function isGlobalAdmin() {
    return getRole() === ROLES.GLOBAL;
  }

  function orgUsers(org) {
    return usersByOrg.get(org.id) || [];
  }

  function orgAdminIds(org) {
    return adminsByOrg.get(org.id);
  }

  function findUser(org, userId) {
    return orgUsers(org).find((user) => user.id === userId);
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

  /* ---------- rendering: page ---------- */

  function renderOrgHeading(org) {
    const count = orgAdminIds(org).size;
    els.orgSelect.innerHTML = ORGANIZATIONS.map((item) =>
      `<option value="${item.id}"${item.id === org.id ? ' selected' : ''}>${escapeHtml(orgName(item))}</option>`
    ).join('');
    els.adminCount.textContent = count === 1 ? t('admins.countOne') : t('admins.count', { count });
    els.addAdmin.setAttribute('aria-label', t('admins.addLabel', { org: orgName(org) }));
  }

  function renderRow(user) {
    return `
      <tr>
        <td>${userCell(user)}</td>
        <td class="col-action">
          <button type="button" class="btn btn-sm btn-outline-danger" data-revoke-admin data-user-id="${user.id}"
            aria-haspopup="dialog" aria-label="${escapeHtml(t('admins.revokeLabel', { name: user.name }))}">${escapeHtml(t('admins.revoke'))}</button>
        </td>
      </tr>`;
  }

  function renderTable(org) {
    const adminIds = orgAdminIds(org);
    const admins = orgUsers(org).filter((user) => adminIds.has(user.id));
    els.rows.innerHTML = admins.map(renderRow).join('');
    els.empty.hidden = admins.length > 0;
  }

  function render() {
    const allowed = isGlobalAdmin();
    els.noPermission.hidden = allowed;
    els.admins.hidden = !allowed;
    if (!allowed) {
      return;
    }
    const org = currentOrg();
    renderOrgHeading(org);
    renderTable(org);
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

  function renderRevokeBody() {
    const org = currentOrg();
    const user = view.pendingRevokeId && findUser(org, view.pendingRevokeId);
    if (user) {
      els.revokeBody.textContent = t('admins.revokeBody', { name: user.name, org: orgName(org) });
    }
  }

  function openRevokeModal(userId) {
    if (!findUser(currentOrg(), userId)) {
      console.error('[manage-admins] User not found for revoke', userId);
      showToast(t('admins.notFound'), 'error');
      return;
    }
    view.pendingRevokeId = userId;
    renderRevokeBody();
    openModal(REVOKE_MODAL_ID);
  }

  function confirmRevoke() {
    const org = currentOrg();
    const user = view.pendingRevokeId && findUser(org, view.pendingRevokeId);
    if (!user) {
      console.error('[manage-admins] Revoke confirmed without a valid user', view.pendingRevokeId);
      showToast(t('admins.notFound'), 'error');
      closeModal(els.revokeModal);
      return;
    }
    orgAdminIds(org).delete(user.id);
    closeModal(els.revokeModal);
    render();
    showToast(t('admins.revoked', { name: user.name }), 'success');
  }

  /* ---------- events ---------- */

  function bindEvents() {
    els.orgSelect.addEventListener('change', () => {
      view.orgId = els.orgSelect.value;
      render();
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
        openRevokeModal(button.dataset.userId);
      }
    });

    els.confirmRevoke.addEventListener('click', confirmRevoke);
    els.revokeModal.addEventListener('close', () => {
      const userId = view.pendingRevokeId;
      view.pendingRevokeId = null;
      // Back to the row's Revoke button when cancelled; the Add admin button once the row is gone.
      const rowButton = userId && els.rows.querySelector(`[data-revoke-admin][data-user-id="${userId}"]`);
      (rowButton || els.addAdmin).focus();
    });

    document.addEventListener(EVENTS.LANG, () => {
      render();
      if (els.addModal.open) {
        renderCandidates();
      }
      renderRevokeBody();
    });
    document.addEventListener(EVENTS.ROLE, () => {
      closeModal(els.addModal);
      closeModal(els.revokeModal);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      noPermission: '[data-no-permission]',
      admins: '[data-admins]',
      orgSelect: '[data-org-select]',
      adminCount: '[data-admin-count]',
      addAdmin: '[data-add-admin]',
      rows: '[data-admin-rows]',
      empty: '[data-empty]',
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
