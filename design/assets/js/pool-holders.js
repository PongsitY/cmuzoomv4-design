'use strict';

/**
 * Pool Holders modal (production PoolHoldersModal.vue): who holds one license, with a Revoke per
 * holder. Used by Manage Users (shared-pool quota bars) and the Admin Console (stat cards and a
 * per-organization Pro row).
 *
 * The modal and its stacked revoke confirmation are injected by this script on first use, so a
 * page only needs to load it (after i18n.js, app.js and mock-data.js) and call:
 *
 *   PoolHolders.open({
 *     license,       // one of App.LICENSES except basic: pro | tempPro | largeMeeting | reservedPro | emergencyPro
 *     orgId,         // optional: only this organization's holders; the title becomes "{license} holders · {org}"
 *     role,          // optional, defaults to App.getRole(); Revoke is shown to Global Admin only
 *     usersByOrg,    // optional: the page's MockData.createUsersByOrg() map, mutated on revoke
 *     onChanged      // optional: called after a revoke so the page can re-render its counts
 *   });
 *   PoolHolders.close();
 *
 * Reserved Pro is never held directly (a Large Meeting holder with no main license uses one), so
 * its list is read-only with a note, as in production.
 */
(function () {
  const { ROLES, LICENSES, EVENTS, t, toast, openModal, closeModal, withLoading, renderPagination, formatExpiry, DEFAULT_PAGE_SIZE } = window.App;
  const { escapeHtml, initials, orgName, displayName, listHolders, createUsersByOrg, ORGANIZATIONS } = window.MockData;

  const MODAL_ID = 'pool-holders-modal';
  const CONFIRM_ID = 'confirm-pool-revoke-modal';
  const OWNER_ATTR = 'data-pool-holders';
  const SEARCH_ID = 'pool-holders-search';

  const state = {
    license: null,
    orgId: null,
    role: null,
    usersByOrg: null,
    onChanged: null,
    search: '',
    appliedSearch: '',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    pendingId: null,
    busy: false
  };

  const els = {};
  let fallbackUsers = null;

  /* ---------- markup ---------- */

  function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function closeButton() {
    return `
      <button type="button" class="icon-button" data-modal-close data-i18n-aria-label="modal.close" aria-label="${escapeHtml(t('modal.close'))}">
        ${icon('x')}
      </button>`;
  }

  /** Removes a same-id dialog this module did not create, so ids stay unique. */
  function claimId(id) {
    const existing = document.getElementById(id);
    if (existing && !existing.hasAttribute(OWNER_ATTR)) {
      console.error('[pool-holders] Replacing a page element that uses a reserved id:', id);
      existing.remove();
    }
    return document.getElementById(id);
  }

  function inject() {
    if (els.modal) {
      return;
    }
    if (!claimId(MODAL_ID)) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog class="modal modal-wide" id="${MODAL_ID}" aria-labelledby="${MODAL_ID}-title" ${OWNER_ATTR}>
          <div class="modal-panel">
            <div class="modal-header">
              <span class="modal-icon">${icon('users')}</span>
              <h2 id="${MODAL_ID}-title" data-ph-title></h2>
              ${closeButton()}
            </div>
            <div class="modal-body">
              <p data-ph-note hidden></p>
              <form class="field" role="search" data-ph-search-form>
                <label class="visually-hidden" for="${SEARCH_ID}" data-i18n="poolHolders.search"></label>
                <input id="${SEARCH_ID}" type="search" autocomplete="off" data-i18n-placeholder="poolHolders.search" data-ph-search>
                <button type="submit" class="search-submit" data-i18n-aria-label="manage.searchSubmit" data-i18n-title="manage.searchSubmit">
                  ${icon('search')}
                </button>
              </form>
              <div class="admin-candidates" data-ph-list></div>
              <div data-ph-pagination></div>
            </div>
          </div>
        </dialog>`);
    }
    if (!claimId(CONFIRM_ID)) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog class="modal" id="${CONFIRM_ID}" aria-labelledby="${CONFIRM_ID}-title" ${OWNER_ATTR}>
          <div class="modal-panel">
            <div class="modal-header">
              <span class="modal-icon modal-icon-danger">${icon('undo')}</span>
              <h2 id="${CONFIRM_ID}-title" data-ph-confirm-title></h2>
              ${closeButton()}
            </div>
            <div class="modal-body">
              <p data-ph-confirm-body></p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost" data-modal-close data-i18n="modal.cancel"></button>
              <button type="button" class="btn btn-danger" data-ph-confirm data-i18n="licenseModal.revoke"></button>
            </div>
          </div>
        </dialog>`);
    }

    els.modal = document.getElementById(MODAL_ID);
    els.confirm = document.getElementById(CONFIRM_ID);
    els.title = els.modal.querySelector('[data-ph-title]');
    els.note = els.modal.querySelector('[data-ph-note]');
    els.form = els.modal.querySelector('[data-ph-search-form]');
    els.search = els.modal.querySelector('[data-ph-search]');
    els.list = els.modal.querySelector('[data-ph-list]');
    els.pagination = els.modal.querySelector('[data-ph-pagination]');
    els.confirmTitle = els.confirm.querySelector('[data-ph-confirm-title]');
    els.confirmBody = els.confirm.querySelector('[data-ph-confirm-body]');
    els.confirmButton = els.confirm.querySelector('[data-ph-confirm]');
    window.I18N.apply(els.modal);
    window.I18N.apply(els.confirm);
    bindEvents();
  }

  /* ---------- data ---------- */

  function usersByOrg() {
    if (state.usersByOrg) {
      return state.usersByOrg;
    }
    if (!fallbackUsers) {
      fallbackUsers = createUsersByOrg();
    }
    return fallbackUsers;
  }

  function licenseLabel() {
    return state.license ? t(`license.${state.license}`) : '';
  }

  function isReadOnly() {
    return state.license === LICENSES.RESERVED_PRO;
  }

  function canRevoke() {
    return !isReadOnly() && state.role === ROLES.GLOBAL;
  }

  /** Holders matching the applied search (name, Thai name or email), sorted by name. */
  function filteredHolders() {
    const filter = state.orgId ? { orgId: state.orgId } : {};
    const term = state.appliedSearch.toLowerCase();
    return listHolders(usersByOrg(), state.license, filter).filter((holder) =>
      !term
      || holder.name.toLowerCase().includes(term)
      || (holder.nameTh || '').toLowerCase().includes(term)
      || holder.email.toLowerCase().includes(term)
    );
  }

  function findUser(holderId) {
    for (const users of usersByOrg().values()) {
      const user = users.find((item) => item.id === holderId);
      if (user) {
        return user;
      }
    }
    return null;
  }

  /** Mirrors production's revoke: a main license is cleared to Basic, Large Meeting is removed. */
  function revoke(user) {
    if (state.license === LICENSES.LARGE_MEETING) {
      user.largeMeeting = false;
      delete user.assignedAt[LICENSES.LARGE_MEETING];
      return;
    }
    if (user.license !== state.license) {
      throw new Error(`User ${user.id} no longer holds ${state.license}`);
    }
    delete user.assignedAt[user.license];
    delete user.expiresAt[user.license];
    user.license = LICENSES.BASIC;
  }

  /* ---------- rendering ---------- */

  function renderTitle() {
    const org = state.orgId && ORGANIZATIONS.find((item) => item.id === state.orgId);
    els.title.textContent = org
      ? t('poolHolders.orgTitle', { license: licenseLabel(), org: orgName(org) })
      : t('poolHolders.title', { license: licenseLabel() });
    els.note.hidden = !isReadOnly();
    els.note.textContent = isReadOnly() ? t('poolHolders.reservedNote') : '';
  }

  function renderRow(holder) {
    const name = displayName(holder);
    const expiry = formatExpiry(holder.expiresAt);
    const org = holder.org ? orgName(holder.org) : '';
    const expiryHtml = expiry
      ? `<span class="license-action-expiry ${expiry.className}"${expiry.title ? ` title="${escapeHtml(expiry.title)}"` : ''}>${escapeHtml(expiry.text)}</span>`
      : '';
    const revokeHtml = canRevoke()
      ? `<button type="button" class="btn btn-sm btn-danger" data-ph-revoke="${escapeHtml(holder.id)}"${state.busy ? ' disabled' : ''}
          aria-label="${escapeHtml(t('poolHolders.revokeLabel', { license: licenseLabel(), name }))}">${escapeHtml(t('licenseModal.revoke'))}</button>`
      : '';
    return `
      <div class="admin-candidate">
        <div class="user-cell">
          <span class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(holder.name))}</span>
          <div>
            <span class="user-name">${escapeHtml(name)}</span>
            <span class="user-email">${escapeHtml(holder.email)}</span>
            ${org ? `<span class="user-email">${escapeHtml(org)}</span>` : ''}
          </div>
        </div>
        ${expiryHtml}
        ${revokeHtml}
      </div>`;
  }

  function renderList() {
    const holders = filteredHolders();
    const totalPages = Math.max(1, Math.ceil(holders.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = holders.slice(start, start + state.pageSize);

    els.list.innerHTML = pageRows.length
      ? pageRows.map(renderRow).join('')
      : `<p class="empty-state">${escapeHtml(t('poolHolders.empty'))}</p>`;

    renderPagination(els.pagination, {
      page: state.page,
      pageSize: state.pageSize,
      total: holders.length,
      onChange: ({ page, pageSize }) => {
        state.page = page;
        state.pageSize = pageSize;
        renderList();
      }
    });
    return pageRows.length;
  }

  function render() {
    renderTitle();
    renderList();
  }

  function renderConfirm() {
    const user = state.pendingId && findUser(state.pendingId);
    els.confirmTitle.textContent = t('confirmLicense.revokeTitle', { license: licenseLabel() });
    els.confirmBody.textContent = user
      ? t('confirmLicense.revokeBody', { name: displayName(user), license: licenseLabel() })
      : '';
  }

  /* ---------- actions ---------- */

  /** Runs on Enter or the search button only, never per keystroke. */
  function applySearch() {
    state.search = els.search.value;
    state.appliedSearch = state.search.trim();
    state.page = 1;
    renderList();
  }

  function ask(holderId) {
    if (!findUser(holderId)) {
      console.error('[pool-holders] Holder not found', holderId);
      toast.error(t('common.error'));
      return;
    }
    state.pendingId = holderId;
    renderConfirm();
    openModal(CONFIRM_ID);
    els.confirmButton.focus();
  }

  async function confirm() {
    const user = state.pendingId && findUser(state.pendingId);
    if (!user || !state.license) {
      closeModal(els.confirm);
      return;
    }
    const label = licenseLabel();
    const name = displayName(user);
    const shownOnPage = els.list.querySelectorAll('.admin-candidate').length;
    state.busy = true;
    try {
      await withLoading(() => {
        revoke(user);
        toast.success(t('manage.revoked', { license: label, name }));
      });
      // Step back a page if this emptied the last one.
      if (shownOnPage === 1 && state.page > 1) {
        state.page -= 1;
      }
      if (typeof state.onChanged === 'function') {
        state.onChanged({ license: state.license, userId: user.id });
      }
    } catch (error) {
      console.error('[pool-holders] Revoke failed', error);
      toast.error(t('common.error'));
    } finally {
      state.busy = false;
      closeModal(els.confirm);
      state.pendingId = null;
      if (els.modal.open) {
        renderList();
      }
    }
  }

  function bindEvents() {
    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      applySearch();
    });
    // The native clear (×) on a search input is an explicit reset, so apply it.
    els.search.addEventListener('search', () => {
      if (els.search.value === '') {
        applySearch();
      }
    });
    els.list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ph-revoke]');
      if (button && !button.disabled) {
        ask(button.dataset.phRevoke);
      }
    });
    els.confirmButton.addEventListener('click', confirm);
    els.confirm.addEventListener('close', () => {
      state.pendingId = null;
    });
    // app.js only wires backdrop clicks for dialogs present at load; these are injected later.
    [els.modal, els.confirm].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
          closeModal(dialog);
        }
      });
    });
    document.addEventListener(EVENTS.LANG, () => {
      window.I18N.apply(els.modal);
      window.I18N.apply(els.confirm);
      if (els.modal.open) {
        render();
      }
      if (els.confirm.open) {
        renderConfirm();
      }
    });
    document.addEventListener(EVENTS.ROLE, (event) => {
      state.role = event.detail && event.detail.role;
      closeModal(els.confirm);
      closeModal(els.modal);
    });
  }

  /* ---------- public API ---------- */

  /**
   * @param {{license: string, orgId?: string|null, role?: string,
   *   usersByOrg?: Map<string, object[]>, onChanged?: (change: {license: string, userId: string}) => void}} options
   */
  function open(options) {
    const license = options && options.license;
    const known = Object.values(LICENSES).filter((value) => value !== LICENSES.BASIC);
    if (!known.includes(license)) {
      console.error('[pool-holders] Unknown license', license);
      return;
    }
    try {
      inject();
      // Each opening starts clean; the list then follows search and paging.
      Object.assign(state, {
        license,
        orgId: options.orgId || null,
        role: options.role || window.App.getRole(),
        usersByOrg: options.usersByOrg || state.usersByOrg,
        onChanged: options.onChanged || null,
        search: '',
        appliedSearch: '',
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        pendingId: null,
        busy: false
      });
      els.search.value = '';
      render();
      openModal(MODAL_ID);
    } catch (error) {
      console.error('[pool-holders] Unable to open', error);
      toast.error(t('common.error'));
    }
  }

  function close() {
    if (els.confirm) {
      closeModal(els.confirm);
    }
    if (els.modal) {
      closeModal(els.modal);
    }
  }

  window.PoolHolders = Object.freeze({ open, close, MODAL_ID, CONFIRM_ID });
})();
