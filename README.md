# e-vacc

**e-vacc** is a role-based vaccination management and appointment platform that connects citizens, vaccination centers, center managers, and administrators in one workflow-driven system.

Homepage: https://e-vacc.vercel.app

## Features

### Citizen
- Register and sign in with email/password
- Complete profile with full name, CNIC, and date of birth
- Browse active vaccination centers and search by city/address
- View available center slots and book appointments
- Track vaccination progress and completed doses
- View and verify vaccination certificates

### Center Manager
- Request creation/approval of vaccination centers
- Create and manage vaccination slots after center approval
- Request center-level vaccine stock
- View today’s appointments and full appointment history
- Verify administered doses using physical batch numbers
- View vaccinated users and available vaccine records

### Administrator
- Manage vaccine catalog and national stock
- Approve or reject center creation requests
- Allocate vaccine doses to centers
- Review and decide dose/stock requests

## Architecture & Stack

- **Frontend:** React 19 + Vite 8 (JavaScript/JSX)
- **Routing:** React Router 7 (`BrowserRouter`, role-protected routes)
- **Backend platform:** Supabase (Auth, Postgres, RLS, Realtime, Storage, Edge Functions)
- **Data/utility libs:** `@supabase/supabase-js` v2, `date-fns`
- **Maps/UI geography:** `leaflet`, `react-leaflet`
- **Styling:** CSS
- **Database logic:** SQL + PL/pgSQL (RLS policies + RPC functions)

App bootstrapping:
- `/src/main.jsx` renders `<App />` inside `<ErrorBoundary />`
- `/src/App.jsx` defines public routes and role-protected admin/manager/citizen routes
- `/src/context/AuthProvider.jsx` loads Supabase auth session + profile state

## Project Structure

```text
e-vacc/
├─ public/
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ lib/
│  │  └─ supabase.js
│  ├─ context/
│  │  └─ AuthProvider.jsx
│  ├─ components/
│  └─ pages/
│     ├─ admin/
│     ├─ manager/
│     └─ citizen/
├─ supabase/
│  ├─ schema.sql
│  ├─ center-stock-migration.sql
│  ├─ realtime.sql
│  ├─ storage-certificates.sql
│  └─ functions/
│     └─ certificate-pdf/
│        └─ index.ts
├─ .env.example
├─ vercel.json
└─ package.json
```

## Prerequisites

- Node.js + npm
- A Supabase project

## Local Setup

```bash
git clone https://github.com/AleezaAfzal/e-vacc.git
cd e-vacc
npm install
cp .env.example .env.local
npm run dev
```

Then edit `.env.local` and provide real values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Open the Vite dev server URL shown in terminal (default: `http://localhost:5173`).

> Do not commit real secrets or environment files containing secrets.

## Supabase Setup

Use this order so schema, security, and optional certificate workflows are configured correctly.

1. **Base schema (required)**
   - Run `/supabase/schema.sql` in Supabase SQL Editor.
   - This creates core tables (`profiles`, `vaccines`, `centers`, `slots`, `appointments`, `vax_records`, `certificates`), auth/profile triggers, RLS policies, and RPCs (including booking/verification/certificate helpers).

2. **Promote first admin (required for admin panel access)**
   - After a user signs up, run the SQL noted in `schema.sql` comments:
   - `update public.profiles set role = 'admin' where id = '<your-auth-user-uuid>';`

3. **Center stock migration (optional, for existing DBs / center stock flows)**
   - Run `/supabase/center-stock-migration.sql` as applicable.
   - Adds center-level stock and center dose request capabilities.

4. **Realtime setup**
   - Run `/supabase/realtime.sql` (or equivalent publication commands) to enable realtime on relevant public tables.

5. **Certificate storage setup**
   - Run `/supabase/storage-certificates.sql` to create the public `certificates` storage bucket and read policy.

6. **Optional Edge Function for certificate PDF generation**
   - Deploy `/supabase/functions/certificate-pdf` only if you want PDF upload automation.
   - Configure function secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Wire trigger/webhook flow as described in function comments.
   - **Important:** current implementation is a **stub** that uploads a placeholder PDF and updates `pdf_url`; treat it as a customization point, not a finished PDF renderer.

### RLS/Security Notes (Supabase)
- Row Level Security is enabled for core data tables in `schema.sql`.
- Access is role-scoped (citizen/manager/admin) through policies and helper functions.
- Keep service-role usage server-side only (e.g., Edge Functions), never in frontend env vars.

## Route & Workflow Overview

Public routes:
- `/` — landing/home
- `/login` — authentication
- `/register` — citizen/user registration
- `/verify-certificate` — public certificate verification

Admin routes (role: `admin`):
- `/admin`
- `/admin/requests`
- `/admin/centres`
- `/admin/allocate-doses`
- `/admin/dose-requests`

Manager routes (role: `manager`):
- `/manager`
- `/manager/request-centre`
- `/manager/slots`
- `/manager/stock-requests`
- `/manager/appointments`
- `/manager/all-appointments`
- `/manager/vaccines`
- `/manager/vaccinated-users`

Citizen routes (role: `citizen`):
- `/citizen`
- `/citizen/browse`
- `/centre/:id`
- `/citizen/profile`
- `/citizen/certificates`

## npm Scripts

From `package.json`:

- `npm run dev` — start Vite dev server
- `npm run start` — alias of Vite dev server
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npm run preview` — preview built app

## Deployment (Vercel)

- `vercel.json` rewrites all paths to `/index.html`:
  - This is required for SPA routing so deep links (e.g., `/admin`, `/citizen/browse`) resolve correctly.
- Production URL configured in this repository: https://e-vacc.vercel.app

## Security & Configuration

- Frontend should use only:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` (publishable/anon key)
- Never expose or commit `SUPABASE_SERVICE_ROLE_KEY`.
- Keep `.env.local` out of version control.
- Never commit real credentials, tokens, or private keys.

## Project Status / Limitations

- There is currently **no automated test script** in `package.json`.
- The `certificate-pdf` Edge Function is a placeholder implementation that uploads a minimal PDF-like stub and sets `pdf_url`; production-grade PDF generation requires custom implementation.
