const fs = require('fs');
const path = 'frontend/index.html';

// The CLEAN body content for ChainFund index.html
const cleanBody = `
  <div class="topbar">
    <div class="topbar-logo" onclick="showPage('home')">
      <div class="logo-gem">⛓️</div>
      ChainFund
    </div>
    <div class="topbar-search">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="Search campaigns, transactions..." id="global-search"
        onkeydown="if(event.key==='Enter'){showPage('explorer');document.getElementById('explorer-input').value=this.value;explorerSearch()}" />
    </div>
    <div class="topbar-right">
      <div id="sync-pill"
        style="display:none;align-items:center;gap:6px;background:rgba(0,229,160,.1);border:1px solid rgba(0,229,160,.2);border-radius:999px;padding:5px 12px;font-size:11px;color:var(--green);font-weight:600;margin-right:8px"
        title="Indexer catching up with blockchain">
        <span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>
        <span id="sync-text">Syncing...</span>
      </div>
      <div class="notif-btn" id="notif-btn" onclick="showPage('dashboard')">🔔<span class="notif-dot" id="notif-dot"
          style="display:none"></span></div>
      <div class="notif-btn" id="theme-btn" onclick="toggleTheme()" title="Toggle theme" style="font-size:16px">🌙</div>
      <div id="topbar-user-area" style="display:flex;align-items:center;gap:8px">
        <button class="topbar-btn btn-signin" id="auth-btn" onclick="openAuthModal()">Sign In</button>
        <button class="topbar-btn btn-signup" id="signup-btn" onclick="switchAuthTab('register');openAuthModal()">Sign
          Up →</button>
      </div>
      <div id="topbar-loggedin" style="display:none;align-items:center;gap:8px">
        <div class="topbar-user" onclick="showPage('dashboard')">
          <div class="user-avatar" id="user-initials">?</div>
          <span class="user-name" id="user-name-display"></span>
        </div>
        <button class="topbar-btn btn-signin" id="logout-btn" onclick="logout()">Sign Out</button>
      </div>
      <button id="wallet-btn" style="display:none" onclick="connectWallet()"></button>
    </div>
  </div>

  <div class="app-layout">
    <div class="sidebar">
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
      <div class="sidebar-divider"></div>
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
      </div>
      <div class="sidebar-bottom">
        <div id="sidebar-wallet-mini" style="display:none" class="sidebar-wallet-mini" onclick="showRightWallet()">
          <div class="swm-label">Connected Wallet</div>
          <div class="swm-addr" id="swm-addr">—</div>
          <div class="swm-bal" id="swm-bal">0.000 <span style="font-size:12px;color:var(--text3)">ETH</span></div>
        </div>
        <div id="sidebar-connect-btn" style="width:100%">
          <button
            style="width:100%;padding:11px;border-radius:12px;background:var(--accent-dim);border:1px solid rgba(108,99,255,.3);color:var(--accent);font-family:var(--sans);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s"
            onclick="connectWallet()">🦊 Connect Wallet</button>
        </div>
      </div>
    </div>

    <div class="main">
      <div class="page active" id="page-home">
        <div style="padding:0 0 20px">
          <div id="hero-plx"
            style="background:linear-gradient(135deg,#0a0518 0%,#0d1a40 40%,#051515 100%);border-radius:24px;padding:64px 48px;position:relative;overflow:hidden;margin-bottom:32px;perspective:1000px;transform-style:preserve-3d;box-shadow:0 24px 60px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.05)">
            <div id="hero-glow" style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(circle 800px at 50% 50%, rgba(108,99,255,0.2), transparent 60%);z-index:0;pointer-events:none"></div>
            
            <div class="plx-layer" data-speed="0.3" data-mouse="-8"
              style="position:absolute;top:-80px;right:-50px;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(108,99,255,.3),transparent 70%);will-change:transform">
            </div>
            
            <div class="plx-layer" data-speed="0.2" data-mouse="5"
              style="position:absolute;bottom:-60px;left:150px;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,160,.2),transparent 70%);will-change:transform">
            </div>

            <div class="plx-layer" data-speed="0.4" data-mouse="-12" style="position:absolute;top:20%;left:10%;width:8px;height:8px;border-radius:50%;background:#00e5a0;box-shadow:0 0 12px #00e5a0;will-change:transform"></div>
            <div class="plx-layer" data-speed="0.1" data-mouse="15" style="position:absolute;top:70%;right:15%;width:12px;height:12px;border-radius:50%;background:#ff6eb0;box-shadow:0 0 16px #ff6eb0;will-change:transform"></div>

            <div class="plx-layer" id="hero-content" data-speed="-0.1" data-mouse="2" style="position:relative;z-index:1;max-width:650px;will-change:transform;transform-style:preserve-3d">
              <div style="display:inline-block;padding:6px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;font-size:11px;color:var(--cyan);font-weight:700;letter-spacing:1px;margin-bottom:20px;backdrop-filter:blur(10px)">🌐 WEB3 FUNDRAISING SAAS</div>
              <h1
                style="font-family:var(--display);font-size:clamp(3.5rem,7vw,5.5rem);font-weight:900;color:#fff;line-height:0.95;margin-bottom:28px;letter-spacing:-0.03em;text-shadow:0 12px 30px rgba(0,0,0,0.5)">
                <b>CHAINFUND</b></h1>
              <p style="font-size:16px;color:rgba(255,255,255,.7);line-height:1.7;max-width:480px;margin-bottom:36px;text-shadow:0 2px 8px rgba(0,0,0,0.4)">
                India's first blockchain fundraising SaaS. Donors verify, in real time, exactly where every rupee went.
                Smart contracts. Zero middlemen.</p>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <button class="btn btn-primary" onclick="showPage('campaigns')"
                  style="padding:16px 32px;font-size:15px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 8px 24px rgba(108,99,255,0.5);transition:all 0.3s">Browse Campaigns →</button>
              </div>
            </div>
          </div>
          <div class="grid4" style="margin-bottom:24px">
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
          </div>
          <div class="card" style="margin-bottom:24px">
            <div
              style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:8px">
              Process</div>
            <div style="font-family:var(--display);font-size:1.2rem;font-weight:800;color:#fff;margin-bottom:4px">How
              ChainFund Works</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:0">Fully automated — no middlemen, every rupee
              tracked on-chain.</div>
          </div>
`;

let content = fs.readFileSync(path, 'utf8');
const bodyStart = content.indexOf('<body>');
const bodyEnd = content.indexOf('<div class="steps-row">');

if (bodyStart !== -1 && bodyEnd !== -1) {
    const newContent = content.slice(0, bodyStart + 6) + cleanBody + content.slice(bodyEnd);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Emergency Body Restoration Complete.');
} else {
    console.log('Error: Could not find body anchors.');
}
