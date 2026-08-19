# Purchase orders for school & institutional customers

How to let schools, districts and libraries buy from alphabet-trains.com on a
purchase order instead of a credit card — using what Magento already ships,
plus one small module for the part it doesn't cover.

Written for **Magento Open Source 2.4.x**. If the store is on **Adobe Commerce**,
skip to [Adobe Commerce](#if-youre-on-adobe-commerce) — you get most of this natively.

---

## What a school actually needs

A school purchase almost never looks like a retail checkout. The typical sequence is:

1. A teacher builds a cart and needs a **written quote** to hand to their business office.
2. The business office issues a **PO number** and mails/emails the PO document.
3. The order ships against that PO — **no payment at checkout**.
4. You **invoice** the district; they pay net 30 (sometimes net 45/60).
5. Many are **sales-tax exempt** and have a certificate on file.

So "purchase orders" is really four mechanisms: a PO payment method, an account
type that's allowed to use it, tax exemption, and a quote document. All four are
doable on Open Source.

---

## 1. Turn on the built-in Purchase Order payment method

Magento Open Source already ships this (`Magento_OfflinePayments`, method code
`purchaseorder`). It is off by default.

**Stores → Configuration → Sales → Payment Methods → Purchase Order**

| Setting | Value |
| --- | --- |
| Enabled | Yes |
| Title | `Purchase Order (schools & institutions)` |
| New Order Status | `Pending` |
| Payment from Applicable Countries | as needed |
| Minimum Order Total | e.g. `100` — keeps casual retail orders out |
| Sort Order | put it last, below the card methods |

What it does: the customer types their PO number at checkout and the order is
placed with **no payment captured**. The number is stored on the order
(`sales_order_payment.po_number`) and prints on the order view, the invoice, and
the PDF documents. You invoice it offline in the admin when you're ready to bill.

That's the whole payment mechanism. The catch is that it's now visible to
*everyone*, including retail shoppers — which is what step 2 fixes.

---

## 2. Create a customer group for institutions

**Customers → Customer Groups → Add New Customer Group**

Create e.g. **`Schools & Institutions`**. Note its ID (shown in the grid) — you'll
select it in step 3.

Assign accounts to it manually (**Customers → All Customers →** edit **→ Account
Information → Customer Group**) after you've verified the school is real. That
manual step *is* your credit-approval process — don't automate it.

Two things worth doing at the same time:

- Give the group a **catalog price rule** if schools get institutional pricing.
- Point the group at a **tax class** (see step 4).

For sign-ups, add a "School / district account request" form — either the
built-in **Contact Us** form with extra fields, or a custom form — that captures
district name, billing contact, tax-exemption certificate, and AP email. Approve
and move the account into the group by hand.

---

## 3. Restrict the PO method to that group (the included module)

Magento's payment config can restrict a method by country and by order total —
but **not by customer group**. That gap is why the module in
`app/code/AlphabetTrains/SchoolPo/` exists. It's ~120 lines: it observes the core
`payment_method_is_active` event and hides `purchaseorder` at checkout unless the
quote's customer group is on your approved list.

### Install

```bash
# from your Magento root, with the store in maintenance mode
cp -r magento/school-purchase-orders/app/code/AlphabetTrains app/code/

bin/magento maintenance:enable
bin/magento module:enable AlphabetTrains_SchoolPo
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy -f       # production mode only
bin/magento cache:flush
bin/magento maintenance:disable
```

### Configure

Back in **Stores → Configuration → Sales → Payment Methods → Purchase Order**,
two new fields appear below the standard ones:

- **Limit to Specific Customer Groups** → `Yes`
- **Allowed Customer Groups** → select `Schools & Institutions`

Behaviour: guests and retail customers never see the method. Admin-created orders
are deliberately *not* restricted, so your staff can always place a PO order on a
school's behalf from **Sales → Orders → Create New Order**.

### Verify

- Log in as a retail customer → PO is absent at checkout.
- Log in as a school-group customer → PO appears, accepts a PO number.
- Place one → order status `Pending`, PO number visible on the order view.
- Admin → Create New Order for a retail customer → PO still selectable.

---

## 4. Tax exemption

Most districts are exempt, so don't charge them tax and then refund it.

1. **Stores → Tax Rules → Additional Settings → Customer Tax Class → Add New** →
   `Tax Exempt — Institutional`.
2. **Customers → Customer Groups →** edit `Schools & Institutions` → set **Tax
   Class** to that new class.
3. **Stores → Tax Rules** — either create a rule at 0% for that customer tax
   class, or simply leave the class out of your existing rules so nothing matches.

Keep the signed exemption certificate on file per district. Anyone in the group
who *isn't* exempt needs a separate group (`Schools — Taxable`) pointed at the
normal tax class.

---

## 5. Quotes / proforma invoices

Open Source has no native "Request a Quote". Three options, cheapest first:

**a. Admin-built order as the quote (free, works today).**
**Sales → Orders → Create New Order**, build the cart for the school, apply
institutional pricing, and save it **without invoicing**. Email the order
confirmation / print the order PDF — that document carries your line items,
totals and terms, and the business office can raise a PO against it. When the PO
arrives, add the number to the order and ship. This is how most small stores
handle it, and it costs nothing.

**b. "Email my cart" (free-ish, one small template).**
Add a *Request a Quote* button on the cart page that posts the cart contents to
your sales inbox and confirms to the teacher. You then do (a). Small custom
module or a form extension.

**c. A quote extension (paid).**
Aheadworks, Amasty, Mageplaza and others sell *Request a Quote* / *B2B Company
Accounts* modules for Open Source that add negotiable quotes, quote-to-order
conversion, and multi-user company accounts. Worth it once you're fielding more
than a handful of quote requests a week — not before.

---

## 6. Operating the workflow

Once an order is placed on a PO:

- **Verify the PO** against the emailed document before shipping. The order sits
  at `Pending` until you do.
- **Ship**, then **Invoice** (**Sales → Orders →** order **→ Invoice**, payment
  action *Offline*). That's the document your AP contact needs.
- **Chase payment** from **Sales → Invoices**, filtered to unpaid.
- **Terms**: put net-30 language in **Stores → Terms and Conditions** and enable
  the checkout agreement so it's accepted at order time.
- **Credit limits** are not native. Practically: cap **Maximum Order Total** on
  the PO method, and un-assign a district from the group if they go delinquent.

Also add a static CMS page — *"Purchase orders & school accounts"* — explaining
how to open an account, and link it in the footer. For a store selling to
schools, that page tends to convert better than any of the config above; teachers
searching for whether you take POs need to find the answer without emailing you.

---

## If you're on Adobe Commerce

The **Adobe Commerce B2B** extension covers all of this natively and better,
without the module here:

- **Company accounts** — multiple buyers under one district, with roles and permissions.
- **Purchase Orders with approval rules** — a teacher's order routes to their
  business office for approval before it becomes an order. This is the real
  multi-step PO workflow, not just a PO-number field.
- **Payment on Account** — credit limits per company, tracked balances.
- **Negotiable Quotes** — native request-a-quote and quote-to-order.
- **Requisition Lists** — recurring classroom-supply reorders.

Enable it under **Stores → Configuration → General → B2B Features**. It's a
separate licensed extension on Adobe Commerce; it is not available on Open Source.

---

## Files

```
app/code/AlphabetTrains/SchoolPo/
├── registration.php
├── etc/
│   ├── module.xml                 declares the module, sequenced after Magento_OfflinePayments
│   ├── events.xml                 observes payment_method_is_active
│   ├── config.xml                 defaults (restriction off)
│   └── adminhtml/system.xml       the two admin fields on the Purchase Order group
├── Model/Config.php               reads the restriction settings
└── Observer/
    └── RestrictPurchaseOrderToGroups.php
```

The module touches nothing else — no core overrides, no schema changes. Disabling
it returns the PO method to stock Magento behaviour (visible to everyone).
