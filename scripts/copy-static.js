const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, shouldSkip = () => false) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const relative = path.relative(root, sourcePath).replace(/\\/g, '/');
    if (shouldSkip(relative, entry)) continue;
    if (entry.isDirectory()) copyDir(sourcePath, destPath, shouldSkip);
    else copyFile(sourcePath, destPath);
  }
}

const htmlFiles = fs.readdirSync(root)
  .filter((file) => file.endsWith('.html'));

for (const file of htmlFiles) {
  copyFile(path.join(root, file), path.join(dist, file));
}

copyDir(path.join(root, 'assets'), path.join(dist, 'assets'), (relative) => {
  return relative === 'assets/js/config.js'
    || relative === 'assets/js/config.example.js'
    || relative === 'assets/js/env.js';
});

const env = {
  CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_ZGl2aW5lLWZyb2ctMjUuY2xlcmsuYWNjb3VudHMuZGV2JA',
  CONVEX_URL: process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || 'https://zealous-ptarmigan-734.convex.cloud',
  CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL || (process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || 'https://zealous-ptarmigan-734.convex.cloud').replace('.convex.cloud', '.convex.site'),
  PAYSTACK_PUBLIC_KEY: process.env.VITE_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || 'pk_live_a8683a0baf2ce8c65b95eace335a3958ebf4df2a',
};

const configEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
  USSD_SHORT_CODE: process.env.USSD_SHORT_CODE || '',
};

const publicConfig = `export const TA_CONFIG = {
  APP_VERSION: '1.0.0',
  APP_ENV: 'production',
  APP_NAME: 'Abonten Tickets',
  SUPABASE_URL: ${JSON.stringify(configEnv.SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(configEnv.SUPABASE_ANON_KEY)},
  PAYSTACK_PUBLIC_KEY: '${env.PAYSTACK_PUBLIC_KEY}',
  FLUTTERWAVE_PUBLIC_KEY: ${JSON.stringify(configEnv.FLUTTERWAVE_PUBLIC_KEY)},
  AFRICASTALKING_API_KEY: '',
  AFRICASTALKING_USERNAME: '',
  USSD_SHORT_CODE: ${JSON.stringify(configEnv.USSD_SHORT_CODE)},
  STORAGE_BUCKETS: {
    EVENT_IMAGES: 'event-images',
    TICKET_ASSETS: 'ticket-assets',
    ORGANIZER_LOGOS: 'organizer-logos',
  },
  FEATURES: {
    REALTIME_INVENTORY: true,
    USSD_PURCHASING: false,
    RESALE_MARKET: false,
    AGENT_NETWORK: false,
    SEATED_EVENTS: false,
    QUEUE_SYSTEM: false,
  },
  API: {
    QR_SERVICE: '/functions/v1/qr-generate',
    FRAUD_CHECK: '/functions/v1/fraud-check',
    TICKET_VALIDATE: '/functions/v1/ticket-validate',
    QUEUE_JOIN: '/functions/v1/queue-join',
    PAYOUT_REQUEST: '/functions/v1/payout-request',
    USSD_WEBHOOK: '/functions/v1/ussd-session',
    PAYMENT_VERIFY: '/functions/v1/payment-verify',
  },
};
`;

const envJs = `window.ENV = ${JSON.stringify(env, null, 2)};\n` +
  `window.getNowMin = function() {\n` +
  `  const now = new Date(Date.now() + 60000);\n` +
  `  return now.toISOString().slice(0, 16);\n` +
  `};\n`;

fs.mkdirSync(path.join(dist, 'assets/js'), { recursive: true });
fs.writeFileSync(path.join(dist, 'assets/js/config.js'), publicConfig);
fs.writeFileSync(path.join(dist, 'assets/js/env.js'), envJs);

console.log(`Copied ${htmlFiles.length} HTML files and static assets into dist.`);
