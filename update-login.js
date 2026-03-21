const fs = require('fs');

const loginHtml = fs.readFileSync('login.html', 'utf8');

const regex = /document\.getElementById\('login-form'\)\.addEventListener\('submit', async \(e\) => \{[\s\S]*?\}\);/g;
const match = regex.exec(loginHtml);

if (match) {
    const replacement = `document.getElementById('login-form').addEventListener('submit', async (e) => {\n            e.preventDefault();\n            if (window.Clerk) {\n                window.Clerk.openSignIn({ redirectUrl: '/account.html' });\n            }\n        });\n\n        document.getElementById('btn-oauth-google').addEventListener('click', () => {\n            if (window.Clerk) {\n                window.Clerk.openSignIn({ redirectUrl: '/account.html' });\n            }\n        });`;
    // We also need to get rid of the duplicate google listener at the bottom
    const newHtml = loginHtml.replace(match[0], replacement).replace(/document\.getElementById\('btn-oauth-google'\)\.addEventListener\('click', \(\) => \{\n\s*window\.TA\?\.toast\('Connecting to Google\.\.\.', 'info'\);\n\s*\}\);/g, '');
    fs.writeFileSync('login.html', newHtml);
    console.log("Updated login.html");
} else {
    console.log("Regex didn't match anything!");
}
