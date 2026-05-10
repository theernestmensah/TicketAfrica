const fs = require('fs');

const eventsHtml = fs.readFileSync('events.html', 'utf8');

const regex = /<div class="events-grid--discovery" id="events-grid">([\s\S]*?)<\/\s*div>\s*<\/div>\s*<!-- Pagination -->/g;

const match = regex.exec(eventsHtml);
if (match) {
    const replacement = `<div class="events-grid--discovery" id="events-grid">\n                    <!-- Events will be injected here by Convex Hook -->\n                </div>\n            </div>\n\n            <!-- Pagination -->`;
    const newEventsHtml = eventsHtml.replace(match[0], replacement);
    fs.writeFileSync('events.html', newEventsHtml);
    console.log("Emptying events grid in events.html successful!");
} else {
    console.log("Regex didn't match anything!");
}
