const fs = require('fs');
const path = 'frontend/index.html';

const sidebarHtml = `    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-section-label">Main</div>
        <div class="nav-item active" id="nav-home" onclick="showPage('home')">
          <div class="nav-icon">🏠</div> Home
        </div>
        <div class="nav-item" id="nav-campaigns" onclick="showPage('campaigns')">
          <div class="nav-icon">📋</div> Campaigns<span class="nav-badge green" id="active-count">—</span>
        </div>
        <div class="nav-item" id="nav-dashboard" onclick="showPage('dashboard')">
          <div class="nav-icon">📊</div> Dashboard
        </div>
        <div class="nav-item" id="nav-my-activity" onclick="showPage('my-activity');loadUserActivity()">
          <div class="nav-icon">🚶</div> My Activity
        </div>
        <div class="nav-item" id="nav-explorer" onclick="showPage('explorer')">
          <div class="nav-icon">🔍</div> Explorer
        </div>
        <div class="nav-item" id="nav-settings" onclick="showPage('settings')">
          <div class="nav-icon">⚙️</div> Settings
        </div>
      </div>

      <div class="sidebar-divider"></div>
      <div class="sidebar-section" id="section-organiser" style="display:none">
        <div class="sidebar-section-label">Organiser</div>
        <div class="nav-item" id="nav-proposals" onclick="showPage('proposals')">
          <div class="nav-icon">📄</div> My Proposals
        </div>
        <div class="nav-item" id="nav-create" onclick="showPage('create')">
          <div class="nav-icon">🚀</div> Submit Proposal
        </div>
        <div class="nav-item" id="nav-kyc" onclick="showPage('kyc')">
          <div class="nav-icon">✅</div> KYC Verification
        </div>
      </div>
      <div class="sidebar-section" id="section-trustee" style="display:none">
        <div class="sidebar-section-label">Trustee</div>
        <div class="nav-item" id="nav-trustee" onclick="showPage('trustee')">
          <div class="nav-icon">🛡️</div> Validation Workspace
        </div>
      </div>
      <div class="sidebar-divider" id="divider-admin" style="display:none"></div>
      <div class="sidebar-section" id="section-admin" style="display:none">
        <div class="sidebar-section-label">Admin</div>
        <div class="nav-item" id="nav-admin" onclick="showPage('admin')">
          <div class="nav-icon">⚙️</div> Admin Panel<span class="nav-badge" id="admin-pending-badge"
            style="display:none">0</span>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-label">Categories</div>
        <div class="nav-item"
          onclick="document.getElementById('cat-filter').value='Healthcare';showPage('campaigns');loadCampaigns()">
          <div class="nav-icon">💊</div> Healthcare
        </div>
        <div class="nav-item"
          onclick="document.getElementById('cat-filter').value='Education';showPage('campaigns');loadCampaigns()">
          <div class="nav-icon">📚</div> Education
        </div>
        <div class="nav-item"
          onclick="document.getElementById('cat-filter').value='Environment';showPage('campaigns');loadCampaigns()">
          <div class="nav-icon">🌱</div> Environment
        </div>
        <div class="nav-item"
          onclick="document.getElementById('cat-filter').value='Relief';showPage('campaigns');loadCampaigns()">
          <div class="nav-icon">🍱</div> Relief
        </div>
      </div>`;

const metricCardsHtml = `          <div class="grid4" style="margin-bottom:24px">
            <div class="metric-card mc-1 tilt-fx">
              <div class="mc-glow"></div>
              <div class="mc-icon" style="background:rgba(108,99,255,.2)">💰</div>
              <div class="mc-label">Total Raised</div>
              <div class="mc-val" id="stat-raised">₹0</div>
              <div class="mc-sub" style="color:var(--accent)">All campaigns</div>
            </div>
            <div class="metric-card mc-2 tilt-fx">
              <div class="mc-glow"></div>
              <div class="mc-icon" style="background:rgba(0,229,160,.15)">📋</div>
              <div class="mc-label">Campaigns</div>
              <div class="mc-val" id="stat-campaigns">0</div>
              <div class="mc-sub" style="color:var(--green)" id="stat-active-sub">Active now</div>
            </div>
            <div class="metric-card mc-3 tilt-fx">
              <div class="mc-glow"></div>
              <div class="mc-icon" style="background:rgba(255,110,176,.15)">👥</div>
              <div class="mc-label">Donors</div>
              <div class="mc-val" id="stat-donors">0</div>
              <div class="mc-sub" style="color:var(--pink)">Unique wallets</div>
            </div>
            <div class="metric-card mc-4 tilt-fx">
              <div class="mc-glow"></div>
              <div class="mc-icon" style="background:rgba(255,200,87,.15)">📈</div>
              <div class="mc-label">Fund Utilisation</div>
              <div class="mc-val" id="stat-util">0%</div>
              <div class="mc-sub" style="color:var(--yellow)">Disbursed</div>
            </div>
          </div>`;

const processStepsHtml = `          <div class="steps-row">
            <div class="step-card tilt-fx">
              <div class="step-num">01</div>
              <h4>Create Campaign</h4>
              <p>Deploy a smart contract with goal, timeline, milestones, and multi-sig trustees</p>
            </div>
            <div class="step-card tilt-fx">
              <div class="step-num">02</div>
              <h4>Receive Donations</h4>
              <p>Funds flow directly into the contract — transparent, no custodian, every tx recorded</p>
            </div>
            <div class="step-card tilt-fx">
              <div class="step-num">03</div>
              <h4>Auto-Disbursement</h4>
              <p>Trustees approve milestones, contract releases funds automatically</p>
            </div>
            <div class="step-card tilt-fx">
              <div class="step-num">04</div>
              <h4>Full Audit Trail</h4>
              <p>Every rupee traceable forever on Ethereum — any donor can verify any tx</p>
            </div>
          </div>`;

const featureCardsHtml = `          <div class="grid3">
            <div class="feat-card tilt-fx"><span class="feat-icon">⛓️</span>
              <h3>Immutable Audit Trail</h3>
              <p>Every transaction permanently recorded. No one can alter or delete a record.</p>
            </div>
            <div class="feat-card tilt-fx"><span class="feat-icon">🤖</span>
              <h3>Smart Contract Escrow</h3>
              <p>Funds held by code. Disbursement only when verifiable milestones are met.</p>
            </div>
            <div class="feat-card tilt-fx"><span class="feat-icon">✅</span>
              <h3>KYC Verified Recipients</h3>
              <p>All recipients identity-verified on-chain. Every disbursement tagged to a verified wallet.</p>
            </div>
            <div class="feat-card tilt-fx"><span class="feat-icon">📊</span>
              <h3>Real-time Dashboards</h3>
              <p>Campaign managers and donors share the same live view from public blockchain nodes.</p>
            </div>
            <div class="feat-card tilt-fx"><span class="feat-icon">🔑</span>
              <h3>Multi-Sig Security</h3>
              <p>Large disbursements need M-of-N trustee approval. No single actor can drain funds.</p>
            </div>
            <div class="feat-card tilt-fx"><span class="feat-icon">↩️</span>
              <h3>Automatic Refunds</h3>
              <p>Miss goal? Smart contract auto-refunds every donor. No forms, no delays.</p>
            </div>
          </div>`;

let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// 1. Restore Sidebar
let sidebarStart = lines.findIndex(l => l.includes('<div class="sidebar">'));
if (sidebarStart !== -1) {
    let sidebarEnd = lines.findIndex((l, i) => i > sidebarStart && l.includes('Categories</div>'));
    if (sidebarEnd !== -1) {
        // Find the END of categories section (there are two for some reason in the corruption)
        let finalEnd = lines.findIndex((l, i) => i > sidebarEnd + 10 && l.includes('</div>'));
        // Better: replace up to sidebar-bottom
        let bottomStart = lines.findIndex(l => l.includes('<div class="sidebar-bottom">'));
        if (bottomStart !== -1) {
            lines.splice(sidebarStart, bottomStart - sidebarStart, sidebarHtml);
        }
    }
}

// Re-read joined content as lines shift
content = lines.join('\n');
const lines2 = content.split('\n');

// 2. Restore Topbar items
const topbarLogoIdx = lines2.findIndex(l => l.includes('<div class="topbar-logo"'));
if (topbarLogoIdx !== -1) {
    lines2[topbarLogoIdx + 1] = '      <div class="logo-gem">⛓️</div>';
}

const signupBtnIdx = lines2.findIndex(l => l.includes('class="topbar-btn btn-signup"'));
if (signupBtnIdx !== -1) {
    lines2[signupBtnIdx + 1] = '          Up →</button>';
}

// 3. Restore Metric Cards
const metricStart = lines2.findIndex(l => l.includes('<div class="grid4"'));
if (metricStart !== -1) {
    const metricEnd = lines2.findIndex((l, i) => i > metricStart && l.includes('stat-util'));
    // Find closing div for grid4
    let closeIdx = -1;
    for (let i = metricStart; i < metricStart + 100; i++) {
        if (lines2[i].includes('</div>') && lines2[i-1].includes('Disbursed')) {
            closeIdx = i + 1;
            break;
        }
    }
    if (closeIdx !== -1) lines2.splice(metricStart, closeIdx - metricStart, metricCardsHtml);
}

// 4. Restore Steps
const stepsStart = lines2.findIndex(l => l.includes('<div class="steps-row">'));
if (stepsStart !== -1) {
    let closeIdx = -1;
    for (let i = stepsStart; i < stepsStart + 100; i++) {
        if (lines2[i].includes('</div>') && lines2[i-1].includes('verify any tx')) {
            closeIdx = i + 1;
            break;
        }
    }
    if (closeIdx !== -1) lines2.splice(stepsStart, closeIdx - stepsStart, processStepsHtml);
}

// 5. Restore Features
const featStart = lines2.findIndex(l => l.includes('<div class="grid3">'));
if (featStart !== -1) {
    let closeIdx = -1;
    for (let i = featStart; i < featStart + 100; i++) {
        if (lines2[i].includes('</div>') && lines2[i-1].includes('no delays.')) {
            closeIdx = i + 1;
            break;
        }
    }
    if (closeIdx !== -1) lines2.splice(featStart, closeIdx - featStart, featureCardsHtml);
}

fs.writeFileSync(path, lines2.join('\n'), 'utf8');
console.log('Line-anchor restoration complete.');
