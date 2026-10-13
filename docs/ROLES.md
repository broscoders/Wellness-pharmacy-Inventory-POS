# Who can see and do what

Four roles. The owner can change a person's role on the Users page. Every rule below is enforced **on the server**, not just hidden on the screen, so it cannot be bypassed by typing an address.

| | Owner | Pharmacist | Cashier | Inventory / purchasing |
|---|:-:|:-:|:-:|:-:|
| **Billing (POS)** | Yes | Yes | Yes | No |
| Bills they can see | All | All | Only their own | None |
| Discount at the counter | Any | Up to the shop limit (default 10%) | Up to the shop limit | None |
| Sales returns | Yes | Yes | No | No |
| Cancel an invoice | Yes | No | No | No |
| **Purchase prices, profit and margins** (anywhere) | Yes | **Never shown** | **Never shown** | Yes |
| Find medicines, prices, stock level, shelf location | Yes | Yes | Yes | Yes |
| Add or edit medicines | Yes | Yes (cannot set purchase price) | No | Yes |
| Stock room page, add stock | Yes | Yes (cost is never recorded by them) | No | Yes |
| Adjust stock / **stock take** | Yes | No | No | Yes |
| Suppliers, purchases, purchase orders, **pay suppliers** | Yes | No | No | Yes |
| Customers: view, add, fix name/phone | Yes | View | Yes | No |
| Customers: **udhaar limit**, archive | Yes | No | No (new customers start with the shop default limit) | No |
| Receive udhaar payments from customers | Yes | No | Yes | No |
| Udhaar reminders (WhatsApp) | Yes | Yes | Yes | No |
| Prescriptions | Yes | Yes | No | No |
| Cash closing | Sees every shift and all workings | Own shift, **blind** | Own shift, **blind** | No |
| Home screen after sign-in | Dashboard | POS | POS | Counter home |
| Dashboard | Full business view | Own day and stock alerts | Own day only | Stock alerts |
| Expenses, staff salaries, Finance and profit, Reports, Daily summary | Yes | No | No | No |
| Users, audit log, shop settings, backup | Yes | No | No | No |

## What "blind" cash closing means
The cashier counts the drawer and types the total **without seeing** what the system expects (no opening-plus-sales sum on screen). After pressing Close they are told whether it matched. If it does not match they must write a reason. The owner sees the full workings of every shift. This stops "typing the expected number" and makes differences real.

## Passwords
A password typed by the owner when creating an account or resetting one is **temporary**: at first sign-in the person must choose their own before anything else works. The seeded owner account is treated the same way. Passwords are stored hashed; five wrong attempts slow down further tries.

## Settings the owner controls
Shop settings: the biggest discount staff can give (% of a bill) and the udhaar limit given to customers added by staff.
