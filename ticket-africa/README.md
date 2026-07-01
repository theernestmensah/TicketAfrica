# Abonten Tickets Frontend MVP

Abonten Tickets is a static frontend MVP for a Ghana-focused event ticketing platform. It uses only HTML, CSS, Bootstrap 5 CDN, and vanilla JavaScript.

## How to run

Open `index.html` directly in a browser. No backend, build step, React, Next.js, Tailwind, or TypeScript is required.

## What is included

- Public event browsing, event details, checkout, mock payment success, and QR-coded ticket pages.
- Mock customer, organizer, and admin auth screens.
- Organizer dashboard, event creation, event management, sales, attendee list, and manual ticket validation.
- Admin dashboard, event approvals, organizers, customers, orders, revenue, service fee income, and payout estimates.
- Mock data and all demo orders/events are stored in `localStorage`.

## Demo flow

1. Open `events.html`.
2. Choose an event and click **View Details**.
3. Select a ticket type and quantity.
4. Continue to `checkout.html`.
5. Enter customer details and click **Pay with Paystack**.
6. The MVP simulates a successful payment, saves an order to `localStorage`, and redirects to `payment-success.html`.
7. Click **View Ticket** to see the ticket code and QR code.
8. Open `scan-ticket.html`, enter the ticket code, validate it, then mark it as used.

## Service fee rules

- GHS 1 to GHS 50 ticket: GHS 3 fee
- GHS 51 to GHS 100 ticket: GHS 5 fee
- GHS 101 to GHS 300 ticket: GHS 7 fee
- Above GHS 300 ticket: GHS 10 fee

The checkout total is ticket price plus the Abonten Tickets service fee, multiplied by quantity.

## Notes for future backend work

- The Paystack payment button currently simulates payment success.
- The integration point is commented in `assets/js/checkout.js`.
- Replace localStorage reads/writes with backend API calls when adding real authentication, payments, ticket issuance, and scanner endpoints.
