"""Builds the .ics calendar-invite text for a booking (BOOK-61/65) -
one place both the confirmation/cancellation emails and the
self-service download endpoint pull from, so a calendar app always
sees the same event for the same booking regardless of which path
sent it.
"""
from datetime import timezone as dt_timezone

from django.utils import timezone


def _escape(text):
    return (
        text.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def _format_dt(dt):
    return dt.astimezone(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_ics(booking, cancelled=False):
    """cancelled=True produces a METHOD:CANCEL event so a calendar
    app that already added the original invite removes it, rather
    than a second PUBLISH the app would just add as a duplicate.
    """
    name = booking.display_name
    method = "CANCEL" if cancelled else "PUBLISH"
    status = "CANCELLED" if cancelled else "CONFIRMED"

    location = ""
    if booking.service:
        if booking.service.is_online and booking.service.meeting_link:
            location = booking.service.meeting_link
        elif booking.service.location:
            location = booking.service.location

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Clientflow//Booking//EN",
        "CALSCALE:GREGORIAN",
        f"METHOD:{method}",
        "BEGIN:VEVENT",
        f"UID:booking-{booking.id}@clientflow",
        f"DTSTAMP:{_format_dt(timezone.now())}",
        f"DTSTART:{_format_dt(booking.start_time)}",
        f"DTEND:{_format_dt(booking.end_time)}",
        f"SUMMARY:{_escape(f'{name} - {booking.workspace.name}')}",
        f"STATUS:{status}",
        "SEQUENCE:0",
    ]
    if location:
        lines.append(f"LOCATION:{_escape(location)}")
    if booking.notes:
        lines.append(f"DESCRIPTION:{_escape(booking.notes)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
