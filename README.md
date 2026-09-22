# Clientflow

A private, branded client portal for service businesses such as freelancers, consultants, agencies, salons, studios, and tutors, combining client management, projects, general purpose booking & resource reservations, documents, messaging, invoicing, Stripe payments, approvals, and feedback in one workspace per business. Built with **Django**, **React**, and **Stripe**, the platform favours correctness, workspace isolation, and a clean, branded experience over generic templating.

[![CI](https://github.com/Eyongtarh/Client-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/Eyongtarh/Client-portal/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?logo=vite&logoColor=white)](#)
[![Django](https://img.shields.io/badge/Django-6.1-092E20?logo=django&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Production-4169E1?logo=postgresql&logoColor=white)](#)
[![Stripe](https://img.shields.io/badge/Stripe-Connect-635BFF?logo=stripe&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Live Application](https://img.shields.io/badge/Live%20Application-clientflow-000000?logo=vercel&logoColor=white)](https://client-portal-phi-ten.vercel.app)

---

**Live Application: [client-portal-phi-ten.vercel.app](https://client-portal-phi-ten.vercel.app/)**

![Clientflow home page](docs/images/hero.jpg)

---

## Table of Contents

- [Features](#features)
- [Application Sections](#application-sections)
- [Installation](#installation)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Author](#author)
- [Contact](#contact)
- [Future Enhancements](#future-enhancements)
- [Credits](#credits)
- [Support](#support)
- [Licence](#licence)

---

## Features

### User Experience

- Fully responsive design for desktop, tablet, and mobile devices
- Light and dark theme, driven by CSS custom properties rather than a duplicated stylesheet
- Branding for each workspace: logo, accent colour, applied consistently across the dashboard, client portal, public booking page, and PDF invoices
- Full English/French translation across every screen
- A general purpose public booking page, guest booking with no account required, and a combined resource reservation and rental system
- Accessible by design: semantic HTML, ARIA labels, keyboard focus states, and colour choices validated against WCAG AA

### Architecture & Code Quality

- Single Django app (`portal`) holding every domain, reflecting the project's own specification that booking is a module of the workspace, not a feature tied to one business type
- Workspace scoped querysets throughout: every list endpoint filters on the requesting user's own workspace, and a `restricted` staff flag narrows an individual team member further
- Payment status is only ever set by a verified Stripe webhook, never by a client's browser or the checkout creation step itself
- Correct Stripe amounts for every currency, including those with no minor unit (XAF, JPY) and those with three decimal places (BHD, KWD)
- 32 Django models, roughly 8,400 backend lines, roughly 15,000 frontend lines, 51 linear migrations

### Performance Optimisations

- Vite production build with code splitting and minification
- Lazy loaded routes
- Tailwind CSS utility classes compiled ahead of time, no runtime styling cost
- WhiteNoise serving compressed static assets directly from the Django process
- Lighthouse optimised (see [Testing](#testing) for a real, current report)

### Repository Standards

- MIT licence
- ESLint configuration for the frontend
- `.env.example` for both the backend and frontend, so setup never depends on tribal knowledge
- Django and Jest test suites, run independently
- A single documented deploy sequence rather than ad hoc commands

---

## Application Sections

### Home

The public marketing page: a clear statement of what Clientflow does, how it works in three steps, and a call to action to create a workspace or sign in.

![Home](docs/images/hero.jpg)

### Sign In

JWT based authentication with silent token refresh, a clear error message on a failed attempt, and links to password reset and workspace creation.

![Sign in](docs/images/login.jpg)

### Owner Dashboard

The workspace owner's home: clients, team, and a plan and usage summary showing exactly how close the workspace is to its subscription limits.

![Owner dashboard](docs/images/dashboard.jpg)

### Booking & Services

Services, locations, payment configuration (Stripe Connect and manual methods such as Mobile Money), and the working hours and rules that drive the public booking page.

![Booking and services](docs/images/booking.jpg)

### Resource Reservations

A general purpose reservation system for any bookable resource (rooms, tables, chairs, vehicles, equipment) filterable by resource, type, date, and status, alongside a separate rentals view for resources rented directly rather than through a service.

![Resource reservations](docs/images/resources.jpg)

### Client Workspace

The owner's tabbed view of a single client: project overview with milestones and tasks, documents, messages, invoices, and approvals, each with full create, edit, and delete support.

![Client workspace](docs/images/client-detail.jpg)

### Client Portal

The client's own private view: booking a service or resource, joining a waitlist, and leaving a review, all scoped so a client only ever sees their own workspace's data.

![Client portal](docs/images/client-portal.jpg)

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Installation

### Prerequisites

- Python 3.12+
- Node.js 18+
- (Optional) Docker, for a local Postgres instance; otherwise the backend defaults to SQLite
- (Optional) The [Stripe CLI](https://docs.stripe.com/stripe-cli), to receive webhooks locally

### Optional: Local Postgres with Docker

`docker-compose.yml` starts a Postgres 16 container. Leave `DATABASE_URL` empty in `backend/.env` to use SQLite instead.

```bash
docker compose up -d
```

Then set this in `backend/.env`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/client_portal
```

### Backend

```bash
cd backend
python -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # each variable is documented with a comment in the file itself
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open your browser and visit:

```
http://localhost:5173
```

The frontend expects the backend at `http://localhost:8000/api` by default (see `VITE_API_URL`).

### Environment Variables

Every variable is documented in the `.env.example` file beside it. The ones that matter most:

| Variable | Where | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | backend | Django signing key. Required. |
| `DEBUG`, `ALLOWED_HOSTS` | backend | Set `DEBUG=False` and your real hosts in production. |
| `DATABASE_URL` | backend | Postgres connection string. Leave empty for local SQLite. |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` | backend | The frontend's origin, used for CORS and links in emails. |
| `STRIPE_SECRET_KEY` | backend | Platform Stripe key, used to create Checkout sessions. |
| `STRIPE_WEBHOOK_SECRET` | backend | Verifies signatures on `/api/stripe/webhook/`. |
| `STRIPE_CONNECT_CLIENT_ID` | backend | Lets a workspace owner link their own Stripe account. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | backend | Verifies signatures on `/api/stripe/connect-webhook/`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | backend | Media storage for logos and documents. |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | backend | SMTP settings. Defaults to printing emails to the console. |
| `VITE_API_URL` | frontend | Base URL of the backend API. |

### Testing Stripe Webhooks Locally

Payment status is only ever set by a verified webhook, so a payment cannot complete locally until Stripe can reach your machine. With the backend running, forward events using the Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/api/stripe/webhook/
```

Copy the `whsec_...` signing secret it prints into `STRIPE_WEBHOOK_SECRET` and restart the backend. To exercise Connect payments, run a second listener with `--forward-connect-to localhost:8000/api/stripe/connect-webhook/` and put its secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

### Scheduled Jobs

Three management commands live in `backend/portal/management/commands/`. Two need to run on a schedule in production, for example with the Heroku Scheduler add on:

| Command | Purpose | Schedule |
| --- | --- | --- |
| `python manage.py send_booking_reminders` | Emails a reminder for each confirmed booking that has entered its workspace's reminder window and has not been reminded yet. | Hourly |
| `python manage.py mark_overdue_rentals` | Marks an active resource rental as overdue once its booking has ended with no check in recorded. | Hourly |
| `python manage.py backfill_resource_reservations` | One off data repair that creates missing reservation rows for existing bookings. Safe to run more than once. | On demand |

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Tech Stack

### Backend

- Django 6.1
- Django REST Framework
- PostgreSQL (production) / SQLite (local)
- JWT authentication (`djangorestframework-simplejwt`)
- Stripe (Connect, webhooks, currency aware Checkout Sessions)
- Cloudinary (media storage)
- ReportLab (PDF invoice generation)
- Gunicorn + WhiteNoise

### Frontend

- React 19
- Vite
- React Router
- Tailwind CSS
- react-i18next
- Axios
- React Icons (Feather set)

### Development Tools

- Git and GitHub
- Visual Studio Code
- Jest and Testing Library (frontend)
- Django's own test runner (backend)
- ESLint

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Project Structure

```text
Client-portal/
├── backend/
│   ├── config/                        # Django project settings, URLs, WSGI
│   ├── portal/                        # the one Django app
│   │   ├── models.py                  # every model (clients, projects, bookings, resources, invoices...)
│   │   ├── views.py                   # the REST API surface (ViewSets + APIViews)
│   │   ├── serializers.py             # validation and response shaping
│   │   ├── webhooks.py                # Stripe webhook handlers, verified by signature
│   │   ├── payments.py                # Stripe Checkout session creation
│   │   ├── currencies.py              # country to currency map, Stripe decimal handling
│   │   ├── permissions.py             # workspace and staff scoping helpers
│   │   ├── migrations/                # database schema history
│   │   ├── management/commands/       # scheduled jobs (booking reminders, overdue rentals)
│   │   └── tests/                     # backend test suite
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/                     # one component per route
│   │   │   └── Booking/                 # the booking page, split into one file per section
│   │   ├── components/                # shared UI (nav, notifications, search, toggles)
│   │   ├── lib/                       # API client, auth context, i18n, theming
│   │   └── locales/                   # en.json / fr.json translation files
│   ├── .env.example
│   └── package.json
│
├── docs/
│   └── images/                        # screenshots used in this README
│
├── LICENSE
└── README.md
```

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Testing

### Backend Test Suite

The Django test suite covers authorisation boundaries, payment flows, booking rules and availability, resource reservation concurrency, notifications, search, and usage limits.

```bash
$ python manage.py test portal
...
----------------------------------------------------------------------
Ran 330 tests in 249.263s

OK
```

### Security

A full codebase review found that booking creation, including recurring bookings, validated the record being created but not every record it referenced: an authenticated request could point a booking at a service, resource, or client belonging to a different workspace. This has been closed, every such reference is now checked against the requester's own workspace, and the fix is covered by dedicated regression tests so it cannot silently regress.

Dependencies are checked with `npm audit` (frontend) and `pip-audit` (backend). The backend has no known vulnerabilities. The frontend's one flagged issue was a high severity advisory in a transitive dependency of Jest's coverage tooling (`js-yaml`, pulled in by `babel-plugin-istanbul`), never shipped in the production bundle and never fed untrusted input, resolved regardless via `npm audit fix`; the frontend now reports none either.

### Frontend Test Suite

Covers the accessibility maths behind an owner's chosen brand colour (WCAG AA contrast), theme and language persistence, the activity feed's translated event text, and the full authentication lifecycle (bootstrapping a session from a stored token, login, logout, and a stored token that turns out to be invalid), alongside the axios interceptor that transparently refreshes an expired token.

A separate review pass found several places where a slower, earlier network response could resolve after a faster, later one, for search, booking availability, filtered lists, and the client detail tabs, and overwrite what the user was actually looking at with stale data. Each now discards a response that is no longer the latest one requested.

```bash
$ npx jest
Test Suites: 7 passed, 7 total
Tests:       30 passed, 30 total
```

### JavaScript Validation

The frontend is linted with **ESLint**. A stricter `react-hooks/set-state-in-effect` rule flags 58 instances of an established pattern already present throughout the codebase (calling a `load()` function inside `useEffect`). This is disclosed rather than hidden: the pattern works correctly in practice, but migrating every instance to the rule's preferred form is tracked as open technical debt rather than claimed as already resolved.

```bash
$ npm run lint
✖ 58 problems (49 errors, 9 warnings)
```

### Continuous Integration

A **GitHub Actions** workflow (`.github/workflows/ci.yml`) runs on every push and pull request against `main`: the backend job runs the full Django test suite against a throwaway SQLite database, and the frontend job installs from the lockfile, runs the Jest suite, and produces a production build. Lint runs in the same job and is reported, but is not a blocking gate while the `react-hooks/set-state-in-effect` debt above stays open, so it can't mask an actual test or build failure behind warnings that were already there and already disclosed.

### Lighthouse Report

Covering Performance, Accessibility, Best Practices, and SEO.

![Lighthouse report](docs/images/lighthouse.jpg)

Every page audited this way (the home page, sign in, register, and the public booking page) currently scores 100 on all four standard categories.

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Deployment

Clientflow deploys to **Heroku** (backend, with a Postgres database attached) and **Vercel** (frontend), with GitHub as the source of truth.

### Build for Production

```bash
# Frontend
cd frontend && npm run build

# Backend static files
cd backend && python manage.py collectstatic --noinput
```

### Deploy Sequence

```bash
# 1. Push source
git push

# 2. Backend: deploys the backend/ subtree to Heroku; the release
#    phase runs `python manage.py migrate` automatically
git subtree push --prefix backend heroku main

# 3. Frontend
cd frontend && vercel --prod
```

### Production Features

- Optimised Vite production builds with code splitting
- Global CDN delivery via Vercel
- Automatic HTTPS on both Heroku and Vercel
- Database migrations applied automatically on every backend release
- Fully responsive, accessible, and optimised for modern browsers

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Author

I am a Full Stack Developer with experience building responsive web applications using React, Django, PostgreSQL, and JavaScript. I enjoy creating software that combines clean engineering with practical business value.

---

## Contact

- GitHub: [Eyongtarh](https://github.com/Eyongtarh)
- Email: eyongtarh@gmail.com

---

## Future Enhancements

- Reimplement platform subscription billing (Stripe Checkout based plan upgrades and a billing portal, built once this session, then reverted, and not currently live)
- Custom domains per workspace
- Native mobile apps

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>

---

## Credits

### Technologies

- **React**: the user interface
- **Vite**: frontend build tool and development server
- **Django** and **Django REST Framework**: the API
- **PostgreSQL**: production database
- **Stripe**: payments, Connect, and webhooks
- **Cloudinary**: media storage
- **ReportLab**: PDF invoice generation
- **Tailwind CSS**: utility first styling
- **react-i18next**: English and French translation

### Development Tools

- **Visual Studio Code**: primary editor
- **Git** and **GitHub**: version control and source hosting
- **Heroku** and **Vercel**: hosting and continuous deployment
- **Google Chrome DevTools**: debugging, testing, and performance analysis

### Testing & Validation

- **Google Lighthouse**: performance, accessibility, best practices, and SEO audits
- **ESLint**: JavaScript and JSX validation
- **Django test runner** and **Jest**: automated testing

---

## Support

If you found this project useful, consider giving the repository a star on GitHub.

---

## Licence

This project is licensed under the MIT Licence; see [LICENSE](LICENSE).

---

Made with care using React, Django, and Stripe by **Eyongtarh Besong**.

<p align="right">(<a href="#clientflow">Back to Top ↑</a>)</p>
