/**
 * @file auth.js
 * @description Ticket Africa — Clerk authentication initialisation.
 *
 * Clerk is loaded via CDN script tag (window.Clerk).  This module waits for
 * the SDK to be available then initialises it and fires 'clerk-ready' on window
 * so layout.js and page scripts can hook in.
 *
 * NOTE: No `import` statements — this runs as a plain <script type="module">
 *       in a no-build environment.
 */

const PUBLISHABLE_KEY = 'pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA';

export async function initClerk() {
    if (!PUBLISHABLE_KEY) {
        console.warn('[TicketAfrica] Clerk publishable key is not set in auth.js');
        return null;
    }

    // If the Clerk CDN script is still loading, wait for it
    let attempts = 0;
    while (typeof window.Clerk === 'undefined' && attempts < 40) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    if (typeof window.Clerk === 'undefined') {
        console.warn('[TicketAfrica] Clerk SDK did not load in time — auth features unavailable.');
        return null;
    }

    const clerk = window.Clerk;

    try {
        await clerk.load({
            appearance: {
                variables: {
                    colorPrimary: '#D4AF37',
                    colorBackground: '#191919',
                    colorText: '#ffffff',
                    colorInputBackground: 'rgba(255, 255, 255, 0.05)',
                    colorInputText: '#ffffff',
                    borderRadius: '0.75rem',
                },
            },
        });

        // Dispatch so layout.js and page scripts know Auth is ready
        window.dispatchEvent(new Event('clerk-ready'));
        console.log('[TicketAfrica] Clerk initialised ✓');
        return clerk;
    } catch (err) {
        console.error('[TicketAfrica] Error starting Clerk:', err);
        return null;
    }
}

// Automatically initialise on import
initClerk();
