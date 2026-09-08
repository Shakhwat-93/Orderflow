/**
 * AI Date & Intent Parser for E-Commerce Order Management System
 * Timezone: Asia/Dhaka (UTC+6 / BST)
 * Supports: Bengali, Banglish, and English relative datetime expressions.
 */

const DHAKA_OFFSET_HOURS = 6;
const DHAKA_OFFSET_MS = DHAKA_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Get reliable current time in Asia/Dhaka timezone
 * Returns both the current Date object and local parts in BST.
 */
export function getDhakaNow(referenceDate = new Date()) {
  const utcTime = referenceDate.getTime();
  const dhakaTime = new Date(utcTime + DHAKA_OFFSET_MS);

  const year = dhakaTime.getUTCFullYear();
  const month = dhakaTime.getUTCMonth(); // 0-indexed
  const date = dhakaTime.getUTCDate();
  const hours = dhakaTime.getUTCHours();
  const minutes = dhakaTime.getUTCMinutes();
  const seconds = dhakaTime.getUTCSeconds();
  const day = dhakaTime.getUTCDay(); // 0 = Sunday

  return {
    nowUtc: referenceDate,
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    day,
    // Helper to construct UTC Date from Dhaka local (year, month, date, h, m, s)
    createUtcFromDhaka: (y, m, d, h = 0, min = 0, s = 0, ms = 0) => {
      const utcMs = Date.UTC(y, m, d, h, min, s, ms) - DHAKA_OFFSET_MS;
      return new Date(utcMs);
    }
  };
}

/**
 * Convert Bengali digits to English digits
 */
export function toEnglishDigits(str = '') {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(str).replace(/[০-৯]/g, (d) => bnDigits.indexOf(d));
}

/**
 * Detect order status filter from text
 */
export function detectStatusFilter(text = '') {
  const norm = String(text).toLowerCase();

  if (norm.includes('confirmed') || norm.includes('কনফার্ম') || norm.includes('confirm')) {
    return 'Confirmed';
  }
  if (norm.includes('pending') || norm.includes('পেন্ডিং')) {
    return 'Pending'; // Special keyword: covers 'Pending Call' & 'New'
  }
  if (norm.includes('cancelled') || norm.includes('বাতিল') || norm.includes('ক্যানসেল') || norm.includes('cancel')) {
    return 'Cancelled';
  }
  if (norm.includes('bulk export') || norm.includes('বাল্ক এক্সপোর্ট')) {
    return 'Bulk Exported';
  }
  if (norm.includes('incomplete') || norm.includes('অসম্পূর্ণ') || norm.includes('ড্রাফট')) {
    return 'Incomplete';
  }
  if (norm.includes('fake') || norm.includes('ভুয়া') || norm.includes('ভুয়া')) {
    return 'Fake Order';
  }

  return null;
}

/**
 * Parse time of day from Bengali/English
 */
function parseTimeOffset(timeSnippet = '') {
  const norm = toEnglishDigits(String(timeSnippet).toLowerCase());

  const hourMatch = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(?:টা|am|pm)?/);
  if (!hourMatch) return null;

  let h = parseInt(hourMatch[1], 10);
  const m = hourMatch[2] ? parseInt(hourMatch[2], 10) : 0;

  const isPm = norm.includes('pm') || norm.includes('বিকাল') || norm.includes('সন্ধ্যা') || norm.includes('রাত') || norm.includes('দুপুর');
  const isAm = norm.includes('am') || norm.includes('সকাল') || norm.includes('ভোর');

  if (isPm && h < 12) {
    if (h !== 12) h += 12;
  } else if (isAm && h === 12) {
    h = 0;
  }

  return { hours: h, minutes: m };
}

/**
 * Parse natural language date/time range in Asia/Dhaka timezone
 */
export function parseDateAndIntent(query = '', refDate = new Date()) {
  const norm = toEnglishDigits(String(query).toLowerCase().trim());
  const dhaka = getDhakaNow(refDate);

  const statusFilter = detectStatusFilter(norm);

  const isBusinessQuery = /(order|অর্ডার|sales|বিক্রি|টাকা|revenue|সেল|কতটি|কয়টা|কয়টা|মোট|হয়েছে|হয়েছে|count|confirmed|pending|বাকি|স্টক|inventory|প্রোডাক্ট)/i.test(norm);

  let startDate = null;
  let endDate = null;
  let label = '';
  let isDateSpecific = false;
  let isAmbiguous = false;

  // Pattern 1: "গতকাল সন্ধ্যা ৬টা থেকে আজ সকাল পর্যন্ত" (Check morning end boundary first)
  const yestToTodayMorningMatch = norm.match(/(?:গতকাল|কালকে|কাল|yesterday)\s*(?:সন্ধ্যা|বিকাল|রাত|সকাল)?\s*(\d{1,2}(?::\d{2})?\s*(?:টা|am|pm)?)\s*(?:থেকে|to)\s*(?:আজ|আজকে|today)\s*(?:সকাল|morning|ভোর)/i);
  if (yestToTodayMorningMatch) {
    const startParsed = parseTimeOffset(yestToTodayMorningMatch[0]) || { hours: 18, minutes: 0 };
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, startParsed.hours, startParsed.minutes, 0);
    // Morning boundary: 12:00 PM noon BST
    const morningEnd = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date, 12, 0, 0);
    endDate = refDate < morningEnd ? refDate : morningEnd;
    label = `গতকাল ${startParsed.hours > 12 ? `সন্ধ্যা ${startParsed.hours - 12}টা` : `${startParsed.hours}টা`} থেকে আজ সকাল (দুপুর ১২টা) পর্যন্ত`;
    isDateSpecific = true;
  }
  // Pattern 2: "কালকে বিকাল ৬টা থেকে আজকে" / "গতকাল সন্ধ্যা ৬টা থেকে আজ" / "yesterday 6pm to today"
  else if (
    norm.match(/(?:গতকাল|কালকে|কাল|yesterday|kalke|gotokal)\s*(?:সন্ধ্যা|বিকাল|রাত|সকাল|দুপুর)?\s*(\d{1,2}(?::\d{2})?\s*(?:টা|am|pm)?)\s*(?:থেকে|to)\s*(?:আজকে|আজ|today|ajke|aaj)/i) ||
    norm.match(/(?:yesterday|গতকাল|কালকে)\s*(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|টা))\s*(?:to|থেকে)\s*(?:today|আজ)/i)
  ) {
    const fullMatch = norm.match(/(?:গতকাল|কালকে|কাল|yesterday|kalke|gotokal)\s*(?:সন্ধ্যা|বিকাল|রাত|সকাল|দুপুর)?\s*(\d{1,2}(?::\d{2})?\s*(?:টা|am|pm)?)\s*(?:থেকে|to)\s*(?:আজকে|আজ|today|ajke|aaj)/i)
      || norm.match(/(?:yesterday|গতকাল|কালকে)\s*(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|টা))\s*(?:to|থেকে)\s*(?:today|আজ)/i);
    const parsedTime = parseTimeOffset(fullMatch ? fullMatch[0] : norm) || { hours: 18, minutes: 0 };
    const h = parsedTime.hours;
    const min = parsedTime.minutes;
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, h, min, 0);
    endDate = refDate;
    label = `গতকাল ${h > 12 ? `বিকাল/সন্ধ্যা ${h - 12}টা` : `${h}টা`} থেকে আজ পর্যন্ত`;
    isDateSpecific = true;
  }
  // Pattern 3: "গতকাল" / "কালকে" / "yesterday" (Full day yesterday 00:00 to 23:59:59)
  else if ((norm.includes('গতকাল') || norm.includes('কালকে') || norm.includes('gotokal') || norm.includes('yesterday')) && !norm.includes('থেকে') && !norm.includes('to')) {
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, 0, 0, 0, 0);
    endDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - 1, 23, 59, 59, 999);
    label = 'গতকাল (পুরো দিন)';
    isDateSpecific = true;
  }
  // Pattern 4: "আজকে" / "আজ" / "today" / "ajke"
  else if (norm.includes('আজকে') || norm.includes('আজ') || norm.includes('today') || norm.includes('ajke') || norm.includes('aaj')) {
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date, 0, 0, 0, 0);
    endDate = refDate;
    label = 'আজকে (মধ্যরাত থেকে এখন পর্যন্ত)';
    isDateSpecific = true;
  }
  // Pattern 5: "গত ২৪ ঘন্টা" / "last 24 hours"
  else if (norm.includes('২৪ ঘন্টা') || norm.includes('24 ঘন্টা') || norm.includes('last 24 hours') || norm.includes('past 24 hours')) {
    startDate = new Date(refDate.getTime() - (24 * 60 * 60 * 1000));
    endDate = refDate;
    label = 'বিগত ২৪ ঘণ্টা';
    isDateSpecific = true;
  }
  // Pattern 6: "এই মাস" / "this month" / "ei mash"
  else if (norm.includes('এই মাস') || norm.includes('this month') || norm.includes('ei mash') || norm.includes('চলতি মাস')) {
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, 1, 0, 0, 0, 0);
    endDate = refDate;
    label = 'চলতি মাস (১ তারিখ থেকে এখন পর্যন্ত)';
    isDateSpecific = true;
  }
  // Pattern 7: "গত মাস" / "last month" / "goto mash"
  else if (norm.includes('গত মাস') || norm.includes('last month') || norm.includes('goto mash')) {
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month - 1, 1, 0, 0, 0, 0);
    endDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, 0, 23, 59, 59, 999);
    label = 'গত মাস (পুরো মাস)';
    isDateSpecific = true;
  }
  // Pattern 8: "এই সপ্তাহ" / "this week" / "ei shoptaho"
  else if (norm.includes('এই সপ্তাহ') || norm.includes('this week') || norm.includes('ei shoptaho')) {
    const daysSinceSaturday = (dhaka.day + 1) % 7;
    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date - daysSinceSaturday, 0, 0, 0, 0);
    endDate = refDate;
    label = 'এই সপ্তাহ';
    isDateSpecific = true;
  }
  // Pattern 9: "সকাল ১০টা থেকে দুপুর ২টা"
  else if (norm.match(/সকাল\s*(\d{1,2})\s*টা?\s*(?:থেকে|to)\s*দুপুর\s*(\d{1,2})/)) {
    const m = norm.match(/সকাল\s*(\d{1,2})\s*টা?\s*(?:থেকে|to)\s*দুপুর\s*(\d{1,2})/);
    const startH = parseInt(m[1], 10);
    let endH = parseInt(m[2], 10);
    if (endH < 12) endH += 12;

    startDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date, startH, 0, 0);
    endDate = dhaka.createUtcFromDhaka(dhaka.year, dhaka.month, dhaka.date, endH, 0, 0);
    label = `আজ সকাল ${startH}টা থেকে দুপুর ${endH > 12 ? endH - 12 : endH}টা`;
    isDateSpecific = true;
  }
  // Pattern 10: Pending orders without explicit date
  else if (statusFilter === 'Pending' || norm.includes('pending') || norm.includes('পেন্ডিং')) {
    startDate = null;
    endDate = null;
    label = 'সিস্টেমের সকল পেন্ডিং অর্ডার';
    isDateSpecific = false;
  }
  // Pattern 11: General total order count question (e.g. "টোটাল কয়টা অর্ডার?")
  else if (norm.match(/(?:total|মোট|সব|সবগুলো|all)\s*(?:order|অর্ডার)/i) || norm.match(/(?:order|অর্ডার)\s*(?:total|মোট)/i)) {
    startDate = null;
    endDate = null;
    label = 'সিস্টেমের সর্বমোট (All-Time)';
    isDateSpecific = false;
  } else if (isBusinessQuery) {
    isAmbiguous = true;
  }

  return {
    isBusinessQuery,
    isDateSpecific,
    startDate,
    endDate,
    statusFilter,
    label,
    isAmbiguous
  };
}
