'use strict';

/**
 * Mock organizations, users, admins, bookings and action logs shared by the prototype pages.
 * Loaded after app.js. Each page builds its own copy (in-memory, resets on reload).
 *
 * License ownership:
 * - Every organization (CMU included) holds its own Pro quota.
 * - The CMU organization additionally holds the Shared Pool quotas on behalf of everyone:
 *   Temporary Pro, Large Meeting, Reserved Pro (for Large Meeting) and Emergency Pro.
 * - Main licenses are mutually exclusive: Basic, Pro, Temporary Pro or Emergency Pro.
 *   Large Meeting is an add-on; a Large Meeting holder with no main license uses a Reserved Pro.
 *
 * Shapes mirror production's shared/types/ui.ts where it has one (UiUser, UiBooking,
 * AdminBooking, ActionLogEntry); field names are noted where the prototype differs.
 */
(function () {
  const { LICENSES } = window.App;

  const ADDON_LARGE_MEETING = LICENSES.LARGE_MEETING;
  // Quota only (never held by a user directly): one Pro is reserved for each Large Meeting holder
  // who has no main license of their own.
  const RESERVED_PRO = LICENSES.RESERVED_PRO;
  const CMU_ORG_ID = 'cmu';
  // The signed-in demo user (shown on profile.html) is an admin of the Faculty of Engineering.
  const SIGNED_IN_USER = Object.freeze({
    name: 'Anong Srisuk',
    nameTh: 'อนงค์ ศรีสุข',
    email: 'anong.s@cmu.ac.th',
    orgId: 'eng',
    accountType: 'Teacher'
  });
  // Above the 20-row default page size, so the pagination footer is visible.
  const USERS_PER_ORG = 45;
  const LAST_USE_WINDOW_DAYS = 45;
  // How long ago a user's license row was created (mock USER_LICENSE.created_at), 1..N days.
  const LICENSE_AGE_WINDOW_DAYS = 40;
  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  // Fixed "today" keeps the generated demo data stable between visits.
  const REFERENCE_DATE = new Date(2026, 8, 14);
  // Pro expiration interval for organizations that declare none (manage-users.js DEFAULT_EXPIRY_DAYS).
  const DEFAULT_PRO_EXPIRY_DAYS = 60;
  // Production `PRO_EXPIRY_DAYS` value meaning "never expires".
  const PRO_EXPIRY_NEVER = 0;
  // Emergency Pro lasts `sharedExpiry.emergPro` from assignment (production licenses/index.post.ts).
  const EMERGENCY_PRO_DURATION_DAYS = 7;
  // The seeded Emergency Pro was assigned this long ago, so it shows "Expires in 3 days" (warning tone).
  const EMERGENCY_PRO_SEED_AGE_DAYS = 4;

  // Fixed booking time slots (5:30 AM to 10:00 PM), shared by the Booking Center and by the expiry of
  // Shared Pool licenses: Temporary Pro / Large Meeting expire at the next slot boundary after assignment.
  const TIME_SLOTS = Object.freeze([
    Object.freeze({ id: 'morning', startHour: 5, startMinute: 30, endHour: 11, endMinute: 0 }),
    Object.freeze({ id: 'midday', startHour: 11, startMinute: 0, endHour: 16, endMinute: 30 }),
    Object.freeze({ id: 'evening', startHour: 16, startMinute: 30, endHour: 22, endMinute: 0 })
  ]);
  const SLOT_BOUNDARIES = Object.freeze(
    [...new Set(TIME_SLOTS.flatMap((slot) => [
      slot.startHour * 60 + slot.startMinute,
      slot.endHour * 60 + slot.endMinute
    ]))].sort((a, b) => a - b)
  );

  // Mock license distribution: every 2nd user gets Pro while the org quota allows.
  const PRO_EVERY = 2;
  // Users (by generated id) who currently hold CMU-held licenses; kept below the CMU quotas
  // so assigning can still be demoed. eng-0 is the signed-in admin, Anong Srisuk (Pro + Large Meeting).
  // ou-7 has no main license, so their Large Meeting takes a Reserved Pro.
  const CMU_LOANS = Object.freeze({
    tempPro: Object.freeze(['ou-1', 'eng-1']),
    largeMeeting: Object.freeze(['eng-0', 'ou-7']),
    emergencyPro: Object.freeze(['med-3'])
  });

  // Organization admins (by generated user id). eng-0 is the signed-in admin, Anong Srisuk.
  const ADMIN_SEED = Object.freeze({
    cmu: Object.freeze(['cmu-0']),
    ou: Object.freeze(['ou-0', 'ou-3']),
    med: Object.freeze(['med-0']),
    eng: Object.freeze(['eng-0', 'eng-4']),
    hum: Object.freeze(['hum-0'])
  });

  // Usage log generation
  const USAGE_WINDOW_DAYS = 30;
  const MAX_MEETINGS = 8;
  const MAX_DAY_GAP = 4;
  const WORK_DAY_START_HOUR = 8;
  const WORK_HOURS = 9;
  const HALF_HOUR = 30;
  const BASIC_MAX_MINUTES = 40;
  const DURATION_STEPS = [15, 30, 45, 60, 90, 120];
  const PARTICIPANT_STEPS = [2, 4, 7, 12, 18, 25, 40, 65];

  // Each organization holds a Pro quota; CMU also holds the Shared Pool quotas for everyone.
  // `seed` keeps each organization's generated mock data stable regardless of list order.
  const ORGANIZATIONS = Object.freeze([
    {
      id: CMU_ORG_ID,
      seed: 4,
      name: { en: 'CMU', th: 'CMU' },
      quotas: { pro: 28, tempPro: 3, largeMeeting: 3, reservedPro: 2, emergencyPro: 2 }
    },
    { id: 'ou', seed: 0, name: { en: 'Office of the University', th: 'สำนักงานมหาวิทยาลัย' }, quotas: { pro: 30 } },
    { id: 'med', seed: 1, name: { en: 'Faculty of Medicine', th: 'คณะแพทยศาสตร์' }, quotas: { pro: 40 }, expiryDays: 90 },
    { id: 'eng', seed: 2, name: { en: 'Faculty of Engineering', th: 'คณะวิศวกรรมศาสตร์' }, quotas: { pro: 25 } },
    { id: 'hum', seed: 3, name: { en: 'Faculty of Humanities', th: 'คณะมนุษยศาสตร์' }, quotas: { pro: 6 }, expiryDays: 30 }
  ]);
  const SHARED_POOL_QUOTAS = ORGANIZATIONS.find((org) => org.id === CMU_ORG_ID).quotas;

  // Same index in each pair of lists = the same person's English / Thai name.
  const FIRST_NAMES = ['Nareerat', 'Somchai', 'Kanya', 'Nattapong', 'Pimchanok', 'Thanawat', 'Supaporn', 'Kittisak', 'Wilaiwan', 'Chaiwat', 'Siriporn', 'Pongsakorn', 'Rattana', 'Apichat', 'Duangjai', 'Teerapat', 'Jiraporn', 'Worawut', 'Malee', 'Sakda'];
  const FIRST_NAMES_TH = ['นารีรัตน์', 'สมชาย', 'กันยา', 'ณัฐพงศ์', 'พิมพ์ชนก', 'ธนวัฒน์', 'สุภาพร', 'กิตติศักดิ์', 'วิไลวรรณ', 'ชัยวัฒน์', 'ศิริพร', 'พงศกร', 'รัตนา', 'อภิชาติ', 'ดวงใจ', 'ธีรภัทร', 'จิราพร', 'วรวุฒิ', 'มาลี', 'ศักดา'];
  const LAST_NAMES = ['Srisuk', 'Kaewmanee', 'Boonmee', 'Chaiyaporn', 'Thongdee', 'Wongsawat', 'Inthapan', 'Saengchai', 'Phrommin', 'Rattanakul', 'Jantarasri', 'Kongkaew', 'Suwannarat', 'Panyawong', 'Yodsuwan', 'Meechai', 'Sangthong', 'Kaewkham', 'Prasertsin', 'Nakprasit'];
  const LAST_NAMES_TH = ['ศรีสุข', 'แก้วมณี', 'บุญมี', 'ชัยพร', 'ทองดี', 'วงศ์สวัสดิ์', 'อินทะพันธ์', 'แสงชัย', 'พรหมมินทร์', 'รัตนกุล', 'จันทรศรี', 'ก้องแก้ว', 'สุวรรณรัตน์', 'ปัญญาวงศ์', 'ยอดสุวรรณ', 'มีชัย', 'แสงทอง', 'แก้วคำ', 'ประเสริฐสิน', 'นาคประสิทธิ์'];
  // Past the 20 first names the same first name comes round again; shift the last name so pairs differ.
  const NAME_CYCLE_SHIFT = 7;

  // Production account types (MIS `itaccounttype`); labels at i18n `accountType.<value>`.
  const ACCOUNT_TYPES = Object.freeze({ TEACHER: 'Teacher', EMPLOYEE: 'Employee', STUDENT: 'Student', ORG: 'Org' });
  // Weighted mix: mostly lecturers and staff, a few students and organization accounts.
  const ACCOUNT_TYPE_MIX = Object.freeze([
    ACCOUNT_TYPES.TEACHER, ACCOUNT_TYPES.TEACHER, ACCOUNT_TYPES.TEACHER, ACCOUNT_TYPES.TEACHER, ACCOUNT_TYPES.TEACHER,
    ACCOUNT_TYPES.EMPLOYEE, ACCOUNT_TYPES.EMPLOYEE, ACCOUNT_TYPES.EMPLOYEE, ACCOUNT_TYPES.STUDENT, ACCOUNT_TYPES.ORG
  ]);
  // Mock backend account ids (the Action Log's "Account ID" column): ACCOUNT_ID_BASE + seed * 100 + index.
  const ACCOUNT_ID_BASE = 10000;
  const ACCOUNT_ID_ORG_STRIDE = 100;

  /* ---------- generators ---------- */

  /**
   * Deterministic pseudo-random pick so every org gets a different but stable mix.
   * @param {number} orgIndex
   * @param {number} userIndex
   * @param {number} salt
   * @param {number} modulo
   */
  function spread(orgIndex, userIndex, salt, modulo) {
    return (orgIndex * salt + userIndex * (salt + 2)) % modulo;
  }

  /**
   * Meetings in the last 30 days, newest first. The newest one falls on the user's last-use day.
   * @param {number} orgIndex
   * @param {number} userIndex
   * @param {number|null} lastUseDaysAgo
   * @param {string} license
   */
  function buildUsageLog(orgIndex, userIndex, lastUseDaysAgo, license) {
    if (lastUseDaysAgo === null || lastUseDaysAgo >= USAGE_WINDOW_DAYS) {
      return [];
    }
    const count = 1 + spread(orgIndex, userIndex, 5, MAX_MEETINGS);
    const log = [];
    let daysAgo = lastUseDaysAgo;
    for (let n = 0; n < count && daysAgo < USAGE_WINDOW_DAYS; n += 1) {
      const seed = orgIndex * 31 + userIndex * 17 + n * 7;
      const start = new Date(REFERENCE_DATE.getTime() - daysAgo * DAY_MS);
      start.setHours(WORK_DAY_START_HOUR + (seed % WORK_HOURS), (seed % 2) * HALF_HOUR, 0, 0);
      const minutes = DURATION_STEPS[seed % DURATION_STEPS.length];
      log.push({
        start,
        // Basic accounts are cut off at 40 minutes by Zoom.
        minutes: license === LICENSES.BASIC ? Math.min(minutes, BASIC_MAX_MINUTES) : minutes,
        participants: PARTICIPANT_STEPS[(seed * 3) % PARTICIPANT_STEPS.length]
      });
      daysAgo += 1 + (seed % MAX_DAY_GAP);
    }
    return log;
  }

  /** The main license: Emergency Pro / Temporary Pro loans first, then Pro while the org quota allows. */
  function pickLicense(org, userId, userIndex, orgProAssigned) {
    if (CMU_LOANS.emergencyPro.includes(userId)) {
      return LICENSES.EMERGENCY_PRO;
    }
    if (CMU_LOANS.tempPro.includes(userId)) {
      return LICENSES.TEMP_PRO;
    }
    if (userIndex % PRO_EVERY === 0 && orgProAssigned < org.quotas.pro) {
      return LICENSES.PRO;
    }
    return LICENSES.BASIC;
  }

  /** The mock "now": the fixed demo date with the real time of day, so slot countdowns stay live. */
  function mockNow() {
    const real = new Date();
    return new Date(
      REFERENCE_DATE.getFullYear(), REFERENCE_DATE.getMonth(), REFERENCE_DATE.getDate(),
      real.getHours(), real.getMinutes(), real.getSeconds()
    );
  }

  /** The first time slot boundary strictly after `date` (the next day's first one after the last slot). */
  function nextSlotBoundary(date) {
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const boundary = SLOT_BOUNDARIES.find((value) => value > minutes);
    const dayOffset = boundary === undefined ? 1 : 0;
    const target = boundary === undefined ? SLOT_BOUNDARIES[0] : boundary;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, 0, target);
  }

  /** @param {Date} date @returns {object|undefined} the time slot `date` falls in */
  function slotAt(date) {
    const minutes = date.getHours() * 60 + date.getMinutes();
    return TIME_SLOTS.find((item) => minutes >= item.startHour * 60 + item.startMinute && minutes < item.endHour * 60 + item.endMinute);
  }

  /** Seeded loans were handed out when the current slot began, so they always run to its end. */
  function seedAssignedAt() {
    const now = mockNow();
    const slot = slotAt(now);
    if (!slot) {
      return now;
    }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.startHour, slot.startMinute);
  }

  /** @param {Date} date @returns {string} local YYYY-MM-DD */
  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** @param {string} key YYYY-MM-DD @returns {Date} local midnight */
  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /** @param {string} key YYYY-MM-DD @param {string} slotId @returns {{startAt: Date, endAt: Date}} */
  function slotWindow(key, slotId) {
    const slot = TIME_SLOTS.find((item) => item.id === slotId);
    const day = parseDateKey(key);
    return {
      startAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.startHour, slot.startMinute),
      endAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.endHour, slot.endMinute)
    };
  }

  /**
   * CMU-style address, unique within the generated data: firstname.l, then more letters of the
   * last name on a clash (firstname.la, …), then a numeric suffix.
   */
  function uniqueEmail(first, last, taken) {
    const firstPart = first.toLowerCase();
    const lastPart = last.toLowerCase();
    const candidates = Array.from({ length: lastPart.length }, (_, n) => `${firstPart}.${lastPart.slice(0, n + 1)}@cmu.ac.th`);
    let email = candidates.find((candidate) => !taken.has(candidate));
    for (let n = 2; !email; n += 1) {
      const numbered = `${firstPart}.${lastPart.charAt(0)}${n}@cmu.ac.th`;
      email = taken.has(numbered) ? null : numbered;
    }
    taken.add(email);
    return email;
  }

  function buildUsers(org, takenEmails) {
    const orgIndex = org.seed;
    let orgProAssigned = 0;
    return Array.from({ length: USERS_PER_ORG }, (_, i) => {
      const firstIndex = spread(orgIndex, i, 7, FIRST_NAMES.length);
      const lastIndex = (spread(orgIndex, i, 11, LAST_NAMES.length) + Math.floor(i / FIRST_NAMES.length) * NAME_CYCLE_SHIFT) % LAST_NAMES.length;
      const first = FIRST_NAMES[firstIndex];
      const last = LAST_NAMES[lastIndex];

      const userId = `${org.id}-${i}`;
      const license = pickLicense(org, userId, i, orgProAssigned);
      if (license === LICENSES.PRO) {
        orgProAssigned += 1;
      }
      // Large Meeting comes with its own reserved Pro, so any user can hold it.
      const largeMeeting = CMU_LOANS.largeMeeting.includes(userId);

      const neverUsed = spread(orgIndex, i, 3, 6) === 5;
      const daysAgo = neverUsed ? null : spread(orgIndex, i, 13, LAST_USE_WINDOW_DAYS);
      // The license is always older than the user's last use.
      const licenseAgeDays = Math.max(1 + spread(orgIndex, i, 19, LICENSE_AGE_WINDOW_DAYS), (daysAgo ?? 0) + 1);
      const isSignedInUser = org.id === SIGNED_IN_USER.orgId && i === 0;
      const emergencyAssignedAt = new Date(seedAssignedAt().getTime() - EMERGENCY_PRO_SEED_AGE_DAYS * DAY_MS);

      return {
        id: userId,
        orgId: org.id,
        accountId: String(ACCOUNT_ID_BASE + orgIndex * ACCOUNT_ID_ORG_STRIDE + i),
        name: isSignedInUser ? SIGNED_IN_USER.name : `${first} ${last}`,
        nameTh: isSignedInUser ? SIGNED_IN_USER.nameTh : `${FIRST_NAMES_TH[firstIndex]} ${LAST_NAMES_TH[lastIndex]}`,
        email: isSignedInUser
          ? SIGNED_IN_USER.email
          : uniqueEmail(first, last, takenEmails),
        accountType: isSignedInUser ? SIGNED_IN_USER.accountType : ACCOUNT_TYPE_MIX[spread(orgIndex, i, 23, ACCOUNT_TYPE_MIX.length)],
        lastUse: daysAgo === null ? null : new Date(REFERENCE_DATE.getTime() - daysAgo * DAY_MS),
        // Mock USER_LICENSE.created_at: what the Pro expiration is counted from when the user never used it.
        licenseCreatedAt: new Date(REFERENCE_DATE.getTime() - licenseAgeDays * DAY_MS),
        license,
        largeMeeting,
        // When each Shared Pool license (tempPro / largeMeeting / emergencyPro) was assigned; drives its expiry.
        assignedAt: {
          ...(license === LICENSES.TEMP_PRO ? { [LICENSES.TEMP_PRO]: seedAssignedAt() } : {}),
          ...(license === LICENSES.EMERGENCY_PRO ? { [LICENSES.EMERGENCY_PRO]: emergencyAssignedAt } : {}),
          ...(largeMeeting ? { [ADDON_LARGE_MEETING]: seedAssignedAt() } : {})
        },
        // Stored expiry dates (production `*_expires_at`); Emergency Pro always has one.
        expiresAt: {
          ...(license === LICENSES.EMERGENCY_PRO
            ? { [LICENSES.EMERGENCY_PRO]: new Date(emergencyAssignedAt.getTime() + EMERGENCY_PRO_DURATION_DAYS * DAY_MS) }
            : {})
        },
        usageLog: buildUsageLog(orgIndex, i, daysAgo, license)
      };
    });
  }

  /** @returns {Map<string, object[]>} fresh users per organization id */
  function createUsersByOrg() {
    const takenEmails = new Set([SIGNED_IN_USER.email]);
    return new Map(ORGANIZATIONS.map((org) => [org.id, buildUsers(org, takenEmails)]));
  }

  /** @returns {Map<string, Set<string>>} fresh admin user ids per organization id */
  function createAdminsByOrg() {
    return new Map(ORGANIZATIONS.map((org) => [org.id, new Set(ADMIN_SEED[org.id] || [])]));
  }

  /* ---------- license expiry (production server/utils/licenseExpiry.ts) ---------- */

  /** @param {string} orgId @returns {number} days; PRO_EXPIRY_NEVER (0) = never */
  function proExpiryDays(orgId) {
    const org = ORGANIZATIONS.find((item) => item.id === orgId);
    return org && org.expiryDays !== undefined ? org.expiryDays : DEFAULT_PRO_EXPIRY_DAYS;
  }

  /**
   * When each license a user holds lapses: a Date, 'never', or null (not held / no end).
   * Pass the result's values straight to App.formatExpiry().
   * - Pro: the org's interval of disuse, counted from last use (or assignment if never used); 0 = never.
   * - Temporary Pro / Large Meeting: the end of the slot they were granted in.
   * - Emergency Pro: its stored date (assignment + EMERGENCY_PRO_DURATION_DAYS).
   * @param {object} user a generated user
   * @param {number} [expiryDays] override the org's Pro interval (e.g. after an admin edits it)
   * @returns {{pro: Date|'never'|null, tempPro: Date|null, emergencyPro: Date|null, largeMeeting: Date|null}}
   */
  function licenseExpiries(user, expiryDays) {
    const days = expiryDays === undefined ? proExpiryDays(user.orgId) : expiryDays;
    const countedFrom = user.lastUse || user.licenseCreatedAt;
    let pro = null;
    if (user.license === LICENSES.PRO) {
      pro = days === PRO_EXPIRY_NEVER ? window.App.EXPIRY_NEVER : new Date(countedFrom.getTime() + days * DAY_MS);
    }
    const slotEnd = (type) => (user.assignedAt[type] ? nextSlotBoundary(user.assignedAt[type]) : null);
    return {
      [LICENSES.PRO]: pro,
      [LICENSES.TEMP_PRO]: user.license === LICENSES.TEMP_PRO ? slotEnd(LICENSES.TEMP_PRO) : null,
      [LICENSES.EMERGENCY_PRO]: user.license === LICENSES.EMERGENCY_PRO ? (user.expiresAt[LICENSES.EMERGENCY_PRO] || null) : null,
      [LICENSES.LARGE_MEETING]: user.largeMeeting ? slotEnd(ADDON_LARGE_MEETING) : null
    };
  }

  /* ---------- pool holders (production PoolHoldersModal) ---------- */

  /**
   * Everyone holding `license`, for the "{license} holders" modal. Reserved Pro = Large Meeting
   * holders with no main license. Pass `orgId` for an organization's Pro holders.
   * @param {Map<string, object[]>} usersByOrg
   * @param {string} license one of App.LICENSES (not basic)
   * @param {{orgId?: string}} [filter]
   * @returns {Array<{id: string, accountId: string, name: string, nameTh: string, email: string,
   *   orgId: string, org: object, license: string, expiresAt: Date|'never'|null}>}
   */
  function listHolders(usersByOrg, license, filter = {}) {
    const holds = (user) => {
      switch (license) {
        case LICENSES.LARGE_MEETING: return user.largeMeeting;
        case LICENSES.RESERVED_PRO: return user.largeMeeting && user.license === LICENSES.BASIC;
        default: return user.license === license;
      }
    };
    // Reserved Pro lasts as long as the Large Meeting it backs.
    const expiryKey = license === LICENSES.RESERVED_PRO ? LICENSES.LARGE_MEETING : license;
    const holders = [];
    usersByOrg.forEach((users, orgId) => {
      if (filter.orgId && filter.orgId !== orgId) {
        return;
      }
      const org = ORGANIZATIONS.find((item) => item.id === orgId);
      users.filter(holds).forEach((user) => {
        holders.push({
          id: user.id,
          accountId: user.accountId,
          name: user.name,
          nameTh: user.nameTh,
          email: user.email,
          orgId,
          org,
          license,
          expiresAt: licenseExpiries(user)[expiryKey] ?? null
        });
      });
    });
    return holders.sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------- bookings ---------- */

  const BOOKING_TITLES = Object.freeze([
    'Faculty seminar', 'Graduate thesis defense', 'Department meeting', 'Online lecture: Calculus I',
    'Research collaboration call', 'Orientation for new students', 'International webinar', 'Curriculum committee',
    'Workshop: Active learning', 'Board of examiners', 'Alumni talk', 'Staff training: e-Learning'
  ]);
  const BOOKING_NOTES = Object.freeze([
    'Contact 081-234-5678 (office ext. 4410)', 'Line ID: tlic.support · 053-942-000', '',
    'Backup host: secretary 089-765-4321', '', 'Call 053-944-111 if the link fails'
  ]);
  // The signed-in user books for this colleague in one seeded booking ("Book for: Someone else").
  const BOOKED_FOR_OTHER = Object.freeze({ name: 'Somchai Kaewmanee', nameTh: 'สมชาย แก้วมณี', email: 'somchai.k@cmu.ac.th' });
  const SIGNED_IN_BOOKER = Object.freeze({ name: SIGNED_IN_USER.name, nameTh: SIGNED_IN_USER.nameTh, email: SIGNED_IN_USER.email });
  // Day offsets from REFERENCE_DATE for the signed-in user's seeded bookings (all inside September 2026).
  const MY_BOOKING_SEEDS = Object.freeze([
    { offset: 2, license: LICENSES.TEMP_PRO, slots: ['midday'], title: 'Faculty seminar', note: 'Contact 081-234-5678 (office ext. 4410)' },
    { offset: 5, license: LICENSES.LARGE_MEETING, slots: ['morning', 'midday'], title: 'Graduate thesis defense', note: '', forOther: true },
    { offset: 9, license: LICENSES.TEMP_PRO, slots: ['evening'], title: 'International webinar', note: 'Backup host: secretary 089-765-4321' },
    { offset: 12, license: LICENSES.LARGE_MEETING, slots: ['midday'], title: 'Orientation for new students', note: '' },
    { offset: -3, license: LICENSES.LARGE_MEETING, slots: ['morning'], title: 'Department meeting', note: '' },
    { offset: -8, license: LICENSES.TEMP_PRO, slots: ['midday', 'evening'], title: 'Workshop: Active learning', note: '' },
    { offset: -13, license: LICENSES.TEMP_PRO, slots: ['morning'], title: 'Curriculum committee', note: '' },
    { offset: -20, license: LICENSES.TEMP_PRO, slots: ['evening'], title: 'Alumni talk', note: '' }
  ]);
  const BOOKING_ID_BASE = 1200;
  // How long before its first slot each seeded booking was made.
  const BOOKING_LEAD_DAYS = 6;

  /**
   * The signed-in user's bookings (production UiBooking, grouped: one booking = one day, 1+ slots).
   * Group them with bookingPhase(): 'current' (in use now), 'upcoming', 'past'. The first booking is
   * today's slot that contains `now` ("In use now"), or the next slot today when `now` is outside
   * booking hours (05:30–22:00) — then it is simply upcoming.
   * Prototype field names (booking.js): `note` (production `notes`), `bookedFor` email|null.
   * @param {Date} [now] defaults to mockNow()
   * @returns {Array<{id: number, license: string, dateKey: string, slots: string[], title: string,
   *   note: string, bookedFor: string|null, bookedForUser: object|null, bookedBy: object,
   *   createdAt: Date, windows: Array<{startAt: Date, endAt: Date}>}>}
   */
  function createMyBookings(now = mockNow()) {
    const todayKey = dateKey(now);
    const currentSlot = slotAt(now) || TIME_SLOTS.find((slot) => slot.startHour * 60 + slot.startMinute > now.getHours() * 60 + now.getMinutes());
    const seeds = [
      ...(currentSlot ? [{ offset: 0, license: LICENSES.TEMP_PRO, slots: [currentSlot.id], title: 'Online lecture: Calculus I', note: 'Line ID: tlic.support · 053-942-000' }] : []),
      ...MY_BOOKING_SEEDS
    ];
    return seeds.map((seed, index) => {
      const key = seed.offset === 0 ? todayKey : dateKey(new Date(REFERENCE_DATE.getTime() + seed.offset * DAY_MS));
      const windows = seed.slots.map((slotId) => slotWindow(key, slotId));
      return {
        id: BOOKING_ID_BASE + index,
        license: seed.license,
        dateKey: key,
        slots: [...seed.slots],
        title: seed.title,
        note: seed.note,
        bookedFor: seed.forOther ? BOOKED_FOR_OTHER.email : null,
        bookedForUser: seed.forOther ? BOOKED_FOR_OTHER : null,
        bookedBy: SIGNED_IN_BOOKER,
        createdAt: new Date(windows[0].startAt.getTime() - BOOKING_LEAD_DAYS * DAY_MS),
        windows
      };
    });
  }

  /**
   * @param {{windows: Array<{startAt: Date, endAt: Date}>}} booking
   * @param {Date} [now]
   * @returns {'current'|'upcoming'|'past'}
   */
  function bookingPhase(booking, now = mockNow()) {
    const time = now.getTime();
    if (booking.windows.some((window) => window.startAt.getTime() <= time && time < window.endAt.getTime())) {
      return 'current';
    }
    return booking.windows.some((window) => window.startAt.getTime() > time) ? 'upcoming' : 'past';
  }

  // Bookings per day and slot for the admin calendar; indexed by a day/slot seed. Weekends use half.
  const TEMP_PRO_PATTERN = Object.freeze([0, 1, 0, 2, 1, 3, 0, 1]);
  const LARGE_MEETING_PATTERN = Object.freeze([0, 0, 1, 0, 2, 1, 0]);
  // Demo day where every Temporary Pro slot is booked out, so a "full" day can be screenshotted.
  const FULL_TEMP_PRO_DAY_KEY = '2026-09-24';
  // The signed-in admin's own colleagues and other orgs' staff who book; picked by seed.
  const BOOKER_ORG_IDS = Object.freeze(['eng', 'med', 'hum', 'ou', 'cmu']);
  // Every Nth calendar booking was made by someone else on the user's behalf (a secretary).
  const BOOKED_BY_OTHER_EVERY = 4;

  /**
   * Organization-wide bookings for the Admin Console calendar (production AdminBooking: one row per
   * slot). Covers the whole month of `monthDate` (default: the demo month, September 2026), both
   * Temporary Pro and Large Meeting, never above the Shared Pool quota per slot, and includes the
   * signed-in user's own bookings.
   * @param {Map<string, object[]>} [usersByOrg]
   * @param {Date} [monthDate]
   * @returns {Array<{id: string, license: string, dateKey: string, slot: string, startAt: Date, endAt: Date,
   *   title: string, note: string, user: {name, nameTh, email}, bookedBy: {name, nameTh, email}|null}>}
   *   bookedBy is null when the user booked for themselves.
   */
  function createOrgBookings(usersByOrg = createUsersByOrg(), monthDate = REFERENCE_DATE) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const people = BOOKER_ORG_IDS.flatMap((orgId) => (usersByOrg.get(orgId) || []).slice(1, 12));
    const person = (seed) => {
      const user = people[seed % people.length];
      return { name: user.name, nameTh: user.nameTh, email: user.email };
    };
    const rows = [];
    let counter = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = dateKey(date);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      TIME_SLOTS.forEach((slot, slotIndex) => {
        const seed = day * 7 + slotIndex * 3 + month;
        const counts = {
          [LICENSES.TEMP_PRO]: key === FULL_TEMP_PRO_DAY_KEY
            ? SHARED_POOL_QUOTAS.tempPro
            : Math.min(TEMP_PRO_PATTERN[seed % TEMP_PRO_PATTERN.length], SHARED_POOL_QUOTAS.tempPro),
          [LICENSES.LARGE_MEETING]: Math.min(LARGE_MEETING_PATTERN[seed % LARGE_MEETING_PATTERN.length], SHARED_POOL_QUOTAS.largeMeeting)
        };
        Object.entries(counts).forEach(([license, rawCount]) => {
          const count = weekend ? Math.floor(rawCount / 2) : rawCount;
          for (let n = 0; n < count; n += 1) {
            counter += 1;
            const pick = seed * 5 + n * 11 + counter;
            const { startAt, endAt } = slotWindow(key, slot.id);
            const user = person(pick);
            rows.push({
              id: `ab-${key}-${slot.id}-${license}-${n}`,
              license,
              dateKey: key,
              slot: slot.id,
              startAt,
              endAt,
              title: BOOKING_TITLES[pick % BOOKING_TITLES.length],
              note: BOOKING_NOTES[pick % BOOKING_NOTES.length],
              user,
              bookedBy: counter % BOOKED_BY_OTHER_EVERY === 0 ? person(pick + 1) : null
            });
          }
        });
      });
    }

    // The signed-in user's own bookings appear on the admin calendar too.
    createMyBookings().filter((booking) => {
      const date = parseDateKey(booking.dateKey);
      return date.getFullYear() === year && date.getMonth() === month;
    }).forEach((booking) => {
      booking.slots.forEach((slotId, index) => {
        rows.push({
          id: `my-${booking.id}-${slotId}`,
          license: booking.license,
          dateKey: booking.dateKey,
          slot: slotId,
          startAt: booking.windows[index].startAt,
          endAt: booking.windows[index].endAt,
          title: booking.title,
          note: booking.note,
          user: booking.bookedForUser || SIGNED_IN_BOOKER,
          bookedBy: booking.bookedForUser ? SIGNED_IN_BOOKER : null
        });
      });
    });

    return rows.sort((a, b) => a.startAt - b.startAt || a.license.localeCompare(b.license));
  }

  /* ---------- action log (production AdminActionLogs / ActionLogEntry) ---------- */

  const ACTION_LOG_TOPICS = Object.freeze(['license', 'booking', 'permission', 'organization', 'meeting']);
  const ACTION_LOG_COUNT = 60;
  // Newest entry at 09:40 on the demo day; each older one a few hours earlier.
  const ACTION_LOG_START = new Date(2026, 8, 14, 9, 40);
  const ACTION_LOG_GAPS_MINUTES = Object.freeze([95, 140, 35, 260, 70, 410, 55, 180]);
  const MEETING_IDS = Object.freeze(['845 1234 5678', '912 3344 0921', '873 5501 2296', '966 7012 4483', '821 9087 3310']);
  // Topic order cycles through this list so every topic is well represented.
  const ACTION_LOG_TOPIC_CYCLE = Object.freeze([
    'license', 'booking', 'meeting', 'license', 'booking', 'permission',
    'meeting', 'license', 'organization', 'booking', 'meeting', 'license'
  ]);

  /**
   * One backend-style log line. Production shows the backend's `msg` verbatim (lowercase, English).
   * @returns {{message: string, user: object|null}} user = the account the row belongs to (null for org changes)
   */
  function actionLogLine(topic, seed, users) {
    const user = users[seed % users.length];
    const other = users[(seed * 7 + 3) % users.length];
    const org = ORGANIZATIONS[seed % ORGANIZATIONS.length];
    const orgEn = org.name.en;
    const day = String(10 + (seed % 18)).padStart(2, '0');
    const slot = TIME_SLOTS[seed % TIME_SLOTS.length];
    const slotLabel = `${String(slot.startHour).padStart(2, '0')}:${String(slot.startMinute).padStart(2, '0')}–${String(slot.endHour).padStart(2, '0')}:${String(slot.endMinute).padStart(2, '0')}`;
    const bookingId = BOOKING_ID_BASE + 100 + seed;
    switch (topic) {
      case 'license': {
        const lines = [
          `assigned license pro to ${user.email} (quota ${orgEn})`,
          `revoked license pro from ${user.email}`,
          `assigned license tempPro to ${user.email}, expires 2026-09-${day} ${slotLabel.slice(-5)}`,
          `assigned license largeMeeting to ${user.email} (reservedPro taken)`,
          `license pro expired for ${user.email} after ${proExpiryDays(user.orgId)} days without use`,
          `assigned license emergPro to ${user.email}, expires 2026-09-${day} 23:59`,
          `revoked license largeMeeting from ${user.email} (reservedPro released)`,
          `user ${user.email} returned license pro`
        ];
        return { message: lines[seed % lines.length], user };
      }
      case 'booking': {
        const license = seed % 3 === 0 ? 'largeMeeting' : 'tempPro';
        const lines = [
          `booked ${license} for ${user.email} on 2026-09-${day} slot ${slot.id} (${slotLabel})`,
          `booking #${bookingId} started: granted ${license} to ${user.email}`,
          `booking #${bookingId} ended: ${license} returned to shared pool`,
          `cancelled booking #${bookingId} (${license}, 2026-09-${day} ${slot.id})`,
          `booked ${license} for ${other.email} by ${user.email} on 2026-09-${day} slot ${slot.id}`,
          `admin cancelled booking #${bookingId} of ${user.email}, user notified by email`
        ];
        return { message: lines[seed % lines.length], user };
      }
      case 'permission': {
        const lines = [
          `granted admin of ${orgEn} to ${user.email}`,
          `revoked admin of ${orgEn} from ${user.email}`
        ];
        return { message: lines[seed % lines.length], user };
      }
      case 'organization': {
        const lines = [
          `set pro quota of ${orgEn} to ${org.quotas.pro}`,
          `set pro expiry of ${orgEn} to ${proExpiryDays(org.id) || 'never'}${proExpiryDays(org.id) ? ' days' : ''}`,
          `added account ${user.email} from MIS to ${orgEn}`
        ];
        const index = seed % lines.length;
        return { message: lines[index], user: index === 2 ? user : null };
      }
      default: {
        const minutes = DURATION_STEPS[seed % DURATION_STEPS.length];
        const participants = PARTICIPANT_STEPS[seed % PARTICIPANT_STEPS.length];
        return {
          message: `meeting ended: ${MEETING_IDS[seed % MEETING_IDS.length]}, host ${user.email}, ${minutes} min, ${participants} participants`,
          user
        };
      }
    }
  }

  /**
   * ~60 action log rows, newest first (production ActionLogEntry plus `email` for the email filter).
   * @param {Map<string, object[]>} [usersByOrg]
   * @returns {Array<{id: string, accountId: string|null, email: string|null, topic: string, message: string, createdAt: Date}>}
   */
  function createActionLogs(usersByOrg = createUsersByOrg()) {
    const users = [...usersByOrg.values()].flatMap((list) => list.slice(0, 20));
    let time = ACTION_LOG_START.getTime();
    return Array.from({ length: ACTION_LOG_COUNT }, (_, index) => {
      const topic = ACTION_LOG_TOPIC_CYCLE[index % ACTION_LOG_TOPIC_CYCLE.length];
      const seed = index * 13 + 5;
      const { message, user } = actionLogLine(topic, seed, users);
      const row = {
        id: String(98000 - index),
        accountId: user ? user.accountId : null,
        email: user ? user.email : null,
        topic,
        message,
        createdAt: new Date(time)
      };
      time -= ACTION_LOG_GAPS_MINUTES[index % ACTION_LOG_GAPS_MINUTES.length] * MINUTE_MS;
      return row;
    });
  }

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initials(name) {
    return name.split(' ').map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
  }

  function orgName(org) {
    return org.name[window.App.getLang()] || org.name.en;
  }

  /** Production shows the Thai name in Thai, the English name otherwise. @param {{name: string, nameTh?: string}} person */
  function displayName(person) {
    return window.App.getLang() === 'th' && person.nameTh ? person.nameTh : person.name;
  }

  window.MockData = Object.freeze({
    ADDON_LARGE_MEETING,
    RESERVED_PRO,
    CMU_ORG_ID,
    TODAY: REFERENCE_DATE,
    TIME_SLOTS,
    ACCOUNT_TYPES,
    ACTION_LOG_TOPICS,
    SHARED_POOL_QUOTAS,
    DEFAULT_PRO_EXPIRY_DAYS,
    PRO_EXPIRY_NEVER,
    EMERGENCY_PRO_DURATION_DAYS,
    mockNow,
    nextSlotBoundary,
    slotAt,
    slotWindow,
    dateKey,
    parseDateKey,
    SIGNED_IN_USER,
    BOOKED_FOR_OTHER,
    ORGANIZATIONS,
    createUsersByOrg,
    createAdminsByOrg,
    proExpiryDays,
    licenseExpiries,
    listHolders,
    createMyBookings,
    bookingPhase,
    createOrgBookings,
    createActionLogs,
    escapeHtml,
    initials,
    orgName,
    displayName
  });
})();
