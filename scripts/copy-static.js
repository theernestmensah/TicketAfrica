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
  return relative === 'assets/js/config.js' || relative === 'assets/js/env.js';
});

const env = {
  CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
  CONVEX_URL: process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || 'https://gallant-greyhound-48.convex.cloud',
  PAYSTACK_PUBLIC_KEY: process.env.VITE_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY || '',
};

const envJs = `window.ENV = ${JSON.stringify(env, null, 2)};\n` +
  `window.getNowMin = function() {\n` +
  `  const now = new Date(Date.now() + 60000);\n` +
  `  return now.toISOString().slice(0, 16);\n` +
  `};\n`;

copyFile(
  path.join(root, 'assets/js/config.example.js'),
  path.join(dist, 'assets/js/config.js')
);
fs.writeFileSync(path.join(dist, 'assets/js/env.js'), envJs);

console.log(`Copied ${htmlFiles.length} HTML files and static assets into dist.`);
