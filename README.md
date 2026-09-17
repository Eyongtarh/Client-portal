# Clientflow

A private, branded client portal for service businesses — freelancers, consultants, agencies, salons, studios, tutors, and similar — combining client management, projects, general-purpose booking & resource reservations, documents, messaging, invoicing, Stripe payments, approvals, and feedback in one workspace per business.

The booking system is deliberately general-purpose rather than tied to any one business type: the same platform supports a barber (clients, bookings, services, payments), a software consultant (clients, projects, bookings, invoices, documents, approvals), and an agency (clients, projects, tasks, bookings, documents, invoices, payments, team, approvals) without changing the underlying architecture.

## Features

- **Auth & workspaces** — registration, JWT login with silent token refresh, password reset, per-workspace branding (logo + accent color), multi-location support
- **Team management** — owner/staff/client roles, staff invites, restricted-staff data scoping (a staff member can be limited to only their assigned clients/projects/bookings)
- **Clients & projects** — client records with notes and history, projects with milestones and tasks, deliverable approvals, client feedback/reviews
- **Documents & messaging** — categorized uploads with private/shared visibility, per-project message threads with attachments
- **Booking & scheduling** — services, staff/location availability, holidays and blocked time, public booking pages, guest booking, recurring bookings, waitlists, calendar invites, booking analytics
- **Resource reservations** — a general-purpose reservable-resource system (rooms, tables, chairs, vehicles, equipment...) supporting both service-linked reservations and direct rentals, with atomic multi-resource locking to prevent double-booking
- **Invoicing & payments** — line-item invoices with PDF export, online payment via Stripe Connect (money goes straight to the workspace owner's own account), manual/offline payment methods, currency-correct Stripe amounts (including zero-decimal currencies like XAF/JPY)
- **Subscription plans** — Free/Pro/Business tiers with enforced usage limits (clients, team size, projects, bookings, storage)
- **Notifications, activity & search** — in-app notifications with per-category preferences, a workspace-wide audit trail, cross-entity search
- **i18n & theming** — full English/French translation, light/dark theme

## Tech stack

**Backend** — Django 6.1, Django REST Framework, PostgreSQL (production) / SQLite (local), JWT auth (`djangorestframework-simplejwt`), Stripe (Connect + webhooks), Cloudinary (media storage), ReportLab (PDF generation), Gunicorn + WhiteNoise.

**Frontend** — React 19, Vite, React Router, Tailwind CSS, react-i18next, Axios.

**Infrastructure** — Heroku (backend + Postgres), Vercel (frontend), GitHub.

## Project structure

```
backend/
  config/            Django project settings, URLs, WSGI
  portal/            the one Django app — all models, views, serializers
    models.py        every model (clients, projects, bookings, resources, invoices...)
    views.py         the REST API surface (ViewSets + APIViews)
    serializers.py   validation and response shaping
    webhooks.py       Stripe webhook handlers (signature-verified)
    payments.py       Stripe Checkout session creation
    currencies.py     country → currency map, Stripe currency-decimals handling
    permissions.py    workspace/staff scoping helpers
    migrations/       database schema history
    management/commands/   scheduled jobs (booking reminders, overdue rentals)
    tests/            backend test suite
frontend/
  src/
    pages/           one component per route (dashboard, booking, client portal, ...)
    components/      shared UI (nav, notifications, search, theme/language toggles)
    lib/              API client, auth context, i18n setup, theming
    locales/          en.json / fr.json translation files
```

## Getting started

### Prerequisites

- Python 3.12+
- Node.js 18+
- (Optional) Docker, for a local Postgres instance — otherwise the backend defaults to SQLite

### Backend

```bash
cd backend
python -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the values you need — see Environment variables below
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000/api` by default (see `VITE_API_URL`).

## Environment variables

Set these in `backend/.env` (not committed):

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django cryptographic signing key |
| `DEBUG` | `True`/`False` |
| `ALLOWED_HOSTS` | Comma-separated hostnames Django will serve |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed to call the API |
| `DATABASE_URL` | Postgres connection string (omit to use local SQLite) |
| `FRONTEND_URL` | Used to build links in emails and Stripe redirect URLs |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Media storage |
| `EMAIL_BACKEND` / `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USE_TLS` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `DEFAULT_FROM_EMAIL` | Outgoing email (invites, reminders, payment confirmations) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Platform Stripe account — checkout sessions and webhook verification |
| `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Connect — lets a workspace owner link their own Stripe account for client payments |

In `frontend/.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Reserved for a future client-side Stripe Elements integration; not currently read by any code |

## Testing

```bash
# Backend
cd backend && python manage.py test portal

# Frontend
cd frontend && npx jest
```

## Deployment

```bash
# 1. Push source
git push

# 2. Backend — deploys the backend/ subtree to Heroku; the release
#    phase runs `python manage.py migrate` automatically
git subtree push --prefix backend heroku main

# 3. Frontend
cd frontend && vercel --prod
```
