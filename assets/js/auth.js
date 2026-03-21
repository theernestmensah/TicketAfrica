import Clerk from '@clerk/clerk-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export async function initClerk() {
    if (!PUBLISHABLE_KEY) {
        console.warn('VITE_CLERK_PUBLISHABLE_KEY is not defined in .env.local');
        return null;
    }

    const clerk = new Clerk(PUBLISHABLE_KEY);

    try {
        await clerk.load({
            appearance: {
                variables: {
                    colorPrimary: '#8B5CF6',
                    colorBackground: '#0a0a0f',
                    colorText: '#ffffff',
                    colorInputBackground: 'rgba(255, 255, 255, 0.05)',
                    colorInputText: '#ffffff',
                    borderRadius: '0.75rem',
                },
                elements: {
                    card: 'glass-panel',
                    headerTitle: 'font-display form-header',
                    formButtonPrimary: 'btn btn--primary w-full'
                }
            }
        });

        window.Clerk = clerk;

        // Dispatch an event so the rest of the app knows Auth is ready
        window.dispatchEvent(new Event('clerk-ready'));

        return clerk;
    } catch (err) {
        console.error('Error starting Clerk: ', err);
        return null;
    }
}

// Automatically initialize
initClerk();
