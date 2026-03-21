const fs = require('fs');

const signupHtml = fs.readFileSync('signup.html', 'utf8');

const regex = /\/\/ Form Sub[\s\S]*?\}\);\s*<\/script>/g;
const match = regex.exec(signupHtml);

if (match) {
    const replacement = `// Form Sub\n        document.getElementById('signup-form').addEventListener('submit', async (e) => {\n            e.preventDefault();\n            if (window.Clerk) {\n               window.Clerk.openSignUp({ redirectUrl: '/account.html' });\n            }\n        });\n\n        // Social Sub\n        const oauthGoogleBtn = document.getElementById('btn-oauth-google');\n        if (oauthGoogleBtn) {\n            oauthGoogleBtn.addEventListener('click', () => {\n                if (window.Clerk) {\n                     window.Clerk.openSignUp({ redirectUrl: '/account.html' });\n                }\n            });\n        }\n    </script>`;
    const newSignupHtml = signupHtml.replace(match[0], replacement);
    fs.writeFileSync('signup.html', newSignupHtml);
    console.log("Updated signup.html");
} else {
    console.log("Regex didn't match anything!");
}
