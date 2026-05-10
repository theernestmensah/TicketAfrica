/**
 * @file types.js
 * @description JSDoc type definitions for Ticket Africa.
 *
 * These types match the Supabase database schema exactly.
 * If you add a Supabase migration, update the types here too.
 *
 * For a TypeScript project, convert this file to types.d.ts and use
 * proper interface declarations instead of @typedef.
 */

/**
 * @typedef {Object} Profile
 * @property {string}  id            UUID — matches auth.users.id
 * @property {string}  full_name
 * @property {string}  phone         E.164 format
 * @property {string}  country       ISO 3166-1 alpha-3, e.g. "GHA"
 * @property {string}  [avatar_url]
 * @property {boolean} [is_organizer]
 * @property {string}  created_at    ISO timestamp
 * @property {string}  [updated_at]
 */

/**
 * @typedef {Object} Venue
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {string} city
 * @property {string} country
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {number} [capacity]
 */

/**
 * @typedef {Object} TicketTier
 * @property {string}  id
 * @property {string}  event_id
 * @property {string}  name           e.g. "VIP Section", "General Admission"
 * @property {string}  [description]
 * @property {number}  price
 * @property {string}  currency       ISO 4217, e.g. "GHS"
 * @property {number}  total_inventory
 * @property {number}  tickets_sold
 * @property {boolean} is_sold_out
 * @property {number}  max_per_order
 * @property {string}  [sale_starts_at]
 * @property {string}  [sale_ends_at]
 * @property {string[]} [includes]    List of tier perks
 * @property {number}  sort_order
 */

/**
 * @typedef {Object} Event
 * @property {string}     id
 * @property {string}     slug           SEO-friendly URL handle
 * @property {string}     title
 * @property {string}     [subtitle]
 * @property {'draft'|'published'|'cancelled'|'ended'} status
 * @property {string}     starts_at      ISO timestamp
 * @property {string}     [ends_at]
 * @property {string}     [doors_at]
 * @property {string}     [cover_image_url]
 * @property {string}     category       e.g. "concert", "festival", "sports"
 * @property {string[]}   [tags]
 * @property {string}     city
 * @property {string}     country        ISO 3166-1 alpha-3
 * @property {Venue}      venue
 * @property {{id:string, name:string, logo_url:string, verified:boolean}} organizer
 * @property {number}     min_price
 * @property {number}     max_price
 * @property {string}     currency
 * @property {number}     total_inventory
 * @property {number}     tickets_sold
 * @property {boolean}    is_sold_out
 * @property {boolean}    is_featured
 * @property {string}     organizer_id
 */

/**
 * @typedef {Event & {
 *   description: string,
 *   lineup?: string[],
 *   agenda?: object[],
 *   age_restriction?: number,
 *   dress_code?: string,
 *   notes?: string,
 *   latitude?: number,
 *   longitude?: number,
 *   ticket_tiers: TicketTier[],
 *   faqs?: Array<{question: string, answer: string}>,
 * }} EventDetail
 */

/**
 * @typedef {Object} Ticket
 * @property {string}  id
 * @property {string}  order_id
 * @property {string}  event_id
 * @property {string}  tier_id
 * @property {'issued'|'used'|'transferred'|'refunded'|'cancelled'} status
 * @property {string}  holder_name
 * @property {string}  holder_email
 * @property {string}  holder_phone
 * @property {string}  ticket_number  Human-readable, e.g. "TKA-2026-83921"
 * @property {string}  [qr_url]       Signed URL for QR display
 * @property {string}  [seat]         e.g. "Block C, Row 12, Seat 7"
 * @property {string}  issued_at
 * @property {string}  [used_at]
 * @property {string}  [transferred_at]
 * @property {Event}   event
 * @property {TicketTier} tier
 */

/**
 * @typedef {Object} Order
 * @property {string}  id
 * @property {string}  reference       Gateway payment reference
 * @property {'pending'|'completed'|'failed'|'refunded'} status
 * @property {number}  total
 * @property {string}  currency
 * @property {'mobile_money'|'card'|'bank_transfer'|'wallet'|'ussd'} payment_method
 * @property {string}  gateway         'paystack' | 'flutterwave'
 * @property {string}  [promo_code]
 * @property {number}  [promo_discount]
 * @property {string}  attendee_name
 * @property {string}  attendee_email
 * @property {string}  attendee_phone
 * @property {string}  created_at
 * @property {string}  [completed_at]
 * @property {Event}   event
 * @property {Ticket[]} tickets
 */

/**
 * @typedef {Object} TicketTransfer
 * @property {string} id
 * @property {string} ticket_id
 * @property {string} [to_phone]
 * @property {string} [to_email]
 * @property {string} [message]
 * @property {string} transferred_at
 */

/**
 * @typedef {Object} OrganizerEventStat
 * @property {string} id
 * @property {string} title
 * @property {string} starts_at
 * @property {string} city
 * @property {string} status
 * @property {number} total_inventory
 * @property {number} tickets_sold
 * @property {number} sell_through_pct
 * @property {number} gross_revenue
 * @property {string} currency
 */

/**
 * @typedef {Object} ScanEvent
 * @property {string} id
 * @property {string} event_id
 * @property {'valid'|'used'|'invalid'|'expired'|'wrong_event'} result
 * @property {string} gate
 * @property {string} scanned_at
 * @property {string} [holder_name]
 * @property {string} [tier_name]
 */

/**
 * @typedef {Object} ResaleListing
 * @property {string} id
 * @property {string} ticket_id
 * @property {number} asking_price
 * @property {string} currency
 * @property {'listed'|'sold'|'cancelled'} status
 * @property {string} listed_at
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {Profile} profile
 */

// No exports — this file exists only for JSDoc tooling and IDE support.
