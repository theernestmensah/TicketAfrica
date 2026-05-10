const fs = require('fs');

const map = {
  '🚌': '<iconify-icon inline icon="ph:bus-fill"></iconify-icon>',
  '🅿️': '<iconify-icon inline icon="ph:parking-circle-fill"></iconify-icon>',
  '🎭': '<iconify-icon icon="ph:mask-happy-fill"></iconify-icon>',
  '🐦': '<iconify-icon inline icon="ph:twitter-logo-fill"></iconify-icon>',
  '👍': '<iconify-icon inline icon="ph:thumbs-up-fill"></iconify-icon>',
  '🔗': '<iconify-icon inline icon="ph:link-bold"></iconify-icon>',
  '⚡': '<iconify-icon inline icon="ph:lightning-fill"></iconify-icon>',
  '✗': '<iconify-icon inline icon="ph:x-bold"></iconify-icon>',
  '✕': '<iconify-icon inline icon="ph:x-bold"></iconify-icon>',
  '☂️': '<iconify-icon inline icon="ph:umbrella-fill"></iconify-icon>',
  '🔒': '<iconify-icon inline icon="ph:lock-fill"></iconify-icon>',
  '🎫': '<iconify-icon inline icon="ph:ticket-fill"></iconify-icon>',
  '💰': '<iconify-icon inline icon="ph:money-fill"></iconify-icon>',
  '🔔': '<iconify-icon inline icon="ph:bell-fill"></iconify-icon>',
  '🛡️': '<iconify-icon inline icon="ph:shield-check-fill"></iconify-icon>',
  '✨': '<iconify-icon inline icon="ph:sparkle-fill"></iconify-icon>',
  '⚠️': '<iconify-icon inline icon="ph:warning-fill"></iconify-icon>',
  '✓': '<iconify-icon inline icon="ph:check-bold"></iconify-icon>',
  '🔥': '<iconify-icon inline icon="ph:fire-fill"></iconify-icon>',
  '📈': '<iconify-icon inline icon="ph:trend-up-bold"></iconify-icon>',
  '📋': '<iconify-icon inline icon="ph:clipboard-text-fill"></iconify-icon>',
  '🔐': '<iconify-icon inline icon="ph:lock-key-fill"></iconify-icon>'
};

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [emoji, icon] of Object.entries(map)) {
    if(text.includes(emoji)){
      text = text.split(emoji).join(icon);
      changed = true;
    }
  }
  if(changed) {
    fs.writeFileSync(file, text);
    console.log('Updated ' + file);
  }
}
