const fs = require('fs');
const path = 'frontend/index.html';

let content = fs.readFileSync(path, 'utf8');

// 1. Remove the misplaced tab-panel from the Home Page area
const misplacedTabStart = content.indexOf('<div class="tab-panel" id="dt-my">');
const campaignsPageMarker = content.indexOf('<!-- CAMPAIGNS PAGE -->');

if (misplacedTabStart !== -1 && campaignsPageMarker !== -1 && misplacedTabStart < campaignsPageMarker) {
    const campaignsPart = content.slice(misplacedTabStart, campaignsPageMarker);
    const endTabIdx = campaignsPart.lastIndexOf('</div>'); // End of the tab-panel block
    if (endTabIdx !== -1) {
        const fullMisplacedBlock = campaignsPart.slice(0, endTabIdx + 6);
        content = content.replace(fullMisplacedBlock, '');
        console.log('Removed misplaced Dashboard tab from Home page.');
    }
}

// 2. Locate the correct Dashboard location
// It should be inside the page-dashboard, right after dt-tracker ends.
const trackerEndStr = '<div id="tracker-alloc">';
const dashboardEndStr = '<!-- MY ACTIVITY PAGE -->';

const trackerIdx = content.indexOf(trackerEndStr);
const dashboardEndIdx = content.indexOf(dashboardEndStr);

if (trackerIdx !== -1 && dashboardEndIdx !== -1) {
    const dashboardSub = content.slice(trackerIdx, dashboardEndIdx);
    const lastClosingDiv = dashboardSub.lastIndexOf('</div>');
    
    if (lastClosingDiv !== -1) {
        const insertPos = trackerIdx + lastClosingDiv + 6;
        
        const cleanTab = `
        <div class="tab-panel" id="dt-my">
          <div id="my-campaigns-content">
            <div style="text-align:center;padding:40px">
              <div style="font-size:2rem;margin-bottom:10px">🔍</div>
              <div style="font-size:13px;color:var(--text2);margin-bottom:14px">Connect wallet or sign in to see your campaigns</div>
              <button class="btn btn-primary btn-sm" onclick="openAuthModal()">Sign In</button>
            </div>
          </div>
        </div>`;
        
        content = content.slice(0, insertPos) + '\n        ' + cleanTab + '\n      ' + content.slice(insertPos);
        console.log('Restored Dashboard tab to correct location.');
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log('Structural Synchronization Complete.');
