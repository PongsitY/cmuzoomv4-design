'use strict';

/**
 * Mock organizations, users and admins shared by the Manage Users and Admin Console pages.
 * Loaded after app.js. Each page builds its own copy (in-memory, resets on reload).
 *
 * License ownership:
 * - Every organization (CMU included) holds its own Pro quota.
 * - The CMU organization additionally holds the Temp. Pro and Large Meeting quotas (Shared Pool)
 *   on behalf of everyone.
 */
(function () {
  const { LICENSES } = window.App;

  const ADDON_LARGE_MEETING = 'largeMeeting';
  const CMU_ORG_ID = 'cmu';
  // The signed-in demo user (shown on profile.html) is an admin of the Faculty of Engineering.
  const SIGNED_IN_USER = Object.freeze({ name: 'Anong Srisuk', email: 'anong.s@cmu.ac.th', orgId: 'eng' });
  const USERS_PER_ORG = 15;
  const LAST_USE_WINDOW_DAYS = 45;
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Fixed "today" keeps the generated demo data stable between visits.
  const REFERENCE_DATE = new Date(2026, 8, 14);

  // Mock license distribution: every 2nd user gets Pro while the org quota allows.
  const PRO_EVERY = 2;
  // Users (by generated id) who currently borrow CMU-held licenses; kept below the CMU quotas
  // so assigning can still be demoed. eng-0 is the signed-in admin, Anong Srisuk.
  const CMU_LOANS = Object.freeze({
    tempPro: Object.freeze(['ou-1', 'eng-1']),
    largeMeeting: Object.freeze(['eng-0'])
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

  // Each organization holds a Pro quota; CMU also holds the Temp. Pro / Large Meeting quotas for everyone.
  // `seed` keeps each organization's generated mock data stable regardless of list order.
  const ORGANIZATIONS = Object.freeze([
    { id: CMU_ORG_ID, seed: 4, name: { en: 'CMU', th: 'CMU' }, quotas: { pro: 12, tempPro: 3, largeMeeting: 2 } },
    { id: 'ou', seed: 0, name: { en: 'Office of the University', th: 'สำนักงานมหาวิทยาลัย' }, quotas: { pro: 10 } },
    { id: 'med', seed: 1, name: { en: 'Faculty of Medicine', th: 'คณะแพทยศาสตร์' }, quotas: { pro: 20 }, expiryDays: 90 },
    { id: 'eng', seed: 2, name: { en: 'Faculty of Engineering', th: 'คณะวิศวกรรมศาสตร์' }, quotas: { pro: 8 } },
    { id: 'hum', seed: 3, name: { en: 'Faculty of Humanities', th: 'คณะมนุษยศาสตร์' }, quotas: { pro: 6 }, expiryDays: 30 }
  ]);

  const FIRST_NAMES = ['Nareerat', 'Somchai', 'Kanya', 'Nattapong', 'Pimchanok', 'Thanawat', 'Supaporn', 'Kittisak', 'Wilaiwan', 'Chaiwat', 'Siriporn', 'Pongsakorn', 'Rattana', 'Apichat', 'Duangjai', 'Teerapat', 'Jiraporn', 'Worawut', 'Malee', 'Sakda'];
  const LAST_NAMES = ['Srisuk', 'Kaewmanee', 'Boonmee', 'Chaiyaporn', 'Thongdee', 'Wongsawat', 'Inthapan', 'Saengchai', 'Phrommin', 'Rattanakul', 'Jantarasri', 'Kongkaew', 'Suwannarat', 'Panyawong', 'Yodsuwan', 'Meechai', 'Sangthong', 'Kaewkham', 'Prasertsin', 'Nakprasit'];

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

  function pickLicense(org, userId, userIndex, orgProAssigned) {
    if (CMU_LOANS.tempPro.includes(userId)) {
      return LICENSES.TEMP_PRO;
    }
    if (userIndex % PRO_EVERY === 0 && orgProAssigned < org.quotas.pro) {
      return LICENSES.PRO;
    }
    return LICENSES.BASIC;
  }

  function buildUsers(org) {
    const orgIndex = org.seed;
    let orgProAssigned = 0;
    return Array.from({ length: USERS_PER_ORG }, (_, i) => {
      const first = FIRST_NAMES[spread(orgIndex, i, 7, FIRST_NAMES.length)];
      const last = LAST_NAMES[spread(orgIndex, i, 11, LAST_NAMES.length)];

      const userId = `${org.id}-${i}`;
      const license = pickLicense(org, userId, i, orgProAssigned);
      if (license === LICENSES.PRO) {
        orgProAssigned += 1;
      }
      // Large Meeting requires a paid license.
      const largeMeeting = license !== LICENSES.BASIC && CMU_LOANS.largeMeeting.includes(userId);

      const neverUsed = spread(orgIndex, i, 3, 6) === 5;
      const daysAgo = neverUsed ? null : spread(orgIndex, i, 13, LAST_USE_WINDOW_DAYS);
      const isSignedInUser = org.id === SIGNED_IN_USER.orgId && i === 0;

      return {
        id: userId,
        name: isSignedInUser ? SIGNED_IN_USER.name : `${first} ${last}`,
        email: isSignedInUser ? SIGNED_IN_USER.email : `${first}.${last.charAt(0)}@cmu.ac.th`.toLowerCase(),
        lastUse: daysAgo === null ? null : new Date(REFERENCE_DATE.getTime() - daysAgo * DAY_MS),
        license,
        largeMeeting,
        usageLog: buildUsageLog(orgIndex, i, daysAgo, license)
      };
    });
  }

  /** @returns {Map<string, object[]>} fresh users per organization id */
  function createUsersByOrg() {
    return new Map(ORGANIZATIONS.map((org) => [org.id, buildUsers(org)]));
  }

  /** @returns {Map<string, Set<string>>} fresh admin user ids per organization id */
  function createAdminsByOrg() {
    return new Map(ORGANIZATIONS.map((org) => [org.id, new Set(ADMIN_SEED[org.id] || [])]));
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

  window.MockData = Object.freeze({
    ADDON_LARGE_MEETING,
    CMU_ORG_ID,
    SIGNED_IN_USER,
    ORGANIZATIONS,
    createUsersByOrg,
    createAdminsByOrg,
    escapeHtml,
    initials,
    orgName
  });
})();
