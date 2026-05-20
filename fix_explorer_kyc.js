const fs = require('fs');
const file = 'c:/Users/Sumeet/Desktop/chainfund/frontend/index.html';
let c = fs.readFileSync(file, 'utf8');

// ══════════════════════════════════════════════════════════════
// 1. FIX EXPLORER PAGE: Replace the skeleton with full HTML
//    that includes blocks-row, explorer-txns, tx-detail-section
// ══════════════════════════════════════════════════════════════
const oldExplorer = `<div class="card" id="explorer-result" style="display:none">
          <div id="explorer-result-content"></div>
        </div>
      </div>`;

const newExplorer = `<!-- Recent Blocks -->
        <div style="margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px">⛓ Recent Blocks</div>
          <div id="blocks-row" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">
            <div style="text-align:center;padding:30px;color:var(--text3);width:100%"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Recent Transactions -->
        <div class="card" style="margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:16px">📜 Recent Transactions</div>
          <div id="explorer-txns" style="display:flex;flex-direction:column;gap:8px">
            <div style="text-align:center;padding:30px;color:var(--text3)"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Transaction Detail (shown after search) -->
        <div id="tx-detail-section" style="display:none;margin-bottom:24px">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px">🔍 Transaction Details</div>
          <div class="card">
            <div id="tx-detail-content"></div>
          </div>
        </div>
      </div>`;

if (c.includes(oldExplorer)) {
  c = c.replace(oldExplorer, newExplorer);
  console.log('✅ Fixed explorer page HTML - added blocks-row, explorer-txns, tx-detail-section');
} else {
  console.log('⚠️  Explorer old HTML not found, trying alternative match...');
  // Try with different whitespace
  const alt = c.indexOf('id="explorer-result"');
  if (alt > -1) {
    // Find the closing of the explorer page div
    const explorerPageStart = c.lastIndexOf('id="page-explorer"', alt);
    const closingDiv = c.indexOf('</div>\n', alt);
    const closingDiv2 = c.indexOf('</div>\r\n', closingDiv + 6);
    const closingDiv3 = c.indexOf('</div>\r\n', closingDiv2 + 6);
    console.log('Found explorer-result at', alt, '- manual fix needed');
  }
}

// ══════════════════════════════════════════════════════════════
// 2. ADD KYC PAGE: Insert page-kyc HTML before the SETTINGS page
// ══════════════════════════════════════════════════════════════
if (!c.includes('id="page-kyc"')) {
  const kycPageHTML = `
      <!-- KYC VERIFICATION PAGE -->
      <div class="page" id="page-kyc">
        <div class="page-header">
          <div>
            <div class="page-title">KYC Verification</div>
            <div class="page-sub">Apply for campaign creator verification to start fundraising</div>
          </div>
        </div>

        <div id="kyc-status-banner" style="display:none;margin-bottom:20px"></div>

        <div id="dev-verify-wrap" style="display:none;margin-bottom:16px">
          <div class="card" style="padding:16px;border-color:rgba(108,99,255,.3)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--accent)">⚡ Dev Fast-Track</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">Instantly verify your account (development mode only)</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="devVerify()">Fast-Track →</button>
            </div>
          </div>
        </div>

        <div id="kyc-form-wrap">
          <div class="card" style="max-width:720px">
            <div class="rp-section-title" style="margin-bottom:20px">Submit Verification Application</div>
            <div style="background:rgba(108,99,255,.05);border-radius:10px;padding:14px;margin-bottom:20px;font-size:12px;color:var(--text2);line-height:1.6">
              <strong style="color:var(--accent)">Why KYC?</strong> — ChainFund requires all campaign organisers to complete identity verification. This ensures donor trust and platform integrity. Your information is encrypted and never shared publicly.
            </div>
            <div class="grid2">
              <div class="form-group">
                <label class="form-label">Full Legal Name</label>
                <input type="text" class="form-input" id="kyc-name" placeholder="As per government ID" />
              </div>
              <div class="form-group">
                <label class="form-label">Phone Number</label>
                <input type="tel" class="form-input" id="kyc-phone" placeholder="+91 98765 43210" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Organisation / NGO Name</label>
              <input type="text" class="form-input" id="kyc-org" placeholder="Your registered organisation name (if any)" />
            </div>
            <div class="form-group">
              <label class="form-label">Aadhaar / PAN Number</label>
              <input type="text" class="form-input" id="kyc-doc" placeholder="Enter your Aadhaar or PAN number" />
            </div>
            <div class="form-group">
              <label class="form-label">Purpose of Fundraising</label>
              <textarea class="form-input" id="kyc-purpose" rows="3" placeholder="Briefly describe why you want to create campaigns on ChainFund..."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Wallet Address</label>
              <input type="text" class="form-input" id="kyc-wallet" readonly style="opacity:0.7;cursor:not-allowed" placeholder="Connect wallet first" />
            </div>
            <button class="btn btn-primary" onclick="submitKYC()" id="kyc-submit-btn">📋 Submit KYC Application</button>
          </div>
        </div>
      </div>

`;

  // Insert before settings page
  c = c.replace('<!-- SETTINGS PAGE -->', kycPageHTML + '      <!-- SETTINGS PAGE -->');
  console.log('✅ Added KYC page HTML');
} else {
  console.log('ℹ️  KYC page already exists');
}

// ══════════════════════════════════════════════════════════════
// 3. ADD submitKYC function if missing
// ══════════════════════════════════════════════════════════════
if (!c.includes('function submitKYC')) {
  const submitKYCFunc = `
    async function submitKYC() {
      const name = document.getElementById('kyc-name')?.value.trim();
      const phone = document.getElementById('kyc-phone')?.value.trim();
      const org = document.getElementById('kyc-org')?.value.trim();
      const doc = document.getElementById('kyc-doc')?.value.trim();
      const purpose = document.getElementById('kyc-purpose')?.value.trim();
      if (!name) return toast('Please enter your full legal name', 'error');
      if (!doc) return toast('Please enter your Aadhaar or PAN number', 'error');
      if (!purpose) return toast('Please describe your fundraising purpose', 'error');
      const btn = document.getElementById('kyc-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner" style="display:inline-block;margin-right:8px"></div> Submitting...';
      try {
        const r = await apiFetch('/kyc/apply', {
          method: 'POST',
          body: JSON.stringify({ name, phone, organisation: org, documentNumber: doc, purpose, walletAddress })
        });
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Submission failed'); }
        toast('KYC application submitted successfully! We will review it shortly.', 'success');
        loadKYCStatus();
      } catch (err) {
        toast('KYC submission failed: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '\uD83D\uDCCB Submit KYC Application';
      }
    }

`;
  // Insert before loadKYCStatus
  c = c.replace('async function loadKYCStatus()', submitKYCFunc + '    async function loadKYCStatus()');
  console.log('✅ Added submitKYC function');
} else {
  console.log('ℹ️  submitKYC already exists');
}

// ══════════════════════════════════════════════════════════════
// 4. Ensure loadKYCStatus also populates the wallet field
// ══════════════════════════════════════════════════════════════
if (!c.includes('kyc-wallet')) {
  // Already have the input in the HTML, just need to populate it in loadKYCStatus
  c = c.replace(
    "async function loadKYCStatus() {\r\n      if (!token) return;",
    "async function loadKYCStatus() {\r\n      if (!token) return;\r\n      const kycWalletEl = document.getElementById('kyc-wallet'); if (kycWalletEl) kycWalletEl.value = walletAddress || '';"
  );
  console.log('✅ Added wallet field population in loadKYCStatus');
}

fs.writeFileSync(file, c, 'utf8');
console.log('\n🎉 All fixes applied!');
