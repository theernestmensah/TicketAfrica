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

    // Exact hex code replacements (case insensitive)
    c = c.replace(/#8B5CF6/gi, '#8B5CF6'); // primary
    c = c.replace(/#7C3AED/gi, '#7C3AED'); // primary dark
    c = c.replace(/#A78BFA/gi, '#A78BFA'); // primary light
    c = c.replace(/#EC4899/gi, '#EC4899'); // accent

    // Also catch some inline grays if they are specific to the old theme
    c = c.replace(/rgba\(232,\s*64,\s*28/g, 'rgba(139, 92, 246');
    c = c.replace(/rgba\(245,\s*166,\s*35/g, 'rgba(236, 72, 153');

    // gradients in scanner/event-detail
    c = c.replace(/#1a0540/gi, '#1a0540');
    c = c.replace(/#3d0f80/gi, '#3d0f80');
    c = c.replace(/#1a0540/gi, '#1a0540');

    // update theme-color meta tag
    c = c.replace(/<meta name="theme-color" content="[^"]+" \/>/g, '<meta name="theme-color" content="#07070f" />');

    if (c !== original) {
        fs.writeFileSync(f, c);
        replacedCount++;
        console.log('Updated: ' + path.basename(f));
    }
});

console.log('Total files updated:', replacedCount);
