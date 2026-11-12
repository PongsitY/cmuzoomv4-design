'use strict';

/**
 * EN/TH dictionary and translation helpers.
 *
 * KEY NAMING: keys mirror the production app's locale paths
 * (cmu-zoom-web-v4/i18n/locales/{en,th}.json), flattened to dotted form:
 * `{ booking: { step: { date } } }` is looked up as `booking.step.date`.
 * PRODUCTION below is a verbatim copy of those JSON files — to resync, paste
 * them in again. vue-i18n literal interpolation (`{'@'}`) is unescaped to a
 * plain character when the tables are flattened.
 * PROTOTYPE_ONLY holds the few keys production has no equivalent for (demo
 * controls, prototype aliases); production wins whenever both define a key.
 *
 * Interpolation: `t('booking.saved', { license, date, count })` replaces each
 * `{name}` placeholder; unknown placeholders are left as-is.
 *
 * Markup opts in with:
 *   data-i18n="key"             -> textContent
 *   data-i18n-placeholder="key" -> placeholder attribute
 *   data-i18n-aria-label="key"  -> aria-label attribute
 *   data-i18n-title="key"       -> title attribute
 */
(function () {
  const FALLBACK_LANG = 'en';

  /* ---------- production locales (verbatim) ---------- */

  const PRODUCTION = {
    en: {
      accountType: {
        Employee: 'Employee',
        Org: 'Organization',
        Student: 'Student',
        Teacher: 'Teacher'
      },
      actionLogs: {
        allTopics: 'All topics',
        count: '{count} entries',
        email: 'Filter by email',
        empty: 'No log entries match these filters.',
        from: 'From',
        heading: 'Action log',
        message: 'Details',
        time: 'Time',
        to: 'To',
        topic: 'Topic',
        topics: {
          booking: 'Booking',
          license: 'License',
          meeting: 'Meeting',
          organization: 'Organization',
          permission: 'Permission'
        },
        user: 'Account ID'
      },
      adminBookings: {
        allLicenses: 'All licenses',
        bookedBy: 'Booked by {name}',
        cancelBody: 'Cancel {name}\'s booking? This frees the license for someone else.',
        cancelLabel: 'Cancel {name}\'s booking',
        cancelledNotified: 'Booking cancelled. The user has been emailed.',
        cancelledNotifyFailed: 'Booking cancelled, but the email could not be sent.',
        empty: 'No bookings this month.',
        heading: 'Booked licenses',
        legend: 'License colours',
        license: 'License',
        noneThisDay: 'No bookings on this day.',
        notify: 'Email the user',
        otherTimes: 'Other times',
        today: 'Today',
        truncated: 'This month has more bookings than can be shown. Filter by license to see the rest.'
      },
      adminQuota: {
        barLabel: 'Pro licenses used at {org}',
        colEdit: 'Edit quota',
        colUsage: 'Pro licenses used',
        edit: 'Edit',
        editLabel: 'Edit the Pro quota of {org}',
        field: 'Pro licenses',
        inUse: '{used} in use now. Up to {max}.',
        invalid: 'Enter a whole number between {used} and {max}.',
        modalTitle: 'Edit Pro quota',
        orgNotFound: 'That organization could not be found.',
        save: 'Save quota',
        saved: 'Pro quota of {org} set to {count}.',
        title: 'Pro License Quotas',
        total: '{count} licenses'
      },
      admins: {
        add: 'Add admin',
        addLabel: 'Add an admin to {org}',
        addTitle: 'Add admin',
        allOrgs: 'All organizations',
        assign: 'Assign',
        assignLabel: 'Make {name} an admin',
        assigned: '{name} is now an admin of {org}.',
        empty: 'This organization has no admins yet.',
        heading: 'Organization Admin',
        noCandidates: 'No users to add.',
        noPermissionBody: 'Only Global Admin can manage organization admins. Switch the demo view to Global Admin.',
        notFound: 'That user could not be found.',
        pageTitle: 'Admin Console',
        revoke: 'Revoke',
        revokeBody: '{name} will no longer be able to manage users of {org}.',
        revokeLabel: 'Revoke admin permission from {name}',
        revokeTitle: 'Revoke admin permission?',
        revoked: 'Admin permission revoked from {name}.',
        search: 'Search name or email',
        tabAdmins: 'Admin Management',
        tabBookings: 'Booked Licenses',
        tabLogs: 'Action Log',
        tabStats: 'Stats',
        tabs: 'Admin Console sections'
      },
      app: {
        name: 'CMU ZOOM'
      },
      booking: {
        bookFor: 'Book for',
        booked: 'Booked',
        cancel: 'Cancel',
        cancelled: 'Booking cancelled.',
        current: 'In use now',
        dayFull: 'That day just filled up. Please choose another.',
        emailInvalid: 'Enter only the part before {\'@\'}cmu.ac.th (letters, numbers, . _ -).',
        emailLabel: 'Email (CMU account Only)',
        emailPlaceholder: 'example.f',
        emailSelf: 'This is your own email. Choose “Myself” instead.',
        empty: 'You have no upcoming bookings.',
        forLabel: 'For {email}',
        forOther: 'Someone else',
        forSelf: 'Myself',
        formTitle: 'Book a license',
        full: 'Full',
        hidePast: 'Hide past bookings',
        largeMeetingDesc: 'Raises the meeting capacity up to 1000 participants.',
        myBookings: 'My bookings',
        nextMonth: 'Next month',
        noUpcoming: 'No upcoming bookings.',
        noteLabel: 'Additional information',
        notePlaceholder: 'Add a phone number and contact info for emergency situation',
        past: 'Past',
        pickDateFirst: 'Choose a day first to see time slots.',
        pickLicenseFirst: 'Choose a license first to see available days.',
        prevMonth: 'Previous month',
        save: 'Save booking',
        saveCount: 'Save booking · {count} time slots',
        saved: 'Booked {license} on {date} for {count} time slot(s).',
        showMore: 'Show more ({count})',
        showPast: 'Show past bookings ({count})',
        step: {
          date: 'Choose an available day',
          details: 'Add details',
          license: 'Choose a license',
          time: 'Choose time slot(s)'
        },
        tempProDesc: 'Eliminates the 40-minute meeting limit and enables cloud recording.',
        tempProLabel: 'Temporary Pro',
        title: 'ZOOM Booking Center',
        titleLabel: 'Title',
        titlePlaceholder: 'e.g. Faculty seminar',
        upcoming: 'Upcoming',
        userNotFound: 'This user isn’t in CMU Zoom yet. Add them, then save again.'
      },
      cancelBooking: {
        body: 'This frees up the license for someone else on that day.',
        confirm: 'Confirm',
        title: 'Cancel this booking?'
      },
      confirmBooking: {
        body: 'Please check the details below before confirming.',
        bookedFor: 'Booked for',
        bookingTitle: 'Title',
        confirm: 'Confirm booking',
        date: 'Date',
        license: 'License',
        noNote: 'No contact info',
        note: 'Contact Info',
        self: 'Myself',
        timeSlots: 'Time slots',
        title: 'Confirm your booking'
      },
      confirmLicense: {
        assignBody: '{name} will receive {license}.',
        assignTitle: 'Assign {license}?',
        releasesTempPro: 'Their {license} is released automatically.',
        revokeBody: '{name} will lose {license}.',
        revokeTitle: 'Revoke {license}?',
        slotCurrent: 'Time slot {start} – {end}: it expires at {end}.',
        slotNext: 'Outside booking hours: it expires at {time}, when the next time slot starts.'
      },
      demo: {
        label: 'Demo view',
        orgQuota: 'Org Pro quota',
        quotaAvailable: 'Available',
        quotaFull: 'Full'
      },
      expiry: {
        days: '{count} days',
        desc: 'A Pro license is returned to the quota when unused for more than {count} days.',
        descNever: 'Pro licenses never expire from inactivity.',
        edit: 'Edit',
        editLabel: 'Edit Pro expiration interval',
        invalid: 'Choose one of the listed intervals.',
        legend: 'Expire Pro after no use for',
        modalNote: 'Applies to every Pro user in this organization, counted from their last use.',
        modalTitle: 'Edit Pro expiration interval',
        never: 'Never',
        save: 'Save',
        saved: '{org}: Pro expiration interval set to {interval}.',
        title: 'Pro Expiration Interval'
      },
      landing: {
        errorAccountType: 'This type of CMU account cannot use CMU Zoom.',
        errorGeneric: 'Sign-in failed. Please try again.',
        errorInactive: 'Your CMU Zoom account is inactive. Please contact TLIC.',
        errorNotProvisioned: 'Your CMU account is not registered for CMU Zoom yet. Please contact TLIC.',
        errorUnavailable: 'We could not reach the CMU Zoom service. Please try again shortly.',
        footer: 'Teaching and Learning Innovation Center, Chiang Mai University',
        login: 'Login with CMU Account',
        note: 'Sign in with your {\'@\'}cmu.ac.th account.',
        subtitle: 'Video conferencing for Chiang Mai University students and staff.',
        welcome: 'Welcome to'
      },
      license: {
        basic: 'Basic',
        emergPro: 'Emergency Pro',
        largeMeeting: 'Large Meeting',
        pro: 'Pro',
        reservedPro: 'Reserved Pro for Large Meeting',
        tempPro: 'Temporary Pro'
      },
      licenseModal: {
        assign: 'Assign',
        assignLabel: 'Assign {license}',
        assigned: 'Assigned',
        current: 'Current license',
        emergBlocked: 'Remove Pro or Temporary Pro first',
        expired: 'Expired',
        expiresIn: 'Expires in {count} days',
        expiresInHm: 'Expires in {hours} h {minutes} min',
        expiresInHours: 'Expires in {hours} h',
        expiresInMin: 'Expires in {minutes} min',
        expiresNever: 'Never expires',
        expiresOne: 'Expires in 1 day',
        expiresToday: 'Expires today',
        license: 'Manage license',
        managedByGlobal: 'Managed by Global Admin',
        meetingCount: '{count} meetings',
        meetingCountOne: '1 meeting',
        needsReservedPro: 'Large Meeting would need a Reserved Pro, and none is left',
        noUsage: 'No meetings recorded in the last 30 days.',
        notAssigned: 'Not assigned',
        notConfigured: 'Not available yet',
        open: 'Manage license for {name} (current: {license})',
        quotaLeft: '{left} of {total} left',
        revoke: 'Revoke',
        revokeLabel: 'Revoke {license}',
        usageTitle: 'Usage log · last 30 days'
      },
      loading: {
        busy: 'Loading…',
        working: 'Please wait…'
      },
      manage: {
        assigned: '{license} assigned to {name}.',
        backToProfile: 'Back to profile',
        empty: 'No users match your search.',
        left: '{count} left',
        licenseQuotas: 'License Quotas',
        never: 'Never',
        noPermissionBody: 'Only organization admins can manage users. Switch the demo view to Admin or Global Admin.',
        noPermissionTitle: 'You are not allowed to access this page',
        organization: 'Organization',
        overQuota: 'No {license} licenses left in this quota.',
        quotaGroupCmu: 'Shared Pool',
        quotas: 'Pro Quotas',
        revoked: '{license} revoked from {name}.',
        search: 'Search name or email',
        searchSubmit: 'Search',
        used: '{used}/{total} ({percent}%)'
      },
      meeting: {
        join: 'Join a Meeting',
        schedule: 'Schedule a Meeting',
        section: 'Zoom meetings',
        start: 'Start a Meeting'
      },
      menu: {
        editProfile: 'Edit Profile',
        language: 'Language',
        logout: 'Logout',
        manageAdmins: 'Admin Console',
        manageUsers: 'Manage Users',
        open: 'Open account menu',
        theme: 'Theme',
        themeDark: 'Dark theme',
        themeLight: 'Light theme'
      },
      modal: {
        cancel: 'Cancel',
        close: 'Close'
      },
      nav: {
        booking: 'Booking Center',
        guide: 'User Guide',
        home: 'Go to profile',
        primary: 'Primary',
        terms: 'Terms of Use'
      },
      pagination: {
        next: 'Next page',
        pageOf: 'Page {page} of {total}',
        perPage: 'Rows per page',
        previous: 'Previous page',
        range: '{from}–{to} of {total}'
      },
      poolHolders: {
        empty: 'No one holds this license.',
        orgTitle: '{license} holders · {org}',
        orgView: 'View {license} holders in {org}',
        reservedNote: 'Reserved Pro is used by Large Meeting holders with no main license. Revoke their Large Meeting to free a seat.',
        revokeLabel: 'Revoke {license} from {name}',
        search: 'Search name or email',
        title: '{license} holders',
        view: 'View {license} holders'
      },
      profile: {
        addon: 'Add-on',
        beta: 'Beta',
        expires: 'Expires {date}',
        expiresUnused: 'Expires {date} if unused',
        license: 'License from your organization',
        meetingsHint: 'Meetings open in the Zoom app or your browser.',
        mockOrg: 'Faculty of Engineering',
        proAssigned: 'Pro license assigned from your organization’s quota.',
        recording: 'Save Cloud Recording to your OneDrive',
        recordingDisabled: 'Cloud recordings will no longer sync to your OneDrive.',
        recordingEnabled: 'Cloud recordings will now sync to your OneDrive.',
        recordingHelp: 'When enabled, new Zoom cloud recordings are copied to your CMU OneDrive automatically.',
        recordingHelpLabel: 'About OneDrive recording',
        recordingOff: 'Cloud Recording will stay in Zoom only.',
        recordingOn: 'Cloud Recording will be saved to OneDrive.',
        recordingPopupBlocked: 'Please allow pop-ups to connect your OneDrive.',
        recordingUnavailable: 'Recording sync is unavailable right now.',
        request: 'Request Pro',
        requestUnavailable: 'No Pro licenses left in your organization’s quota.',
        return: 'Return license',
        returnLabel: 'Return {license}',
        returned: 'License returned. You are now a Basic user.',
        returnedAddon: '{license} returned.'
      },
      provision: {
        add: 'Check {email} from MIS',
        notFound: 'No CMU account exists for {email}.',
        success: '{email} was added to CMU Zoom.'
      },
      releaseBooking: {
        action: 'Free up now',
        body: 'Your {license} returns to the shared pool right away, and the rest of this booking is cancelled.',
        confirm: 'Free up now',
        released: 'License returned to the shared pool.',
        releasedLater: 'Booking cancelled. The license ends with the current slot.',
        title: 'Free up this license now?'
      },
      request: {
        body: 'A Pro license from your organization’s quota will be assigned to you right away. Pro removes the 40-minute meeting limit and enables cloud recording.',
        confirm: 'Get Pro',
        termsPrefix: 'By getting Pro, you agree to the',
        title: 'Request a Pro license?'
      },
      return: {
        body: 'Your account will change to Basic (40-minute meetings, no cloud recording). Your organization can assign the license to someone else.',
        bodyAddon: 'You will lose {license}. Your organization can assign it to someone else; your Zoom license is not affected.',
        confirm: 'Return license',
        title: 'Return {license}?'
      },
      role: {
        admin: 'Admin',
        global: 'Global Admin',
        user: 'User'
      },
      stats: {
        ofTotal: '{used}/{total}',
        title: 'Usage summary'
      },
      table: {
        accountType: 'Account Type',
        action: 'Permission',
        lastUse: 'Last Hosted',
        license: 'License',
        manage: 'Manage',
        name: 'Name',
        organization: 'Organization',
        sortAsc: 'ascending',
        sortDesc: 'descending',
        sortNone: '{column}: not sorted. Click to sort.',
        sortState: '{column}: sorted {direction}. Click to change.',
        sortStatePriority: '{column}: sorted {direction}, priority {priority}. Click to change.'
      },
      terms: {
        1: 'You must be a Chiang Mai University lecturer or staff member with a CMU Account.',
        2: 'Request access through the designated online license management system.',
        3: 'A Pro license expires if you leave it unused.',
        accept: 'I understand',
        note1: 'To add an admin for your faculty/organization who can assign and return licenses within it, contact us on LINE:',
        note2: 'The university has a limited number of licenses. Zoom Pro licenses are granted on a first-come, first-served basis.',
        note3: 'Each faculty/organization has its own admin, who sets that period — commonly 30 to 180 days, or never. An expired license returns to the organization’s quota; your own date is on your profile page.',
        notesTitle: 'Notes',
        title: 'Zoom Pro Terms of Use'
      },
      usage: {
        dateTime: 'Date & time',
        duration: 'Duration',
        ended: 'Ended',
        minutes: '{count} min',
        unavailable: 'Usage history could not be loaded.'
      },
      common: {
        error: 'Something went wrong.',
        loading: 'Loading…',
        retry: 'Try again'
      }
    },
    th: {
      accountType: {
        Employee: 'บุคลากร',
        Org: 'หน่วยงาน',
        Student: 'นักศึกษา',
        Teacher: 'อาจารย์'
      },
      actionLogs: {
        allTopics: 'ทุกหมวด',
        count: '{count} รายการ',
        email: 'กรองด้วยอีเมล',
        empty: 'ไม่พบรายการที่ตรงกับตัวกรอง',
        from: 'ตั้งแต่',
        heading: 'บันทึกการดำเนินการ',
        message: 'รายละเอียด',
        time: 'เวลา',
        to: 'ถึง',
        topic: 'หมวด',
        topics: {
          booking: 'การจอง',
          license: 'สิทธิ์การใช้งาน',
          meeting: 'การประชุม',
          organization: 'หน่วยงาน',
          permission: 'สิทธิ์ผู้ดูแล'
        },
        user: 'รหัสบัญชี'
      },
      adminBookings: {
        allLicenses: 'ทุกสิทธิ์',
        bookedBy: 'จองโดย {name}',
        cancelBody: 'ยกเลิกการจองของ {name} หรือไม่? สิทธิ์นี้จะว่างให้ผู้อื่นจองได้',
        cancelLabel: 'ยกเลิกการจองของ {name}',
        cancelledNotified: 'ยกเลิกการจองแล้ว และส่งอีเมลแจ้งผู้ใช้แล้ว',
        cancelledNotifyFailed: 'ยกเลิกการจองแล้ว แต่ส่งอีเมลแจ้งไม่สำเร็จ',
        empty: 'ไม่มีการจองในเดือนนี้',
        heading: 'จัดการ ZOOM Booking',
        legend: 'สีของแต่ละสิทธิ์',
        license: 'สิทธิ์',
        noneThisDay: 'ไม่มีการจองในวันนี้',
        notify: 'ส่งอีเมลแจ้งผู้ใช้',
        otherTimes: 'ช่วงเวลาอื่น',
        today: 'วันนี้',
        truncated: 'เดือนนี้มีการจองมากเกินกว่าจะแสดงได้ทั้งหมด กรองตามสิทธิ์เพื่อดูส่วนที่เหลือ'
      },
      adminQuota: {
        barLabel: 'สิทธิ์ Pro ที่ใช้ไปของ {org}',
        colEdit: 'แก้ไขโควตา',
        colUsage: 'สิทธิ์ Pro ที่ใช้ไป',
        edit: 'แก้ไข',
        editLabel: 'แก้ไขโควตาสิทธิ์ Pro ของ {org}',
        field: 'จำนวนสิทธิ์ Pro',
        inUse: 'ใช้อยู่ {used} สิทธิ์ สูงสุด {max}',
        invalid: 'กรอกจำนวนเต็มระหว่าง {used} ถึง {max}',
        modalTitle: 'แก้ไขโควตาสิทธิ์ Pro',
        orgNotFound: 'ไม่พบหน่วยงานนี้',
        save: 'บันทึกโควตา',
        saved: 'ตั้งโควตาสิทธิ์ Pro ของ {org} เป็น {count} แล้ว',
        title: 'โควตาสิทธิ์ Pro',
        total: '{count} สิทธิ์'
      },
      admins: {
        add: 'เพิ่มผู้ดูแล',
        addLabel: 'เพิ่มผู้ดูแลของ {org}',
        addTitle: 'เพิ่มผู้ดูแล',
        allOrgs: 'ทุกหน่วยงาน',
        assign: 'มอบสิทธิ์',
        assignLabel: 'มอบสิทธิ์ผู้ดูแลให้ {name}',
        assigned: '{name} เป็นผู้ดูแลของ {org} แล้ว',
        empty: 'หน่วยงานนี้ยังไม่มีผู้ดูแล',
        heading: 'ผู้ดูแลหน่วยงาน',
        noCandidates: 'ไม่มีผู้ใช้งานที่เพิ่มได้',
        noPermissionBody: 'เฉพาะผู้ดูแลระบบกลางเท่านั้นที่จัดการผู้ดูแลหน่วยงานได้ ลองเปลี่ยนมุมมองตัวอย่างเป็น Global Admin',
        notFound: 'ไม่พบผู้ใช้งานนี้',
        pageTitle: 'คอนโซลผู้ดูแล',
        revoke: 'ยกเลิกสิทธิ์',
        revokeBody: '{name} จะไม่สามารถจัดการผู้ใช้งานของ {org} ได้อีก',
        revokeLabel: 'ยกเลิกสิทธิ์ผู้ดูแลของ {name}',
        revokeTitle: 'ยกเลิกสิทธิ์ผู้ดูแล?',
        revoked: 'ยกเลิกสิทธิ์ผู้ดูแลของ {name} แล้ว',
        search: 'ค้นหาชื่อหรืออีเมล',
        tabAdmins: 'จัดการผู้ดูแล',
        tabBookings: 'จัดการ ZOOM Booking',
        tabLogs: 'บันทึกการดำเนินการ',
        tabStats: 'สถิติ',
        tabs: 'ส่วนต่าง ๆ ของคอนโซลผู้ดูแล'
      },
      app: {
        name: 'CMU ZOOM'
      },
      booking: {
        bookFor: 'จองให้',
        booked: 'จองแล้ว',
        cancel: 'ยกเลิก',
        cancelled: 'ยกเลิกการจองแล้ว',
        current: 'กำลังใช้งาน',
        dayFull: 'วันนั้นเพิ่งเต็ม กรุณาเลือกวันอื่น',
        emailInvalid: 'กรอกเฉพาะส่วนหน้า {\'@\'}cmu.ac.th (ตัวอักษร ตัวเลข . _ -)',
        emailLabel: 'อีเมล (เฉพาะบัญชี CMU เท่านั้น)',
        emailPlaceholder: 'example.f',
        emailSelf: 'นี่คืออีเมลของคุณ กรุณาเลือก “ตัวเอง” แทน',
        empty: 'คุณยังไม่มีรายการจองที่จะถึง',
        forLabel: 'จองให้ {email}',
        forOther: 'ผู้อื่น',
        forSelf: 'ตัวเอง',
        formTitle: 'จองสิทธิ์',
        full: 'เต็ม',
        hidePast: 'ซ่อนการจองที่ผ่านมา',
        largeMeetingDesc: 'เพิ่มจำนวนผู้เข้าร่วมประชุมได้สูงสุด 1,000 คน',
        myBookings: 'รายการจองของฉัน',
        nextMonth: 'เดือนถัดไป',
        noUpcoming: 'ไม่มีการจองที่กำลังจะมาถึง',
        noteLabel: 'ข้อมูลเพิ่มเติม',
        notePlaceholder: 'เพิ่มเบอร์โทรศัพท์และข้อมูลติดต่อสำหรับกรณีฉุกเฉิน',
        past: 'ที่ผ่านมา',
        pickDateFirst: 'กรุณาเลือกวันก่อนเพื่อดูช่วงเวลา',
        pickLicenseFirst: 'กรุณาเลือกสิทธิ์ก่อนเพื่อดูวันที่ว่าง',
        prevMonth: 'เดือนก่อนหน้า',
        save: 'บันทึกการจอง',
        saveCount: 'บันทึกการจอง · {count} ช่วงเวลา',
        saved: 'จอง {license} วันที่ {date} จำนวน {count} ช่วงเวลา',
        showMore: 'แสดงเพิ่มเติม ({count})',
        showPast: 'แสดงการจองที่ผ่านมา ({count})',
        step: {
          date: 'เลือกวันที่ว่าง',
          details: 'กรอกรายละเอียด',
          license: 'เลือกสิทธิ์',
          time: 'เลือกช่วงเวลา'
        },
        tempProDesc: 'ปลดล็อกข้อจำกัดการประชุม 40 นาที พร้อมสามารถใช้ Cloud Recording ได้',
        tempProLabel: 'Temporary Pro',
        title: 'จองสิทธิ์ ZOOM',
        titleLabel: 'หัวข้อ',
        titlePlaceholder: 'เช่น สัมมนาคณะ',
        upcoming: 'กำลังจะมาถึง',
        userNotFound: 'ผู้ใช้นี้ยังไม่มีในระบบ CMU Zoom กรุณาเพิ่มผู้ใช้ แล้วบันทึกอีกครั้ง'
      },
      cancelBooking: {
        body: 'สิทธิ์ในวันนั้นจะถูกปล่อยให้ผู้อื่นใช้ได้',
        confirm: 'ยืนยัน',
        title: 'ยืนยันการยกเลิกการจอง?'
      },
      confirmBooking: {
        body: 'กรุณาตรวจสอบรายละเอียดด้านล่างก่อนยืนยัน',
        bookedFor: 'จองให้',
        bookingTitle: 'หัวข้อ',
        confirm: 'ยืนยันการจอง',
        date: 'วันที่',
        license: 'สิทธิ์',
        noNote: 'ไม่มีข้อมูลเพิ่มเติม',
        note: 'ข้อมูลเพิ่มเติม',
        self: 'ตัวเอง',
        timeSlots: 'ช่วงเวลา',
        title: 'ยืนยันการจอง'
      },
      confirmLicense: {
        assignBody: '{name} จะได้รับสิทธิ์ {license}',
        assignTitle: 'มอบสิทธิ์ {license}?',
        releasesTempPro: 'สิทธิ์ {license} ของผู้ใช้จะถูกปล่อยคืนโดยอัตโนมัติ',
        revokeBody: '{name} จะสูญเสียสิทธิ์ {license}',
        revokeTitle: 'ยกเลิกสิทธิ์ {license}?',
        slotCurrent: 'ช่วงเวลา {start} – {end}: สิทธิ์จะหมดอายุเวลา {end}',
        slotNext: 'นอกเวลาจอง: สิทธิ์จะหมดอายุเวลา {time} เมื่อช่วงเวลาถัดไปเริ่มต้น'
      },
      demo: {
        label: 'มุมมองตัวอย่าง',
        orgQuota: 'โควตา Pro ของหน่วยงาน',
        quotaAvailable: 'มีว่าง',
        quotaFull: 'เต็ม'
      },
      expiry: {
        days: '{count} วัน',
        desc: 'สิทธิ์ Pro จะถูกคืนเข้าโควตาเมื่อไม่ได้ใช้งานเกิน {count} วัน',
        descNever: 'สิทธิ์ Pro จะไม่หมดอายุแม้ไม่ได้ใช้งาน',
        edit: 'แก้ไข',
        editLabel: 'แก้ไขระยะเวลาหมดอายุสิทธิ์ Pro',
        invalid: 'กรุณาเลือกระยะเวลาจากตัวเลือกที่กำหนด',
        legend: 'สิทธิ์ Pro หมดอายุเมื่อไม่ได้ใช้งานเกิน',
        modalNote: 'มีผลกับผู้ใช้ Pro ทุกคนในหน่วยงานนี้ โดยนับจากวันที่ใช้งานล่าสุด',
        modalTitle: 'แก้ไขระยะเวลาหมดอายุสิทธิ์ Pro',
        never: 'ไม่มีวันหมดอายุ',
        save: 'บันทึก',
        saved: '{org}: ตั้งระยะเวลาหมดอายุสิทธิ์ Pro เป็น {interval} แล้ว',
        title: 'ระยะเวลาหมดอายุสิทธิ์ Pro'
      },
      landing: {
        errorAccountType: 'บัญชี CMU ประเภทนี้ไม่สามารถใช้งาน CMU Zoom ได้',
        errorGeneric: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        errorInactive: 'บัญชี CMU Zoom ของคุณถูกระงับการใช้งาน กรุณาติดต่อ TLIC',
        errorNotProvisioned: 'บัญชี CMU ของคุณยังไม่ได้ลงทะเบียนใช้งาน CMU Zoom กรุณาติดต่อ TLIC',
        errorUnavailable: 'ไม่สามารถเชื่อมต่อระบบ CMU Zoom ได้ กรุณาลองใหม่อีกครั้ง',
        footer: 'ศูนย์นวัตกรรมการสอนและการเรียนรู้ มหาวิทยาลัยเชียงใหม่',
        login: 'เข้าสู่ระบบด้วย CMU Account',
        note: 'ลงชื่อเข้าใช้ด้วยบัญชี {\'@\'}cmu.ac.th ของคุณ',
        subtitle: 'ระบบประชุมออนไลน์สำหรับนักศึกษาและบุคลากรมหาวิทยาลัยเชียงใหม่',
        welcome: 'ยินดีต้อนรับสู่'
      },
      license: {
        basic: 'Basic',
        emergPro: 'Emergency Pro',
        largeMeeting: 'Large Meeting',
        pro: 'Pro',
        reservedPro: 'Pro สำรองสำหรับ Large Meeting',
        tempPro: 'Temporary Pro'
      },
      licenseModal: {
        assign: 'มอบสิทธิ์',
        assignLabel: 'มอบสิทธิ์ {license}',
        assigned: 'ได้รับสิทธิ์แล้ว',
        current: 'สิทธิ์ปัจจุบัน',
        emergBlocked: 'ต้องยกเลิกสิทธิ์ Pro หรือ Temporary Pro ก่อน',
        expired: 'หมดอายุแล้ว',
        expiresIn: 'หมดอายุในอีก {count} วัน',
        expiresInHm: 'หมดอายุในอีก {hours} ชม. {minutes} นาที',
        expiresInHours: 'หมดอายุในอีก {hours} ชม.',
        expiresInMin: 'หมดอายุในอีก {minutes} นาที',
        expiresNever: 'ไม่มีวันหมดอายุ',
        expiresOne: 'หมดอายุในอีก 1 วัน',
        expiresToday: 'หมดอายุวันนี้',
        license: 'จัดการสิทธิ์',
        managedByGlobal: 'จัดการโดยผู้ดูแลระบบกลาง',
        meetingCount: '{count} ครั้ง',
        meetingCountOne: '1 ครั้ง',
        needsReservedPro: 'Large Meeting จะต้องใช้ Pro สำรอง แต่ไม่เหลือแล้ว',
        noUsage: 'ไม่มีการประชุมที่บันทึกไว้ใน 30 วันที่ผ่านมา',
        notAssigned: 'ยังไม่ได้รับสิทธิ์',
        notConfigured: 'ยังไม่เปิดให้ใช้งาน',
        open: 'จัดการสิทธิ์ของ {name} (ปัจจุบัน: {license})',
        quotaLeft: 'เหลือ {left} จาก {total}',
        revoke: 'ยกเลิกสิทธิ์',
        revokeLabel: 'ยกเลิกสิทธิ์ {license}',
        usageTitle: 'ประวัติการใช้งาน 30 วันล่าสุด'
      },
      loading: {
        busy: 'กำลังโหลด…',
        working: 'กรุณารอสักครู่…'
      },
      manage: {
        assigned: 'มอบสิทธิ์ {license} ให้ {name} แล้ว',
        backToProfile: 'กลับไปหน้าโปรไฟล์',
        empty: 'ไม่พบผู้ใช้งานที่ตรงกับการค้นหา',
        left: 'เหลือ {count}',
        licenseQuotas: 'โควตาสิทธิ์การใช้งาน',
        never: 'ยังไม่เคยใช้',
        noPermissionBody: 'เฉพาะผู้ดูแลหน่วยงานเท่านั้นที่จัดการผู้ใช้งานได้ ลองเปลี่ยนมุมมองตัวอย่างเป็น Admin หรือ Global Admin',
        noPermissionTitle: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
        organization: 'หน่วยงาน',
        overQuota: 'สิทธิ์ {license} ในโควตานี้เต็มแล้ว',
        quotaGroupCmu: 'โควตาส่วนกลาง',
        quotas: 'โควตา Pro',
        revoked: 'ยกเลิกสิทธิ์ {license} ของ {name} แล้ว',
        search: 'ค้นหาชื่อหรืออีเมล',
        searchSubmit: 'ค้นหา',
        used: '{used}/{total} ({percent}%)'
      },
      meeting: {
        join: 'เข้าร่วมประชุม',
        schedule: 'นัดหมายการประชุม',
        section: 'การประชุม Zoom',
        start: 'เริ่มการประชุม'
      },
      menu: {
        editProfile: 'แก้ไขโปรไฟล์',
        language: 'ภาษา',
        logout: 'ออกจากระบบ',
        manageAdmins: 'คอนโซลผู้ดูแล',
        manageUsers: 'จัดการผู้ใช้งาน',
        open: 'เปิดเมนูบัญชี',
        theme: 'ธีม',
        themeDark: 'ธีมมืด',
        themeLight: 'ธีมสว่าง'
      },
      modal: {
        cancel: 'ยกเลิก',
        close: 'ปิด'
      },
      nav: {
        booking: 'จองสิทธิ์ ZOOM',
        guide: 'คู่มือการใช้งาน',
        home: 'ไปที่หน้าโปรไฟล์',
        primary: 'เมนูหลัก',
        terms: 'เงื่อนไขการใช้งาน'
      },
      pagination: {
        next: 'หน้าถัดไป',
        pageOf: 'หน้า {page} จาก {total}',
        perPage: 'แถวต่อหน้า',
        previous: 'หน้าก่อนหน้า',
        range: '{from}–{to} จาก {total}'
      },
      poolHolders: {
        empty: 'ยังไม่มีผู้ใช้งานที่ถือสิทธิ์นี้',
        orgTitle: 'ผู้ถือสิทธิ์ {license} · {org}',
        orgView: 'ดูผู้ถือสิทธิ์ {license} ใน {org}',
        reservedNote: 'Reserved Pro ถูกใช้โดยผู้ที่มีสิทธิ์ Large Meeting แต่ไม่มีสิทธิ์หลัก หากต้องการคืนโควตา ให้ยกเลิกสิทธิ์ Large Meeting ของผู้ใช้งานนั้น',
        revokeLabel: 'ยกเลิกสิทธิ์ {license} ของ {name}',
        search: 'ค้นหาชื่อหรืออีเมล',
        title: 'ผู้ถือสิทธิ์ {license}',
        view: 'ดูผู้ถือสิทธิ์ {license}'
      },
      profile: {
        addon: 'สิทธิ์เสริม',
        beta: 'Beta',
        expires: 'หมดอายุ {date}',
        expiresUnused: 'หมดอายุ {date} หากไม่ได้ใช้งาน',
        license: 'สิทธิ์จากหน่วยงานของท่าน',
        meetingsHint: 'การประชุมจะเปิดในแอป Zoom หรือเบราว์เซอร์ของคุณ',
        mockOrg: 'คณะวิศวกรรมศาสตร์',
        proAssigned: 'ได้รับสิทธิ์ Pro จากโควตาของหน่วยงานแล้ว',
        recording: 'เก็บ Cloud Recording ใน OneDrive ของคุณ',
        recordingDisabled: 'ไฟล์บันทึกบนคลาวด์จะไม่ถูกซิงก์ไปยัง OneDrive ของคุณแล้ว',
        recordingEnabled: 'ไฟล์บันทึกบนคลาวด์จะถูกซิงก์ไปยัง OneDrive ของคุณ',
        recordingHelp: 'เมื่อเปิดใช้งาน ไฟล์บันทึกการประชุมบนคลาวด์จะถูกคัดลอกไปยัง CMU OneDrive ของคุณโดยอัตโนมัติ',
        recordingHelpLabel: 'เกี่ยวกับการบันทึกไปยัง OneDrive',
        recordingOff: 'Cloud Recording จะถูกเก็บไว้ใน Zoom เท่านั้น',
        recordingOn: 'Cloud Recording จะถูกบันทึกไปยัง OneDrive',
        recordingPopupBlocked: 'กรุณาอนุญาตป๊อปอัปเพื่อเชื่อมต่อ OneDrive',
        recordingUnavailable: 'ขณะนี้ไม่สามารถใช้งานการซิงก์ไฟล์บันทึกได้',
        request: 'ขอสิทธิ์ Pro',
        requestUnavailable: 'สิทธิ์ Pro ในโควตาของหน่วยงานเต็มแล้ว',
        return: 'คืนสิทธิ์',
        returnLabel: 'คืนสิทธิ์ {license}',
        returned: 'คืนสิทธิ์เรียบร้อย บัญชีของคุณเป็น Basic แล้ว',
        returnedAddon: 'คืนสิทธิ์ {license} เรียบร้อย'
      },
      provision: {
        add: 'ตรวจสอบ {email} จาก MIS',
        notFound: 'ไม่พบบัญชี CMU ของ {email}',
        success: 'เพิ่ม {email} เข้าสู่ CMU Zoom แล้ว'
      },
      releaseBooking: {
        action: 'คืนสิทธิ์ทันที',
        body: 'สิทธิ์ {license} ของท่านจะคืนสู่ส่วนกลางทันที และการจองที่เหลือนี้จะถูกยกเลิก',
        confirm: 'คืนสิทธิ์ทันที',
        released: 'คืนสิทธิ์สู่ส่วนกลางแล้ว',
        releasedLater: 'ยกเลิกการจองแล้ว สิทธิ์จะสิ้นสุดเมื่อจบช่วงเวลาปัจจุบัน',
        title: 'คืนสิทธิ์นี้ทันทีหรือไม่?'
      },
      request: {
        body: 'ท่านจะได้รับสิทธิ์ Pro จากโควตาของหน่วยงานทันที สิทธิ์ Pro ช่วยให้ประชุมได้เกิน 40 นาทีและใช้ Cloud Recording ได้',
        confirm: 'รับสิทธิ์ Pro',
        termsPrefix: 'การรับสิทธิ์ Pro ถือว่าท่านยอมรับ',
        title: 'ขอสิทธิ์ Zoom Pro?'
      },
      return: {
        body: 'บัญชีของคุณจะเปลี่ยนเป็น Basic (ประชุมได้ 40 นาที ไม่มี Cloud Recording) และหน่วยงานสามารถมอบสิทธิ์นี้ให้ผู้อื่นได้',
        bodyAddon: 'ท่านจะไม่สามารถใช้ {license} ได้อีก และหน่วยงานสามารถมอบสิทธิ์นี้ให้ผู้อื่นได้ ทั้งนี้สิทธิ์การใช้ Zoom หลักของท่านไม่เปลี่ยนแปลง',
        confirm: 'คืนสิทธิ์',
        title: 'ยืนยันการคืนสิทธิ์ {license}?'
      },
      role: {
        admin: 'ผู้ดูแล',
        global: 'ผู้ดูแลระบบกลาง',
        user: 'ผู้ใช้'
      },
      stats: {
        ofTotal: '{used}/{total}',
        title: 'ภาพรวมการใช้งาน'
      },
      table: {
        accountType: 'ประเภทบัญชี',
        action: 'สิทธิ์ผู้ดูแล',
        lastUse: 'จัดประชุมล่าสุด',
        license: 'สิทธิ์',
        manage: 'จัดการ',
        name: 'ชื่อ',
        organization: 'หน่วยงาน',
        sortAsc: 'น้อยไปมาก',
        sortDesc: 'มากไปน้อย',
        sortNone: '{column}: ยังไม่เรียงลำดับ คลิกเพื่อเรียง',
        sortState: '{column}: เรียงแบบ{direction} คลิกเพื่อเปลี่ยน',
        sortStatePriority: '{column}: เรียงแบบ{direction} ลำดับความสำคัญ {priority} คลิกเพื่อเปลี่ยน'
      },
      terms: {
        1: 'เป็นอาจารย์หรือเจ้าหน้าที่ของมหาวิทยาลัยเชียงใหม่ที่มี CMU Account',
        2: 'การขอใช้งานให้ทำเรื่องขอผ่านทางระบบจัดการสิทธิ์ออนไลน์ที่กำหนดให้',
        3: 'สิทธิ์ Zoom Pro จะหมดอายุหากไม่มีการใช้งาน',
        accept: 'รับทราบ',
        note1: 'สามารถเพิ่ม Admin ของหน่วยงานเพื่อจัดการ ให้-คืนสิทธิ์ ภายในคณะ/หน่วยงานของท่าน ที่ LINE:',
        note2: 'ทางมหาวิทยาลัยฯ มี License จำกัด การขอใช้สิทธิ์ Zoom Pro เป็นลักษณะมาก่อนได้ก่อน',
        note3: 'แต่ละคณะ/หน่วยงานมี Admin ของตนเองเป็นผู้กำหนดระยะเวลาดังกล่าว โดยทั่วไป 30-180 วัน หรือไม่มีกำหนดหมดอายุ สิทธิ์ที่หมดอายุจะถูกคืนเข้าโควตาของหน่วยงาน และท่านสามารถดูวันหมดอายุของตนเองได้ที่หน้าโปรไฟล์',
        notesTitle: 'หมายเหตุ',
        title: 'เงื่อนไขการใช้งาน Zoom Pro'
      },
      usage: {
        dateTime: 'วันและเวลา',
        duration: 'ระยะเวลา',
        ended: 'สิ้นสุด',
        minutes: '{count} นาที',
        unavailable: 'ไม่สามารถโหลดประวัติการใช้งานได้'
      },
      common: {
        error: 'เกิดข้อผิดพลาด',
        loading: 'กำลังโหลด…',
        retry: 'ลองอีกครั้ง'
      }
    }
  };

  /* ---------- prototype-only keys (no production equivalent) ---------- */

  const PROTOTYPE_ONLY = {
    en: {
      // Signed-in demo user; production shows nameTh in Thai, name in English.
      'demo.userName': 'Anong Srisuk',
      // Alias: the prototype's license key is `emergencyPro`, production's slug is `emergPro`.
      'license.emergencyPro': 'Emergency Pro',
      /* profile-agent */ 'demo.userLicense': 'User license'
    },
    th: {
      'demo.userName': 'อนงค์ ศรีสุข',
      'license.emergencyPro': 'Emergency Pro',
      /* profile-agent */ 'demo.userLicense': 'สิทธิ์ของผู้ใช้'
    }
  };

  /** vue-i18n literal interpolation, e.g. `{'@'}`, renders as the bare character. */
  const LITERAL_INTERPOLATION = /\{'([^']*)'\}/g;

  /**
   * Nested locale object -> flat `{ 'a.b.c': text }` table.
   * @param {Record<string, unknown>} node
   * @param {string} [prefix]
   * @param {Record<string, string>} [out]
   * @returns {Record<string, string>}
   */
  function flatten(node, prefix = '', out = {}) {
    Object.entries(node).forEach(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') {
        flatten(value, path, out);
        return;
      }
      out[path] = String(value).replace(LITERAL_INTERPOLATION, '$1');
    });
    return out;
  }

  /** Production wins whenever both tables define a key. */
  const DICTIONARY = Object.fromEntries(
    Object.keys(PRODUCTION).map((lang) => [
      lang,
      Object.freeze({ ...PROTOTYPE_ONLY[lang], ...flatten(PRODUCTION[lang]) })
    ])
  );

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

  /**
   * @param {string} key
   * @returns {boolean} whether the key exists in the current or fallback language
   */
  function has(key) {
    const table = DICTIONARY[currentLang] || DICTIONARY[FALLBACK_LANG];
    return key in table || key in DICTIONARY[FALLBACK_LANG];
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
    has,
    apply,
    setLang,
    getLang: () => currentLang
  });
})();
