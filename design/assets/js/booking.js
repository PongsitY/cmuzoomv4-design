'use strict';

/**
 * 3. ZOOM Booking Center — book a Temp. Pro or Large Meeting license (from the CMU Shared
 * Pool, see manage-users.js) for one day, in one or more time slots, then manage the
 * resulting bookings.
 *
 * A booking is one day + one or more of the fixed 5.5-hour time slots; only one day can be
 * picked per booking. Anyone can book either license for any available day; saving assigns
 * it immediately (no admin approval). Daily capacity mirrors the Shared Pool quotas CMU holds
 * for everyone (Temp. Pro 3, Large Meeting 2) — one booking uses one day of that quota
 * regardless of how many time slots it covers. A day is simply disabled once it's unavailable
 * (full or already booked by the user); once a day is picked, its individual time slots are
 * disabled the same way when a slot itself is unavailable. Other users' bookings are generated
 * deterministically from the day/slot offset so there's a stable mix of open and full days/slots.
 *
 * All data is in-memory (resets on reload).
 */
(function () {
  const { LICENSES, EVENTS, t, formatDate, showToast, openModal, closeModal } = window.App;

  const LICENSE_TEMP_PRO = LICENSES.TEMP_PRO;
  const LICENSE_LARGE_MEETING = 'largeMeeting'; // matches ADDON_LARGE_MEETING / badge-largeMeeting in manage-users.js

  // Shared Pool daily capacity — mirrors CMU's tempPro/largeMeeting quotas in manage-users.js (ORGANIZATIONS).
  const DAILY_CAPACITY = Object.freeze({ [LICENSE_TEMP_PRO]: 3, [LICENSE_LARGE_MEETING]: 2 });

  // Three fixed 5.5-hour slots covering the bookable day, 5:30 AM to 10:00 PM.
  const TIME_SLOTS = Object.freeze([
    Object.freeze({ id: 'morning', startHour: 5, startMinute: 30, endHour: 11, endMinute: 0 }),
    Object.freeze({ id: 'midday', startHour: 11, startMinute: 0, endHour: 16, endMinute: 30 }),
    Object.freeze({ id: 'evening', startHour: 16, startMinute: 30, endHour: 22, endMinute: 0 })
  ]);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const BOOKING_LEAD_DAYS = 1; // earliest bookable day is tomorrow
  const BOOKING_WINDOW_MONTHS = 6; // bookable through the end of the 6th month from today
  const NOTE_MAX_LENGTH = 200;
  // Same locale mapping app.js uses internally for Intl formatting, kept here since it isn't exported.
  const DATE_LOCALES = Object.freeze({ en: 'en-GB', th: 'th-TH' });
  // Fixed "today" — matches manage-users.js's REFERENCE_DATE so the demo data stays consistent
  // across pages and stable between visits.
  const REFERENCE_DATE = new Date(2026, 8, 14);

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const WINDOW_START = addDays(REFERENCE_DATE, BOOKING_LEAD_DAYS);
  // Last day of the 6th month from today (e.g. today in September -> end of March).
  const WINDOW_END = new Date(REFERENCE_DATE.getFullYear(), REFERENCE_DATE.getMonth() + BOOKING_WINDOW_MONTHS + 1, 0);

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function locale() {
    return DATE_LOCALES[window.App.getLang()] || DATE_LOCALES.en;
  }

  function licenseLabel(license) {
    return license === LICENSE_TEMP_PRO ? t('booking.tempProLabel') : t('license.largeMeeting');
  }

  /** Localized "h:mm AM/PM"-style clock time for a fixed hour/minute (locale decides the exact format). */
  function formatClock(hour, minute) {
    const reference = new Date(2000, 0, 1, hour, minute);
    return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(reference);
  }

  function timeSlotById(id) {
    return TIME_SLOTS.find((slot) => slot.id === id);
  }

  function timeSlotLabel(slot) {
    return `${formatClock(slot.startHour, slot.startMinute)} – ${formatClock(slot.endHour, slot.endMinute)}`;
  }

  /** Chronological order, regardless of the order slots were selected in. */
  function sortSlotIds(ids) {
    return TIME_SLOTS.filter((slot) => ids.includes(slot.id)).map((slot) => slot.id);
  }

  /* ---------- mock "other users" availability ---------- */

  function dayIndex(key) {
    return Math.round((parseDateKey(key) - WINDOW_START) / DAY_MS);
  }

  /** Deterministic count of other users already booked on this day, for the given license. */
  function othersBooked(key, license) {
    const capacity = DAILY_CAPACITY[license];
    return dayIndex(key) % (capacity + 1);
  }

  /** Deterministic count of other users already booked in this specific time slot. */
  function othersBookedForSlot(key, license, slotId) {
    const capacity = DAILY_CAPACITY[license];
    const slotIndex = TIME_SLOTS.findIndex((slot) => slot.id === slotId);
    return (dayIndex(key) + slotIndex) % (capacity + 1);
  }

  function isSlotFull(key, license, slotId) {
    return othersBookedForSlot(key, license, slotId) >= DAILY_CAPACITY[license];
  }

  /* ---------- state ---------- */

  // The signed-in demo user's own bookings. Seeded with one of each license so the list isn't empty.
  let nextBookingId = 1;
  const bookings = [
    { id: nextBookingId++, license: LICENSE_TEMP_PRO, dateKey: dateKey(addDays(WINDOW_START, 5)), slots: ['midday'], note: '' },
    { id: nextBookingId++, license: LICENSE_LARGE_MEETING, dateKey: dateKey(addDays(WINDOW_START, 10)), slots: ['morning', 'evening'], note: '' }
  ];

  const view = {
    license: null,
    selectedDate: null,
    selectedSlots: new Set(),
    calendarMonth: new Date(WINDOW_START.getFullYear(), WINDOW_START.getMonth(), 1),
    cancelBookingId: null
  };

  const els = {};

  function userBooking(key, license) {
    return bookings.find((booking) => booking.dateKey === key && booking.license === license);
  }

  /** Licenses still free on this day for a new booking (negative once over-booked, but that can't happen here). */
  function remaining(key, license) {
    return DAILY_CAPACITY[license] - othersBooked(key, license) - (userBooking(key, license) ? 1 : 0);
  }

  /* ---------- rendering: calendar ---------- */

  function isSameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function renderWeekdayHeaders() {
    const formatter = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    // 1 Jan 2023 is a Sunday; used only to read localized weekday abbreviations in order.
    const referenceSunday = new Date(2023, 0, 1);
    const labels = Array.from({ length: 7 }, (_, i) => formatter.format(addDays(referenceSunday, i)));
    els.calWeekdays.innerHTML = labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
  }

  function renderDayButton(date) {
    const key = dateKey(date);
    if (date < WINDOW_START || date > WINDOW_END) {
      return `<button type="button" class="calendar-day" disabled tabindex="-1"><span aria-hidden="true">${date.getDate()}</span></button>`;
    }

    const booked = Boolean(userBooking(key, view.license));
    const full = !booked && remaining(key, view.license) <= 0;
    const disabled = booked || full;
    const selected = !disabled && key === view.selectedDate;
    const stateClass = booked ? ' is-booked' : '';
    // Available days need no extra label; disabled ones say why, for screen reader users.
    const ariaLabel = disabled ? `${formatDate(date)} · ${booked ? t('booking.booked') : t('booking.full')}` : formatDate(date);
    const bookedLabel = booked ? `<span class="calendar-day-label" aria-hidden="true">${escapeHtml(t('booking.booked'))}</span>` : '';

    return `
      <button type="button" class="calendar-day${stateClass}" data-day="${key}" aria-pressed="${selected}" aria-label="${escapeHtml(ariaLabel)}"${disabled ? ' disabled' : ''}>
        <span aria-hidden="true">${date.getDate()}</span>
        ${bookedLabel}
      </button>`;
  }

  function renderCalendar() {
    const hasLicense = Boolean(view.license);
    els.calendar.setAttribute('aria-disabled', String(!hasLicense));
    els.pickLicenseHint.hidden = hasLicense;

    const monthDate = view.calendarMonth;
    els.calTitle.textContent = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(monthDate);
    els.calPrev.disabled = !hasLicense || isSameMonth(monthDate, WINDOW_START);
    els.calNext.disabled = !hasLicense || isSameMonth(monthDate, WINDOW_END);

    renderWeekdayHeaders();
    els.calGrid.innerHTML = '';
    if (!hasLicense) {
      return;
    }

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
      cells.push('<span class="calendar-day-empty" aria-hidden="true"></span>');
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(renderDayButton(new Date(year, month, day)));
    }
    els.calGrid.innerHTML = cells.join('');
  }

  /* ---------- rendering: time slots & note ---------- */

  /** Echoes the day picked in step 2 next to the step 3 label. */
  function renderPickedDateChip() {
    const key = view.selectedDate;
    els.pickedDateChip.hidden = !key;
    els.pickedDateChip.textContent = key ? formatDate(parseDateKey(key)) : '';
  }

  function renderTimeSlots() {
    const hasDate = Boolean(view.selectedDate);
    els.timeSlotPicker.setAttribute('aria-disabled', String(!hasDate));
    els.pickDateHint.hidden = hasDate;
    if (!hasDate) {
      els.timeSlotPicker.innerHTML = '';
      return;
    }
    els.timeSlotPicker.innerHTML = TIME_SLOTS.map((slot) => {
      const full = isSlotFull(view.selectedDate, view.license, slot.id);
      return `
        <label class="time-slot-option">
          <input type="checkbox" data-time-slot="${slot.id}"${view.selectedSlots.has(slot.id) ? ' checked' : ''}${full ? ' disabled' : ''}>
          <span>${escapeHtml(timeSlotLabel(slot))}</span>
        </label>`;
    }).join('');
  }

  function renderNoteCount() {
    els.noteCount.textContent = `${els.noteInput.value.length}/${NOTE_MAX_LENGTH}`;
  }

  function updateSaveButton() {
    const count = view.selectedSlots.size;
    els.saveButton.disabled = !view.license || !view.selectedDate || count === 0;
    els.saveLabel.textContent = count > 1 ? t('booking.saveCount', { count }) : t('booking.save');
  }

  /* ---------- rendering: my bookings ---------- */

  function renderBookingItem(booking) {
    const slotsText = sortSlotIds(booking.slots).map((id) => timeSlotLabel(timeSlotById(id))).join(', ');
    const note = booking.note
      ? `<p class="booking-item-note">${escapeHtml(booking.note)}</p>`
      : '';
    return `
      <div class="booking-item">
        <div class="booking-item-body">
          <span class="booking-item-date">${escapeHtml(formatDate(parseDateKey(booking.dateKey)))}</span>
          <span class="badge badge-${booking.license}">${escapeHtml(licenseLabel(booking.license))}</span>
          <span class="booking-item-slots">${escapeHtml(slotsText)}</span>
          ${note}
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm" data-cancel-booking="${booking.id}">
          <svg class="icon icon-sm" aria-hidden="true"><use href="#i-trash"></use></svg>
          <span>${escapeHtml(t('booking.cancel'))}</span>
        </button>
      </div>`;
  }

  function renderBookingsList() {
    const sorted = [...bookings].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    els.bookingEmpty.hidden = sorted.length > 0;
    els.bookingList.innerHTML = sorted.map(renderBookingItem).join('');
  }

  function render() {
    renderCalendar();
    renderPickedDateChip();
    renderTimeSlots();
    renderNoteCount();
    updateSaveButton();
    renderBookingsList();
  }

  /* ---------- actions ---------- */

  function onLicenseChange(license) {
    view.license = license;
    view.selectedDate = null;
    view.selectedSlots = new Set();
    view.calendarMonth = new Date(WINDOW_START.getFullYear(), WINDOW_START.getMonth(), 1);
    renderCalendar();
    renderPickedDateChip();
    renderTimeSlots();
    updateSaveButton();
  }

  function onDayClick(key) {
    // Only one day can be picked per booking: picking a new day replaces any previous pick
    // (highlighted on the calendar and echoed next to step 3), and clicking the same day
    // again clears it. Time slots reset, since they're per-day.
    view.selectedDate = view.selectedDate === key ? null : key;
    view.selectedSlots = new Set();
    renderCalendar();
    renderPickedDateChip();
    renderTimeSlots();
    updateSaveButton();
  }

  function onSlotToggle(slotId) {
    if (view.selectedSlots.has(slotId)) {
      view.selectedSlots.delete(slotId);
    } else {
      view.selectedSlots.add(slotId);
    }
    updateSaveButton();
  }

  function onSave() {
    const license = view.license;
    const key = view.selectedDate;
    if (!license || !key || view.selectedSlots.size === 0) {
      return;
    }
    // Defensive re-check: guards against the day filling up between selection and save.
    if (!userBooking(key, license) && remaining(key, license) <= 0) {
      showToast(t('booking.dayFull'), 'error');
      view.selectedDate = null;
      view.selectedSlots = new Set();
      render();
      return;
    }

    const slots = sortSlotIds([...view.selectedSlots]);
    const note = els.noteInput.value.trim();
    bookings.push({ id: nextBookingId++, license, dateKey: key, slots, note });

    view.selectedDate = null;
    view.selectedSlots = new Set();
    els.noteInput.value = '';
    render();
    showToast(t('booking.saved', { license: licenseLabel(license), date: formatDate(parseDateKey(key)), count: slots.length }), 'success');
  }

  function onCancelBooking(id) {
    view.cancelBookingId = id;
    openModal('cancel-booking-modal');
  }

  function onConfirmCancelBooking() {
    const index = bookings.findIndex((booking) => booking.id === view.cancelBookingId);
    if (index === -1) {
      console.error('[booking] Booking not found for cancel', view.cancelBookingId);
    } else {
      bookings.splice(index, 1);
      renderBookingsList();
      renderCalendar();
      showToast(t('booking.cancelled'), 'success');
    }
    closeModal(els.cancelModal);
    view.cancelBookingId = null;
  }

  function bindEvents() {
    els.licensePicker.addEventListener('change', (event) => {
      const radio = event.target.closest('[data-license-radio]');
      if (radio) {
        onLicenseChange(radio.value);
      }
    });

    els.calPrev.addEventListener('click', () => {
      view.calendarMonth = addMonths(view.calendarMonth, -1);
      renderCalendar();
    });

    els.calNext.addEventListener('click', () => {
      view.calendarMonth = addMonths(view.calendarMonth, 1);
      renderCalendar();
    });

    els.calGrid.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-day]');
      if (button && !button.disabled) {
        onDayClick(button.dataset.day);
      }
    });

    els.timeSlotPicker.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-time-slot]');
      if (checkbox) {
        onSlotToggle(checkbox.dataset.timeSlot);
      }
    });

    els.noteInput.addEventListener('input', renderNoteCount);
    els.saveButton.addEventListener('click', onSave);

    els.bookingList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cancel-booking]');
      if (button) {
        onCancelBooking(Number(button.dataset.cancelBooking));
      }
    });

    els.confirmCancel.addEventListener('click', onConfirmCancelBooking);

    document.addEventListener(EVENTS.LANG, render);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      pickLicenseHint: '[data-pick-license-hint]',
      licensePicker: '[data-license-picker]',
      calendar: '[data-calendar]',
      calPrev: '[data-cal-prev]',
      calNext: '[data-cal-next]',
      calTitle: '[data-cal-title]',
      calWeekdays: '[data-cal-weekdays]',
      calGrid: '[data-cal-grid]',
      pickDateHint: '[data-pick-date-hint]',
      pickedDateChip: '[data-picked-date]',
      timeSlotPicker: '[data-time-slot-picker]',
      noteInput: '[data-note-input]',
      noteCount: '[data-note-count]',
      saveButton: '[data-save-booking]',
      saveLabel: '[data-save-label]',
      bookingList: '[data-booking-list]',
      bookingEmpty: '[data-booking-empty]',
      cancelModal: '#cancel-booking-modal',
      confirmCancel: '[data-confirm-cancel-booking]'
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
      console.error('[booking] Initialisation failed', error);
    }
  });
})();
