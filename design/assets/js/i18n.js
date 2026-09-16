'use strict';

/**
 * EN/TH dictionary and translation helpers.
 * Markup opts in with:
 *   data-i18n="key"             -> textContent
 *   data-i18n-placeholder="key" -> placeholder attribute
 *   data-i18n-aria-label="key"  -> aria-label attribute
 *   data-i18n-title="key"       -> title attribute
 */
(function () {
  const FALLBACK_LANG = 'en';

  const DICTIONARY = {
    en: {
      'app.name': 'CMU ZOOM',
      'nav.primary': 'Primary',
      'nav.terms': 'Zoom Pro Terms of Use',
      'nav.guide': 'User Guide',
      'nav.home': 'Go to profile',
      'nav.booking': 'Booking Center',

      'menu.open': 'Open account menu',
      'menu.editProfile': 'Edit Profile',
      'menu.language': 'Language',
      'menu.theme': 'Theme',
      'menu.themeLight': 'Light theme',
      'menu.themeDark': 'Dark theme',
      'menu.manageUsers': 'Manage Users',
      'menu.logout': 'Logout',

      'landing.welcome': 'Welcome to',
      'landing.subtitle': 'Video conferencing for Chiang Mai University students and staff.',
      'landing.login': 'Login with CMU Account',
      'landing.note': 'Sign in with your @cmu.ac.th account.',
      'landing.footer': 'Teaching and Learning Innovation Center, Chiang Mai University',
      'landing.manageLicense': 'Manage Your License',
      'landing.bookingCenter': 'Go to ZOOM Booking Center',
      'landing.signedInAs': 'Signed in as',
      'landing.logout': 'Logout',

      'profile.mockOrg': 'Faculty of Engineering',
      'profile.license': 'Your Zoom license',
      'profile.return': 'Return license',
      'profile.request': 'Request Pro',
      'profile.requestUnavailable': 'No Pro licenses left in your organization’s quota.',
      'profile.proAssigned': 'Pro license assigned from your organization’s quota.',
      'request.title': 'Request a Pro license?',
      'request.body': 'A Pro license from your organization’s quota will be assigned to you right away. Pro removes the 40-minute meeting limit and enables cloud recording.',
      'request.termsPrefix': 'By getting Pro, you agree to the',
      'request.confirm': 'Get Pro',
      'profile.recording': 'Save Cloud Recording to your OneDrive',
      'profile.beta': 'Beta',
      'profile.recordingHelp': 'When enabled, new Zoom cloud recordings are copied to your CMU OneDrive automatically.',
      'profile.recordingHelpLabel': 'About OneDrive recording',
      'profile.recordingOn': 'Cloud Recording will be saved to OneDrive.',
      'profile.recordingOff': 'Cloud Recording will stay in Zoom only.',
      'profile.returned': 'License returned. You are now a Basic user.',
      'profile.expires': 'Expires {date}',
      'profile.meetingsHint': 'Meetings open in the Zoom app or your browser.',

      'meeting.section': 'Zoom meetings',
      'meeting.join': 'Join a Meeting',
      'meeting.start': 'Start a Meeting',
      'meeting.schedule': 'Schedule a Meeting',

      'license.basic': 'Basic',
      'license.pro': 'Pro',
      'license.tempPro': 'Temp. Pro',
      'license.largeMeeting': 'Large Meeting',
      'licenseLabel.basic': 'Basic User',
      'licenseLabel.pro': 'Pro User',
      'licenseLabel.tempPro': 'Temporary Pro User',

      'modal.close': 'Close',
      'modal.cancel': 'Cancel',
      'terms.title': 'Zoom Pro Terms of Use',
      // Source: "เงื่อนไขการใช้ ZOOM Pro.txt" (English translation)
      'terms.1': 'You must be a Chiang Mai University lecturer or staff member with a CMU Account.',
      'terms.2': 'Request access through the designated online license management system.',
      'terms.notesTitle': 'Notes',
      'terms.note1': 'To add an admin for your faculty/organization who can assign and return licenses within it, contact us on LINE:',
      'terms.note2': 'The university has a limited number of licenses. Zoom Pro licenses are granted on a first-come, first-served basis.',
      'terms.accept': 'I understand',
      'return.title': 'Return your license?',
      'return.body': 'Your account will change to Basic (40-minute meetings, no cloud recording). Your organization can assign the license to someone else.',
      'return.confirm': 'Return license',

      'manage.quotas': 'Pro Quotas',
      'manage.licenseQuotas': 'License Quotas',
      'manage.quotaGroupCmu': 'Shared Pool',
      'manage.used': '{used}/{total} ({percent}%)',
      'manage.left': '{count} left',
      'manage.organization': 'Organization',
      'manage.search': 'Search name or email',
      'manage.userCount': '{count} users',
      'manage.empty': 'No users match your search.',
      'manage.never': 'Never',
      'manage.overQuota': 'No {license} licenses left in this quota.',
      'manage.requiresPaid': 'Requires a Pro or Temp. Pro license',
      'manage.assigned': '{license} assigned to {name}.',
      'manage.revoked': '{license} revoked from {name}.',

      'licenseModal.open': 'Manage license for {name} (current: {license})',
      'licenseModal.current': 'Current license',
      'licenseModal.license': 'Manage license',
      'licenseModal.quotaLeft': '{left} of {total} left',
      'licenseModal.cmuQuotaLeft': '{left} of {total} left · Shared Pool',
      'licenseModal.notAssigned': 'Not assigned',
      'licenseModal.managedByGlobal': 'Managed by Global Admin',
      'licenseModal.lockedTempPro': 'Has Temp. Pro from CMU · only Global Admin can change it',
      'licenseModal.lockedLargeMeeting': 'Has Large Meeting from CMU · only Global Admin can revoke Pro',
      'licenseModal.assigned': 'Assigned',
      'licenseModal.assign': 'Assign',
      'licenseModal.revoke': 'Revoke',
      'licenseModal.assignLabel': 'Assign {license}',
      'licenseModal.revokeLabel': 'Revoke {license}',
      'licenseModal.usageTitle': 'Usage log · last 30 days',
      'licenseModal.meetingCount': '{count} meetings',
      'licenseModal.meetingCountOne': '1 meeting',
      'licenseModal.noUsage': 'No meetings in the last 30 days.',
      'usage.dateTime': 'Date & time',
      'usage.duration': 'Duration',
      'usage.participants': 'Participants',
      'usage.minutes': '{count} min',
      'manage.noPermissionTitle': 'You are not allowed to access this page',
      'manage.noPermissionBody': 'Only organization admins can manage users. Switch the demo view to Admin or Global Admin.',
      'manage.backToProfile': 'Back to profile',

      'table.name': 'Name',
      'table.lastUse': 'Last Use',
      'table.license': 'License',

      'booking.title': 'ZOOM Booking Center',
      'booking.subtitle': 'Book a Temporary Pro or Large Meeting license for a day, in one or more time slots.',
      'booking.formTitle': 'Book a license',
      'booking.step.license': 'Choose a license',
      'booking.step.date': 'Choose an available day',
      'booking.step.time': 'Choose time slot(s)',
      'booking.step.note': 'Add a note (optional)',
      'booking.tempProLabel': 'Temporary Pro',
      'booking.tempProDesc': 'Eliminates the 40-minute meeting limit and enables cloud recording.',
      'booking.largeMeetingDesc': 'Raises the meeting capacity up to 1000 participants.',
      'booking.pickLicenseFirst': 'Choose a license first to see available days.',
      'booking.pickDateFirst': 'Choose a day first to see time slots.',
      'booking.full': 'Full',
      'booking.booked': 'Booked',
      'booking.prevMonth': 'Previous month',
      'booking.nextMonth': 'Next month',
      'booking.noteLabel': 'Note',
      'booking.notePlaceholder': 'Add a note for your admin (optional)',
      'booking.save': 'Save booking',
      'booking.saveCount': 'Save booking · {count} time slots',
      'booking.saved': 'Booked {license} on {date} for {count} time slot(s).',
      'booking.dayFull': 'That day just filled up. Please choose another.',
      'booking.myBookings': 'My bookings',
      'booking.empty': 'You have no upcoming bookings.',
      'booking.cancel': 'Cancel',
      'booking.cancelled': 'Booking cancelled.',
      'cancelBooking.title': 'Cancel this booking?',
      'cancelBooking.body': 'This frees up the license for someone else on that day.',
      'cancelBooking.confirm': 'Cancel booking',

      'demo.label': 'Demo view',
      'demo.orgQuota': 'Org Pro quota',
      'demo.quotaAvailable': 'Available',
      'demo.quotaFull': 'Full',
      'role.user': 'User',
      'role.admin': 'Admin',
      'role.global': 'Global Admin'
    },
    th: {
      'app.name': 'CMU ZOOM',
      'nav.primary': 'เมนูหลัก',
      'nav.terms': 'เงื่อนไขการใช้งาน Zoom Pro',
      'nav.guide': 'คู่มือการใช้งาน',
      'nav.home': 'ไปที่หน้าโปรไฟล์',
      'nav.booking': 'จองสิทธิ์ ZOOM',

      'menu.open': 'เปิดเมนูบัญชี',
      'menu.editProfile': 'แก้ไขโปรไฟล์',
      'menu.language': 'ภาษา',
      'menu.theme': 'ธีม',
      'menu.themeLight': 'ธีมสว่าง',
      'menu.themeDark': 'ธีมมืด',
      'menu.manageUsers': 'จัดการผู้ใช้งาน',
      'menu.logout': 'ออกจากระบบ',

      'landing.welcome': 'ยินดีต้อนรับสู่',
      'landing.subtitle': 'ระบบประชุมออนไลน์สำหรับนักศึกษาและบุคลากรมหาวิทยาลัยเชียงใหม่',
      'landing.login': 'เข้าสู่ระบบด้วย CMU Account',
      'landing.note': 'ลงชื่อเข้าใช้ด้วยบัญชี @cmu.ac.th ของคุณ',
      'landing.footer': 'ศูนย์นวัตกรรมการสอนและการเรียนรู้ มหาวิทยาลัยเชียงใหม่',
      'landing.manageLicense': 'จัดการสิทธิ์ของคุณ',
      'landing.bookingCenter': 'การจองสิทธิ์ ZOOM',
      'landing.signedInAs': 'ลงชื่อเข้าใช้ในชื่อ',
      'landing.logout': 'ออกจากระบบ',

      'profile.mockOrg': 'คณะวิศวกรรมศาสตร์',
      'profile.license': 'สิทธิ์การใช้ Zoom ของท่าน',
      'profile.return': 'คืนสิทธิ์',
      'profile.request': 'ขอสิทธิ์ Pro',
      'profile.requestUnavailable': 'สิทธิ์ Pro ในโควตาของหน่วยงานเต็มแล้ว',
      'profile.proAssigned': 'ได้รับสิทธิ์ Pro จากโควตาของหน่วยงานแล้ว',
      'request.title': 'ขอสิทธิ์ Zoom Pro?',
      'request.body': 'ท่านจะได้รับสิทธิ์ Pro จากโควตาของหน่วยงานทันที สิทธิ์ Pro ช่วยให้ประชุมได้เกิน 40 นาทีและใช้ Cloud Recording ได้',
      'request.termsPrefix': 'การรับสิทธิ์ Pro ถือว่าท่านยอมรับ',
      'request.confirm': 'รับสิทธิ์ Pro',
      'profile.recording': 'เก็บ Cloud Recording ใน OneDrive ของคุณ',
      'profile.beta': 'Beta',
      'profile.recordingHelp': 'เมื่อเปิดใช้งาน ไฟล์บันทึกการประชุมบนคลาวด์จะถูกคัดลอกไปยัง CMU OneDrive ของคุณโดยอัตโนมัติ',
      'profile.recordingHelpLabel': 'เกี่ยวกับการบันทึกไปยัง OneDrive',
      'profile.recordingOn': 'Cloud Recording จะถูกบันทึกไปยัง OneDrive',
      'profile.recordingOff': 'Cloud Recording จะถูกเก็บไว้ใน Zoom เท่านั้น',
      'profile.returned': 'คืนสิทธิ์เรียบร้อย บัญชีของคุณเป็น Basic แล้ว',
      'profile.expires': 'หมดอายุ {date}',
      'profile.meetingsHint': 'การประชุมจะเปิดในแอป Zoom หรือเบราว์เซอร์ของคุณ',

      'meeting.section': 'การประชุม Zoom',
      'meeting.join': 'เข้าร่วมประชุม',
      'meeting.start': 'เริ่มการประชุม',
      'meeting.schedule': 'นัดหมายการประชุม',

      'license.basic': 'Basic',
      'license.pro': 'Pro',
      'license.tempPro': 'Temporary Pro',
      'license.largeMeeting': 'Large Meeting',
      'licenseLabel.basic': 'Basic User',
      'licenseLabel.pro': 'Pro User',
      'licenseLabel.tempPro': 'Temporary Pro User',

      'modal.close': 'ปิด',
      'modal.cancel': 'ยกเลิก',
      'terms.title': 'เงื่อนไขการใช้งาน Zoom Pro',
      // Source: "เงื่อนไขการใช้ ZOOM Pro.txt"
      'terms.1': 'เป็นอาจารย์หรือเจ้าหน้าที่ของมหาวิทยาลัยเชียงใหม่ที่มี CMU Account',
      'terms.2': 'การขอใช้งานให้ทำเรื่องขอผ่านทางระบบจัดการสิทธิ์ออนไลน์ที่กำหนดให้',
      'terms.notesTitle': 'หมายเหตุ',
      'terms.note1': 'สามารถเพิ่ม Admin ของหน่วยงานเพื่อจัดการ ให้-คืนสิทธิ์ ภายในคณะ/หน่วยงานของท่าน ที่ LINE:',
      'terms.note2': 'ทางมหาวิทยาลัยฯ มี License จำกัด การขอใช้สิทธิ์ Zoom Pro เป็นลักษณะมาก่อนได้ก่อน',
      'terms.accept': 'รับทราบ',
      'return.title': 'ยืนยันการคืนสิทธิ์?',
      'return.body': 'บัญชีของคุณจะเปลี่ยนเป็น Basic (ประชุมได้ 40 นาที ไม่มี Cloud Recording) และหน่วยงานสามารถมอบสิทธิ์นี้ให้ผู้อื่นได้',
      'return.confirm': 'คืนสิทธิ์',

      'manage.quotas': 'โควตา Pro',
      'manage.licenseQuotas': 'โควตาสิทธิ์การใช้งาน',
      'manage.quotaGroupCmu': 'โควตาส่วนกลาง',
      'manage.used': '{used}/{total} ({percent}%)',
      'manage.left': 'เหลือ {count}',
      'manage.organization': 'หน่วยงาน',
      'manage.search': 'ค้นหาชื่อหรืออีเมล',
      'manage.userCount': '{count} คน',
      'manage.empty': 'ไม่พบผู้ใช้งานที่ตรงกับการค้นหา',
      'manage.never': 'ยังไม่เคยใช้',
      'manage.overQuota': 'สิทธิ์ {license} ในโควตานี้เต็มแล้ว',
      'manage.requiresPaid': 'ต้องมีสิทธิ์ Pro หรือ Temporary Pro ก่อน',
      'manage.assigned': 'มอบสิทธิ์ {license} ให้ {name} แล้ว',
      'manage.revoked': 'ยกเลิกสิทธิ์ {license} ของ {name} แล้ว',

      'licenseModal.open': 'จัดการสิทธิ์ของ {name} (ปัจจุบัน: {license})',
      'licenseModal.current': 'สิทธิ์ปัจจุบัน',
      'licenseModal.license': 'จัดการสิทธิ์',
      'licenseModal.quotaLeft': 'เหลือ {left} จาก {total}',
      'licenseModal.cmuQuotaLeft': 'เหลือ {left} จาก {total} · โควตาส่วนกลาง',
      'licenseModal.notAssigned': 'ยังไม่ได้รับสิทธิ์',
      'licenseModal.managedByGlobal': 'จัดการโดยผู้ดูแลระบบกลาง',
      'licenseModal.lockedTempPro': 'มีสิทธิ์ Temporary Pro จากมหาวิทยาลัย · เฉพาะผู้ดูแลระบบกลางที่เปลี่ยนได้',
      'licenseModal.lockedLargeMeeting': 'มีสิทธิ์ Large Meeting จากมหาวิทยาลัย · เฉพาะผู้ดูแลระบบกลางที่ยกเลิก Pro ได้',
      'licenseModal.assigned': 'ได้รับสิทธิ์แล้ว',
      'licenseModal.assign': 'มอบสิทธิ์',
      'licenseModal.revoke': 'ยกเลิกสิทธิ์',
      'licenseModal.assignLabel': 'มอบสิทธิ์ {license}',
      'licenseModal.revokeLabel': 'ยกเลิกสิทธิ์ {license}',
      'licenseModal.usageTitle': 'ประวัติการใช้งาน 30 วันล่าสุด',
      'licenseModal.meetingCount': '{count} ครั้ง',
      'licenseModal.meetingCountOne': '1 ครั้ง',
      'licenseModal.noUsage': 'ไม่มีการประชุมใน 30 วันที่ผ่านมา',
      'usage.dateTime': 'วันและเวลา',
      'usage.duration': 'ระยะเวลา',
      'usage.participants': 'ผู้เข้าร่วม',
      'usage.minutes': '{count} นาที',
      'manage.noPermissionTitle': 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
      'manage.noPermissionBody': 'เฉพาะผู้ดูแลหน่วยงานเท่านั้นที่จัดการผู้ใช้งานได้ ลองเปลี่ยนมุมมองตัวอย่างเป็น Admin หรือ Global Admin',
      'manage.backToProfile': 'กลับไปหน้าโปรไฟล์',

      'table.name': 'ชื่อ',
      'table.lastUse': 'ใช้งานล่าสุด',
      'table.license': 'สิทธิ์',

      'booking.title': 'จองสิทธิ์ ZOOM',
      'booking.subtitle': 'จองสิทธิ์ Temporary Pro หรือ Large Meeting สำหรับหนึ่งวัน เลือกได้หลายช่วงเวลา',
      'booking.formTitle': 'จองสิทธิ์',
      'booking.step.license': 'เลือกสิทธิ์',
      'booking.step.date': 'เลือกวันที่ว่าง',
      'booking.step.time': 'เลือกช่วงเวลา',
      'booking.step.note': 'เพิ่มหมายเหตุ (ถ้ามี)',
      'booking.tempProLabel': 'Temporary Pro',
      'booking.tempProDesc': 'ปลดล็อกข้อจำกัดการประชุม 40 นาที พร้อมสามารถใช้ Cloud Recording ได้',
      'booking.largeMeetingDesc': 'เพิ่มจำนวนผู้เข้าร่วมประชุมได้สูงสุด 1,000 คน',
      'booking.pickLicenseFirst': 'กรุณาเลือกสิทธิ์ก่อนเพื่อดูวันที่ว่าง',
      'booking.pickDateFirst': 'กรุณาเลือกวันก่อนเพื่อดูช่วงเวลา',
      'booking.full': 'เต็ม',
      'booking.booked': 'จองแล้ว',
      'booking.prevMonth': 'เดือนก่อนหน้า',
      'booking.nextMonth': 'เดือนถัดไป',
      'booking.noteLabel': 'หมายเหตุ',
      'booking.notePlaceholder': 'เพิ่มหมายเหตุถึงผู้ดูแลระบบ (ถ้ามี)',
      'booking.save': 'บันทึกการจอง',
      'booking.saveCount': 'บันทึกการจอง · {count} ช่วงเวลา',
      'booking.saved': 'จอง {license} วันที่ {date} จำนวน {count} ช่วงเวลา',
      'booking.dayFull': 'วันนั้นเพิ่งเต็ม กรุณาเลือกวันอื่น',
      'booking.myBookings': 'รายการจองของฉัน',
      'booking.empty': 'คุณยังไม่มีรายการจองที่จะถึง',
      'booking.cancel': 'ยกเลิก',
      'booking.cancelled': 'ยกเลิกการจองแล้ว',
      'cancelBooking.title': 'ยืนยันการยกเลิกการจอง?',
      'cancelBooking.body': 'สิทธิ์ในวันนั้นจะถูกปล่อยให้ผู้อื่นใช้ได้',
      'cancelBooking.confirm': 'ยกเลิกการจอง',

      'demo.label': 'มุมมองตัวอย่าง',
      'demo.orgQuota': 'โควตา Pro ของหน่วยงาน',
      'demo.quotaAvailable': 'มีว่าง',
      'demo.quotaFull': 'เต็ม',
      'role.user': 'ผู้ใช้',
      'role.admin': 'ผู้ดูแล',
      'role.global': 'ผู้ดูแลระบบกลาง'
    }
  };

  const ATTRIBUTE_BINDINGS = [
    { selector: '[data-i18n-placeholder]', data: 'i18nPlaceholder', attr: 'placeholder' },
    { selector: '[data-i18n-aria-label]', data: 'i18nAriaLabel', attr: 'aria-label' },
    { selector: '[data-i18n-title]', data: 'i18nTitle', attr: 'title' }
  ];

  let currentLang = FALLBACK_LANG;

  /**
   * @param {string} key
   * @param {Record<string, string|number>} [vars]
   * @returns {string}
   */
  function t(key, vars) {
    const table = DICTIONARY[currentLang] || DICTIONARY[FALLBACK_LANG];
    let text = table[key];
    if (text === undefined) {
      text = DICTIONARY[FALLBACK_LANG][key];
    }
    if (text === undefined) {
      console.error('[i18n] Missing translation key:', key);
      return key;
    }
    if (!vars) {
      return text;
    }
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  }

  /** @param {ParentNode} root */
  function apply(root) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    ATTRIBUTE_BINDINGS.forEach(({ selector, data, attr }) => {
      root.querySelectorAll(selector).forEach((el) => {
        el.setAttribute(attr, t(el.dataset[data]));
      });
    });
  }

  /** @param {string} lang */
  function setLang(lang) {
    if (!DICTIONARY[lang]) {
      console.error('[i18n] Unsupported language:', lang);
      return;
    }
    currentLang = lang;
  }

  window.I18N = Object.freeze({
    LANGS: Object.freeze(Object.keys(DICTIONARY)),
    FALLBACK_LANG,
    t,
    apply,
    setLang,
    getLang: () => currentLang
  });
})();
