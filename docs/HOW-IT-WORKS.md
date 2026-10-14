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

## Screen space on a small laptop
- The 3-bar button at the top of the menu folds it into a thin icon strip (hover an icon to see its name). The 3-bar button on the strip opens the full menu over the page, like on a phone. The choice is remembered on that computer.
- The medicine list on the POS is plain A to Z (it is not reordered by what sold most). The bill shows the whole medicine name, its generic name and maker, the unit, quantity, rate and amount.
- The Total and the Complete sale button stay at the bottom; if the screen is short, the customer, cash and prescription part scrolls inside its own box. Browser zoom 90% (Ctrl and minus) shows even more.

## Counter shortcuts
| Key | What it does |
|---|---|
| Type / scan, then **Enter** | Add the highlighted medicine (scanner: exact barcode) |
| **Up / Down**, then **Enter** | Choose a row in the list and add it. No typing needed; works even after you clicked a button or a category |
| Just start typing | The letters go to the search box from anywhere on the POS |
| `3*pana` then Enter | Add 3 of the first match |
| **F2** | Jump back to the search box |
| **F4** | Edit the quantity of the last added medicine |
| **F8** | Hold this bill (serve another customer first) |
| **F9** or **Ctrl+Enter** | Complete the sale (Ctrl+Enter is for laptops where F9 needs the Fn key). If the bill cannot be completed, the screen says why (for example: tick the prescription check, choose a customer for udhaar) |
| **Enter** on the receipt window | Start a new sale (**P** prints) |

If the customer pays the exact amount in cash, the cashier types nothing: F9 completes the bill with exact cash. For bigger notes there are quick buttons and the change is shown. The Discount box is in percent: type `2` for 2% off (the rupee amount is shown next to it). For a fixed amount type `rs 50`.

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

## Finance and profit (owner)
**Finance & profit** answers "did the shop really make money?":
- **Net sales** = sales minus returns. **Gross profit** = net sales minus what the sold medicines cost (the real purchase cost of the batches sold). **Margin %** = profit as a share of net sales.
- **Expenses** (rent, electricity, internet, delivery, maintenance, salaries...) are taken off gross profit to give **net profit** and **net margin %**. Each expense shows its share of sales, so the owner sees what is eating the profit.
- Every figure is compared with the same-length period before it, and the last 6 months are shown as a trend.
- It also shows what the shop holds (stock at cost) and owes/is owed (udhaar, supplier payables).
- **Price check** lists medicines that lose money, have a tiny margin, are above MRP, or have no sale price.

## Staff salaries
Staff salaries > add each person with their monthly salary. For every month the sheet shows salary, paid, advance, bonus and what is still to pay. **Pay** records a salary, an advance (deducted from that month's salary) or a bonus (extra). Each payment automatically becomes an expense, so profit is correct; a wrongly entered payment is voided with a reason (it disappears from expenses too). Only the owner can see this page.

## Where is the medicine? (shelf location)
Each medicine can have a rack, row and side ("Rack C | Row 2 | Left"), a dosage form, a storage type (fridge items show a warning) and an MRP. The location is shown on the POS list and on the bill, and typing "rack c" at the counter finds everything on that rack. The system refuses a sale price above MRP. Import from Excel accepts the same columns.

## Barcode labels
Barcode labels > **Give barcodes to all without one**: every medicine that has no barcode gets the shop's own EAN-13 number (starting with 20, reserved worldwide for in-store use). Search medicines, set how many labels each needs, choose A4 label sheet (3 x 8) or a 50 x 30 mm roll, and Print. Stick the label on the pack: from then on a scanner adds it at the POS like any other medicine.

## Udhaar reminders
Udhaar reminders lists customers who owe money and have not paid for 7 / 15 / 30 / 60+ days (counted from their last payment). **WhatsApp** opens WhatsApp with the message already written (name, amount, shop name); the staff member only presses Send. The date of the last reminder is remembered so nobody is nagged by mistake. Nothing is sent automatically. The POS receipt window also has a WhatsApp button to send the bill total to a customer.

## Expiry returns
Expiry returns shows expired stock and near-expiry stock per supplier. For each batch it estimates whether it will sell before it expires, using the last 30 days of sales and earliest-expiry-first selling. Batches that will not are the ones to return to the supplier or discount now. Print the list or send it on WhatsApp. When the supplier accepts, record it in Purchases (Return).

## Daily summary and backup
**Daily summary** gathers the day: sales and how customers paid, gross and net profit, expenses, udhaar given/received, cash drawer differences, stock alerts, top sellers and staff sales. **Send on WhatsApp** shares it as text. **Settings > Backup > Download backup** saves the whole database as one file (do it weekly; the dashboard warns the owner after 7 days). To restore: `npm run restore -- <file.json> --yes` (with CONFIRM_DB_NAME set). Keep the file private: it contains staff password hashes.

## Stock take (physical count)
Stock take > choose a rack > count the packs on the shelf and type them (boxes, strips, loose units). The counting sheet does **not** show the system quantity, so people count instead of copying. **Review differences** shows system vs counted, short and extra, with the value at cost for the owner. **Apply** records one stock adjustment per difference with the note and the person's name. If a sale happens while you are reviewing, the system asks you to review again, so a count never overwrites a sale. Rack, row and side on each medicine (Medicines page) make this fast.

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
See `docs/ROLES.md` for the full table. In short:
Owner (everything), Pharmacist, Cashier, Inventory. Profit, purchase cost and payables are visible to the owner only. The POS medicine list never contains purchase prices.

## Likely client questions
- **"What if the internet goes down?"** The list still searches. Completing a sale needs the server; the screen says so clearly and nothing is lost. Hold bills stay on the computer.
- **"Can two people use it at once?"** Yes. Stock is updated safely and every counter sees the other's sales within 30 seconds.
- **"Is my data safe?"** Passwords are hashed, sessions expire, every action is permission-checked, and `npm run backup` saves a full copy (restore tested).
- **"Can we bring our register data?"** Yes: Medicines, Import from file (CSV from Excel). It checks the file first and never doubles stock if uploaded twice.
- **"How many medicines can it handle?"** Tested with 5,000 on the POS list. Shops with 20,000+ still work; the first load is a few seconds, then everything is instant.
