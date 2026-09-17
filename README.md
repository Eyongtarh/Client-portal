# Clientflow

A private, branded client portal for service businesses — freelancers, consultants, agencies, salons, studios, tutors, and similar — combining client management, projects, general purpose booking & resource reservations, documents, messaging, invoicing, Stripe payments, approvals, and feedback in one workspace per business.

The booking system is deliberately general purpose rather than tied to any one business type: the same platform supports a barber (clients, bookings, services, payments), a software consultant (clients, projects, bookings, invoices, documents, approvals), and an agency (clients, projects, tasks, bookings, documents, invoices, payments, team, approvals) without changing the underlying architecture.

## Features

- **Auth & workspaces** — registration, JWT login with silent token refresh, password reset, branding for each workspace (logo + accent colour), support for multiple locations
- **Team management** — owner/staff/client roles, staff invites, scoping of data for restricted staff (a staff member can be limited to only their assigned clients, projects and bookings)
- **Clients & projects** — client records with notes and history, projects with milestones and tasks, deliverable approvals, client feedback and reviews
- **Documents & messaging** — categorised uploads with private or shared visibility, message threads for each project with attachments
- **Booking & scheduling** — services, availability by staff member and location, holidays and blocked time, public booking pages, guest booking, recurring bookings, waitlists, calendar invites, booking analytics
- **Resource reservations** — a general purpose system for reservable resources (rooms, tables, chairs, vehicles, equipment...) supporting both reservations linked to a service and direct rentals, with atomic locking across multiple resources to prevent the same one being booked twice
- **Invoicing & payments** — invoices with line items and PDF export, online payment via Stripe Connect (money goes straight to the workspace owner's own account), manual or offline payment methods, Stripe amounts calculated correctly for every currency (including those with no minor unit, such as XAF or JPY)
- **Subscription plans** — Free, Pro and Business tiers with enforced usage limits (clients, team size, projects, bookings, storage)
- **Notifications, activity & search** — notifications inside the app with preferences by category, an audit trail covering the whole workspace, search across every entity type
- **i18n & theming** — full English/French translation, light and dark theme

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
    webhooks.py       Stripe webhook handlers (verified by signature)
    payments.py       Stripe Checkout session creation
    currencies.py     country to currency map, Stripe currency decimal handling
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
| `ALLOWED_HOSTS` | Hostnames Django will serve, separated by commas |
| `CORS_ALLOWED_ORIGINS` | Origins allowed to call the API, separated by commas |
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
| `VITE_STRIPE_PUBLISHABLE_KEY` | Reserved for a future Stripe Elements integration read in the browser; not currently read by any code |

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
