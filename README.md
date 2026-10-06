# e-vacc

e-vacc is a role-based vaccination management and appointment platform that connects citizens, vaccination centres, centre managers, and administrators.

Live deployment: https://e-vacc.vercel.app

## Features

### Citizen
- Register with email/password, full name, CNIC, and date of birth.
- Browse active centres and search by city/address.
- Open centre slot pages, book appointments, and track upcoming bookings.
- Track dose progress, eligibility intervals, and completion status.
- View/generate certificates and verify certificate status.

### Centre Manager
- Request a vaccination centre (with location details) for admin approval.
- Create and manage vaccination slots after centre approval.
- Request centre stock and monitor request outcomes.
- View today’s appointments and all appointments.
- Verify administered doses using physical batch numbers.
- View vaccinated users and vaccine/stock insights for assigned centres.

### Administrator
- Manage vaccine catalog and national stock.
- Review and approve/reject centre requests.
- Allocate doses to active centres.
- Review and process centre dose requests.

## Architecture & stack

- **Frontend:** React 19 + Vite 8 (JavaScript/JSX)
- **Routing/Auth shell:** React Router 7, role-based protected routes
- **Backend platform:** Supabase (Auth, Postgres, RLS, RPC, Realtime, Storage, Edge Function)
- **Libraries:** `@supabase/supabase-js`, `date-fns`, `leaflet`, `react-leaflet`
- **Styling/Data:** CSS, SQL/PLpgSQL

App bootstrap and auth flow:
- `/home/runner/work/e-vacc/e-vacc/src/main.jsx` renders `App` inside `ErrorBoundary`.
- `/home/runner/work/e-vacc/e-vacc/src/App.jsx` defines public + role-protected routes under `BrowserRouter` and `AuthProvider`.
- `/home/runner/work/e-vacc/e-vacc/src/lib/supabase.js` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Project structure

```text
e-vacc/
├── .env.example
├── package.json
├── vercel.json
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── components/
│   │   ├── ErrorBoundary.jsx
│   │   ├── Layout.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── VerifyDose.jsx
│   ├── context/
│   │   ├── AuthProvider.jsx
│   │   ├── authContext.js
│   │   └── useAuth.js
│   ├── lib/
│   │   └── supabase.js
│   └── pages/
│       ├── Home.jsx
│       ├── Login.jsx
│       ├── Register.jsx
│       ├── VerifyCertificate.jsx
│       ├── admin/
│       ├── manager/
│       └── citizen/
└── supabase/
    ├── schema.sql
    ├── center-stock-migration.sql
    ├── realtime.sql
    ├── storage-certificates.sql
    └── functions/
        └── certificate-pdf/
            └── index.ts
```

## Prerequisites

- Node.js and npm
- A Supabase project

## Local setup

```bash
git clone https://github.com/AleezaAfzal/e-vacc.git
cd e-vacc
npm install
cp .env.example .env.local
npm run dev
```

Then edit `.env.local` and set real values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Open the Vite dev server URL (default: `http://localhost:5173`).

> Do not commit real secrets. Keep `.env.local` local only.

## Supabase setup

Use Supabase SQL Editor and apply setup in this order:

1. **Base schema**
   - Run: `/home/runner/work/e-vacc/e-vacc/supabase/schema.sql`
   - Creates core tables (`profiles`, `vaccines`, `centers`, `slots`, `appointments`, `vax_records`, `certificates`), triggers, RLS policies, and RPCs (including booking, dose verification, certificate workflows, and public verification).

2. **Center stock migration (as applicable)**
   - Run: `/home/runner/work/e-vacc/e-vacc/supabase/center-stock-migration.sql`
   - Adds center-level stock and stock request workflow (`center_vaccine_stock`, `center_dose_requests`, related RPC/policies).

3. **Realtime publication**
   - Run: `/home/runner/work/e-vacc/e-vacc/supabase/realtime.sql`

4. **Certificate storage bucket**
   - Run: `/home/runner/work/e-vacc/e-vacc/supabase/storage-certificates.sql`

5. **Optional Edge Function for stored certificate PDFs**
   - Function: `/home/runner/work/e-vacc/e-vacc/supabase/functions/certificate-pdf/index.ts`
   - Deploy and configure only if you want storage-backed PDF URL updates.
   - Configure secrets in Supabase function env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Configure webhook/trigger flow to invoke it on certificate events.

### Promote the first admin

After schema setup, promote the first admin manually:

```sql
update public.profiles
set role = 'admin'
where id = '<your-auth-user-uuid>';
```

### RLS/security notes

- RLS policies are enabled for core tables in schema/migration SQL.
- Keep role changes/admin actions tightly controlled.
- Public certificate verification is exposed through RPC; review policy/RPC behavior before production rollout.

### Certificate PDF function status

`certificate-pdf` is currently a **stub**: it uploads a placeholder PDF and updates `pdf_url`. Treat it as a customization point, not a finished PDF renderer.

## Available npm scripts

From `/home/runner/work/e-vacc/e-vacc/package.json`:

- `npm run start` — start Vite dev server
- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run lint` — lint project
- `npm run preview` — preview production build

## Route/workflow overview

Defined in `/home/runner/work/e-vacc/e-vacc/src/App.jsx`:

### Public routes
- `/`
- `/login`
- `/register`
- `/verify-certificate`

### Administrator routes (`admin` role)
- `/admin`
- `/admin/requests`
- `/admin/centres`
- `/admin/allocate-doses`
- `/admin/dose-requests`

### Manager routes (`manager` role)
- `/manager`
- `/manager/request-centre`
- `/manager/slots`
- `/manager/stock-requests`
- `/manager/appointments`
- `/manager/all-appointments`
- `/manager/vaccines`
- `/manager/vaccinated-users`

### Citizen routes (`citizen` role)
- `/citizen`
- `/citizen/browse`
- `/centre/:id`
- `/citizen/profile`
- `/citizen/certificates`

## Deployment (Vercel)

`/home/runner/work/e-vacc/e-vacc/vercel.json` rewrites all paths to `/index.html`, so client-side React Router navigation works for direct URL visits in this SPA.

## Configuration and security

- Frontend should only use Supabase URL + anon/publishable key.
- **Never** expose or commit `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Keep `.env.local` out of version control.
- Rotate keys immediately if any real key is accidentally leaked.

## Project status / limitations

- No automated `npm test` script is currently defined in `package.json`.
- `supabase/functions/certificate-pdf/index.ts` is a placeholder implementation, not a final PDF rendering pipeline.
