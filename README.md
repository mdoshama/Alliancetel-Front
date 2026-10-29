# AllianceTel Scheduling: Web App

The web app for AllianceTel's weekly store scheduling. It's built with Angular 22 and Bootstrap 5,
and uses a sliding sidebar that collapses on small screens. It talks to the Spring Boot API in
[`scheduling-software`](../scheduling-software). The main project README, configuration, API and
deployment guide live there.

## Screens

| Page | Who | What it's for |
|---|---|---|
| **Sign in / Change password** | Everyone | Sign in; new and reset accounts must choose their own password first. |
| **Dashboard** | Admin, Manager | Staff per area, pending day-off requests, shortcuts. |
| **Weekly Schedule** | Everyone | Managers generate, edit, auto-fill and publish the week; employees see their published week ("My Schedule"). |
| **Day-off Requests** | Everyone | Ask for days off (max 2 per week, one person per store per day; days a colleague has are marked *Taken*) or an **emergency** day off; managers approve or reject with a staffing check. |
| **Employees / My Team** | Admin, Manager | Staff list, home store, Primary / Secondary / Floater, sign-in resets. Search, filters, sort and pages. |
| **Areas** | Admin | San Diego, Los Angeles, San Francisco, … (search and pages) |
| **Stores** | Everyone | Admins edit code, color, hours and minimum staff. Managers and employees see a directory: address with directions, weekly hours, "Your store". Search by name, code or address. |
| **Page not found** | Everyone | Friendly page for mistyped or old links. |

### On the schedule

- **Two views** (managers and admins): **By employee** (one row per person) or **By store** (one row per
  store: who works there each day, the count against the store's minimum in red when short, hours or
  Closed, and an **Off** row). Drag a person to another store or day, onto someone to swap, onto **Off**
  to give the day off, or from Off onto a store to put them to work. The choice is remembered.

- Each work day shows the **store name in the store's color** and the shift hours (the store's
  hours that day).
- Under each name is a chip: **★ Primary · Oceanside**, **Oceanside** (secondary) or **Floater**.
- Red cells and a banner flag store-days below their minimum. Dashed boxes with ⇄ are people
  moved automatically, and a dot marks days changed by hand.
- **Drag and drop** while building the week (draft): drop any day box on **any other** box (any person,
  any day) and the two trade places, e.g. Ana's Tuesday at Oceanside ↔ Ben's Thursday off. Drop a work day
  on any day of a store's row to send that shift there. Valid places light up while dragging; a card asks
  first if the swap changes someone's number of work days, leaves two people from one store off, or moves a
  primary. Approved days off never move.
- Clicking a day opens the editor: change it, swap with a colleague, or move the person for the
  whole week. A work day needs a store. Moving a **primary** asks for confirmation first.
- **Employees** see only the schedule itself: no totals rows and no Primary / Secondary / Floater.
- Confirmations (publish, regenerate, delete, approve…) use in-app cards, never browser pop-ups.

### Search and pages

- **Employees**: search by name, full name, email or code (as you type), filter by area, store, role,
  Primary / Secondary / Floater and status, sort by name, code or role, and **Clear filters**. The list
  comes from the server one page at a time, so it stays fast with thousands of staff.
- **Day-off Requests**: search by employee name or code next to the status tabs and dates; paged on the server.
- **Areas** and **Stores**: instant search in the browser; Areas also has pages.
- **Weekly Schedule**: **Find person** narrows the By employee grid to matching people and dims everyone
  else in the By store view.
- Under each list: "Showing 26–50 of 132 people", page links with Previous / Next and **Rows** (10, 25,
  50 or 100, remembered in this browser). On phones the links shrink to Previous · 2 / 6 · Next.
- The new-request form's employee picker gets a search box when an area has more than 8 people.

### Works on any screen

Phones, tablets and desktops are supported. On phones, tables become stacked cards, the summary
cards sit two per row, and the weekly grid scrolls sideways with the names column fixed in place.
On tablets, the Employees list shows two cards per row.

## Develop

Requires Node 22.

```bash
npm install
npm start            # http://localhost:4200
```

`npm start` forwards `/api` to the backend on `http://localhost:8080` (see `proxy.conf.json`), so
start the backend first. Demo sign-ins (password `Welcome123`): `admin@alliancetel.example`,
`manager.sandiego@alliancetel.example`, `aisha.khan@alliancetel.example`.

| Command | Does |
|---|---|
| `npm start` | Dev server with live reload. |
| `npm test` | Unit tests in watch mode (Vitest). |
| `npx ng test --watch=false` | Unit tests once (what CI runs). |
| `npx ng build --configuration production` | Production build into `dist/scheduling-software-frontend/browser`. |

## Project layout

```
src/app/
├── core/         API client, auth (token, guards, interceptors), models, confirm cards, toasts,
│                 date helpers, store hours/colors, day-off staffing card, paging/search helpers
├── layout/       shell: sidebar, top bar, user menu, toasts
├── shared/       modal, confirmation dialog, pagination bar
└── features/     dashboard, schedule, day-off, employees, areas, stores, auth, not-found
src/styles.scss   theme, schedule grid, store colors, role chips, responsive rules
nginx/            production web server config (serves the app, forwards /api)
```

## Production

The `Dockerfile` builds the app and serves it with nginx, which also forwards `/api/` to the
backend. Settings:

| Variable | Default | Meaning |
|---|---|---|
| `BACKEND_URL` | `http://backend:8080` | Where the API runs. On Railway: `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`. |
| `PORT` | `80` | Port nginx listens on (Railway sets it). |

nginx adds security headers, caches the hashed JS/CSS files for a year, never caches
`index.html`, and answers `GET /healthz` for health checks. Railway settings are in
`railway.json`; GitHub Actions (`.github/workflows/ci.yml`) runs the tests, the production build
and a Docker build on every push.

For deployment steps, see `DEPLOYMENT.md` in the backend repository.
