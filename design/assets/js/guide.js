'use strict';

/**
 * User Guide page (guide.html) — port of production `app/guide/index.ts` and
 * `pages/guide.vue`: one card per page of the app, with what it is for, an
 * Open page link and, when the page has one, its product tour.
 *
 * Audience maps onto the shared role attributes, so switching the demo role
 * shows and hides sections live: Manage Users for Admins, Admin Console for
 * Global Admin only.
 */
(function () {
  const AUDIENCE_ATTRIBUTES = Object.freeze({ all: '', admin: 'data-admin-only', global: 'data-global-only' });

  const GUIDE_SECTIONS = Object.freeze([
    { id: 'profile', icon: 'id-card', to: 'profile.html', tour: 'profile', audience: 'all', points: 5 },
    { id: 'booking', icon: 'calendar-check', to: 'booking.html', tour: 'booking', audience: 'all', points: 4 },
    { id: 'manageUsers', icon: 'users', to: 'manage-users.html', tour: 'manageUsers', audience: 'admin', points: 4 },
    { id: 'adminConsole', icon: 'shield', to: 'manage-admins.html', audience: 'global', points: 4 }
  ]);

  /** i18n keys of a section's bullet points, in order. */
  const pointKeys = (section) =>
    Array.from({ length: section.points }, (_, i) => `guide.sections.${section.id}.points.p${i + 1}`);

  function renderSection(section) {
    const key = (field) => `guide.sections.${section.id}.${field}`;
    const points = pointKeys(section).map((k) => `<li data-i18n="${k}"></li>`).join('');
    const tourButton = section.tour
      ? `<button type="button" class="btn btn-primary btn-sm" data-start-tour="${section.tour}">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#i-help"></use></svg>
          <span data-i18n="guide.takeTour"></span>
        </button>`
      : '';
    return `
      <section class="card guide-section" aria-labelledby="guide-${section.id}" ${AUDIENCE_ATTRIBUTES[section.audience]}>
        <div class="guide-section-head">
          <span class="guide-section-icon"><svg class="icon" aria-hidden="true"><use href="#i-${section.icon}"></use></svg></span>
          <div>
            <h2 id="guide-${section.id}" class="card-title" data-i18n="${key('title')}"></h2>
            <span class="badge guide-audience" data-i18n="guide.audience.${section.audience}"></span>
          </div>
        </div>
        <p class="guide-section-desc" data-i18n="${key('desc')}"></p>
        <ul class="guide-points">${points}</ul>
        <div class="guide-actions">
          ${tourButton}
          <a class="btn btn-outline-primary btn-sm" href="${section.to}">
            <span data-i18n="guide.openPage"></span>
            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-right"></use></svg>
          </a>
        </div>
      </section>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const grid = document.querySelector('[data-guide-grid]');
      if (!grid) {
        console.error('[guide] grid container not found');
        return;
      }
      grid.innerHTML = GUIDE_SECTIONS.map(renderSection).join('');
      window.I18N.apply(grid);
    } catch (error) {
      console.error('[guide] render failed', error);
    }
  });
})();
