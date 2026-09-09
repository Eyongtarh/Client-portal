# Client Portal — V1 User Stories

A professional client portal and business management platform for freelancers, consultants, agencies, contractors, studios, salons, barbers, tutors, trainers, photographers, clinics, and other service providers.

The platform combines **client management, projects, bookings, scheduling, documents, messaging, invoicing, payments, approvals, feedback, and business administration** in one private, branded workspace.

---

# 1. Authentication

- **AUTH-01** — As a user, I want to register so that I can create and manage my workspace.
- **AUTH-02** — As a user, I want to log in and log out securely so that my account is protected.
- **AUTH-03** — As a user, I want to reset my password so that I can regain account access.
- **AUTH-04** — As a workspace owner, I want to invite clients so that they can access their private portal.
- **AUTH-05** — As a user, I want to update my profile so that my information stays current.

# 2. Workspace Dashboard

- **DASH-01** — As a workspace member, I want to see clients, projects, bookings, invoices, messages, payments, approvals, and deadlines in one dashboard so that I know what needs attention.
- **DASH-02** — As a workspace member, I want to see today's bookings and upcoming appointments so that I can manage my schedule.
- **DASH-03** — As a workspace member, I want to see recent activity so that I can track important changes.
- **DASH-04** — As a workspace member, I want to see key business metrics so that I can understand bookings, revenue, clients, and project activity.

# 3. Client Management

- **CLIENT-01** — As a workspace member, I want to create and manage clients so that I can organize client information.
- **CLIENT-02** — As a workspace member, I want to invite clients by email so that they can access their portal.
- **CLIENT-03** — As a workspace member, I want to view clients and their projects, bookings, invoices, and history so that I can manage relationships efficiently.
- **CLIENT-04** — As a workspace member, I want to archive inactive clients so that my workspace stays organized.
- **CLIENT-05** — As a workspace member, I want to store client notes and preferences so that I can provide personalized service.
- **CLIENT-06** — As a workspace member, I want to see a client's booking and payment history so that I understand their relationship with my business.

# 4. Client Portal

- **PORTAL-01** — As a client, I want a dashboard showing my projects, tasks, bookings, documents, messages, invoices, payments, and approvals so that everything is accessible in one place.
- **PORTAL-02** — As a client, I want access only to my own information so that my data remains private.
- **PORTAL-03** — As a client, I want to see important updates and deadlines so that I know what requires my attention.
- **PORTAL-04** — As a client, I want to manage my profile and preferences so that my information stays current.
- **PORTAL-05** — As a client, I want to access my booking history so that I can see past and upcoming appointments.

# 5. Projects

- **PROJECT-01** — As a workspace member, I want to create projects with clients, budgets, dates, and descriptions so that I can organize client work.
- **PROJECT-02** — As a workspace member, I want to update project status so that clients know the current state of their project.
- **PROJECT-03** — As a client, I want to see project progress so that I know how much work has been completed.
- **PROJECT-04** — As a workspace member, I want to create milestones so that I can divide projects into stages.
- **PROJECT-05** — As a client, I want to see project deadlines so that I know when work is expected to be completed.

# 6. Tasks

- **TASK-01** — As a workspace member, I want to create tasks so that I can organize project work.
- **TASK-02** — As a workspace member, I want to assign tasks so that responsibilities are clear.
- **TASK-03** — As a workspace member, I want to mark tasks as complete so that project progress is updated.
- **TASK-04** — As a client, I want to see relevant tasks so that I understand the work being performed.

# 7. Documents

- **DOC-01** — As a workspace member, I want to upload project and client documents so that clients can access important files.
- **DOC-02** — As a client, I want to upload documents so that I can provide files requested by the business.
- **DOC-03** — As a user, I want to download documents so that I can use them outside the portal.
- **DOC-04** — As a workspace member, I want to categorize documents so that files are easy to find.
- **DOC-05** — As a workspace member, I want to delete outdated documents so that my workspace stays organized.
- **DOC-06** — As a workspace member, I want to control document visibility so that some documents can remain private.

# 8. Messaging

- **MSG-01** — As a workspace member, I want project- and client-based conversations so that communication stays organized.
- **MSG-02** — As a client, I want to send messages so that I can communicate with the business.
- **MSG-03** — As a user, I want email notifications for new messages so that I don't miss important communication.
- **MSG-04** — As a user, I want message history so that project and client communication is preserved.
- **MSG-05** — As a user, I want to attach documents to messages so that I can share relevant information.

# 9. Invoices

- **INV-01** — As a workspace member, I want to create invoices so that I can request payment from clients.
- **INV-02** — As a workspace member, I want to generate PDF invoices so that I can send professional invoices.
- **INV-03** — As a workspace member, I want to send invoices to clients so that they know payment is due.
- **INV-04** — As a workspace member, I want to track invoice status so that I know which invoices are paid or overdue.
- **INV-05** — As a client, I want to view and download invoices so that I can understand what I owe.

# 10. Online Payments

- **PAY-01** — As a client, I want to pay invoices online so that I can pay conveniently.
- **PAY-02** — As a workspace member, I want payment confirmations so that I know when invoices are paid.
- **PAY-03** — As a workspace member, I want invoice status to update automatically after payment so that I don't need to update it manually.
- **PAY-04** — As a client, I want to see my payment history so that I can track my payments.
- **PAY-05** — As a workspace member, I want to see payment history so that I can track business revenue.

# 11. Booking & Scheduling

The booking system is **general-purpose**, not specific to barbers.

It should support appointments, consultations, classes, sessions, services, meetings, events, and resource reservations.

## Booking Setup

- **BOOK-01** — As a workspace owner, I want to enable booking for my workspace so that clients can schedule appointments online.
- **BOOK-02** — As a workspace member, I want to create services with names, descriptions, durations, prices, and availability so that clients can choose what they need.
- **BOOK-03** — As a workspace member, I want to create different booking types so that I can support appointments, consultations, meetings, classes, and events.
- **BOOK-04** — As a workspace member, I want to assign team members to services so that clients can book with the appropriate person.
- **BOOK-05** — As a workspace member, I want to define service-specific availability so that different services can have different schedules.
- **BOOK-06** — As a workspace member, I want to define locations for services so that clients know where appointments take place.
- **BOOK-07** — As a workspace member, I want to offer online meeting options so that clients can book virtual appointments.
- **BOOK-08** — As a workspace member, I want to add service instructions so that clients know what to prepare before an appointment.

## Availability

- **BOOK-09** — As a workspace member, I want to define weekly working hours so that clients can only book available times.
- **BOOK-10** — As a team member, I want to define my individual availability so that bookings respect my schedule.
- **BOOK-11** — As a workspace member, I want to add holidays and days off so that unavailable dates cannot be booked.
- **BOOK-12** — As a workspace member, I want to block specific dates and times so that I can prevent bookings when unavailable.
- **BOOK-13** — As a workspace member, I want to configure booking buffers before or after appointments so that I have preparation and recovery time.
- **BOOK-14** — As a workspace member, I want to set minimum notice periods so that clients cannot book at the last minute.
- **BOOK-15** — As a workspace member, I want to set maximum advance booking periods so that clients cannot book too far into the future.
- **BOOK-16** — As a workspace member, I want to set maximum daily or weekly bookings so that my workload remains manageable.
- **BOOK-17** — As a workspace member, I want the system to prevent double-booking so that two clients cannot reserve the same availability.

## Customer Booking

- **BOOK-18** — As a client, I want to view available services so that I can choose the service I need.
- **BOOK-19** — As a client, I want to choose a team member when applicable so that I can book with my preferred provider.
- **BOOK-20** — As a client, I want to select a date and available time so that I can schedule an appointment.
- **BOOK-21** — As a client, I want to book without creating an account when the business allows it so that booking is quick and convenient.
- **BOOK-22** — As a client, I want to log in before booking when required so that my booking history is connected to my account.
- **BOOK-23** — As a client, I want to see the price and duration before confirming so that I know what I am booking.
- **BOOK-24** — As a client, I want to see the booking location or meeting link so that I know where the appointment will happen.
- **BOOK-25** — As a client, I want to receive immediate confirmation so that I know my booking was successful.

## Booking Links & Public Booking

- **BOOK-26** — As a workspace owner, I want a public booking page so that clients can book without contacting me manually.
- **BOOK-27** — As a workspace owner, I want a shareable booking link so that I can share my booking page on websites and social media.
- **BOOK-28** — As a workspace owner, I want service-specific booking links so that I can send clients directly to a particular service.
- **BOOK-29** — As a workspace owner, I want to embed booking into my website so that clients can book without leaving my website.
- **BOOK-30** — As a workspace owner, I want to control whether my booking page is public or invitation-only so that I can control access.

## Booking Management

- **BOOK-31** — As a workspace member, I want to see bookings in a calendar so that I can manage my schedule.
- **BOOK-32** — As a workspace member, I want to create bookings manually so that I can record phone, walk-in, or manually arranged appointments.
- **BOOK-33** — As a workspace member, I want to edit bookings so that I can correct or update appointment information.
- **BOOK-34** — As a workspace member, I want to cancel bookings so that unavailable appointments are removed from my schedule.
- **BOOK-35** — As a workspace member, I want to reschedule bookings so that I can move appointments when necessary.
- **BOOK-36** — As a client, I want to cancel my booking so that I can notify the business when I cannot attend.
- **BOOK-37** — As a client, I want to reschedule my booking so that I can choose another available time.
- **BOOK-38** — As a workspace member, I want to mark bookings as completed, cancelled, or no-show so that appointment records remain accurate.

## Booking Rules & Policies

- **BOOK-39** — As a workspace owner, I want to define cancellation policies so that clients understand the rules before booking.
- **BOOK-40** — As a workspace owner, I want to define rescheduling rules so that I can control when appointments can be changed.
- **BOOK-41** — As a workspace owner, I want to define no-show policies so that missed appointments can be handled consistently.
- **BOOK-42** — As a workspace owner, I want to require a deposit or full payment for selected services so that I can reduce no-shows.
- **BOOK-43** — As a workspace owner, I want clients to see booking policies before confirming so that expectations are clear.

## Recurring Bookings

- **BOOK-44** — As a client, I want to book recurring appointments so that I don't need to schedule every appointment manually.
- **BOOK-45** — As a workspace member, I want to create recurring bookings for clients so that regular appointments are easy to manage.
- **BOOK-46** — As a user, I want to modify or cancel one occurrence or an entire recurring series so that I can manage recurring appointments flexibly.

## Group & Capacity Bookings

- **BOOK-47** — As a workspace member, I want to define capacity for a service or time slot so that multiple clients can book the same session when appropriate.
- **BOOK-48** — As a client, I want to book a group session when capacity is available so that I can participate in classes or events.
- **BOOK-49** — As a workspace member, I want to see remaining capacity so that I know when a session is full.
- **BOOK-50** — As a system, I want to automatically close full booking slots so that overbooking cannot occur.

## Resources

- **BOOK-51** — As a workspace member, I want to create bookable resources such as rooms, equipment, chairs, tables, or vehicles so that shared resources cannot be double-booked.
- **BOOK-52** — As a workspace member, I want to associate resources with services so that bookings automatically reserve required resources.
- **BOOK-53** — As a system, I want to check staff and resource availability together so that only valid booking times are offered.

## Waitlist

- **BOOK-54** — As a client, I want to join a waitlist when no suitable time is available so that I can be notified when a slot opens.
- **BOOK-55** — As a workspace member, I want to manage the waitlist so that cancelled slots can be offered to waiting clients.
- **BOOK-56** — As a system, I want to notify waiting clients when matching availability opens so that empty slots can be filled quickly.

## Booking Reminders

- **BOOK-57** — As a client, I want booking confirmation emails so that I have a record of my appointment.
- **BOOK-58** — As a client, I want appointment reminders so that I don't forget my booking.
- **BOOK-59** — As a workspace member, I want to configure reminder timing so that reminders fit my business.
- **BOOK-60** — As a user, I want cancellation and rescheduling notifications so that everyone stays informed.
- **BOOK-61** — As a user, I want calendar invitations so that appointments can appear in my personal calendar.

## Calendar Integration

- **BOOK-62** — As a workspace member, I want to connect an external calendar so that existing events can affect my availability.
- **BOOK-63** — As a workspace member, I want external calendar events to block unavailable times so that clients cannot book when I am busy.
- **BOOK-64** — As a workspace member, I want confirmed bookings to appear in my connected calendar so that my schedules stay synchronized.
- **BOOK-65** — As a client, I want to add appointments to my calendar so that I remember them.

## Time Zones

- **BOOK-66** — As a workspace owner, I want to configure the workspace time zone so that booking times are displayed correctly.
- **BOOK-67** — As a client, I want to see booking times in my local time zone when appropriate so that I do not confuse appointment times.
- **BOOK-68** — As a system, I want to store booking times consistently so that time-zone changes do not corrupt appointments.

## Booking Intake

- **BOOK-69** — As a workspace member, I want to create custom questions for a service so that I can collect information before an appointment.
- **BOOK-70** — As a client, I want to provide requested information while booking so that the business has the details it needs.
- **BOOK-71** — As a workspace member, I want to view booking responses so that I can prepare for the appointment.

## Booking Payments

- **BOOK-72** — As a client, I want to pay a deposit during booking so that my appointment is secured.
- **BOOK-73** — As a client, I want to pay the full service price during booking so that payment is completed in advance.
- **BOOK-74** — As a workspace member, I want booking payments to be connected to invoices and transactions so that financial records remain organized.
- **BOOK-75** — As a workspace member, I want cancellation and no-show fees to follow my configured policy so that payment rules are enforced consistently.

## Booking Analytics

- **BOOK-76** — As a workspace owner, I want to see booking statistics so that I can understand demand.
- **BOOK-77** — As a workspace owner, I want to see bookings by service, team member, location, and date so that I can understand business performance.
- **BOOK-78** — As a workspace owner, I want to see cancellation and no-show rates so that I can identify scheduling problems.
- **BOOK-79** — As a workspace owner, I want to see revenue generated from bookings so that I can measure booking performance.

# 12. Notifications

- **NOTIF-01** — As a user, I want notifications for messages, documents, invoices, payments, bookings, approvals, and project updates so that I don't miss anything.
- **NOTIF-02** — As a user, I want notification preferences so that I control which notifications I receive.
- **NOTIF-03** — As a workspace owner, I want automated booking reminders so that I spend less time manually contacting clients.

# 13. Activity & Audit Trail

- **ACT-01** — As a workspace member, I want an activity log so that I can see what happened across my workspace.
- **ACT-02** — As a workspace member, I want to know when clients view documents or invoices so that I know whether important information was received.
- **ACT-03** — As a workspace member, I want booking activity recorded so that I can see who created, changed, cancelled, or completed appointments.

# 14. Deliverable Approvals

- **APPROVAL-01** — As a workspace member, I want to request deliverable approval so that clients can formally review work.
- **APPROVAL-02** — As a client, I want to approve deliverables so that the business knows I accept the work.
- **APPROVAL-03** — As a client, I want to request changes so that the business knows what needs to be modified.
- **APPROVAL-04** — As a workspace member, I want an approval history so that client decisions are recorded.

# 15. Client Feedback

- **FEEDBACK-01** — As a workspace member, I want to request feedback after a project, appointment, or service so that I can improve my business.
- **FEEDBACK-02** — As a client, I want to rate and review a project, appointment, or service so that I can provide feedback.
- **FEEDBACK-03** — As a workspace owner, I want to see feedback by service or team member so that I can identify strengths and areas for improvement.

# 16. Subscriptions

- **SUB-01** — As a workspace owner, I want to choose a subscription plan so that I can access the features I need.
- **SUB-02** — As a workspace owner, I want to upgrade or downgrade my plan so that I can control my subscription.
- **SUB-03** — As a workspace owner, I want to see my current plan and usage so that I understand my subscription.
- **SUB-04** — As a workspace owner, I want to cancel my subscription so that I can stop future billing.

# 17. Custom Branding

- **BRAND-01** — As a workspace owner, I want to add my logo and brand colors so that my client portal looks professional.
- **BRAND-02** — As a workspace owner, I want my branding to appear on client-facing pages and documents so that my business has a consistent identity.
- **BRAND-03** — As a workspace owner, I want my booking page to use my branding so that clients recognize my business.

# 18. Team Management

- **TEAM-01** — As a workspace owner, I want to invite team members so that we can collaborate on client projects and bookings.
- **TEAM-02** — As a workspace owner, I want role-based permissions so that team members only access appropriate information.
- **TEAM-03** — As a workspace owner, I want to remove team members so that access can be controlled when someone leaves.
- **TEAM-04** — As a team member, I want to see the projects, clients, and bookings assigned to me so that I know what I am responsible for.
- **TEAM-05** — As a workspace owner, I want to define each team member's services and availability so that bookings are assigned correctly.

# 19. Search & Organization

- **SEARCH-01** — As a workspace member, I want to search clients, projects, bookings, documents, invoices, and messages so that I can quickly find information.
- **SEARCH-02** — As a workspace member, I want to filter projects by client, status, and deadline so that I can prioritize work.
- **SEARCH-03** — As a workspace member, I want to filter invoices by status and date so that I can track outstanding payments.
- **SEARCH-04** — As a workspace member, I want to filter bookings by date, service, team member, client, and status so that I can manage schedules efficiently.

# 20. Usage Limits

- **LIMIT-01** — As a workspace owner, I want to see my client, project, booking, storage, and team-member usage so that I understand my limits.
- **LIMIT-02** — As a workspace owner, I want to receive warnings when approaching a limit so that I can upgrade before reaching it.
- **LIMIT-03** — As a system, I want to enforce subscription limits so that users receive only the features included in their plan.

# 21. Custom Domains

- **DOMAIN-01** — As a workspace owner, I want to connect a custom domain so that clients can access a branded portal.
- **DOMAIN-02** — As a workspace owner, I want to configure my domain securely so that my portal is accessible through my business URL.
- **DOMAIN-03** — As a system, I want to verify domain ownership so that unauthorized domains cannot be connected.
- **DOMAIN-04** — As a workspace owner, I want my booking page to work on my custom domain so that clients see my business URL.

# 22. Mobile Apps

- **MOBILE-01** — As a user, I want to access my workspace from a mobile app so that I can manage my work anywhere.
- **MOBILE-02** — As a client, I want to access my portal from a mobile app so that I can review projects, documents, invoices, bookings, and messages anywhere.
- **MOBILE-03** — As a user, I want mobile notifications so that I receive important updates even when the web application is closed.
- **MOBILE-04** — As a client, I want to book, cancel, and reschedule appointments from the mobile app so that I can manage bookings conveniently.

# 23. Security & Privacy

- **SEC-01** — As a system, I want role-based access control so that sensitive information is protected.
- **SEC-02** — As a system, I want workspace isolation so that organizations cannot access each other's data.
- **SEC-03** — As a system, I want secure file access so that private documents are protected.
- **SEC-04** — As a system, I want secure sessions so that unauthorized users cannot access accounts.
- **SEC-05** — As a user, I want to delete my account and data so that I control my information.
- **SEC-06** — As a system, I want booking authorization rules so that only authorized users can create, modify, or cancel bookings.
- **SEC-07** — As a system, I want payment information handled securely so that sensitive financial data is protected.

# 24. Responsive Experience

- **UI-01** — As a workspace member, I want the dashboard to work on desktop, tablet, and mobile so that I can manage my work anywhere.
- **UI-02** — As a client, I want the portal to work on mobile so that I can access projects, documents, messages, invoices, payments, and approvals anywhere.
- **UI-03** — As a client, I want the booking experience to work well on mobile so that I can book appointments quickly from my phone.
- **UI-04** — As a workspace member, I want the booking calendar to work on desktop and tablet so that I can manage appointments efficiently.

---

# First Build — V1

Everything below is included in V1:

```text
Authentication
Workspace Management
Client Management
Client Invitations
Client Portal
Projects
Milestones
Tasks
Documents
Messaging

Booking & Scheduling
├── Services
├── Appointment Types
├── Staff Availability
├── Working Hours
├── Time Off
├── Holidays
├── Blocked Time
├── Buffer Time
├── Booking Rules
├── Public Booking Page
├── Booking Links
├── Website Embed
├── Client Booking
├── Guest Booking
├── Manual Booking
├── Rescheduling
├── Cancellation
├── Recurring Bookings
├── Group Bookings
├── Capacity Management
├── Resource Booking
├── Waitlist
├── Booking Reminders
├── Booking Notifications
├── Calendar Integration
├── Time Zones
├── Intake Forms
├── Deposits
├── Booking Payments
├── No-Show Policies
├── Cancellation Policies
├── Booking Analytics
└── Multi-Location Support

Invoices
Online Payments
Deliverable Approvals
Change Requests
Email Notifications
Activity & Audit Trail
Client Feedback
Subscriptions
Custom Branding
Team Management
Advanced Search
Usage Limits
Custom Domains
Mobile Apps
Security & Access Control
Responsive UI
```

# Core User Flows

## General Client Portal

```text
User registers
       ↓
Creates workspace
       ↓
Sets business profile & branding
       ↓
Adds client
       ↓
Invites client
       ↓
Client accepts invitation
       ↓
Creates project
       ↓
Adds milestones & tasks
       ↓
Uploads documents
       ↓
Client accesses portal
       ↓
Client + workspace communicate
       ↓
Deliverable submitted
       ↓
Client approves / requests changes
       ↓
Invoice created
       ↓
Client pays
       ↓
Project completed
       ↓
Client leaves feedback
```

## General Booking Flow

```text
Business creates service
       ↓
Defines price & duration
       ↓
Assigns staff/resources
       ↓
Defines availability
       ↓
Sets booking rules
       ↓
Publishes booking page
       ↓
Client opens booking link
       ↓
Selects service
       ↓
Selects staff (if applicable)
       ↓
Selects date & available time
       ↓
Provides contact/intake information
       ↓
Accepts booking policy
       ↓
Pays deposit/full amount (if required)
       ↓
Booking confirmed
       ↓
Calendar updated
       ↓
Confirmation sent
       ↓
Reminder sent
       ↓
Appointment happens
       ↓
Booking marked completed
       ↓
Feedback requested
```

## Booking Cancellation Flow

```text
Client opens booking
       ↓
Selects Cancel
       ↓
System checks cancellation policy
       ↓
Cancellation accepted
       ↓
Payment/deposit policy applied
       ↓
Calendar slot becomes available
       ↓
Waitlist checked
       ↓
Waiting clients notified
```

## Booking Rescheduling Flow

```text
Client selects Reschedule
       ↓
System checks rescheduling policy
       ↓
Shows available times
       ↓
Client selects new time
       ↓
Old slot released
       ↓
New slot reserved
       ↓
Calendar updated
       ↓
Notifications sent
```

---

# Core Entities

```text
User
Workspace
WorkspaceMember
Client
ClientContact

Project
Milestone
Task

Service
BookingType
Booking
Availability
WorkingHours
TimeOff
BlockedTime
BookingRule
BookingPolicy
Resource
Location
BookingForm
BookingResponse
WaitlistEntry

Document
Message

Invoice
Payment

Approval
Feedback

Notification
Activity

Subscription
SubscriptionPlan
UsageLimit

Domain
Branding

CalendarConnection
```

# Booking Statuses

```text
Pending
Confirmed
Rescheduled
Cancelled
Completed
No-Show
Declined
```

# Booking Types

The system should support:

```text
One-on-One Appointment
Group Appointment
Consultation
Meeting
Class
Workshop
Event
Service Appointment
Resource Reservation
Recurring Appointment
```

# Example Businesses

The same V1 product can support:

| Business                | Booking Example      |
| ----------------------- | -------------------- |
| 💈 Barber               | Haircut              |
| 💇 Salon                | Hair appointment     |
| 🧑‍🏫 Tutor                | Tutoring session     |
| 🏋️ Trainer              | Personal training    |
| 📸 Photographer         | Photoshoot           |
| 💻 Consultant           | Consultation         |
| 🧑‍💻 Freelancer           | Client meeting       |
| 🧑‍⚕️ Professional service | Appointment          |
| 🚗 Auto service         | Vehicle service      |
| 🐕 Pet groomer          | Grooming appointment |
| 🏢 Agency               | Client consultation  |
| 🎨 Designer             | Design consultation  |
| 🏠 Contractor           | Site visit           |
| 📚 Coach                | Coaching session     |
| 🧘 Wellness business    | Class/session        |

# Product Positioning

> **The all-in-one client portal for service businesses.**

Manage your **clients, projects, bookings, documents, messages, invoices, payments, approvals, and feedback** — all from one private, branded workspace.

### Target Users

```text
Freelancers
Consultants
Agencies
Contractors
Design Studios
Development Studios
Marketing Agencies
Barbers
Salons
Tutors
Coaches
Personal Trainers
Photographers
Wellness Businesses
Professional Service Providers
Small Businesses
```

# V1 Architecture

```text
                         Client Portal
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
     Clients               Projects             Bookings
        │                     │                     │
     Messages             Documents             Services
        │                     │                  Calendar
        │                     │                  Staff
        │                     │                  Resources
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                         Django API
                              │
                    ┌─────────┼─────────┐
                    │         │         │
               PostgreSQL   Redis    Background Jobs
                                      │
                              Notifications
                              Reminders
                              Emails
```

The important design decision is that **Booking is a module of the Workspace**, not a barber-specific feature.

That means a barber can use:

```text
Clients
Bookings
Services
Payments
```

while a software consultant can use:

```text
Clients
Projects
Bookings
Invoices
Documents
Approvals
```

and an agency can use:

```text
Clients
Projects
Tasks
Bookings
Documents
Invoices
Payments
Team
Approvals
```

The same platform supports all three without changing the core architecture.
