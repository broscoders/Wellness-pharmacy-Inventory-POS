// Hides purchase prices, profit and margins from everyone who does not have the "costs:view" permission
// (in practice: the owner and the inventory/purchasing staff). It works on the way OUT of every API response, so a new
// endpoint or a forgotten field can never leak a cost to a cashier. The screens simply never receive these values.
const COST_KEYS = new Set([
  'purchasePrice', 'purchasePricePerBox', 'costTotal', 'costPerBox', 'costPerBase', 'costValue', 'cost', 'costOf',
  'stockValue', 'stockValueAtCost', 'profit', 'grossProfit', 'margin', 'marginPercent', 'estimatedNetProfit',
  'purchaseCostOfGoodsSold', 'lastPurchasePrice',
]);

function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) if (!COST_KEYS.has(k)) out[k] = scrub(val);
    return out;
  }
  return v;
}

module.exports = function redactCosts(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    // req.user is set later in the chain (by `protect`), so it is checked at the moment the answer is sent
    if (req.user && !req.user.permissions().includes('costs:view')) return json(scrub(JSON.parse(JSON.stringify(body ?? null))));
    return json(body);
  };
  next();
};
module.exports.COST_KEYS = COST_KEYS;
module.exports.scrub = scrub;
