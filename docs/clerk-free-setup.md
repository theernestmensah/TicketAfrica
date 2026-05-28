# Clerk Free Setup

Ticket Africa uses Clerk for identity and Convex for app roles. This avoids paid Clerk Organizations while keeping buyer, organizer, and admin roles in the Convex `users` table.

## Clerk Dashboard

Use the Hobby/Free plan and keep these settings:

- Authentication: email/password enabled.
- Email verification: enabled.
- Social connections: optional; keep to Google/Apple only for now.
- Organizations: not required.
- SMS, MFA, passkeys, enterprise SSO, custom session lifetime, and removing Clerk branding: leave disabled for free-plan compatibility.

## URLs

Add these redirect URLs while developing locally:

```txt
http://127.0.0.1:5173/sso-callback.html
http://localhost:5173/sso-callback.html
```

Add the production equivalent before launch:

```txt
https://YOUR_DOMAIN/sso-callback.html
```

## Convex JWT Template

Create a Clerk JWT template named exactly:

```txt
convex
```

Convex expects the issuer domain configured in `convex/auth.config.js` and the frontend requests this token with:

```js
window.Clerk.session.getToken({ template: 'convex' })
```

## Webhook

Webhooks are optional for basic auth because the frontend also syncs users after sign-in. To enable webhooks:

1. In Clerk, add an endpoint:

```txt
https://gallant-greyhound-48.convex.site/clerk
```

2. Subscribe to:

```txt
user.created
user.updated
```

3. Copy the Clerk webhook signing secret and set it in Convex:

```txt
npx convex env set CLERK_WEBHOOK_SECRET whsec_...
```

## Current Local Values

The current local app uses:

```txt
CLERK_PUBLISHABLE_KEY=pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA
CONVEX_URL=https://gallant-greyhound-48.convex.cloud
CONVEX_SITE_URL=https://gallant-greyhound-48.convex.site
```

The matching Clerk issuer in `convex/auth.config.js` is:

```txt
https://divine-frog-25.clerk.accounts.dev
```
