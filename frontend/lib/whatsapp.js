// WhatsApp "click to chat" links: the staff member taps, WhatsApp opens with the message already written, and presses Send.
// No WhatsApp Business account or API key is needed (and nothing is ever sent without a human pressing Send).
export const DEFAULT_COUNTRY_CODE = '92'; // Pakistan; local numbers like 0300-1234567 become 92300...

// "0300-1234567" -> "923001234567", "+92 300 1234567" -> "923001234567". Returns '' when it cannot be a real number.
export function waNumber(phone, cc = DEFAULT_COUNTRY_CODE) {
  let d = String(phone ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = cc + d.slice(1);
  else if (!d.startsWith(cc) && d.length <= 10) d = cc + d;
  return /^\d{10,15}$/.test(d) ? d : '';
}

export const waLink = (phone, text) => {
  const n = waNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`; // no number = WhatsApp lets the user pick a contact
};

const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-US')}`;

export const udhaarMessage = ({ name, balance, shop }) =>
  `Assalam o Alaikum ${name},\n${shop} ki taraf se yaad dahani: aap ka ${rs(balance)} udhaar baqi hai.\nMehrbani farma kar jald ada kar dein. Shukriya.`;

export const receiptMessage = ({ shop, sale }) =>
  `${shop}\nInvoice ${sale.invoiceNo}\nTotal: ${rs(sale.total)}${sale.creditAmount > 0 ? `\nUdhaar baqi (is bill ka): ${rs(sale.creditAmount)}` : ''}\nShukriya, dobara tashreef layein!`;

export const returnMessage = ({ shop, supplier, lines }) =>
  `Assalam o Alaikum ${supplier},\n${shop} ki taraf se in medicines ki wapsi/claim ki request hai:\n${lines.map((l) => `- ${l.name}, batch ${l.batchNumber}, expiry ${l.expiry}, qty ${l.qty}`).join('\n')}\nBarah-e-karam confirm karein. Shukriya.`;

export const dailyMessage = (d) => {
  const lines = [
    `*${d.shopName}* - ${d.date}`,
    `Sales: ${rs(d.sales.total)} (${d.sales.bills} bills)`,
    `Cash ${rs(d.sales.cash)} | Card ${rs(d.sales.card)} | Bank ${rs(d.sales.bank)} | Udhaar ${rs(d.sales.credit)}`,
    `Gross profit: ${rs(d.profit.grossProfit)} (${d.profit.grossMarginPercent}%)`,
    `Expenses today: ${rs(d.profit.expenses)}`,
    `Net profit today: ${rs(d.profit.netProfit)}`,
    `Udhaar given ${rs(d.udhaar.given)} | received ${rs(d.udhaar.received)} | total owed ${rs(d.udhaar.totalOwed)}`,
    `Supplier payables: ${rs(d.payables)}`,
  ];
  if (d.cash.shiftsClosed) lines.push(d.cash.difference === 0 ? 'Cash drawers matched.' : `CASH DIFFERENCE: ${rs(d.cash.difference)} (${d.cash.shortOrExtra.map((s) => `${s.user} ${s.difference > 0 ? '+' : ''}${s.difference}`).join(', ')})`);
  const a = d.stockAlerts;
  lines.push(`Stock: ${a.outOfStock} out, ${a.lowStock} low | Expired ${a.expired} | Expiring in 30 days ${a.nearExpiry30}`);
  if (d.topSellers.length) lines.push(`Top: ${d.topSellers.map((t) => t.name).join(', ')}`);
  return lines.join('\n');
};
