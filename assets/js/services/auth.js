/**
 * @file services/auth.js
 * @description Authentication service — Supabase Auth as primary provider.
 *
 * SUPABASE AUTH FEATURES USED:
 *   - Email + password sign-up / sign-in
 *   - Magic link (passwordless)
 *   - OAuth: Google (Google Cloud Console) & Apple (Apple Developer + Services ID)
 *   - Phone/OTP (for African mobile-first auth)
 *   - JWT sessions with auto-refresh
 *
 * OAUTH SETUP (Supabase Dashboard → Authentication → Providers):
 *   Google — needs Client ID + Secret from Google Cloud Console (OAuth 2.0)
 *   Apple  — needs Services ID, Team ID, Key ID + private key from Apple Developer
 *
 * DATABASE TABLES (Supabase schema):
 *   auth.users          → managed by Supabase
 *   public.profiles     → extended user data (name, phone, country, etc.)
 */

import { supabase, sb, TAError } from '../lib/supabase.js';

export const AuthService = {

    /**
     * Get the currently authenticated user session.
     * @returns {Promise<{user: import('../types.js').User|null, session: object|null}>}
     */
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return { user: null, session: null };
        const profile = await this.getProfile(session.user.id);
        return { user: { ...session.user, profile }, session };
    },

    /**
     * Sign up a new user with email, password, and profile data.
     * @param {{ email: string, password: string, fullName: string, phone: string, country: string }} params
     * @returns {Promise<{user: object, session: object}>}
     */
    async signUp({ email, password, fullName, phone, country }) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone,
                    country,
                },
                emailRedirectTo: `${window.location.origin}/account.html`,
            },
        });
        if (error) throw new TAError(error.message, error.status);

        // Create extended profile row
        if (data.user) {
            await sb(
                supabase.from('profiles').upsert({
                    id: data.user.id,
                    full_name: fullName,
                    phone,
                    country,
                    created_at: new Date().toISOString(),
                })
            );
        }

        return data;
    },

    /**
     * Sign in with email and password.
     * @param {{ email: string, password: string }} params
     * @returns {Promise<{user: object, session: object}>}
     */
    async signIn({ email, password }) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new TAError(error.message, error.status);
        return data;
    },

    /**
     * Send a magic link (passwordless sign-in) to an email address.
     * @param {string} email
     * @returns {Promise<void>}
     */
    async sendMagicLink(email) {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/account.html` },
        });
        if (error) throw new TAError(error.message, error.status);
    },

    /**
     * Sign in / register with phone OTP (mobile-first, common in Africa).
     * @param {string} phone  E.164 format e.g. "+233244000000"
     * @returns {Promise<void>}
     */
    async sendPhoneOTP(phone) {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw new TAError(error.message, error.status);
    },

    /**
     * Verify a phone OTP code.
     * @param {string} phone
     * @param {string} token  6-digit code from SMS
     * @returns {Promise<{user: object, session: object}>}
     */
    async verifyPhoneOTP(phone, token) {
        const { data, error } = await supabase.auth.verifyOtp({
            phone, token, type: 'sms',
        });
        if (error) throw new TAError(error.message, error.status);
        return data;
    },

    /**
     * OAuth sign-in — Google or Apple.
     * Both redirect the browser to the provider, then back to redirectTo.
     *
     * GOOGLE: Enable "Google" provider in Supabase → Auth → Providers.
     *   Requires Client ID + Secret from Google Cloud Console.
     *
     * APPLE:  Enable "Apple" provider in Supabase → Auth → Providers.
     *   Requires: Apple Services ID, Team ID, Key ID, and private key (.p8 file).
     *   The redirect URL must be registered in Apple Developer portal.
     *
     * @param {'google'|'apple'} provider
     * @returns {Promise<void>} — redirects the browser
     */
    async signInWithOAuth(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/account.html`,
                // Apple requires scopes to get name + email on first login
                ...(provider === 'apple' ? { scopes: 'name email' } : {}),
            },
        });
        if (error) throw new TAError(error.message, error.status);
    },

    /** Shorthand: sign in with Google */
    signInWithGoogle() { return this.signInWithOAuth('google'); },

    /** Shorthand: sign in with Apple */
    signInWithApple()  { return this.signInWithOAuth('apple'); },

    /**
     * Sign out the current user.
     * @returns {Promise<void>}
     */
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw new TAError(error.message, error.status);
    },

    /**
     * Fetch extended profile data for a user.
     * @param {string} userId
     * @returns {Promise<import('../types.js').Profile|null>}
     */
    async getProfile(userId) {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        return data;
    },

    /**
     * Update a user's profile.
     * @param {string} userId
     * @param {Partial<import('../types.js').Profile>} updates
     * @returns {Promise<import('../types.js').Profile>}
     */
    async updateProfile(userId, updates) {
        return sb(
            supabase
                .from('profiles')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', userId)
                .select()
                .single()
        );
    },

    /**
     * Subscribe to auth state changes (sign in, sign out, token refresh).
     * @param {(event: string, session: object|null) => void} callback
     * @returns {{ unsubscribe: () => void }}
     */
    onAuthChange(callback) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
        return { unsubscribe: () => subscription.unsubscribe() };
    },
};
