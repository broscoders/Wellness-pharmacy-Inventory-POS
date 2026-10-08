const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Business day boundaries. Pakistan = UTC+5 (300 minutes). Override with BUSINESS_TZ_OFFSET_MIN.
const OFFSET_MIN = Number(process.env.BUSINESS_TZ_OFFSET_MIN ?? 300);

function dayRange(date = new Date()) {
  const local = new Date(date.getTime() + OFFSET_MIN * 60000);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocal - OFFSET_MIN * 60000);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

module.exports = { round2, dayRange };

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (both inclusive, business time zone). Default: this month so far.
function rangeFromQuery(q = {}) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? dayRange(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))).start : null;
  };
  const todayStart = dayRange().start;
  const local = new Date(todayStart.getTime() + OFFSET_MIN * 60000);
  const monthStart = parse(`${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-01`);
  const start = parse(q.from) || monthStart;
  const toStart = parse(q.to) || todayStart;
  return { start, end: new Date(toStart.getTime() + 24 * 3600 * 1000) };
}

// "2026-10-08" in business time
const localDay = (d) => new Date(new Date(d).getTime() + OFFSET_MIN * 60000).toISOString().slice(0, 10);

module.exports.rangeFromQuery = rangeFromQuery;
module.exports.localDay = localDay;
