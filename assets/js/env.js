window.ENV = { CLERK_PUBLISHABLE_KEY: "pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA", CONVEX_URL: "https://gallant-greyhound-48.convex.cloud", PAYSTACK_PUBLIC_KEY: "pk_live_a8683a0baf2ce8c65b95eace335a3958ebf4df2a" };
// Helper: get current datetime-local min string
window.getNowMin = function() {
    const now = new Date(Date.now() + 60000); // 1 min buffer
    return now.toISOString().slice(0,16);
};
