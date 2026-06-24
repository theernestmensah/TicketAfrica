const fs = require('fs');
const path = require('path');

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('.git') && !file.includes('node_modules') && !file.includes('.gemini') && !file.includes('convex')) {
            results = results.concat(getFiles(file));
        } else {
            if (file.endsWith('.html') || file.endsWith('.css') || file.endsWith('.js')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = getFiles(__dirname);
let replacedCount = 0;

files.forEach(f => {
    let original = fs.readFileSync(f, 'utf8');
    let c = original;

    // Exact brand replacements (case insensitive)
    c = c.replace(/#8B5CF6/gi, '#7C3AED'); // primary purple
    c = c.replace(/#D4AF37/gi, '#F59E0B'); // accent amber
    c = c.replace(/#EC4899/gi, '#F59E0B'); // old pink accent
    c = c.replace(/#191919/gi, '#111827'); // charcoal text
    c = c.replace(/#F5F5F7/gi, '#F9FAFB'); // light gray background

    // RGB legacy brand values
    c = c.replace(/rgba\(139,\s*92,\s*246/g, 'rgba(124, 58, 237');
    c = c.replace(/rgba\(212,\s*175,\s*55/g, 'rgba(245, 158, 11');
    c = c.replace(/rgba\(201,\s*168,\s*76/g, 'rgba(245, 158, 11');
    c = c.replace(/rgba\(236,\s*72,\s*153/g, 'rgba(245, 158, 11');
    c = c.replace(/rgba\(232,\s*64,\s*28/g, 'rgba(124, 58, 237');

    // gradients in scanner/event-detail
    c = c.replace(/#1a0540/gi, '#1a0540');
    c = c.replace(/#3d0f80/gi, '#3d0f80');
    c = c.replace(/#1a0540/gi, '#1a0540');

    // update theme-color meta tag
    c = c.replace(/<meta name="theme-color" content="[^"]+" \/>/g, '<meta name="theme-color" content="#7C3AED" />');

    if (c !== original) {
        fs.writeFileSync(f, c);
        replacedCount++;
        console.log('Updated: ' + path.basename(f));
    }
});

console.log('Total files updated:', replacedCount);
