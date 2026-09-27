# Luxury Motors — luxury car rental website

Bilingual (English / Arabic, full RTL) storefront, booking engine and admin dashboard for a luxury and
chauffeur car rental business in Amman. Everything the customer sees — cars, photos, prices, fees,
discounts, offers, contact details — is managed from the admin panel and read live from one database.

## Quick start

```bash
npm install
npm start            # http://localhost:3000  ·  admin: http://localhost:3000/admin.html
```

- First admin password: `admin123` (or set `ADMIN_PASSWORD` before the first start).
  The dashboard shows a warning until you change it in **Settings → Security**.
- `npm run dev` restarts the server on file changes.
- `npm test` runs the automated suite (pricing rules, every admin/website API flow, and the
  legacy-database migration) against a throwaway database.

Environment variables: `PORT` (3000), `DB_PATH` (`./showroom.db`), `ADMIN_PASSWORD`,
`BUSINESS_TIMEZONE` (`Asia/Amman`).

## What the dashboard does

| Area | Screen | What it covers |
| --- | --- | --- |
| Overview | Dashboard | Revenue, pending requests, cars on rent, unpaid balance, monthly costs, service alerts, pick-ups and returns |
| Operations | Bookings | Filter/search/export, staff bookings with a live quote, status, notes, **payments, printable invoice, re-pricing an edit, driver assignment** |
| | Calendar | Every car day by day: confirmed, pending and blocked periods; block dates in one click |
| | Fleet | Prices, photos, specs, visibility, featured, maintenance |
| | Inventory | Plate, odometer, next service (km/date), insurance and licence expiry, alerts, running costs per car |
| | Drivers | Chauffeurs and their rates, assignable to a booking |
| People | Customers | Every customer with booking history, private notes, block from booking online |
| | Inbox | Contact-form messages |
| | Conversations | Full transcripts of what visitors asked the website assistant |
| Growth | Offers | Promo codes with rules and usage counts |
| | Analytics | Revenue, costs, net profit, cash collected, conversion, per-car utilisation, channels, best customers, CSV export |
| | Website content | The reviews and FAQ shown on the site, in both languages |
| Administration | Team | Accounts with roles + an activity log of who changed what |
| | Settings | Business details, pricing rules, webhook, password |

### Roles

- **Owner** — everything, including team accounts.
- **Manager** — everything except team accounts.
- **Staff** — bookings, calendar, customers, inbox, conversations and their own password.

Roles are enforced on the server (`requireRole`), and the sidebar only shows what the account can use.

## How prices stay in sync

There is exactly **one** pricing engine: [`server/lib/pricing.js`](server/lib/pricing.js).

- The website never calculates a price itself. Fleet cards, the car page and the booking form all
  ask the server (`GET /api/cars?pickupAt&returnAt`, `POST /api/quote`).
- When a booking is created the server re-prices it from the database and ignores any total sent by
  the browser, then stores the full breakdown on the booking.
- Daily rates (Fleet), delivery / chauffeur fees and weekly / monthly discounts (Settings) and
  promo codes (Offers) take effect on the website immediately.

Order of calculation: `days × daily rate` → long-rental discount → extras → promo code.
Every started 24 hours counts as a day.

## Booking rules

- A car is unavailable for a window when it has a **pending or confirmed** booking overlapping it,
  or when its status is **Maintenance**. Double bookings are prevented on the server.
- Customers must book at least *Minimum booking notice* hours ahead (Settings). Staff bookings made
  from the dashboard skip this rule.
- Cancelling or completing a booking frees the car. Re-activating a cancelled booking is refused if
  someone else has since booked those dates.
- A car with upcoming bookings cannot be deleted — hide it (turn off *On website*) instead.
- New bookings are posted to the n8n webhook configured in Settings (payload compatible with
  [`docs/n8n-workflow.json`](docs/n8n-workflow.json)).

## Project structure

```
server/
  index.js · bootstrap.js · app.js · config.js
  db/        schema + migrations (PRAGMA user_version), seed from data/fleet.json
  lib/       pricing engine, validation, crypto, time, media library, HTTP errors
  services/  cars, bookings, availability, offers, messages, settings, auth, reports, chat, webhook, uploads,
             inventory, drivers, customers, payments, users, activity, chats, content, analytics
  routes/    public API, admin API (token-protected), admin operations API, server-rendered page metadata
public/
  index.html · car.html · admin.html · 404.html
  assets/css  base.css (design tokens) · site.css · admin.css
  assets/js   core/ (api, i18n, dom, format) · site/ (storefront) · admin/ (dashboard views)
  media/cars  web-optimised photos generated from the posters
  whatsapp_images   original marketing posters (source + photo library)
  uploads/    photos uploaded from the admin
data/
  fleet.json           curated catalogue (names, specs, bilingual copy, default prices)
  media-manifest.json  generated by scripts/build-media.py
  site-content.json    launch copy for the website reviews and FAQ (seeded once, then edited in the admin)
scripts/build-media.py crops posters into covers, thumbnails and gallery photos
tests/                 node:test suites
```

## Photos

`python scripts/build-media.py` (Python 3 + Pillow + NumPy) turns each poster listed in
`data/fleet.json` into a clean cover (baked-in poster text faded out), a 640px card thumbnail and
the detail photos from the poster's side column. Per-poster crop overrides live next to the poster
in `fleet.json`. New photos can also simply be uploaded from **Fleet → Edit → Photos**.

## Security

- Admin API requires a bearer token from `POST /api/admin/login`; passwords are stored with scrypt,
  sessions are stored hashed and expire after 12 hours. Changing the password signs out other devices.
- Strict Content-Security-Policy, rate limits on login / bookings / messages / chat, and upload type
  checks by file signature. All user text is escaped when rendered.
- Each account signs in with its own username and password; roles are checked server-side on every
  write, and every change is written to the activity log.
- Internal vehicle data (plate, odometer, insurance and licence dates) is never sent to the website.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) — requirements, systemd/Nginx/Docker setup, the pre-launch
checklist and the backup routine.

## Database

SQLite (`showroom.db`), migrated forward on every start (`PRAGMA user_version`, currently 2 — v2 adds
inventory, drivers, blackouts, expenses, payments, customers, chats, users, activity and website content).
On first start of this version the prototype database is migrated: messages,
offers and booking history are kept; the prototype car list (generated with wrong names) is replaced
by the curated fleet. A copy of the original database is in `_archive/`.
