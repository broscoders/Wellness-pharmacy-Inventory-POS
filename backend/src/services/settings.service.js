const Setting = require('../models/Setting');

// Settings that are read on every sale are cached for a minute so billing stays fast.
let cache = { at: 0, doc: null };
async function getSettings() {
  if (cache.doc && Date.now() - cache.at < 60000) return cache.doc;
  cache = { at: Date.now(), doc: (await Setting.findOne({ key: 'main' }).lean()) || {} };
  return cache.doc;
}
const clearSettingsCache = () => { cache = { at: 0, doc: null }; };
async function maxDiscountPercent() {
  const v = (await getSettings()).maxDiscountPercent;
  return typeof v === 'number' ? v : 10;
}
async function defaultCreditLimit() {
  const v = (await getSettings()).defaultCreditLimit;
  return typeof v === 'number' ? v : 5000;
}
module.exports = { defaultCreditLimit, getSettings, clearSettingsCache, maxDiscountPercent };
