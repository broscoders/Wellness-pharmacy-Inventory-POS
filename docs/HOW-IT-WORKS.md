# How the system works (plain language, for the shop owner and for client questions)

## Why the POS is fast now
Before: every letter typed at the counter asked the internet server to search, and on a busy day (or a slow connection) the list lagged.

Now: when the POS opens, the full medicine list (names, generic names, prices, stock, expiry) is loaded **once into the computer's memory**. After that:

- Typing a name, generic name, company or part of a barcode shows results **instantly**, no internet needed for the search itself (about 5 milliseconds for 5,000 medicines).
- A barcode scanner adds the medicine the moment it presses Enter.
- The medicine list is also **visible on the POS screen itself** (best sellers first, category buttons), so the cashier can just click or press the arrow keys and Enter.
- Every 30 seconds the screen quietly asks the server "what changed?" (a very small request) so sales from other counters, price changes and new stock appear on their own.
- The list is saved in the browser, so tomorrow morning the POS opens immediately, and it still searches if the internet drops for a while (selling then needs the internet again).

The server still has the last word: when a bill is completed, the server re-checks stock, expiry and prices. An old screen can never sell expired or missing stock.

## Counter shortcuts
| Key | What it does |
|---|---|
| Type / scan, then **Enter** | Add the highlighted medicine (scanner: exact barcode) |
| **Up / Down** | Choose a different result |
| `3*pana` then Enter | Add 3 of the first match |
| **F2** | Jump back to the search box |
| **F4** | Edit the quantity of the last added medicine |
| **F8** | Hold this bill (serve another customer first) |
| **F9** | Complete the sale |
| **Enter** on the receipt window | Start a new sale (**P** prints) |

If the customer pays the exact amount in cash, the cashier types nothing: F9 completes the bill with exact cash. For bigger notes there are quick buttons and the change is shown. Discount accepts an amount (`50`) or a percentage (`10%`).

## Cash closing (every cashier, every shift)
1. **Start of shift:** Cash closing > count the drawer > enter the amount > Open shift.
2. **During the day:** sell as usual. Money that is not a sale (owner takes cash, tea, change from the bank) goes in "Cash in / out" with a reason.
3. **End of shift:** count the cash and type the total (without looking at the expected figure). The system compares it with what the drawer should hold: opening cash + cash sales + udhaar payments received - cash refunds - supplier payments - cash expenses - cash taken out. Card, bank and udhaar sales are not cash and are shown separately.
4. **Any difference needs a written reason.** The owner sees every shift, who closed it, and the difference.
The POS shows a reminder if no shift is open. A cashier can only see their own shifts.

## Purchase orders
- **Purchase orders > From low stock > pick a supplier:** a draft order is made with that supplier's low and finished medicines, in whole boxes. Change quantities, add medicines, set an expected date.
- **Mark as sent** (locks it), **Print** to give or send to the supplier.
- When the goods arrive: **Receive stock** opens the purchase form already filled in. Add batch number and expiry from the packs. Partial deliveries are tracked ("2 of 3 boxes received") and the order closes itself when everything has come.
- Cancelling needs a reason; finished orders cannot be changed.

## Substitutes
If a medicine is out of stock or expired, the POS lists other brands with the same generic name that are in stock, same strength first. There is also an "Alternatives" link on every bill line. It only suggests; the pharmacist decides whether a substitute is suitable.

## Safety rules the system enforces
- Expired medicine can never be sold (checked again on the server).
- The earliest-expiry batch is sold first (FEFO).
- Stock cannot go below zero, even if two counters sell the last pack at the same moment.
- **Double-click / slow internet cannot create two bills:** each bill has a unique key; if the same bill is sent twice the server returns the first one.
- Prescription (Rx) medicines need a prescription check before the sale.
- Udhaar needs a customer and respects the credit limit.
- Returns, cancellations, stock adjustments, discounts and price changes are written to the audit log; staff cannot delete financial records.

## Roles
Owner (everything), Pharmacist, Cashier, Inventory. Profit, purchase cost and payables are visible to the owner only. The POS medicine list never contains purchase prices.

## Likely client questions
- **"What if the internet goes down?"** The list still searches. Completing a sale needs the server; the screen says so clearly and nothing is lost. Hold bills stay on the computer.
- **"Can two people use it at once?"** Yes. Stock is updated safely and every counter sees the other's sales within 30 seconds.
- **"Is my data safe?"** Passwords are hashed, sessions expire, every action is permission-checked, and `npm run backup` saves a full copy (restore tested).
- **"Can we bring our register data?"** Yes: Medicines, Import from file (CSV from Excel). It checks the file first and never doubles stock if uploaded twice.
- **"How many medicines can it handle?"** Tested with 5,000 on the POS list. Shops with 20,000+ still work; the first load is a few seconds, then everything is instant.
