'use strict';

/**
 * Admin Console "Action Log" tab — production app/components/AdminActionLogs.vue.
 *
 * The backend's action log, filtered by email (applied on Enter / the search button only),
 * topic and an inclusive From/To date range, with production's table pagination (20 per page
 * by default). Rows come from MockData.createActionLogs().
 */
(function () {
  const { EVENTS, DEFAULT_PAGE_SIZE, t, formatDateTime, renderPagination } = window.App;
  const { ACTION_LOG_TOPICS, createActionLogs, dateKey, escapeHtml } = window.MockData;

  const LOGS = createActionLogs();

  const view = {
    appliedEmail: '',
    topic: '',
    from: '',
    to: '',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  };

  const els = {};

  function topicLabel(topic) {
    return ACTION_LOG_TOPICS.includes(topic) ? t(`actionLogs.topics.${topic}`) : topic;
  }

  /** Production asks the backend for an exact (case-insensitive) email match. */
  function filteredLogs() {
    const email = view.appliedEmail.toLowerCase();
    return LOGS.filter((log) => {
      const day = dateKey(log.createdAt);
      return (!email || (log.email || '').toLowerCase() === email)
        && (!view.topic || log.topic === view.topic)
        && (!view.from || day >= view.from)
        && (!view.to || day <= view.to);
    });
  }

  function renderTopicSelect() {
    els.topic.innerHTML = [
      `<option value="">${escapeHtml(t('actionLogs.allTopics'))}</option>`,
      ...ACTION_LOG_TOPICS.map((topic) => `<option value="${topic}">${escapeHtml(t(`actionLogs.topics.${topic}`))}</option>`)
    ].join('');
    els.topic.value = view.topic;
  }

  function render() {
    renderTopicSelect();
    const logs = filteredLogs();
    const totalPages = Math.max(1, Math.ceil(logs.length / view.pageSize));
    view.page = Math.min(view.page, totalPages);
    const start = (view.page - 1) * view.pageSize;

    els.count.textContent = t('actionLogs.count', { count: logs.length });
    els.rows.innerHTML = logs.slice(start, start + view.pageSize).map((log) => `
      <tr>
        <td data-label="${escapeHtml(t('actionLogs.time'))}">${escapeHtml(formatDateTime(log.createdAt))}</td>
        <td data-label="${escapeHtml(t('actionLogs.topic'))}"><span class="badge">${escapeHtml(topicLabel(log.topic))}</span></td>
        <td data-label="${escapeHtml(t('actionLogs.message'))}">${escapeHtml(log.message)}</td>
        <td data-label="${escapeHtml(t('actionLogs.user'))}" class="num">${escapeHtml(log.accountId ?? '—')}</td>
      </tr>`).join('');
    els.empty.hidden = logs.length > 0;

    renderPagination(els.pagination, {
      page: view.page,
      pageSize: view.pageSize,
      total: logs.length,
      onChange: ({ page, pageSize }) => {
        view.page = page;
        view.pageSize = pageSize;
        render();
      }
    });
  }

  /** Runs on Enter or the search button only, never per keystroke (production). */
  function applyEmailFilter() {
    view.appliedEmail = els.email.value.trim();
    view.page = 1;
    render();
  }

  function onDateChange() {
    view.from = els.from.value;
    view.to = els.to.value;
    // Each bound limits the other, as production's :max / :min.
    els.from.max = view.to;
    els.to.min = view.from;
    view.page = 1;
    render();
  }

  function bindEvents() {
    els.search.addEventListener('submit', (event) => {
      event.preventDefault();
      applyEmailFilter();
    });
    // The native clear (×) on a search input is an explicit reset, so apply it.
    els.email.addEventListener('search', () => {
      if (els.email.value === '') {
        applyEmailFilter();
      }
    });
    els.topic.addEventListener('change', () => {
      view.topic = els.topic.value;
      view.page = 1;
      render();
    });
    els.from.addEventListener('change', onDateChange);
    els.to.addEventListener('change', onDateChange);
    document.addEventListener(EVENTS.LANG, render);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      count: '[data-al-count]',
      search: '[data-al-search]',
      email: '[data-al-email]',
      topic: '[data-al-topic]',
      from: '[data-al-from]',
      to: '[data-al-to]',
      rows: '[data-al-rows]',
      empty: '[data-al-empty]',
      pagination: '[data-al-pagination]'
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
      console.error('[action-logs] Initialisation failed', error);
    }
  });
})();
