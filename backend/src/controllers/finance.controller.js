const asyncHandler = require('../utils/asyncHandler');
const { rangeFromQuery, localDay } = require('../utils/money');
const { profitFor, previousRange, monthlyTrend, balanceSnapshot, pricingIssues } = require('../services/finance.service');

// Everything the owner needs on one screen: this period, the period before it, six-month trend, what the shop owns and owes.
const summary = asyncHandler(async (req, res) => {
  const range = rangeFromQuery(req.query);
  const prev = previousRange(range.start, range.end);
  const [current, previous, trend, balance] = await Promise.all([profitFor(range.start, range.end), profitFor(prev.start, prev.end), monthlyTrend(6), balanceSnapshot()]);
  const meta = (r) => ({ from: localDay(r.start), to: localDay(new Date(r.end.getTime() - 1)) });
  res.json({ success: true, range: meta(range), previousRange: meta(prev), data: { current, previous, trend, balance } });
});

const pricing = asyncHandler(async (req, res) => {
  const data = await pricingIssues();
  res.json({ success: true, data, counts: data.reduce((c, x) => ({ ...c, [x.issue]: (c[x.issue] || 0) + 1 }), {}) });
});

module.exports = { summary, pricing };
