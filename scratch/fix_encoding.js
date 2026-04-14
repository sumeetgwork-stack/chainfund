const fs = require('fs');
const path = 'frontend/index.html';

// Comprehensive corruption mappings
const maps = [
    { from: /ðŸ /g, to: '🏠' },
    { from: /ðŸ“‹/g, to: '📋' },
    { from: /ðŸ“Š/g, to: '📊' },
    { from: /ðŸš¶/g, to: '🚶' },
    { from: /ðŸ” /g, to: '🔍' },
    { from: /âš™ï¸ /g, to: '⚙️' },
    { from: /ðŸ“ /g, to: '📄' },
    { from: /ðŸš€/g, to: '🚀' },
    { from: /âœ…/g, to: '✅' },
    { from: /ðŸ›¡ï¸ /g, to: '🛡️' },
    { from: /ðŸ’Š/g, to: '💊' },
    { from: /ðŸ“š/g, to: '📚' },
    { from: /ðŸŒ±/g, to: '🌱' },
    { from: /ðŸ ±/g, to: '🍱' },
    { from: /ðŸ’°/g, to: '💰' },
    { from: /â‚¹/g, to: '₹' },
    { from: /ðŸ“ˆ/g, to: '📈' },
    { from: /â€”/g, to: '—' },
    { from: /ðŸŒ /g, to: '🌐' },
    { from: /â†’/g, to: '→' },
    { from: /â†©ï¸ /g, to: '↩️' },
    { from: /ðŸ””/g, to: '🔔' },
    { from: /ðŸŒ™/g, to: '🌙' },
    { from: /ðŸ‘¥/g, to: '👥' },
    { from: /â›“/g, to: '⛓️' },
    { from: /ðŸ¤–/g, to: '🤖' },
    { from: /ðŸ”‘/g, to: '🔑' },
    { from: /ðŸŸ¢/g, to: '🟢' },
    { from: /âš«/g, to: '⚫' },
    { from: /ðŸ“­/g, to: '📥' },
    { from: /ðŸ”„/g, to: '🔄' },
    { from: /ðŸ› ï¸ /g, to: '🛠️' },
    { from: /ðŸ”’/g, to: '🔒' },
    { from: /ðŸŽ‰/g, to: '🎉' },
    { from: /ðŸ“¢/g, to: '📢' },
    { from: /ðŸŽ /g, to: '🎁' },
    { from: /â Œ/g, to: '❌' },
    { from: /â€¢/g, to: '•' },
    { from: /ðŸ —ï¸ /g, to: '🏗️' },
    { from: /ðŸ“Œ/g, to: '📌' },
    { from: /â†—/g, to: '↗' },
    { from: /ðŸ’§/g, to: '💧' },
    { from: /âœ—/g, to: '✖' },
    { from: /ðŸ“¤/g, to: '📤' },
    { from: /ðŸ“„/g, to: '📄' },
    { from: /ðŸŽ¯/g, to: '🎯' },
    { from: /â ±/g, to: '⌛' },
    { from: /ðŸ“§/g, to: '📧' },
    { from: /â ³/g, to: '⏳' },
    { from: /ðŸ‘¤/g, to: '👤' },
    { from: /â˜€ï¸ /g, to: '☀️' },
    { from: /ðŸ¦Š/g, to: '🦊' }
];

let content = fs.readFileSync(path, 'utf8');

maps.forEach(m => {
    content = content.replace(m.from, m.to);
});

fs.writeFileSync(path, content, 'utf8');
console.log('Cleanup complete.');
