/**
 * @file services/index.js
 * @description Central service registry for Ticket Africa.
 *
 * All application code imports from here — never from individual service files.
 * This creates a single seam for swapping backends.
 *
 * PATTERN:
 *   Every service module exports a plain object with async methods.
 *   Methods always return plain data objects, never raw Supabase responses.
 *   Errors are always instances of TAError.
 *
 * BACKEND ROUTING:
 *   - Supabase    → auth, database reads/writes, realtime, storage
 *   - Edge Funcs  → QR generation, fraud checks, payment verification
 *   - Paystack    → GH₵ / ₦ payment sessions
 *   - Flutterwave → KSh / R / RWF payment sessions
 *   - Africa's Talking → SMS + USSD
 *
 * ADDING A NEW BACKEND:
 *   1. Create assets/js/services/my-service.js
 *   2. Export it here
 *   3. Update types in assets/js/types.js
 *
 * @module services
 */

export { AuthService } from './auth.js';
export { EventService } from './events.js';
export { TicketService } from './tickets.js';
export { OrderService } from './orders.js';
export { PaymentService } from './payments.js';
export { OrganizerService } from './organizer.js';
export { ScannerService } from './scanner.js';
export { StorageService } from './storage.js';
export { RealtimeService } from './realtime.js';
