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
