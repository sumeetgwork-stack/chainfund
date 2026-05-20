const fs = require('fs');
const file = 'c:/Users/Sumeet/Desktop/chainfund/frontend/index.html';
let c = fs.readFileSync(file, 'utf8');

// Find and remove the SECOND occurrence of page-my-activity
// The first one is the real one, the second was inserted by the bad edit
const first = c.indexOf('id="page-my-activity"');
const second = c.indexOf('id="page-my-activity"', first + 1);
if (second > -1) {
  // Find the start of this div (go back to find <div class="page")
  let start = c.lastIndexOf('<div class="page"', second);
  // Also look for the comment before it
  const commentBefore = c.lastIndexOf('<!-- MY ACTIVITY PAGE -->', second);
  if (commentBefore > start - 50) start = commentBefore;
  
  // Find the end - look for the closing </div> that closes this page
  // Count div nesting
  let pos = second;
  let depth = 0;
  let foundStart = false;
  for (let i = pos; i < c.length; i++) {
    if (c.substring(i, i + 4) === '<div') { depth++; if (!foundStart) foundStart = true; }
    if (c.substring(i, i + 6) === '</div>') {
      depth--;
      if (foundStart && depth <= 0) {
        const end = i + 6;
        // Also eat the newline after
        let endFinal = end;
        while (c[endFinal] === '\r' || c[endFinal] === '\n') endFinal++;
        console.log('Removing duplicate page-my-activity from char', start, 'to', endFinal);
        console.log('Context before:', JSON.stringify(c.substring(Math.max(0, start - 30), start)));
        c = c.substring(0, start) + c.substring(endFinal);
        break;
      }
    }
  }
  console.log('✅ Removed duplicate page-my-activity');
} else {
  console.log('ℹ️  No duplicate page-my-activity');
}

// Verify
const check1 = (c.match(/id="page-my-activity"/g) || []).length;
const check2 = (c.match(/id="page-explorer"/g) || []).length;
console.log('page-my-activity occurrences:', check1);
console.log('page-explorer occurrences:', check2);

// Check explorer has blocks-row
console.log('blocks-row exists:', c.includes('id="blocks-row"'));
console.log('explorer-txns exists:', c.includes('id="explorer-txns"'));
console.log('tx-detail-section exists:', c.includes('id="tx-detail-section"'));
console.log('page-kyc exists:', c.includes('id="page-kyc"'));

fs.writeFileSync(file, c, 'utf8');
console.log('\n🎉 Done');
