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
            if (file.endsWith('.html')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = getFiles(__dirname);

files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if (!content.includes('src="/assets/js/db.js"')) {
        // Find </title> or <link rel="stylesheet"... to inject below
        if (content.includes('</title>')) {
            content = content.replace('</title>', '</title>\n    <script type="module" src="/assets/js/db.js"></script>');
        } else if (content.includes('</head>')) {
            content = content.replace('</head>', '  <script type="module" src="/assets/js/db.js"></script>\n</head>');
        }
        fs.writeFileSync(f, content);
        console.log('Injected DB into:', path.basename(f));
    }
});
