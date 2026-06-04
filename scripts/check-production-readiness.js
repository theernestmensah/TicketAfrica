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

const blockers = [];

const env = run(npx, ["convex", "env", "list", "--prod"]);
if (!env.ok) {
  blockers.push("Could not read Convex production environment variables.");
  line(false, "Convex env", env.stderr.trim());
} else {
  const hasMoolreApiUser = /^MOOLRE_API_USER=/m.test(env.stdout);
  const hasMoolreApiKey = /^MOOLRE_API_KEY=/m.test(env.stdout);
  const hasMoolrePublicKey = /^MOOLRE_PUBLIC_KEY=/m.test(env.stdout);
  const hasMoolreAccountNumber = /^MOOLRE_ACCOUNT_NUMBER=/m.test(env.stdout);
  const hasMoolreSmsVasKey = /^MOOLRE_SMS_VAS_KEY=/m.test(env.stdout);
  const hasMoolreSmsSenderId = /^MOOLRE_SMS_SENDER_ID=/m.test(env.stdout);
  const hasClerkWebhookSecret = /^CLERK_WEBHOOK_SECRET=/m.test(env.stdout);
  const hasBrevoApiKey = /^BREVO_API_KEY=/m.test(env.stdout);
  const hasBrevoSenderEmail = /^BREVO_SENDER_EMAIL=/m.test(env.stdout);
  line(hasClerkWebhookSecret, "CLERK_WEBHOOK_SECRET", hasClerkWebhookSecret ? "configured" : "missing");
  line(hasMoolreApiUser, "MOOLRE_API_USER", hasMoolreApiUser ? "configured" : "missing");
  line(hasMoolreApiKey, "MOOLRE_API_KEY", hasMoolreApiKey ? "configured" : "missing");
  line(hasMoolrePublicKey, "MOOLRE_PUBLIC_KEY", hasMoolrePublicKey ? "configured" : "missing");
  line(hasMoolreAccountNumber, "MOOLRE_ACCOUNT_NUMBER", hasMoolreAccountNumber ? "configured" : "missing");
  line(hasMoolreSmsVasKey, "MOOLRE_SMS_VAS_KEY", hasMoolreSmsVasKey ? "configured" : "missing");
  line(hasMoolreSmsSenderId, "MOOLRE_SMS_SENDER_ID", hasMoolreSmsSenderId ? "configured" : "missing");
  line(hasBrevoApiKey, "BREVO_API_KEY", hasBrevoApiKey ? "configured" : "missing");
  line(hasBrevoSenderEmail, "BREVO_SENDER_EMAIL", hasBrevoSenderEmail ? "configured" : "missing");
  if (!hasMoolreApiUser) blockers.push("Set MOOLRE_API_USER in Convex production.");
  if (!hasMoolreApiKey) blockers.push("Set MOOLRE_API_KEY in Convex production.");
  if (!hasMoolrePublicKey) blockers.push("Set MOOLRE_PUBLIC_KEY in Convex production.");
  if (!hasMoolreAccountNumber) blockers.push("Set MOOLRE_ACCOUNT_NUMBER in Convex production.");
  if (!hasMoolreSmsVasKey) blockers.push("Set MOOLRE_SMS_VAS_KEY in Convex production.");
  if (!hasMoolreSmsSenderId) blockers.push("Set MOOLRE_SMS_SENDER_ID in Convex production.");
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
  line(eventCount > 0, "Production events", `${eventCount} published event(s)`);
  if (eventCount === 0) blockers.push("Add at least one published production event.");
}

const spec = run(npx, ["convex", "function-spec", "--prod"]);
if (!spec.ok) {
  blockers.push("Could not read Convex production function spec.");
  line(false, "Convex functions", spec.stderr.trim());
} else {
  const required = [
    "events.js:getEventBySlug",
    "events.js:getTicketTiers",
    "payments.js:createCheckout",
    "payments.js:initiateMoolrePaymentLink",
    "payments.js:verifyMoolrePayment",
    "organizer.js:getPayoutBalance",
    "organizer.js:requestPayout",
    "organizer.js:processMoolrePayout",
    "organizer.js:checkInTicket",
    "organizer.js:listScanEventsByEvent",
    "messages.js:deliverQueued",
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
