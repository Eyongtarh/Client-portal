# Django settings for the Client Portal project. Secrets and
# environment-specific values (database, allowed hosts, CORS)
# are read from environment variables so the same code works
# unchanged locally (SQLite) and in production (Heroku Postgres).
import sys
from pathlib import Path
from datetime import timedelta
from decouple import config, Csv
import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config(
    "DJANGO_SECRET_KEY",
    default="django-insecure-local-dev-only-change-in-prod",
)

# Fails closed: an environment that forgets to set DEBUG gets the
# production behaviour, not the debug page. Local development sets
# DEBUG=True in backend/.env (see .env.example).
DEBUG = config("DEBUG", default=False, cast=bool)

if not DEBUG and SECRET_KEY.startswith("django-insecure"):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a real secret when DEBUG is off."
    )

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv()
)

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://localhost:5174",
    cast=Csv(),
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "cloudinary_storage",
    "cloudinary",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "portal",
]

AUTH_USER_MODEL = "portal.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Scoped throttles on the unauthenticated endpoints that can be
    # brute forced or used to send email (login, register, password
    # reset, invites, public booking). Counted per client IP. The
    # default cache is per process, so with several dynos the real
    # ceiling is the rate times the dyno count; fine as abuse
    # protection, not a precise quota. Tests run with a very high
    # rate so they never trip over each other.
    "DEFAULT_THROTTLE_RATES": {
        "auth": "1000000/min" if "test" in sys.argv else "10/min",
        "public": "1000000/min" if "test" in sys.argv else "30/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL", default="no-reply@example.com"
)

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

_PASSWORD_VALIDATION = "django.contrib.auth.password_validation"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            f"{_PASSWORD_VALIDATION}."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            f"{_PASSWORD_VALIDATION}.MinimumLengthValidator"
        ),
    },
    {
        "NAME": (
            f"{_PASSWORD_VALIDATION}.CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            f"{_PASSWORD_VALIDATION}.NumericPasswordValidator"
        ),
    },
]

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

CLOUDINARY_STORAGE = {
    "CLOUD_NAME": config("CLOUDINARY_CLOUD_NAME"),
    "API_KEY": config("CLOUDINARY_API_KEY"),
    "API_SECRET": config("CLOUDINARY_API_SECRET"),
}

STORAGES = {
    "default": {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
    },
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
        ),
    },
}

STATICFILES_STORAGE = (
    "django.contrib.staticfiles.storage.StaticFilesStorage"
)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

MEDIA_URL = "/media/"
# Real requests never touch this - STORAGES["default"] is Cloudinary
# (see above) - but tests deliberately override STORAGES to local
# FileSystemStorage to avoid hitting real Cloudinary, and without
# MEDIA_ROOT set that falls back to the current working directory,
# scattering test-generated upload dirs (e.g. workspaces/<id>/...)
# straight into the backend/ source tree instead of a confined,
# gitignored location.
MEDIA_ROOT = BASE_DIR / "media"

FRONTEND_URL = config(
    "FRONTEND_URL", default="http://localhost:5173"
)

# Heroku's router terminates TLS and forwards plain HTTP internally,
# so without this Django (and anything building an absolute URL from
# the request, e.g. the Stripe Connect OAuth redirect_uri) sees every
# request as http:// even in production.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

if not DEBUG and "test" not in sys.argv:
    # Heroku terminates TLS and forwards X-Forwarded-Proto, trusted
    # above, so these are safe behind it.
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_CONTENT_TYPE_NOSNIFF = True

STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY", default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")

# Stripe Connect (Standard accounts) - lets each workspace owner link
# their own Stripe account so client payments go straight to them
# instead of the platform's account. STRIPE_CONNECT_CLIENT_ID is the
# platform's OAuth client id (starts "ca_", from Dashboard > Settings
# > Connect). STRIPE_CONNECT_WEBHOOK_SECRET verifies events from a
# SEPARATE webhook endpoint subscribed to "events on connected
# accounts" - direct-charge events on a connected account are not
# delivered to the platform's own STRIPE_WEBHOOK_SECRET endpoint.
STRIPE_CONNECT_CLIENT_ID = config("STRIPE_CONNECT_CLIENT_ID", default="")
STRIPE_CONNECT_WEBHOOK_SECRET = config(
    "STRIPE_CONNECT_WEBHOOK_SECRET", default=""
)

# Platform subscription billing (SUB-01..15) - the workspace owner
# paying US for Pro/Business, entirely separate from the Connect
# settings above. These are read once, at migrate time, by
# 0052_seed_platform_billing.py to populate SubscriptionPlan.
# stripe_price_id for a fresh deploy; changing them afterwards does
# nothing by itself; update the plan's price in /admin/ instead.
# Use Stripe TEST MODE price ids (price_... from a product created
# with a test-mode secret key) until this goes live.
STRIPE_PRICE_ID_PRO = config("STRIPE_PRICE_ID_PRO", default="")
STRIPE_PRICE_ID_BUSINESS = config("STRIPE_PRICE_ID_BUSINESS", default="")
