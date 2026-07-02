const { execFileSync } = require("child_process");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const vercelCli = process.platform === "win32" ? "vercel.cmd" : "vercel";

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        ...options,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : error.message,
    };
  }
}

function line(status, label, detail = "") {
  const marker = status ? "OK " : "ERR";
  console.log(`${marker} ${label}${detail ? ` - ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.log(`WARN ${label}${detail ? ` - ${detail}` : ""}`);
}

const blockers = [];

const env = run(npx, ["convex", "env", "list", "--prod"]);
if (!env.ok) {
  blockers.push("Could not read Convex production environment variables.");
  line(false, "Convex env", env.stderr.trim());
} else {
  const hasPaystackSecretKey = /^PAYSTACK_SECRET_KEY=/m.test(env.stdout);
  const hasClerkWebhookSecret = /^CLERK_WEBHOOK_SECRET=/m.test(env.stdout);
  const hasBrevoApiKey = /^BREVO_API_KEY=/m.test(env.stdout);
  const hasBrevoSenderEmail = /^BREVO_SENDER_EMAIL=/m.test(env.stdout);
  const hasUpstashRedisUrl = /^UPSTASH_REDIS_REST_URL=/m.test(env.stdout);
  const hasUpstashRedisToken = /^UPSTASH_REDIS_REST_TOKEN=/m.test(env.stdout);
  line(hasClerkWebhookSecret, "CLERK_WEBHOOK_SECRET", hasClerkWebhookSecret ? "configured" : "missing");
  line(hasPaystackSecretKey, "PAYSTACK_SECRET_KEY", hasPaystackSecretKey ? "configured" : "missing");
  line(hasBrevoApiKey, "BREVO_API_KEY", hasBrevoApiKey ? "configured" : "missing");
  line(hasBrevoSenderEmail, "BREVO_SENDER_EMAIL", hasBrevoSenderEmail ? "configured" : "missing");
  if (hasUpstashRedisUrl && hasUpstashRedisToken) {
    line(true, "Upstash Redis", "configured");
  } else {
    warn("Upstash Redis", "missing; public cache functions will fall back to direct Convex queries");
  }
  if (!hasPaystackSecretKey) blockers.push("Set PAYSTACK_SECRET_KEY in Convex production.");
  if (!hasBrevoApiKey) blockers.push("Set BREVO_API_KEY in Convex production.");
  if (!hasBrevoSenderEmail) blockers.push("Set BREVO_SENDER_EMAIL in Convex production.");
}

const events = run(npx, [
  "convex",
  "run",
  "--prod",
  "--typecheck",
  "disable",
  "--codegen",
  "disable",
  "events:listEvents",
]);
if (!events.ok) {
  blockers.push("Could not query production events.");
  line(false, "Production events", events.stderr.trim());
} else {
  let eventCount = 0;
  try {
    const parsed = JSON.parse(events.stdout);
    eventCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    blockers.push("Production events query returned invalid JSON.");
  }
  line(true, "Production events", `${eventCount} published event(s)`);
}

const spec = run(npx, ["convex", "function-spec", "--prod"]);
if (!spec.ok) {
  blockers.push("Could not read Convex production function spec.");
  line(false, "Convex functions", spec.stderr.trim());
} else {
  const required = [
    "events.js:getEventBySlug",
    "events.js:getTicketTiers",
    "events.js:createEventWithTiers",
    "payments.js:createCheckout",
    "payments.js:setPaystackReference",
    "payments.js:verifyPaystackPayment",
    "payments.js:verifyPaystackReference",
    "organizer.js:getPayoutBalance",
    "organizer.js:requestPayout",
    "organizer.js:checkInTicket",
    "organizer.js:listScanEventsByEvent",
    "messages.js:deliverQueued",
    "cache.js:getPublicEvents",
    "cache.js:getUpcomingEvents",
    "cache.js:getEventBySlug",
    "cache.js:getPublicPolls",
    "cache.js:warmPublicCache",
  ];
  for (const fn of required) {
    const present = spec.stdout.includes(`"identifier": "${fn}"`);
    line(present, fn, present ? "deployed" : "missing");
    if (!present) blockers.push(`Deploy missing Convex function ${fn}.`);
  }
}

const vercel = run(vercelCli, ["whoami"]);
line(vercel.ok, "Vercel auth", vercel.ok ? vercel.stdout.trim() : "not logged in");
if (!vercel.ok) blockers.push("Log in to Vercel or provide VERCEL_TOKEN before frontend deploy.");

if (blockers.length) {
  console.log("\nLaunch blockers:");
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}

console.log("\nProduction readiness checks passed.");
