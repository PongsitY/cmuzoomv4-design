'use strict';

/**
 * Admin Console "Booked Licenses" tab — production app/components/AdminBookingCalendar.vue.
 *
 * Month calendar of every booked Temporary Pro and Large Meeting slot (one bar per start time and
 * license, with its count), the selected day's bookings grouped by slot beside it, and a cancel
 * confirmation that can email the user. Bookings come from MockData.createOrgBookings(), one
 * month at a time; cancellations live in memory (reset on reload).
 */
(function () {
  const { LICENSES, EVENTS, t, toast, getLang, openModal, closeModal, withLoading, formatDate } = window.App;
  const { TIME_SLOTS, createUsersByOrg, createOrgBookings, mockNow, dateKey, escapeHtml, displayName } = window.MockData;

  const CANCEL_MODAL_ID = 'admin-cancel-booking-modal';
  const CALENDAR_LICENSES = Object.freeze([LICENSES.TEMP_PRO, LICENSES.LARGE_MEETING]);
  const DATE_LOCALES = Object.freeze({ en: 'en-GB', th: 'th-TH' });
  const OTHER_SLOT = 'other';
  const SLOT_ORDER = Object.freeze([...TIME_SLOTS.map((slot) => slot.id), OTHER_SLOT]);
  const DAYS_IN_WEEK = 7;
  // 1 Sep 2024 was a Sunday: weekday names start on Sunday, as the Booking Center does.
  const FIRST_SUNDAY = { year: 2024, month: 8, day: 1 };

  const usersByOrg = createUsersByOrg();
  const todayKey = dateKey(mockNow());
  /** Bookings per 'YYYY-MM', generated on first view. */
  const bookingsByMonth = new Map();
  const cancelledIds = new Set();

  const view = {
    month: todayKey.slice(0, 7),
    license: '',
    selectedDate: null,
    pendingCancelId: null
  };

  const els = {};

  /* ---------- helpers ---------- */

  function intlLocale() {
    return DATE_LOCALES[getLang()] || DATE_LOCALES.en;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function slotTimes(slot) {
    return {
      start: `${pad(slot.startHour)}:${pad(slot.startMinute)}`,
      end: `${pad(slot.endHour)}:${pad(slot.endMinute)}`
    };
  }

  function monthStart() {
    const [year, month] = view.month.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  /** Noon of a date key, so formatting never slips a day. */
  function dayDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function monthBookings() {
    if (!bookingsByMonth.has(view.month)) {
      bookingsByMonth.set(view.month, createOrgBookings(usersByOrg, monthStart()));
    }
    return bookingsByMonth.get(view.month)
      .filter((booking) => !cancelledIds.has(booking.id))
      .filter((booking) => !view.license || booking.license === view.license);
  }

  function bookingsByDate() {
    const out = new Map();
    monthBookings().forEach((booking) => {
      const bucket = out.get(booking.dateKey);
      if (bucket) {
        bucket.push(booking);
      } else {
        out.set(booking.dateKey, [booking]);
      }
    });
    return out;
  }

  function findBooking(id) {
    return id ? monthBookings().find((booking) => booking.id === id) || null : null;
  }

  function startTime(booking) {
    const slot = TIME_SLOTS.find((item) => item.id === booking.slot);
    return slot ? slotTimes(slot).start : `${pad(booking.startAt.getHours())}:${pad(booking.startAt.getMinutes())}`;
  }

  function slotGroupLabel(key) {
    const slot = TIME_SLOTS.find((item) => item.id === key);
    if (!slot) {
      return t('adminBookings.otherTimes');
    }
    const { start, end } = slotTimes(slot);
    return `${start} – ${end}`;
  }

  /** One bar per start time and license, ordered by time then license. */
  function barsFor(dayBookings) {
    const bars = new Map();
    (dayBookings || []).forEach((booking) => {
      if (!CALENDAR_LICENSES.includes(booking.license)) {
        return;
      }
      const time = startTime(booking);
      const key = `${time}|${booking.license}`;
      const bar = bars.get(key);
      if (bar) {
        bar.count += 1;
      } else {
        bars.set(key, { license: booking.license, time, count: 1 });
      }
    });
    return [...bars.values()].sort((a, b) =>
      a.time.localeCompare(b.time) || CALENDAR_LICENSES.indexOf(a.license) - CALENDAR_LICENSES.indexOf(b.license));
  }

  /** A slot that has already ended is history, not something to cancel. */
  function isCancellable(booking) {
    return booking.endAt.getTime() > mockNow().getTime();
  }

  /**
   * The day the list shows: kept while it stays in the shown month; otherwise today when it is in
   * the month, else the month's first booked day, else its 1st (production).
   */
  function syncSelectedDate(byDate) {
    if (view.selectedDate && view.selectedDate.startsWith(view.month)) {
      return;
    }
    if (todayKey.startsWith(view.month)) {
      view.selectedDate = todayKey;
      return;
    }
    const firstBooked = [...byDate.keys()].filter((key) => key.startsWith(view.month)).sort()[0];
    view.selectedDate = firstBooked || `${view.month}-01`;
  }

  /* ---------- rendering ---------- */

  function renderCalendar(byDate) {
    const start = monthStart();
    els.title.textContent = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(start);

    const weekday = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' });
    els.weekdays.innerHTML = Array.from({ length: DAYS_IN_WEEK }, (_, i) =>
      `<span>${escapeHtml(weekday.format(new Date(FIRST_SUNDAY.year, FIRST_SUNDAY.month, FIRST_SUNDAY.day + i)))}</span>`).join('');

    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const cells = Array.from({ length: start.getDay() }, () => '<span class="calendar-day-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${view.month}-${pad(day)}`;
      const bars = barsFor(byDate.get(key));
      const date = formatDate(dayDate(key));
      const label = bars.length
        ? `${date} · ${bars.map((bar) => `${bar.time} ${t(`license.${bar.license}`)}: ${bar.count}`).join(', ')}`
        : date;
      const barsHtml = bars.length
        ? `<span class="calendar-day-bars" aria-hidden="true">${bars.map((bar) => `
            <span class="badge calendar-day-bar badge-${bar.license}">
              <span class="calendar-day-bar-time">${bar.time}</span>
              <span>${bar.count}</span>
            </span>`).join('')}</span>`
        : '';
      cells.push(`
        <button type="button" class="calendar-day${key === todayKey ? ' is-today' : ''}" data-ab-day="${key}"
          aria-pressed="${key === view.selectedDate}" aria-label="${escapeHtml(label)}">
          <span class="calendar-day-number" aria-hidden="true">${day}</span>${barsHtml}
        </button>`);
    }
    els.grid.innerHTML = cells.join('');
  }

  function renderBooking(booking) {
    const name = displayName(booking.user);
    const bookedBy = booking.bookedBy
      ? `<p class="booking-item-for">${escapeHtml(t('adminBookings.bookedBy', { name: booking.bookedBy.email || displayName(booking.bookedBy) }))}</p>`
      : '';
    const cancel = isCancellable(booking)
      ? `<button type="button" class="icon-button booking-item-cancel" aria-haspopup="dialog" data-ab-cancel="${escapeHtml(booking.id)}"
          aria-label="${escapeHtml(t('adminBookings.cancelLabel', { name }))}" title="${escapeHtml(t('booking.cancel'))}">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#i-trash"></use></svg>
        </button>`
      : '';
    return `
      <article class="booking-item">
        <span class="badge booking-item-license badge-${booking.license}">${escapeHtml(t(`license.${booking.license}`))}</span>
        ${cancel}
        <div class="booking-item-body">
          <p class="booking-item-title">${escapeHtml(name)}</p>
          ${booking.user.email ? `<p class="booking-item-for">${escapeHtml(booking.user.email)}</p>` : ''}
          ${bookedBy}
          ${booking.title ? `<p class="booking-item-note">${escapeHtml(booking.title)}</p>` : ''}
          ${booking.note ? `<p class="booking-item-note">${escapeHtml(booking.note)}</p>` : ''}
        </div>
      </article>`;
  }

  function renderDay(byDate) {
    const key = view.selectedDate;
    const todayBadge = key === todayKey ? ` <span class="badge badge-pro">${escapeHtml(t('adminBookings.today'))}</span>` : '';
    els.date.innerHTML = `${escapeHtml(formatDate(dayDate(key)))}${todayBadge}`;

    const dayBookings = byDate.get(key) || [];
    const groups = SLOT_ORDER
      .map((slotKey) => ({ key: slotKey, bookings: dayBookings.filter((booking) => (booking.slot || OTHER_SLOT) === slotKey) }))
      .filter((group) => group.bookings.length > 0);

    if (groups.length === 0) {
      els.list.innerHTML = `
        <div class="empty-state">
          <svg class="icon" aria-hidden="true"><use href="#i-calendar"></use></svg>
          <p>${escapeHtml(t('adminBookings.noneThisDay'))}</p>
        </div>`;
      return;
    }
    els.list.innerHTML = `<div class="booking-list">${groups.map((group) => `
      <section class="booking-group" aria-labelledby="admin-bookings-slot-${group.key}">
        <h4 id="admin-bookings-slot-${group.key}" class="booking-group-label">${escapeHtml(slotGroupLabel(group.key))}</h4>
        ${group.bookings.map(renderBooking).join('')}
      </section>`).join('')}</div>`;
  }

  function renderFilters() {
    els.license.innerHTML = [
      `<option value="">${escapeHtml(t('adminBookings.allLicenses'))}</option>`,
      ...CALENDAR_LICENSES.map((license) =>
        `<option value="${license}"${license === view.license ? ' selected' : ''}>${escapeHtml(t(`license.${license}`))}</option>`)
    ].join('');
    els.license.value = view.license;
    const legend = view.license ? [view.license] : CALENDAR_LICENSES;
    els.legend.innerHTML = legend.map((license) =>
      `<li><span class="badge badge-${license}">${escapeHtml(t(`license.${license}`))}</span></li>`).join('');
  }

  function render() {
    const byDate = bookingsByDate();
    syncSelectedDate(byDate);
    renderFilters();
    renderCalendar(byDate);
    renderDay(byDate);
  }

  /* ---------- cancel ---------- */

  function renderCancelModal() {
    const booking = findBooking(view.pendingCancelId);
    if (!booking) {
      return;
    }
    els.cancelBody.textContent = t('adminBookings.cancelBody', { name: displayName(booking.user) });
    els.cancelSummary.textContent = `${formatDate(dayDate(booking.dateKey))} · ${slotGroupLabel(booking.slot || OTHER_SLOT)}`;
  }

  function askCancel(id) {
    if (!findBooking(id)) {
      console.error('[admin-bookings] Booking not found for cancel', id);
      toast.error(t('common.error'));
      return;
    }
    view.pendingCancelId = id;
    els.notify.checked = true;
    els.cancelConfirm.disabled = false;
    renderCancelModal();
    openModal(CANCEL_MODAL_ID);
  }

  async function confirmCancel() {
    const booking = findBooking(view.pendingCancelId);
    if (!booking) {
      closeModal(els.cancelModal);
      return;
    }
    const notify = els.notify.checked;
    els.cancelConfirm.disabled = true;
    try {
      await withLoading(() => {
        cancelledIds.add(booking.id);
        toast.success(t(notify ? 'adminBookings.cancelledNotified' : 'booking.cancelled'));
        render();
      });
    } catch (error) {
      console.error('[admin-bookings] Cancelling a booking failed', error);
      toast.error(t('common.error'));
    } finally {
      closeModal(els.cancelModal);
      view.pendingCancelId = null;
    }
  }

  /* ---------- events ---------- */

  function step(months) {
    const start = monthStart();
    const next = new Date(start.getFullYear(), start.getMonth() + months, 1);
    view.month = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
    render();
  }

  function bindEvents() {
    document.querySelectorAll('[data-ab-step]').forEach((button) => {
      button.addEventListener('click', () => step(Number(button.dataset.abStep)));
    });
    els.grid.addEventListener('click', (event) => {
      const day = event.target.closest('[data-ab-day]');
      if (day) {
        view.selectedDate = day.dataset.abDay;
        render();
      }
    });
    els.license.addEventListener('change', () => {
      view.license = els.license.value;
      render();
    });
    els.list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ab-cancel]');
      if (button) {
        askCancel(button.dataset.abCancel);
      }
    });
    els.cancelConfirm.addEventListener('click', confirmCancel);
    els.cancelModal.addEventListener('close', () => {
      view.pendingCancelId = null;
    });
    document.addEventListener(EVENTS.LANG, () => {
      render();
      renderCancelModal();
    });
    document.addEventListener(EVENTS.ROLE, () => closeModal(els.cancelModal));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      title: '[data-ab-title]',
      weekdays: '[data-ab-weekdays]',
      grid: '[data-ab-grid]',
      license: '[data-ab-license]',
      date: '[data-ab-date]',
      list: '[data-ab-list]',
      legend: '[data-ab-legend]',
      cancelModal: `#${CANCEL_MODAL_ID}`,
      cancelBody: '[data-ab-cancel-body]',
      cancelSummary: '[data-ab-cancel-summary]',
      notify: '[data-ab-notify]',
      cancelConfirm: '[data-ab-cancel-confirm]'
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
      console.error('[admin-bookings] Initialisation failed', error);
    }
  });
})();
