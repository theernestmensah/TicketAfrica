/**
 * Utility functions for input sanitization in Convex mutations.
 * Prevents HTML injection, XSS, and cleans up input strings.
 */

// Strip all HTML tags
export function sanitizeText(val: any): string {
    if (typeof val !== "string") return "";
    // Strip HTML tags using regex
    const cleaned = val.replace(/<[^>]*>/g, "");
    return cleaned.trim();
}

// Strip dangerous HTML/script tags from HTML/markdown content
export function sanitizeHtml(val: any): string {
    if (typeof val !== "string") return "";
    // Strip script, iframe, object, embed, style, form, link, meta, inline handlers
    let cleaned = val
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, ""); // remove inline handlers like onclick, onload

    // Also strip generic self-closing/dangerous elements
    cleaned = cleaned.replace(/<(object|embed|applet|form|link|meta|svg|canvas|audio|video)\b[^>]*>/gi, "");
    return cleaned.trim();
}

// Clean and validate emails
export function sanitizeEmail(val: any): string {
    if (typeof val !== "string") return "";
    return val.trim().toLowerCase();
}

// Clean and uppercase promo codes
export function sanitizeAlphanumeric(val: any): string {
    if (typeof val !== "string") return "";
    return val.replace(/[^a-zA-Z0-9]/g, "").trim().toUpperCase();
}

// Clean and validate phones
export function sanitizePhone(val: any): string {
    if (typeof val !== "string") return "";
    return val.replace(/[^0-9+\-\s()]/g, "").trim();
}
