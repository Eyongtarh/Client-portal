"""Shared resource-availability and capacity-checking helpers.

Both the read-side slot math (AvailabilityView, compute_service_
availability) and the write-side enforcement (BookingSerializer)
call these same functions, so the two can never drift apart from
each other the way the old duplicated per-resource loops could.
See the Resource Reservation System plan for the full design
rationale behind each function.
"""
from collections import namedtuple
from datetime import datetime, time, timedelta

from django.db.models import Q

from .models import BlockedTime, Resource, ResourceAvailability, ResourceReservation


def resource_is_bookable(resource):
    """BOOK-80: only these statuses make a resource unbookable
    everywhere. AVAILABLE/RESERVED/OCCUPIED are advisory display
    states only - nothing auto-sets them in v1."""
    return resource.status not in Resource.UNBOOKABLE_STATUSES


#: Sentinel meaning "no ResourceAvailability rows configured for
#: this resource" - the resource is bookable across the full 24h
#: day, exactly like every Resource behaved before this model
#: existed.
FULL_DAY_WINDOWS = [(time.min, time.max)]


def resource_availability_windows(resource, target_date):
    """Configured ResourceAvailability rows for that weekday, or
    FULL_DAY_WINDOWS if none are configured."""
    weekday = target_date.weekday()
    windows = list(
        ResourceAvailability.objects.filter(
            resource=resource, weekday=weekday
        ).order_by("start_time").values_list("start_time", "end_time")
    )
    return windows or FULL_DAY_WINDOWS


def resource_blocked_windows(resource, query_start, query_end, tz):
    """Resource-specific blocks and workspace-wide holidays (staff
    AND resource both blank) apply; a staff-specific block never
    does - mirrors compute_service_availability's staff-vs-holiday
    distinction one level further. Returns naive-local (start, end)
    tuples, matching how the rest of the availability code compares
    windows.
    """
    blocked_qs = BlockedTime.objects.filter(
        workspace=resource.workspace_id,
        start_time__lt=query_end,
        end_time__gt=query_start,
    ).filter(
        Q(resource=resource)
        | Q(resource__isnull=True, staff__isnull=True)
    )
    return [
        (
            b.start_time.astimezone(tz).replace(tzinfo=None),
            b.end_time.astimezone(tz).replace(tzinfo=None),
        )
        for b in blocked_qs
    ]


def resource_overlapping_reservations(resource, query_start, query_end):
    """Every confirmed ResourceReservation for `resource` whose
    booking overlaps [query_start, query_end) (both timezone-aware).
    Fetched once per resource/window and then reused for an
    in-Python sliding-window overlap count, exactly like the
    original AvailabilityView did with raw Bookings - avoids one
    query per candidate slot.
    """
    return list(
        ResourceReservation.objects.filter(
            resource=resource,
            booking__status="confirmed",
            booking__start_time__lt=query_end,
            booking__end_time__gt=query_start,
        ).select_related("booking")
    )


def reservations_overlap_count(reservations, window_start, window_end, tz, capacity_mode):
    """Sum of quantity (EXCLUSIVE) or party_size (SHARED) already
    held by `reservations` that overlap the naive-local
    [window_start, window_end) window. `reservations` is the list
    from resource_overlapping_reservations().
    """
    total = 0
    for rr in reservations:
        b_start = rr.booking.start_time.astimezone(tz).replace(tzinfo=None)
        b_end = rr.booking.end_time.astimezone(tz).replace(tzinfo=None)
        if window_start < b_end and window_end > b_start:
            total += (rr.party_size or 1) if capacity_mode == Resource.CapacityMode.SHARED else rr.quantity
    return total


def resource_has_capacity(resource, window_start, window_end, needed_quantity=1, exclude_booking_id=None):
    """Single-window authoritative capacity check used at write
    time (BookingSerializer). window_start/window_end must be
    timezone-aware. Applies the resource's own booking buffers, the
    same way an existing booking's buffer widens its own occupied
    window in the service-booking check.
    """
    buffer_before = timedelta(minutes=resource.booking_buffer_before_minutes)
    buffer_after = timedelta(minutes=resource.booking_buffer_after_minutes)
    qs = ResourceReservation.objects.filter(
        resource=resource,
        booking__status="confirmed",
        booking__start_time__lt=window_end + buffer_before,
        booking__end_time__gt=window_start - buffer_after,
    )
    if exclude_booking_id:
        qs = qs.exclude(booking_id=exclude_booking_id)

    if resource.capacity_mode == Resource.CapacityMode.SHARED:
        used = sum((rr.party_size or 1) for rr in qs)
        limit = resource.capacity or resource.quantity
    else:
        used = sum(rr.quantity for rr in qs)
        limit = resource.quantity
    return used + needed_quantity <= limit


ResourceRequirement = namedtuple(
    "ResourceRequirement",
    ["resource", "requirement_type", "alternative_group", "quantity"],
)


def service_resource_requirements(service):
    """Explicit ServiceResourceRequirement rows for this service if
    any exist, else synthesized REQUIRED/quantity-1 rows from the
    legacy Service.resources M2M - so a service created before
    ServiceResourceRequirement existed keeps behaving exactly as it
    did before this model existed.
    """
    explicit = list(
        service.resource_requirements.select_related("resource").all()
    )
    if explicit:
        return [
            ResourceRequirement(
                r.resource, r.requirement_type, r.alternative_group,
                r.quantity,
            )
            for r in explicit
        ]
    return [
        ResourceRequirement(resource, "required", "", 1)
        for resource in service.resources.all()
    ]
