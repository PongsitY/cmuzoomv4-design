'use strict';

/**
 * 3. ZOOM Booking Center — mirrors production app/pages/booking.vue + BookingCalendar.vue.
 *
 * Left: "My bookings", grouped into In use now (Free up now), Upcoming (Cancel) and Past
 * (hidden behind "Show past bookings", then paged 3 at a time). Right: "Book a license" in four
 * gated steps — license, day, time slot(s), details — then a confirm modal.
 *
 * Mock backend: the user's bookings come from MockData.createMyBookings(); availability per
 * day/slot is the Shared Pool quota (MockData.SHARED_POOL_QUOTAS) minus other people's bookings
 * (MockData.createOrgBookings) minus the user's own. Booking for someone else simulates the
 * production 404 for people not in CMU Zoom yet: any address starting with "x" is unknown until
 * added via "Check … from MIS", which fails only for "xnobody".
 *
 * All data is in-memory (resets on reload).
 */
(function () {
  const { EVENTS, t, formatDate, licenseLabel, toast, openModal, closeModal, withLoading } = window.App;
  const MockData = window.MockData;
  const { TIME_SLOTS, SHARED_POOL_QUOTAS, SIGNED_IN_USER, dateKey, parseDateKey, escapeHtml } = MockData;

  const CMU_EMAIL_DOMAIN = '@cmu.ac.th';
  const EMAIL_LOCAL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
  const NOTE_MAX = 200;
  const BOOKING_WINDOW_MONTHS = 6; // through the end of the 6th month ahead
  const PAST_PAGE_SIZE = 3;
  const SKELETON_ROWS = 2;
  // Simulated fetch times for the read skeleton (bookings) and the dimmed calendar (availability).
  const BOOKINGS_LOAD_MS = 600;
  const AVAILABILITY_LOAD_MS = 400;
  // Simulated "not in CMU Zoom yet" (production 404): unknown prefix, and the one MIS lookup that fails.
  const UNKNOWN_USER_PREFIX = 'x';
  const MIS_MISSING_LOCAL_PART = 'xnobody';
  const BOOK_FOR = Object.freeze({ SELF: 'self', OTHER: 'other' });
  const GROUPS = Object.freeze(['current', 'upcoming', 'past']);
  const CONFIRM_MODAL_ID = 'confirm-booking-modal';
  const CANCEL_MODAL_ID = 'cancel-booking-modal';
  const DATE_LOCALES = Object.freeze({ en: 'en-GB', th: 'th-TH' });

  /* ---------- booking window (tomorrow .. end of the 6th month ahead) ---------- */

  const NOW = MockData.mockNow();
  const WINDOW_START = dateKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1));
  // Day 0 of month+7 is the last day of month+6.
  const WINDOW_END = dateKey(new Date(NOW.getFullYear(), NOW.getMonth() + BOOKING_WINDOW_MONTHS + 1, 0));

  /* ---------- helpers ---------- */

  function intlLocale() {
    return DATE_LOCALES[window.App.getLang()] || DATE_LOCALES.en;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function formatDay(key) {
    return formatDate(parseDateKey(key));
  }

  function clock(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /** Production slotLabel(): fixed "05:30 – 11:00" strings, not locale-formatted. */
  function slotLabel(slotId) {
    const slot = TIME_SLOTS.find((item) => item.id === slotId);
    if (!slot) {
      console.error('[booking] Unknown time slot', slotId);
      return slotId;
    }
    return `${clock(slot.startHour, slot.startMinute)} – ${clock(slot.endHour, slot.endMinute)}`;
  }

  /** Chronological order, regardless of the order slots were picked in. */
  function orderSlots(ids) {
    return TIME_SLOTS.filter((slot) => ids.includes(slot.id)).map((slot) => slot.id);
  }

  function icon(name) {
    return `<svg class="icon icon-sm" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  /* ---------- mock backend ---------- */

  const bookings = MockData.createMyBookings(NOW);
  let nextBookingId = Math.max(0, ...bookings.map((booking) => booking.id)) + 1;
  const provisionedEmails = new Set();

  /** Other people's bookings per `license|dateKey|slot`, for every month of the booking window. */
  const othersBySlot = (function buildOthers() {
    const counts = new Map();
    try {
      const usersByOrg = MockData.createUsersByOrg();
      const end = parseDateKey(WINDOW_END);
      for (let month = startOfMonth(parseDateKey(WINDOW_START)); month <= end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
        MockData.createOrgBookings(usersByOrg, month)
          // The user's own bookings are counted live from `bookings` instead.
          .filter((row) => !String(row.id).startsWith('my-'))
          .forEach((row) => {
            const key = `${row.license}|${row.dateKey}|${row.slot}`;
            counts.set(key, (counts.get(key) || 0) + 1);
          });
      }
    } catch (error) {
      console.error('[booking] Unable to build availability', error);
    }
    return counts;
  })();

  /** Licenses still free in one slot (production DayAvailability.slots[].available). */
  function slotAvailable(license, key, slotId) {
    if (!license || key < WINDOW_START || key > WINDOW_END) {
      return 0;
    }
    const others = othersBySlot.get(`${license}|${key}|${slotId}`) || 0;
    const mine = bookings.filter((b) => b.license === license && b.dateKey === key && b.slots.includes(slotId)).length;
    return (SHARED_POOL_QUOTAS[license] || 0) - others - mine;
  }

  function isDayFull(license, key) {
    return TIME_SLOTS.every((slot) => slotAvailable(license, key, slot.id) <= 0);
  }

  function isInCmuZoom(email) {
    return !email.startsWith(UNKNOWN_USER_PREFIX) || provisionedEmails.has(email);
  }

  /* ---------- state ---------- */

  const view = {
    bookingsLoading: true,
    availabilityLoading: false,
    license: null,
    selectedDate: null,
    selectedSlots: [],
    cursor: startOfMonth(parseDateKey(WINDOW_START)),
    bookFor: BOOK_FOR.SELF,
    emailTouched: false,
    missingEmail: null,
    provisioning: false,
    saving: false,
    showPast: false,
    pastLimit: PAST_PAGE_SIZE,
    pendingCancel: null,
    pendingRelease: false,
    cancelling: false
  };

  const els = {};

  /* ---------- my bookings ---------- */

  function firstStart(booking) {
    return Math.min(...booking.windows.map((w) => w.startAt.getTime()));
  }

  function lastEnd(booking) {
    return Math.max(...booking.windows.map((w) => w.endAt.getTime()));
  }

  function bookingGroups() {
    const now = MockData.mockNow();
    const groups = { current: [], upcoming: [], past: [] };
    bookings.forEach((booking) => groups[MockData.bookingPhase(booking, now)].push(booking));
    groups.current.sort((a, b) => firstStart(a) - firstStart(b));
    groups.upcoming.sort((a, b) => firstStart(a) - firstStart(b));
    // Most recent first, so the collapsed list shows the latest past bookings.
    groups.past.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || lastEnd(b) - lastEnd(a));
    return groups;
  }

  function renderSkeleton() {
    const row = `
      <div class="booking-item" aria-hidden="true">
        <div class="booking-item-license"><span class="skeleton skeleton-pill" style="width: 96px" aria-hidden="true"></span></div>
        <span class="skeleton skeleton-circle" style="width: 28px; height: 28px" aria-hidden="true"></span>
        <div class="booking-item-body"><span class="skeleton skeleton-line" style="width: 70%; height: 14px" aria-hidden="true"></span></div>
        <div class="booking-item-when">
          <span class="skeleton skeleton-line" style="width: 30%; height: 10px" aria-hidden="true"></span>
          <span class="skeleton skeleton-line" style="width: 40%; height: 10px" aria-hidden="true"></span>
        </div>
      </div>`;
    return `<div class="booking-list" aria-busy="true">${row.repeat(SKELETON_ROWS)}</div>`;
  }

  function renderActionButton(group, booking) {
    if (group === 'current') {
      const label = escapeHtml(t('releaseBooking.action'));
      return `<button type="button" class="icon-button booking-item-cancel" aria-haspopup="dialog" aria-label="${label}" title="${label}" data-cancel-booking="${booking.id}" data-release>${icon('undo')}</button>`;
    }
    if (group === 'upcoming') {
      const label = escapeHtml(t('booking.cancel'));
      return `<button type="button" class="icon-button booking-item-cancel" aria-haspopup="dialog" aria-label="${label}" title="${label}" data-cancel-booking="${booking.id}">${icon('trash')}</button>`;
    }
    return '';
  }

  function renderBookingItem(group, booking) {
    const past = group === 'past';
    const slots = orderSlots(booking.slots).map(slotLabel).join(', ');
    return `
      <article class="booking-item${past ? ' booking-item-past' : ''}"${past ? ' aria-disabled="true"' : ''}>
        <span class="badge booking-item-license badge-${booking.license}">${escapeHtml(licenseLabel(booking.license))}</span>
        ${renderActionButton(group, booking)}
        <div class="booking-item-body">
          <p class="booking-item-title">${escapeHtml(booking.title)}</p>
        </div>
        <div class="booking-item-when">
          <p class="booking-item-date">${escapeHtml(formatDay(booking.dateKey))}</p>
          <p class="booking-item-slots">${escapeHtml(slots)}</p>
        </div>
      </article>`;
  }

  function renderGroup(group, groups) {
    let html = '';
    if (group === 'past' && groups.past.length) {
      const label = view.showPast ? t('booking.hidePast') : t('booking.showPast', { count: groups.past.length });
      html += `<button type="button" class="link-button booking-show-more" aria-expanded="${view.showPast}" aria-controls="booking-group-past-section" data-toggle-past>${escapeHtml(label)}</button>`;
    }
    if (!groups[group].length || (group === 'past' && !view.showPast)) {
      return html;
    }
    const visible = group === 'past' ? groups.past.slice(0, view.pastLimit) : groups[group];
    const hidden = group === 'past' ? Math.max(0, groups.past.length - view.pastLimit) : 0;
    const more = hidden
      ? `<button type="button" class="link-button booking-show-more" data-show-more-past>${escapeHtml(t('booking.showMore', { count: hidden }))}</button>`
      : '';
    return `${html}
      <section id="booking-group-${group}-section" class="booking-group booking-group-${group}" aria-labelledby="booking-group-${group}">
        <h3 id="booking-group-${group}" class="booking-group-label">${escapeHtml(t(`booking.${group}`))}</h3>
        ${visible.map((booking) => renderBookingItem(group, booking)).join('')}
        ${more}
      </section>`;
  }

  function renderMyBookings() {
    if (view.bookingsLoading) {
      els.myBookings.innerHTML = renderSkeleton();
      return;
    }
    if (!bookings.length) {
      els.myBookings.innerHTML = `
        <div class="empty-state">
          <svg class="icon" aria-hidden="true"><use href="#i-calendar-check"></use></svg>
          <p>${escapeHtml(t('booking.empty'))}</p>
        </div>`;
      return;
    }
    const groups = bookingGroups();
    const noUpcoming = !groups.current.length && !groups.upcoming.length
      ? `<p class="booking-item-note">${escapeHtml(t('booking.noUpcoming'))}</p>`
      : '';
    els.myBookings.innerHTML = `<div class="booking-list">${noUpcoming}${GROUPS.map((group) => renderGroup(group, groups)).join('')}</div>`;
  }

  /* ---------- step 2: calendar (BookingCalendar.vue) ---------- */

  function bookedDates() {
    return bookings.filter((b) => b.license === view.license).map((b) => b.dateKey);
  }

  function dayLabel(key) {
    return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateKey(key));
  }

  function renderDayButton(year, month, day, booked) {
    const key = dateKey(new Date(year, month, day));
    const isBooked = booked.includes(key);
    const outOfWindow = key < WINDOW_START || key > WINDOW_END;
    const full = Boolean(view.license) && !outOfWindow && isDayFull(view.license, key);
    const disabled = outOfWindow || full || isBooked || !view.license;
    const label = isBooked
      ? `${dayLabel(key)} · ${t('booking.booked')}`
      : full ? `${dayLabel(key)} · ${t('booking.full')}` : dayLabel(key);
    const bookedLabel = isBooked
      ? `<span class="calendar-day-label" aria-hidden="true">${escapeHtml(t('booking.booked'))}</span>`
      : '';
    return `<button type="button" class="calendar-day${isBooked ? ' is-booked' : ''}" data-day="${key}"${disabled ? ' disabled' : ''} aria-pressed="${key === view.selectedDate}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${day}</span>${bookedLabel}</button>`;
  }

  function renderCalendar() {
    const hasLicense = Boolean(view.license);
    els.pickLicenseHint.hidden = hasLicense;
    els.calendar.setAttribute('aria-disabled', String(!hasLicense));
    els.availabilityRegion.classList.toggle('is-loading', view.availabilityLoading);
    els.availabilityRegion.setAttribute('aria-busy', String(view.availabilityLoading));

    const cursor = view.cursor;
    els.calTitle.textContent = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(cursor);
    // Paging is limited to the bookable window only (not to the license), as in production.
    els.calPrev.disabled = monthKey(cursor) <= WINDOW_START.slice(0, 7);
    els.calNext.disabled = monthKey(cursor) >= WINDOW_END.slice(0, 7);

    // Weekday initials, starting on Sunday (1 Sep 2024 was a Sunday).
    const weekday = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' });
    els.calWeekdays.innerHTML = Array.from({ length: 7 }, (_, i) => `<span>${escapeHtml(weekday.format(new Date(2024, 8, 1 + i)))}</span>`).join('');

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const blanks = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const booked = bookedDates();
    const cells = Array.from({ length: blanks }, () => '<span class="calendar-day-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(renderDayButton(year, month, day, booked));
    }
    els.calGrid.innerHTML = cells.join('');
  }

  /* ---------- step 3: time slots ---------- */

  function renderTimeSlots() {
    const hasDate = Boolean(view.selectedDate);
    els.pickedDateChip.hidden = !hasDate;
    els.pickedDateChip.textContent = hasDate ? formatDay(view.selectedDate) : '';
    els.pickDateHint.hidden = hasDate;
    els.timeSlotPicker.setAttribute('aria-disabled', String(!hasDate));
    els.timeSlotPicker.classList.toggle('is-loading', view.availabilityLoading);
    els.timeSlotPicker.innerHTML = TIME_SLOTS.map((slot) => {
      const available = hasDate ? slotAvailable(view.license, view.selectedDate, slot.id) : 0;
      const checked = view.selectedSlots.includes(slot.id);
      return `
        <label class="time-slot-option"${hasDate ? '' : ' style="display: none;"'}>
          <input type="checkbox" data-time-slot="${slot.id}"${checked ? ' checked' : ''}${available <= 0 ? ' disabled' : ''}>
          <span>${escapeHtml(slotLabel(slot.id))}</span>
        </label>`;
    }).join('');
  }

  /* ---------- step 4: details ---------- */

  function emailLocalPart() {
    return els.emailInput.value.trim();
  }

  function onBehalfEmail() {
    return `${emailLocalPart().toLowerCase()}${CMU_EMAIL_DOMAIN}`;
  }

  /** Production emailError: shown only once the field has been blurred. */
  function emailError() {
    if (view.bookFor !== BOOK_FOR.OTHER || !view.emailTouched) {
      return null;
    }
    const value = emailLocalPart();
    if (!value || !EMAIL_LOCAL_PATTERN.test(value)) {
      return t('booking.emailInvalid');
    }
    if (onBehalfEmail() === SIGNED_IN_USER.email.toLowerCase()) {
      return t('booking.emailSelf');
    }
    return null;
  }

  function detailsValid() {
    if (!els.titleInput.value.trim()) {
      return false;
    }
    if (view.bookFor === BOOK_FOR.SELF) {
      return true;
    }
    return EMAIL_LOCAL_PATTERN.test(emailLocalPart()) && onBehalfEmail() !== SIGNED_IN_USER.email.toLowerCase();
  }

  function canSave() {
    return Boolean(view.license && view.selectedDate) && view.selectedSlots.length > 0 && detailsValid();
  }

  function renderDetails() {
    els.emailField.hidden = view.bookFor !== BOOK_FOR.OTHER;
    const error = emailError();
    const message = error || (view.missingEmail ? t('booking.userNotFound') : '');
    els.emailError.hidden = !message;
    els.emailError.textContent = message;
    const showProvision = !error && Boolean(view.missingEmail);
    els.provisionButton.hidden = !showProvision;
    els.provisionButton.disabled = view.provisioning;
    els.provisionButton.textContent = showProvision ? t('provision.add', { email: view.missingEmail }) : '';
    els.noteCount.textContent = `${els.noteInput.value.length}/${NOTE_MAX}`;
  }

  function renderSaveButton() {
    const count = view.selectedSlots.length;
    els.saveButton.disabled = !canSave();
    els.saveLabel.textContent = count > 1 ? t('booking.saveCount', { count }) : t('booking.save');
  }

  /* ---------- confirm modal ---------- */

  function summary() {
    return {
      license: view.license ? licenseLabel(view.license) : '',
      date: view.selectedDate ? formatDay(view.selectedDate) : '',
      slots: orderSlots(view.selectedSlots).map(slotLabel).join(', '),
      bookedFor: view.bookFor === BOOK_FOR.SELF ? t('confirmBooking.self') : onBehalfEmail(),
      title: els.titleInput.value.trim(),
      notes: els.noteInput.value.trim() || t('confirmBooking.noNote')
    };
  }

  function renderConfirmSummary() {
    const s = summary();
    const badge = view.license ? `<span class="badge badge-${view.license}">${escapeHtml(s.license)}</span>` : '';
    const rows = [
      ['confirmBooking.license', badge],
      ['confirmBooking.date', escapeHtml(s.date)],
      ['confirmBooking.timeSlots', escapeHtml(s.slots)],
      ['confirmBooking.bookedFor', escapeHtml(s.bookedFor)],
      ['confirmBooking.bookingTitle', escapeHtml(s.title)],
      ['confirmBooking.note', escapeHtml(s.notes)]
    ];
    els.confirmSummary.innerHTML = rows.map(([key, value]) => `<dt>${escapeHtml(t(key))}</dt><dd>${value}</dd>`).join('');
    els.confirmBooking.disabled = view.saving;
  }

  /* ---------- cancel / release modal ---------- */

  function renderCancelModal() {
    const release = view.pendingRelease;
    const license = view.pendingCancel ? licenseLabel(view.pendingCancel.license) : '';
    els.cancelIcon.setAttribute('href', release ? '#i-undo' : '#i-trash');
    els.cancelTitle.textContent = release ? t('releaseBooking.title') : t('cancelBooking.title');
    els.cancelBody.textContent = release ? t('releaseBooking.body', { license }) : t('cancelBooking.body');
    els.confirmCancel.textContent = release ? t('releaseBooking.confirm') : t('cancelBooking.confirm');
    els.confirmCancel.disabled = view.cancelling;
  }

  /* ---------- render ---------- */

  function renderForm() {
    renderCalendar();
    renderTimeSlots();
    renderDetails();
    renderSaveButton();
  }

  function render() {
    renderMyBookings();
    renderForm();
  }

  /* ---------- actions ---------- */

  /** Picking a license invalidates the day and slots beneath it and reloads its availability. */
  function onLicenseChange(license) {
    view.license = license;
    view.selectedDate = null;
    view.selectedSlots = [];
    view.availabilityLoading = true;
    renderForm();
    window.setTimeout(() => {
      view.availabilityLoading = false;
      renderForm();
    }, AVAILABILITY_LOAD_MS);
  }

  function onDayClick(key) {
    view.selectedDate = key;
    view.selectedSlots = [];
    renderForm();
  }

  function onSlotToggle(slotId) {
    view.selectedSlots = view.selectedSlots.includes(slotId)
      ? view.selectedSlots.filter((id) => id !== slotId)
      : [...view.selectedSlots, slotId];
    renderSaveButton();
  }

  function resetForm() {
    view.license = null;
    view.selectedDate = null;
    view.selectedSlots = [];
    view.bookFor = BOOK_FOR.SELF;
    view.emailTouched = false;
    view.missingEmail = null;
    els.licenseRadios.forEach((radio) => { radio.checked = false; });
    els.bookForRadios.forEach((radio) => { radio.checked = radio.value === BOOK_FOR.SELF; });
    els.emailInput.value = '';
    els.titleInput.value = '';
    els.noteInput.value = '';
  }

  function onSave() {
    if (!canSave()) {
      return;
    }
    renderConfirmSummary();
    openModal(CONFIRM_MODAL_ID);
  }

  async function onConfirmBooking() {
    if (!canSave() || view.saving) {
      return;
    }
    const s = summary();
    const forOther = view.bookFor === BOOK_FOR.OTHER;
    const email = forOther ? onBehalfEmail() : null;
    view.saving = true;
    els.confirmBooking.disabled = true;
    try {
      // Mock POST /api/bookings: 404 when the on-behalf person is not in CMU Zoom yet.
      const result = await withLoading(() => {
        if (forOther && !isInCmuZoom(email)) {
          return { ok: false, notFound: true };
        }
        const slots = orderSlots(view.selectedSlots);
        bookings.push({
          id: nextBookingId++,
          license: view.license,
          dateKey: view.selectedDate,
          slots,
          title: s.title,
          note: els.noteInput.value.trim(),
          bookedFor: email,
          bookedForUser: null,
          bookedBy: SIGNED_IN_USER,
          createdAt: MockData.mockNow(),
          windows: slots.map((slotId) => MockData.slotWindow(view.selectedDate, slotId))
        });
        return { ok: true, count: slots.length };
      });
      if (result.ok) {
        toast.success(t('booking.saved', { license: s.license, date: s.date, count: result.count }));
        resetForm();
      } else if (result.notFound) {
        // Not in CMU Zoom yet: say so beside the field and offer to add them.
        view.missingEmail = s.bookedFor;
      }
    } catch (error) {
      console.error('[booking] Save failed', error);
      toast.error(t('common.error'));
    } finally {
      view.saving = false;
      closeModal(els.confirmModal);
      render();
    }
  }

  /** "Check {email} from MIS": adding the person does not resubmit; the user saves again. */
  async function onProvision() {
    const email = view.missingEmail;
    if (!email || view.provisioning) {
      return;
    }
    view.provisioning = true;
    renderDetails();
    try {
      const found = await withLoading(() => email !== `${MIS_MISSING_LOCAL_PART}${CMU_EMAIL_DOMAIN}`);
      if (found) {
        provisionedEmails.add(email);
        toast.success(t('provision.success', { email }));
        view.missingEmail = null;
      } else {
        console.error('[provision] failed for', email);
        toast.error(t('provision.notFound', { email }));
      }
    } catch (error) {
      console.error('[provision] failed for', email, error);
      toast.error(t('common.error'));
    } finally {
      view.provisioning = false;
      renderDetails();
    }
  }

  function askCancel(id, release) {
    const booking = bookings.find((b) => b.id === id);
    if (!booking) {
      console.error('[booking] Booking not found', id);
      return;
    }
    view.pendingCancel = booking;
    view.pendingRelease = release;
    renderCancelModal();
    openModal(CANCEL_MODAL_ID);
  }

  async function onConfirmCancel() {
    const booking = view.pendingCancel;
    if (!booking || view.cancelling) {
      return;
    }
    const release = view.pendingRelease;
    view.cancelling = true;
    els.confirmCancel.disabled = true;
    try {
      // Mock DELETE /api/bookings: a release always frees the license right away here.
      const result = await withLoading(() => {
        const index = bookings.indexOf(booking);
        if (index === -1) {
          throw new Error(`Booking ${booking.id} not found`);
        }
        bookings.splice(index, 1);
        return { released: release };
      });
      if (!release) {
        toast.success(t('booking.cancelled'));
      } else {
        toast.success(result.released ? t('releaseBooking.released') : t('releaseBooking.releasedLater'));
      }
    } catch (error) {
      console.error('[booking] Cancel failed', error);
      toast.error(t('common.error'));
    } finally {
      view.cancelling = false;
      closeModal(els.cancelModal);
      view.pendingCancel = null;
      view.pendingRelease = false;
      render();
    }
  }

  function stepMonth(months) {
    view.cursor = new Date(view.cursor.getFullYear(), view.cursor.getMonth() + months, 1);
    renderCalendar();
  }

  function bindEvents() {
    els.licensePicker.addEventListener('change', (event) => {
      const radio = event.target.closest('[data-license-radio]');
      if (radio) {
        onLicenseChange(radio.value);
      }
    });
    els.calPrev.addEventListener('click', () => stepMonth(-1));
    els.calNext.addEventListener('click', () => stepMonth(1));
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
    els.bookForGroup.addEventListener('change', (event) => {
      const radio = event.target.closest('[data-book-for]');
      if (!radio) {
        return;
      }
      view.bookFor = radio.value === BOOK_FOR.OTHER ? BOOK_FOR.OTHER : BOOK_FOR.SELF;
      view.missingEmail = null;
      renderDetails();
      renderSaveButton();
    });
    els.emailInput.addEventListener('input', () => {
      view.missingEmail = null;
      renderDetails();
      renderSaveButton();
    });
    els.emailInput.addEventListener('blur', () => {
      view.emailTouched = true;
      renderDetails();
    });
    els.provisionButton.addEventListener('click', onProvision);
    els.titleInput.addEventListener('input', renderSaveButton);
    els.noteInput.addEventListener('input', renderDetails);
    els.saveButton.addEventListener('click', onSave);
    els.confirmBooking.addEventListener('click', onConfirmBooking);
    els.confirmCancel.addEventListener('click', onConfirmCancel);

    els.myBookings.addEventListener('click', (event) => {
      const cancel = event.target.closest('[data-cancel-booking]');
      if (cancel) {
        askCancel(Number(cancel.dataset.cancelBooking), cancel.hasAttribute('data-release'));
        return;
      }
      if (event.target.closest('[data-toggle-past]')) {
        view.showPast = !view.showPast;
        view.pastLimit = PAST_PAGE_SIZE;
        renderMyBookings();
        return;
      }
      if (event.target.closest('[data-show-more-past]')) {
        view.pastLimit += PAST_PAGE_SIZE;
        renderMyBookings();
      }
    });

    document.addEventListener(EVENTS.LANG, () => {
      render();
      if (els.confirmModal.open) {
        renderConfirmSummary();
      }
      if (els.cancelModal.open) {
        renderCancelModal();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const selectors = {
      myBookings: '[data-my-bookings]',
      licensePicker: '[data-license-picker]',
      pickLicenseHint: '[data-pick-license-hint]',
      availabilityRegion: '[data-availability-region]',
      calendar: '[data-calendar]',
      calPrev: '[data-cal-prev]',
      calNext: '[data-cal-next]',
      calTitle: '[data-cal-title]',
      calWeekdays: '[data-cal-weekdays]',
      calGrid: '[data-cal-grid]',
      pickDateHint: '[data-pick-date-hint]',
      pickedDateChip: '[data-picked-date]',
      timeSlotPicker: '[data-time-slot-picker]',
      bookForGroup: '[data-book-for-group]',
      emailField: '[data-email-field]',
      emailInput: '[data-email-input]',
      emailError: '[data-email-error]',
      provisionButton: '[data-provision]',
      titleInput: '[data-title-input]',
      noteInput: '[data-note-input]',
      noteCount: '[data-note-count]',
      saveButton: '[data-save-booking]',
      saveLabel: '[data-save-label]',
      confirmModal: `#${CONFIRM_MODAL_ID}`,
      confirmSummary: '[data-booking-summary]',
      confirmBooking: '[data-confirm-booking]',
      cancelModal: `#${CANCEL_MODAL_ID}`,
      cancelIcon: '[data-cancel-icon]',
      cancelTitle: '[data-cancel-title]',
      cancelBody: '[data-cancel-body]',
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
      els.licenseRadios = [...els.licensePicker.querySelectorAll('[data-license-radio]')];
      els.bookForRadios = [...els.bookForGroup.querySelectorAll('[data-book-for]')];
      bindEvents();
      render();
      // Mock GET /api/bookings: skeleton first, as production's lazy fetch does.
      window.setTimeout(() => {
        view.bookingsLoading = false;
        renderMyBookings();
      }, BOOKINGS_LOAD_MS);
    } catch (error) {
      console.error('[booking] Initialisation failed', error);
    }
  });
})();
