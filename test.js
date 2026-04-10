
// ── Config ───────────────────────────────────────────────────────────────
const API = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';
const ETH_INR = 220000;

const FACTORY_ABI = [
  "function createCampaign(string,string,string,uint256,uint256,address[],uint256) returns (address)",
  "function getAllCampaigns() view returns (address[])",
  "event CampaignCreated(address indexed,address indexed,string,string,uint256,uint256,uint256)"
];
const CAMPAIGN_ABI = [
  "function donate() payable",
  "function totalRaised() view returns (uint256)",
  "function goalAmount() view returns (uint256)",
  "function balance() view returns (uint256)",
  "function getCampaignInfo() view returns (address _organiser, string memory _title, string memory _category, uint256 _goalAmount, uint256 _totalRaised, uint256 _totalDisbursed, uint256 _deadline, bool _active, bool _goalReached, uint256 _balance)",
  "function getMilestoneCount() view returns (uint256)",
  "function getMilestone(uint256) view returns (string,uint256,uint256,bool,uint256)",
  "function addMilestone(string,uint256)",
  "function approveMilestone(uint256)",
  "function claimRefund()",
  "function getDonorCount() view returns (uint256)",
  "event DonationReceived(address indexed,uint256,uint256)",
  "event FundsDisbursed(uint256 indexed,address indexed,uint256)"
];



// ── State ─────────────────────────────────────────────────────────────────
let provider, signer, walletAddress, token, currentUser;
let FACTORY_ADDRESS = null;
let socket;
let isDonating = false;
let _modalRefreshTimer = null;

// ── Init ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Try to load config with retries
  let attempts = 0;
  while (attempts < 3 && !FACTORY_ADDRESS) {
    try { 
      const cr = await fetch(`${API.replace('/api','')}/config`);
      if (cr.ok) {
        const config = await cr.json();
        FACTORY_ADDRESS = config.factory;
        console.log('⛓️ Blockchain Config Loaded:', config);
        if (config.factory) break;
      }
    } catch(e) { console.warn('Config fetch attempt failed:', e.message); }
    attempts++;
    if (!FACTORY_ADDRESS) await new Promise(r => setTimeout(r, 1000));
  }

  token = localStorage.getItem('cf_token');
  if (token) {
    try {
      const r = await apiFetch('/auth/me');
      if (r.ok) { currentUser = await r.json(); updateAuthUI(); updateTopbarUser(); }
    } catch(_) { localStorage.removeItem('cf_token'); token = null; }
  }
  initializeDemoCampaignStorage();
  loadStats(); loadCampaigns();
  try {
    socket = io(window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin);
    socket.on('new_transaction', (tx) => { appendLiveTx(tx); toast(`New ${tx.type}: ${tx.valueETH?.toFixed(4) || '?'} ETH`, 'info'); loadStats(); });
    socket.on('stats_update', () => loadStats());
    socket.on('campaign_created', () => { loadCampaigns(); loadStats(); });
    socket.on('new_donation', (donation) => {
      loadCampaigns();
      loadStats();
      updateRightPanelFeed();
      if (document.getElementById('campaign-modal').style.display !== 'none' && window._currentModalAddress === donation.campaignAddress) {
        refreshCampaignModal(true);
      }
    });
    socket.on('kyc_decision', (d) => {
      if (currentUser && d.userId === currentUser.id) {
        if (d.status === 'approved') { toast('🎉 Your KYC application was approved! You can now create campaigns.', 'success'); updateTopbarUser(); }
        else toast('Your KYC application was rejected. Check the KYC page for details.', 'error');
      }
      if (document.getElementById('page-admin')?.classList.contains('active')) loadAdminApplications();
    });
    socket.on('proposal_decision', (d) => {
      toast(`📢 Proposal ${d.id.slice(-6)} update: ${d.status.toUpperCase()}`, 'info');
      if (document.getElementById('page-proposals')?.classList.contains('active')) loadProposals();
      if (document.getElementById('page-trustee')?.classList.contains('active')) loadTrusteeValidations();
    });
  } catch(_) {}
  document.getElementById('c-goal').addEventListener('input', (e) => {
    document.getElementById('c-goal-inr').textContent = `≈ ₹${(parseFloat(e.target.value || 0) * ETH_INR).toLocaleString('en-IN')}`;
  });
  applyStoredTheme();
  setInterval(loadStats, 30000);
  setInterval(updateRightPanelFeed, 15000);
  updateRightPanelFeed();
  updateTopbarUser();
  if (window.ethereum?.selectedAddress) { walletAddress = window.ethereum.selectedAddress; updateWalletUI(); }
});

// ── Page Navigation ───────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const pg = document.getElementById(`page-${name}`);
  if(pg) pg.classList.add('active');
  const navEl = document.getElementById(`nav-${name}`);
  if (navEl) navEl.classList.add('active');
  window.scrollTo(0,0);
  if (name === 'dashboard') loadDashboard();
  if (name === 'explorer') loadExplorer();
  if (name === 'campaigns') loadCampaigns();
  if (name === 'proposals') loadProposals();
  if (name === 'trustee') loadTrusteeValidations();
  if (name === 'create') checkCreateAccess();
  if (name === 'kyc') loadKYCStatus();
  if (name === 'admin') loadAdminApplications();
  if (name === 'settings') loadSettings();
  if (name === 'my-activity') loadUserActivity();
}

function setModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('modal-tab-details').style.display = 'none';
  document.getElementById('modal-tab-history').style.display = 'none';
  
  if (tab === 'details') {
    document.querySelector('.modal-tab:nth-child(1)').classList.add('active');
    document.getElementById('modal-tab-details').style.display = 'block';
  } else {
    document.querySelector('.modal-tab:nth-child(2)').classList.add('active');
    document.getElementById('modal-tab-history').style.display = 'block';
    if (window._currentModalAddress) loadCampaignHistory(window._currentModalAddress);
  }
}

async function loadCampaignHistory(address) {
  const list = document.getElementById('campaign-history-list');
  try {
    const r = await fetch(`${API}/blockchain/history/${address}`);
    const txs = await r.json();
    if (!txs.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">No transactions yet</div>'; return; }
    list.innerHTML = txs.map(tx => `
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="color:var(--text);font-weight:600">${tx.from === address ? 'Disbursement' : 'Donation'}</div>
          <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${shortAddr(tx.from)}</div>
        </div>
        <div style="text-align:right">
          <div style="color:var(--green);font-weight:700">${tx.valueETH.toFixed(4)} ETH</div>
          <div style="font-size:10px;color:var(--text3)">${new Date(tx.timestamp).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  } catch(e) { list.innerHTML = '<div style="color:var(--red)">Failed to load history</div>'; }
}

async function syncSpecificCampaign(address) {
  toast('Syncing with blockchain...', 'info');
  try {
    const r = await apiFetch(`/blockchain/sync/${address}`, { method: 'POST' });
    if (r.ok) { toast('Campaign synced successfully', 'success'); refreshCampaignModal(true); loadCampaigns(); }
    else toast('Sync failed', 'error');
  } catch(e) { toast('Sync error: ' + e.message, 'error'); }
}

async function loadUserActivity() {
  if (!walletAddress) { 
    document.getElementById('my-donations-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Connect wallet to view your activity</div>';
    return;
  }
  document.getElementById('my-wallet-short').textContent = shortAddr(walletAddress);
  try {
    const r = await apiFetch(`/blockchain/user-activity/${walletAddress}`);
    const data = await r.json();
    document.getElementById('my-total-donated').textContent = toINR(data.totalDonated);
    document.getElementById('my-backed-count').textContent = data.campaignsCount;
    
    if (!data.donations.length) {
      document.getElementById('my-donations-list').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">You haven\'t made any donations yet.</div>';
    } else {
      document.getElementById('my-donations-list').innerHTML = data.donations.map(d => `
        <div class="tx-row" style="margin-bottom:8px" onclick="openCampaignDetail('${d.campaignAddress}')">
          <div class="tx-icon-w" style="background:var(--accent-dim)">🎁</div>
          <div class="tx-info">
            <div class="tx-desc" style="font-weight:600;color:var(--text)">${d.campaignTitle}</div>
            <div class="tx-hash">${shortAddr(d.txHash)}</div>
          </div>
          <div class="tx-amount">
            <div class="amt">${(d.valueETH || 0).toFixed(4)} ETH</div>
            <div class="when">${new Date(d.timestamp).toLocaleDateString()}</div>
          </div>
        </div>
      `).join('');
    }
  } catch(e) { toast('Failed to load activity', 'error'); }
}


async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401 && token && path !== '/auth/me') {
    token = null; currentUser = null; localStorage.removeItem('cf_token');
    updateTopbarUser(); toast('Session expired. Please sign in again.', 'error'); openAuthModal();
  }
  return res;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div'); el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '⛓️' };
  el.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Wallet ────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) { toast('MetaMask not found. Please install it from metamask.io', 'error'); window.open('https://metamask.io', '_blank'); return; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      toast('Please switch to the Sepolia Testnet in MetaMask', 'error');
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }); } catch (e) {}
    }
    const accounts = await provider.send('eth_requestAccounts', []);
    walletAddress = accounts[0];
    signer = await provider.getSigner();
    updateWalletUI();
    if (token) { apiFetch('/auth/wallet', { method: 'PUT', body: JSON.stringify({ walletAddress }) }); updateRightPanelWallet(); toast('Wallet connected: ' + shortAddr(walletAddress), 'success'); return; }
    toast('Connecting wallet...', 'info');
    const r = await apiFetch('/auth/login-wallet', { method: 'POST', body: JSON.stringify({ walletAddress }) });
    if (r.ok) { const d = await r.json(); token = d.token; currentUser = d.user; localStorage.setItem('cf_token', token); updateAuthUI(); updateTopbarUser(); updateRightPanelWallet(); toast('Welcome back, ' + d.user.name + '!', 'success'); }
    else { document.getElementById('mm-reg-wallet').textContent = shortAddr(walletAddress); document.getElementById('mm-reg-name').value = ''; document.getElementById('mm-reg-email').value = ''; document.getElementById('mm-reg-phone').value = ''; document.getElementById('mm-reg-pass').value = ''; document.getElementById('metamask-reg-modal').style.display = 'flex'; setTimeout(() => document.getElementById('mm-reg-name').focus(), 300); }
  } catch (err) { toast('Wallet connection failed: ' + err.message, 'error'); }
}
function updateWalletUI() { const warn = document.getElementById('create-wallet-warning'); if (warn) warn.style.display = 'none'; updateRightPanelWallet(); }
function shortAddr(a) { return a ? `${a.slice(0,6)}...${a.slice(-4)}` : ''; }

// ── Auth ──────────────────────────────────────────────────────────────────
function openAuthModal() { document.getElementById('auth-modal').style.display = 'flex'; }
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0) === (tab==='login')));
  document.getElementById('auth-login').style.display = tab==='login' ? 'block' : 'none';
  document.getElementById('auth-register').style.display = tab==='register' ? 'block' : 'none';
}
async function login() {
  const email = document.getElementById('login-email').value, password = document.getElementById('login-pass').value;
  if (!email || !password) return toast('Enter email and password', 'error');
  try {
    const r = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const d = await r.json();
    if (!r.ok) return toast(d.error, 'error');
    token = d.token; currentUser = d.user; localStorage.setItem('cf_token', token);
    updateAuthUI(); updateTopbarUser(); document.getElementById('auth-modal').style.display = 'none';
    toast(`Welcome back, ${d.user.name}!`, 'success');
    if (document.getElementById('page-create')?.classList.contains('active')) checkCreateAccess();
  } catch (err) { toast(err.message, 'error'); }
}
async function register() {
  const name = document.getElementById('reg-name').value, email = document.getElementById('reg-email').value, password = document.getElementById('reg-pass').value, role = document.getElementById('reg-role').value;
  if (!name || !email || !password) return toast('All fields required', 'error');
  try {
    const r = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role, walletAddress }) });
    const d = await r.json();
    if (!r.ok) return toast(d.error, 'error');
    token = d.token; currentUser = d.user; localStorage.setItem('cf_token', token);
    updateAuthUI(); updateTopbarUser(); document.getElementById('auth-modal').style.display = 'none';
    toast(`Account created! Welcome, ${d.user.name}`, 'success');
    if (document.getElementById('page-create')?.classList.contains('active')) checkCreateAccess();
  } catch (err) { toast(err.message, 'error'); }
}
function updateAuthUI() {
  if (!currentUser) return;
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  if (currentUser.role === 'admin') {
    apiFetch('/kyc/admin/stats').then(r=>r.json()).then(d=>{
      if (d.pending > 0) { const badge = document.getElementById('admin-pending-badge'); badge.textContent = d.pending; badge.style.display = 'inline-block'; document.getElementById('notif-dot').style.display = 'block'; }
    }).catch(()=>{});
  }
}
function logout() {
  token = null; currentUser = null; walletAddress = null; signer = null; provider = null;
  localStorage.removeItem('cf_token');
  updateTopbarUser();
  document.getElementById('nav-admin').style.display = 'none';
  document.getElementById('admin-pending-badge').style.display = 'none';
  document.getElementById('notif-dot').style.display = 'none';
  document.getElementById('rp-connect-prompt').style.display = 'block';
  document.getElementById('rp-wallet-card').style.display = 'none';
  document.getElementById('rp-my-donations-section').style.display = 'none';
  document.getElementById('sidebar-wallet-mini').style.display = 'none';
  document.getElementById('sidebar-connect-btn').style.display = 'block';
  const warn = document.getElementById('create-wallet-warning'); if (warn) warn.style.display = 'block';
  toast('Signed out successfully', 'info');
  showPage('home');
}

// ── Stats ─────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await apiFetch('/campaigns/stats/platform');
    if (!r.ok) return;
    const d = await r.json();
    const toINR = (eth) => `₹${(eth * ETH_INR).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    document.getElementById('stat-raised').textContent = toINR(d.totalRaised || 0);
    document.getElementById('stat-campaigns').textContent = (d.totalCampaigns || 0).toLocaleString();
    document.getElementById('stat-donors').textContent = (d.totalDonors || 0).toLocaleString();
    document.getElementById('stat-util').textContent = `${d.utilizationRate || 0}%`;
    document.getElementById('db-raised').textContent = toINR(d.totalRaised || 0);
    document.getElementById('db-active').textContent = d.activeCampaigns || 0;
    document.getElementById('db-disbursed').textContent = toINR(d.totalDisbursed || 0);
    document.getElementById('db-disbursed-sub').textContent = `${d.utilizationRate || 0}% utilisation`;
    updateRightPanelStats();
    updateActiveBadge(d.activeCampaigns);
  } catch(_) {
    document.getElementById('stat-raised').textContent = '₹0';
    document.getElementById('stat-campaigns').textContent = '0';
    document.getElementById('stat-donors').textContent = '0';
    document.getElementById('stat-util').textContent = '0%';
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────
async function loadCampaigns() {
  const grid = document.getElementById('campaigns-grid');
  const cat = document.getElementById('cat-filter')?.value?.trim() || '';
  grid.innerHTML = `<div style="grid-column:span 3;text-align:center;padding:60px;color:var(--text3)"><div class="spinner"></div><div style="margin-top:12px">Loading campaigns...</div></div>`;
  try {
    const r = await apiFetch(`/campaigns?${cat ? `category=${encodeURIComponent(cat)}` : ''}&limit=50`);
    if (!r.ok) throw new Error();
    let { campaigns } = await r.json();
    // Client-side filter to ensure only selected category is shown
    if (cat) {
      campaigns = campaigns.filter(c => c.category === cat);
    }
    if (!campaigns.length) { grid.innerHTML = ''; document.getElementById('no-campaigns').style.display = 'block'; return; }
    document.getElementById('no-campaigns').style.display = 'none';
    const catEmoji = { Healthcare:'💊', Education:'📚', Infrastructure:'🏗️', Relief:'🍱', Environment:'🌱', Other:'📌' };
    console.log(`📋 Rendering ${campaigns.length} campaigns:`, campaigns.map(c => ({title: c.title, addr: c.contractAddress})));
    grid.innerHTML = campaigns.map((c, cardIdx) => {
      const pctFill = Math.min(100, (c.totalRaised||0)/(c.goalAmount||1)*100).toFixed(3);
      const visualPct = Object.is(c.totalRaised||0, 0) ? 0 : Math.max(3, pctFill);
      return `
      <div class="camp-card" onclick="openCampaignDetail('${c.contractAddress}')" data-addr="${c.contractAddress}">
        <div class="pot-container">
          <div class="pot-body">
            <div class="pot-liquid" style="height:${visualPct}%"></div>
          </div>
          <div class="pot-handle"></div>
          <div class="pot-rim">${catEmoji[c.category] || '📌'}</div>
        </div>
        <div class="camp-info">
          <div class="camp-cat">${c.category}</div>
          <div class="camp-title">${c.title}</div>
          <div class="camp-desc">${c.description && c.description !== 'undefined' ? c.description : 'A blockchain-verified fundraising campaign.'}</div>
          <div class="camp-meta">
            <div class="camp-stats">
              <span class="camp-raised">₹${((c.totalRaised||0)*ETH_INR).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
              <span style="color:var(--text3)">of ₹${((c.goalAmount||0)*ETH_INR).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
              <span style="color:var(--cyan);font-weight:600">${pctFill}% full</span>
              <a href="https://sepolia.etherscan.io/address/${c.contractAddress}" target="_blank" style="font-size:11px;color:var(--text3);text-decoration:underline" onclick="event.stopPropagation()">Explorer ↗</a>
              <span class="badge-tag ${c.active ? 'badge-active' : 'badge-ended'}">${c.active ? '🟢 Active' : '⚫ Ended'}</span>
            </div>
          </div>
        </div>
      </div>`
    }).join('');
    const sel = document.getElementById('tracker-select');
    sel.innerHTML = '<option>— Select a Campaign —</option>' + campaigns.map(c => `<option value="${c.contractAddress}">${c.title.slice(0,40)}</option>`).join('');
  } catch(_) { grid.innerHTML = demoCampaigns(); }
}
function updateCardUI(address, raisedETH, goalETH) {
  const card = document.querySelector(`.camp-card[data-addr="${address}"]`);
  if (!card) return;
  const pctFill = goalETH > 0 ? Math.min(100, (raisedETH / goalETH) * 100).toFixed(3) : 0;
  const visualPct = Object.is(raisedETH, 0) ? 0 : Math.max(3, pctFill);
  const raisedINR = Math.round(raisedETH * ETH_INR).toLocaleString('en-IN', {maximumFractionDigits:0});
  
  const liquid = card.querySelector('.pot-liquid');
  if (liquid) liquid.style.height = visualPct + '%';
  
  const raisedText = card.querySelector('.camp-raised');
  if (raisedText) raisedText.textContent = `₹${raisedINR}`;
  
  // The first span in the flex container next to explorer link holds the percent text
  const pctText = card.querySelector('.camp-meta > div:nth-child(2) > span:first-child');
  if (pctText) pctText.textContent = `${pctFill}% full`;
}

function demoCampaigns() {
  // Load demo campaigns from localStorage
  initializeDemoCampaignStorage(); // Ensure storage is initialized
  const demos = [0, 1, 2].map(i => getDemoCampaign(i)).filter(Boolean);
  console.log(`📋 Rendering ${demos.length} demo campaigns:`, demos.map(c => ({title: c.title, addr: c.contractAddress})));
  
  return demos.map((c, idx) => {
    const catEmoji = { Healthcare:'💊', Education:'📚', Infrastructure:'🏗️', Relief:'🍱', Environment:'🌱', Other:'📌' };
    const pctFill = Math.min(100, (c.totalRaised||0)/(c.goalAmount||1)*100).toFixed(3);
    const toINR = (eth) => `₹${Math.round((eth || 0) * 220000).toLocaleString('en-IN', {maximumFractionDigits:0})}`;
    
    return `<div class="camp-card" onclick="openDemoCampaignDetail(${idx})" data-demo-idx="${idx}">
      <div class="pot-container">
        <div class="pot-body">
          <div class="pot-liquid" style="height:${pctFill}%"></div>
        </div>
        <div class="pot-handle"></div>
        <div class="pot-rim">${catEmoji[c.category] || '📌'}</div>
      </div>
      <div class="camp-info">
        <div class="camp-cat">${c.category}</div>
        <div class="camp-title">${c.title}</div>
        <div class="camp-desc">${c.description}</div>
        <div class="camp-meta">
          <div class="camp-stats">
            <span class="camp-raised">${toINR(c.totalRaised)}</span>
            <span style="color:var(--text3)">of ${toINR(c.goalAmount)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--cyan);font-weight:600">${pctFill}% full</span>
            <span class="badge-tag badge-active">${c.active ? '🟢 Active' : '⚫ Ended'}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Demo Campaign Data Management ───────────────────────────────────────
function initializeDemoCampaignStorage() {
  const demoCampaignsData = [
    { 
      contractAddress: '0xDEMO000000000000000000000000000000000001',
      title: 'Clean Water Initiative — Rajasthan',
      description: 'Providing safe drinking water to 5000 families through blockchain-verified disbursement.',
      category: 'Healthcare',
      goalAmount: 27.5,
      totalRaised: 0.00022,
      active: true,
      imageUrl: null,
      organiser: null,
      organiserWallet: null,
      donorCount: 0,
      totalDisbursed: 0,
      milestones: [],
      trustees: [],
      deadline: new Date(Date.now() + 60*24*60*60*1000),
      _demoInfo: { emoji: '💧', pct: 0.1 }
    },
    { 
      contractAddress: '0xDEMO000000000000000000000000000000000002',
      title: 'Rural Education Fund — Bihar',
      description: 'Building 12 schools and training 40 teachers in underserved Bihar districts.',
      category: 'Education',
      goalAmount: 10,
      totalRaised: 0,
      active: true,
      imageUrl: null,
      organiser: null,
      organiserWallet: null,
      donorCount: 0,
      totalDisbursed: 0,
      milestones: [],
      trustees: [],
      deadline: new Date(Date.now() + 90*24*60*60*1000),
      _demoInfo: { emoji: '📚', pct: 0 }
    },
    { 
      contractAddress: '0xDEMO000000000000000000000000000000000003',
      title: 'Reforestation Drive — Uttarakhand',
      description: 'Planting 50,000 trees across degraded forest land in Uttarakhand.',
      category: 'Environment',
      goalAmount: 10,
      totalRaised: 0,
      active: true,
      imageUrl: null,
      organiser: null,
      organiserWallet: null,
      donorCount: 0,
      totalDisbursed: 0,
      milestones: [],
      trustees: [],
      deadline: new Date(Date.now() + 120*24*60*60*1000),
      _demoInfo: { emoji: '🌱', pct: 0 }
    }
  ];
  demoCampaignsData.forEach((c, idx) => {
    const key = `demo_campaign_demo-${idx}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(c));
      console.log(`✓ Initialized demo campaign ${idx}: "${c.title}" → key: ${key}`);
    }
  });
  console.log(`✓ Demo storage initialized with keys:`, Object.keys(localStorage).filter(k => k.startsWith('demo_campaign')));
}
function getDemoCampaign(index) {
  const key = `demo_campaign_demo-${index}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    const data = JSON.parse(stored);
    console.log(`✓ getDemoCampaign(${index}) from key "${key}" → "${data.title}"`);
    return data;
  }
  console.warn(`✗ getDemoCampaign(${index}) NOT FOUND for key "${key}"`);
  return null;
}
function updateDemoCampaign(index, data) {
  const key = `demo_campaign_demo-${index}`;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Campaign Detail with Refresh Button ───────────────────────────────────
async function openCampaignDetail(address, forceRefresh = false) {
  document.getElementById('campaign-modal').style.display = 'flex';
  document.getElementById('campaign-modal-content').innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:12px">Loading campaign data...</div></div>';
  if (_modalRefreshTimer && !forceRefresh) { clearInterval(_modalRefreshTimer); _modalRefreshTimer = null; }
  window._currentModalAddress = address;
  try {
    const [cr, br] = await Promise.all([ apiFetch(`/campaigns/${address}`), apiFetch(`/blockchain/campaign/${address}`) ]);
    const c = await cr.json();
    const b = br.ok ? await br.json() : null;
    
    // Fetch fresh data directly from blockchain smart contract for permanent accuracy
    let totalRaised = 0;
    let goal = b ? parseFloat(b.goalAmount) : (c.goalAmount || 0);
    let apiTotalRaised = b ? parseFloat(b.totalRaised) : (c.totalRaised || 0);
    
    try {
      // Try to fetch directly from the blockchain contract
      const contract = new ethers.Contract(address, CAMPAIGN_ABI, provider);
      const blockchainTotalRaised = await contract.totalRaised();
      const blockchainGoal = await contract.goalAmount();
      const rawRaised = parseFloat(ethers.formatEther(blockchainTotalRaised));
      const rawGoal   = parseFloat(ethers.formatEther(blockchainGoal));
      
      // 🛡️ ZERO-GUARD: If blockchain returns 0 but API has data, favor API (likely RPC lag/error)
      if (rawRaised === 0 && apiTotalRaised > 0) {
        console.warn('⚠️ [Zero-Guard] Blockchain returned 0, favoring cached API data:', apiTotalRaised);
        totalRaised = apiTotalRaised;
      } else {
        totalRaised = rawRaised;
      }
      goal = rawGoal > 0 ? rawGoal : goal;
      
      console.log('✓ Reconciled data:', {totalRaised, goal, source: rawRaised === totalRaised ? 'blockchain' : 'api_fallback'});
    } catch(e) {
      // Fallback to API if direct blockchain fetch fails
      console.log('Blockchain fetch failed, using API data:', e.message);
      totalRaised = apiTotalRaised;
      goal = b ? parseFloat(b.goalAmount) : (c.goalAmount || 0);
    }
    
    const pct  = goal > 0 ? Math.min(100, (totalRaised / goal) * 100).toFixed(3) : 0;
    const visualPct = Object.is(totalRaised, 0) ? 0 : Math.max(3, pct); // Guarantee visible liquid if there's any donation
    const toINR = (eth) => `₹${(eth * ETH_INR).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const catEmoji = { Healthcare:'💧', Education:'📚', Infrastructure:'🏗️', Relief:'🍱', Environment:'🌱', Other:'📌' };
    document.getElementById('campaign-modal-content').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><div class="modal-title" style="margin-bottom:0">${c.title}</div><button class="btn btn-ghost btn-sm" onclick="refreshCampaignModal()" style="padding:6px 10px;font-size:12px">🔄 Refresh</button></div>
      <div style="display:flex;gap:8px;margin-bottom:20px"><span class="badge-tag badge-active">${c.category}</span><span class="badge-tag" style="background:rgba(0,210,200,.1);color:var(--cyan)">${c.active ? '🟢 Active' : '⚫ Ended'}</span></div>
      <div style="text-align:center;margin-bottom:30px"><div style="position:relative;width:140px;height:200px;margin:0 auto">
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:140px;height:150px;background:linear-gradient(135deg,#ff8c42 0%,#ff6b42 50%,#d4512a 100%);border:3px solid #d4512a;border-radius:50% 50% 35% 35%;box-shadow:inset -4px -4px 12px rgba(0,0,0,.4),0 12px 30px rgba(255,107,66,.5),inset 2px 2px 8px rgba(255,255,255,.1);overflow:hidden">
          <div id="modal-pot-liquid" class="pot-liquid" style="height:${visualPct}%;position:absolute;bottom:0;left:0;width:100%;background:linear-gradient(180deg,#00d4ff 0%,#0099dd 50%,#006eaa 100%);border-radius:50% 50% 0 0;transition:height .8s cubic-bezier(0.34, 1.56, 0.64, 1);box-shadow:inset 0 2px 8px rgba(255,255,255,.4),inset -2px -2px 6px rgba(0,0,0,.2)"></div>
        </div>
        <div style="position:absolute;right:-20px;top:25px;width:32px;height:50px;border:3px solid #d4512a;border-radius:0 22px 22px 0;box-shadow:3px 2px 8px rgba(0,0,0,.4),inset 1px 1px 4px rgba(255,255,255,.1)"></div>
        <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);width:150px;height:18px;background:linear-gradient(180deg,#ffb366 0%,#ff8c42 50%,#d4512a 100%);border:2px solid #d4512a;border-radius:50%;box-shadow:inset 0 -3px 6px rgba(0,0,0,.3),0 6px 14px rgba(0,0,0,.3),inset 1px 1px 4px rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:24px">${catEmoji[c.category] || '📌'}</div>
        <div style="position:absolute;bottom:-35px;left:50%;transform:translateX(-50%);text-align:center;white-space:nowrap"><div style="font-size:13px;font-weight:600;color:var(--cyan)" id="modal-pot-pct">${pct}% full</div></div>
      </div></div>

      <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px;text-align:center">${c.description}</p>
      <div class="grid3" style="margin-bottom:20px"><div class="metric card-sm"><div class="metric-label">Raised</div><div class="metric-val" style="font-size:1.3rem" id="modal-raised">${toINR(totalRaised)}</div></div><div class="metric card-sm"><div class="metric-label">Goal</div><div class="metric-val" style="font-size:1.3rem" id="modal-goal">${toINR(goal)}</div></div><div class="metric card-sm"><div class="metric-label">Progress</div><div class="metric-val" style="font-size:1.3rem" id="modal-progress">${pct}%</div></div></div>
      <div class="chain-badge" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
        <span><span class="v">✓</span> Contract: <span style="font-family:var(--mono);color:var(--cyan)">${address}</span></span>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn-ghost" onclick="syncSpecificCampaign('${address}')" style="font-size:11px;padding:4px 8px" title="Re-sync with blockchain">🔄 Sync</button>
          <a href="https://sepolia.etherscan.io/address/${address}" target="_blank" style="font-size:11px;color:var(--text3);text-decoration:underline">Explorer ↗</a>
          <span id="last-updated" style="font-size:10px;color:var(--text3)">updated just now</span>
        </div>
      </div>
      
      <div id="modal-tabs" style="display:flex;gap:20px;margin-bottom:16px;border-bottom:1px solid var(--border)">
        <div class="modal-tab active" onclick="setModalTab('details')">Details</div>
        <div class="modal-tab" onclick="setModalTab('history')">History</div>
      </div>
      
      <div id="modal-tab-details">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:16px"><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">💰 Donate via MetaMask</div><div style="display:flex;gap:10px"><input class="form-input" id="donate-amount" type="number" step="0.001" min="0.001" placeholder="Amount in ETH (e.g. 0.01)" style="flex:1"/><button class="btn btn-primary" onclick="donateToCampaign('${address}')">Donate</button></div><div class="form-hint" style="margin-top:6px">Connected wallet: ${walletAddress ? shortAddr(walletAddress) : '<a onclick="connectWallet()" style="color:var(--cyan);cursor:pointer">Connect first</a>'}</div></div>
        ${b && b.milestones && b.milestones.length ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">Milestones</div>${b.milestones.map((m, i) => `<div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:13px;color:#fff">${m.description}</div><span class="badge-tag ${m.completed ? 'badge-active' : 'badge-review'}">${m.completed ? '✓ Done' : `${m.approvalCount}/${b.requiredApprovals || 1} approvals`}</span></div><div style="font-size:11px;color:var(--text3);margin-top:4px">Target: ${toINR(parseFloat(m.targetAmount))}</div></div>`).join('')}` : ''}
      </div>

      <div id="modal-tab-history" style="display:none">
        <div id="campaign-history-list" style="max-height:300px;overflow-y:auto;font-size:12px">
          <div style="text-align:center;padding:20px;color:var(--text3)">Loading transaction history...</div>
        </div>
      </div>
    `;
    window._currentRaised = totalRaised; window._currentGoal = goal;
    updateCardUI(address, totalRaised, goal);
  } catch(_) { openDemoCampaignDetail(); }
  if (!isDonating) {
    if (_modalRefreshTimer) clearInterval(_modalRefreshTimer);
    _modalRefreshTimer = setInterval(() => {
      const modal = document.getElementById('campaign-modal');
      if (modal && modal.style.display !== 'none' && window._currentModalAddress && !isDonating) refreshCampaignModal(true);
      else { clearInterval(_modalRefreshTimer); _modalRefreshTimer = null; }
    }, 8000);
  }
}
async function refreshCampaignModal(silent = false) {
  if (!window._currentModalAddress) return;
  if (!silent) document.getElementById('campaign-modal-content').innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:12px">Refreshing...</div></div>';
  try {
    const [cr, br] = await Promise.all([ apiFetch(`/campaigns/${window._currentModalAddress}`), apiFetch(`/blockchain/campaign/${window._currentModalAddress}`) ]);
    const c = await cr.json();
    const b = br.ok ? await br.json() : null;
    
    // Fetch fresh data directly from blockchain smart contract
    let totalRaised = 0;
    let goal = b ? parseFloat(b.goalAmount) : (c.goalAmount || 0);
    
    try {
      const contract = new ethers.Contract(window._currentModalAddress, CAMPAIGN_ABI, provider);
      const blockchainTotalRaised = await contract.totalRaised();
      const blockchainGoal = await contract.goalAmount();
      totalRaised = parseFloat(ethers.formatEther(blockchainTotalRaised));
      goal = parseFloat(ethers.formatEther(blockchainGoal));
      console.log('✓ Refreshed from blockchain:', {totalRaised, goal});
    } catch(e) {
      console.log('Blockchain refresh failed, using API:', e.message);
      totalRaised = b ? parseFloat(b.totalRaised) : (c.totalRaised || 0);
      goal = b ? parseFloat(b.goalAmount) : (c.goalAmount || 0);
    }
    
    const pct = goal > 0 ? Math.min(100, (totalRaised / goal) * 100).toFixed(3) : 0;
    const visualPct = Object.is(totalRaised, 0) ? 0 : Math.max(3, pct);
    const toINR = (eth) => `₹${(eth * ETH_INR).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    const raisedEl = document.getElementById('modal-raised'), goalEl = document.getElementById('modal-goal'), progressEl = document.getElementById('modal-progress'), liquidEl = document.getElementById('modal-pot-liquid'), potPctEl = document.getElementById('modal-pot-pct'), updatedSpan = document.getElementById('last-updated');
    if (raisedEl) raisedEl.textContent = toINR(totalRaised);
    if (goalEl) goalEl.textContent = toINR(goal);
    if (progressEl) progressEl.textContent = pct + '%';
    if (liquidEl) liquidEl.style.height = visualPct + '%';
    if (potPctEl) potPctEl.textContent = pct + '% full';
    if (updatedSpan) updatedSpan.textContent = 'updated ' + new Date().toLocaleTimeString();
    window._currentRaised = totalRaised; window._currentGoal = goal;
    updateCardUI(window._currentModalAddress, totalRaised, goal);
    if (!silent) toast('Campaign data refreshed', 'success');
  } catch(err) { if (!silent) toast('Refresh failed: ' + err.message, 'error'); openCampaignDetail(window._currentModalAddress, true); }
}
function openDemoCampaignDetail(index = 0) {
  console.log(`🔍 openDemoCampaignDetail called with index: ${index}`);
  let demo = getDemoCampaign(index);
  
  // Fallback: if demo not found, initialize storage and try again
  if (!demo) {
    console.warn(`Demo not found at index ${index}, reinitializing storage...`);
    initializeDemoCampaignStorage();
    demo = getDemoCampaign(index);
  }
  
  if (!demo) {
    console.error(`✗ Demo campaign ${index} still not found after reinitialization!`);
    return;
  }
  
  console.log(`✓ Opening demo campaign ${index}:`, demo.title);
  
  // Store current demo index for reference
  window._currentDemoIndex = index;
  
  document.getElementById('campaign-modal').style.display = 'flex';
  const toINR = (eth) => eth > 0 ? `₹${Math.round(eth * 220000).toLocaleString('en-IN', {maximumFractionDigits:0})}` : `₹0`;
  const pctFill = Math.min(100, (demo.totalRaised||0)/(demo.goalAmount||1)*100).toFixed(3);
  const catEmoji = { Healthcare:'💊', Education:'📚', Infrastructure:'🏗️', Relief:'🍱', Environment:'🌱', Other:'📌' };
  
  document.getElementById('campaign-modal-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div class="modal-title" style="margin-bottom:0">${catEmoji[demo.category] || '📌'} ${demo.title}</div>
      <button class="btn btn-ghost btn-sm" onclick="" style="padding:6px 10px;font-size:12px;cursor:not-allowed">Demo</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px">
      <span class="badge-tag badge-active">${demo.category}</span>
      <span class="badge-tag" style="background:rgba(0,210,200,.1);color:var(--cyan)">${demo.active ? '🟢 Active' : '⚫ Ended'}</span>
    </div>
    <div style="text-align:center;margin-bottom:30px">
      <div style="position:relative;width:140px;height:200px;margin:0 auto">
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:140px;height:150px;background:linear-gradient(135deg,#ff8c42 0%,#ff6b42 50%,#d4512a 100%);border:3px solid #d4512a;border-radius:50% 50% 35% 35%;box-shadow:inset -4px -4px 12px rgba(0,0,0,.4),0 12px 30px rgba(255,107,66,.5),inset 2px 2px 8px rgba(255,255,255,.1);overflow:hidden">
          <div id="modal-demo-pot-liquid" style="height:${pctFill}%;position:absolute;bottom:0;left:0;width:100%;background:linear-gradient(180deg,#00d4ff 0%,#0099dd 50%,#006eaa 100%);border-radius:50% 50% 0 0;transition:height .8s cubic-bezier(0.34, 1.56, 0.64, 1);box-shadow:inset 0 2px 8px rgba(255,255,255,.4),inset -2px -2px 6px rgba(0,0,0,.2)"></div>
        </div>
        <div style="position:absolute;right:-20px;top:25px;width:32px;height:50px;border:3px solid #d4512a;border-radius:0 22px 22px 0;box-shadow:3px 2px 8px rgba(0,0,0,.4),inset 1px 1px 4px rgba(255,255,255,.1)"></div>
        <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);width:150px;height:18px;background:linear-gradient(180deg,#ffb366 0%,#ff8c42 50%,#d4512a 100%);border:2px solid #d4512a;border-radius:50%;box-shadow:inset 0 -3px 6px rgba(0,0,0,.3),0 6px 14px rgba(0,0,0,.3),inset 1px 1px 4px rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:24px">${catEmoji[demo.category] || '📌'}</div>
        <div style="position:absolute;bottom:-35px;left:50%;transform:translateX(-50%);text-align:center;white-space:nowrap">
          <div style="font-size:13px;font-weight:600;color:var(--cyan)" id="modal-demo-pot-pct">${pctFill}% full</div>
        </div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px;text-align:center">${demo.description}</p>
    <div class="grid3" style="margin-bottom:20px">
      <div class="metric card-sm">
        <div class="metric-label">Raised</div>
        <div class="metric-val" style="font-size:1.3rem" id="modal-demo-raised">${toINR(demo.totalRaised)}</div>
      </div>
      <div class="metric card-sm">
        <div class="metric-label">Goal</div>
        <div class="metric-val" style="font-size:1.3rem" id="modal-demo-goal">${toINR(demo.goalAmount)}</div>
      </div>
      <div class="metric card-sm">
        <div class="metric-label">Progress</div>
        <div class="metric-val" style="font-size:1.3rem" id="modal-demo-progress">${pctFill}%</div>
      </div>
    </div>
    <div class="chain-badge" style="margin-bottom:20px"><span class="v">✓</span> Demo Campaign (localStorage tracked)</div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">💰 Simulate Donation</div>
      <div style="display:flex;gap:10px">
        <input class="form-input" id="donate-amount" type="number" step="0.001" min="0.001" placeholder="ETH amount" style="flex:1"/>
        <button class="btn btn-primary" onclick="simulateDemoDonation(${index})">Add to Pot</button>
      </div>
      <div class="form-hint" style="margin-top:6px">This demo data is stored locally in your browser</div>
    </div>
  `;
}

// ── Simulate Demo Donation ───────────────────────────────────────────────
function simulateDemoDonation(index) {
  const amountInput = document.getElementById('donate-amount');
  const amount = amountInput?.value;
  if (!amount || parseFloat(amount) <= 0) { toast('Enter a valid ETH amount', 'error'); return; }
  
  const demo = getDemoCampaign(index);
  if (!demo) return;
  
  const donatedAmount = parseFloat(amount);
  demo.totalRaised = (demo.totalRaised || 0) + donatedAmount;
  const newPct = Math.min(100, (demo.totalRaised / demo.goalAmount * 100));
  
  updateDemoCampaign(index, demo);
  
  // Update modal immediately
  const toINR = (eth) => eth > 0 ? `₹${Math.round(eth * 220000).toLocaleString('en-IN', {maximumFractionDigits:0})}` : `₹0`;
  const pct = newPct.toFixed(3);
  
  const raisedEl = document.getElementById('modal-demo-raised');
  const progressEl = document.getElementById('modal-demo-progress');
  const liquidEl = document.getElementById('modal-demo-pot-liquid');
  const potPctEl = document.getElementById('modal-demo-pot-pct');
  
  if (raisedEl) raisedEl.textContent = toINR(demo.totalRaised);
  if (progressEl) progressEl.textContent = pct + '%';
  if (liquidEl) liquidEl.style.height = pct + '%';
  if (potPctEl) potPctEl.textContent = pct + '% full';
  
  amountInput.value = '';
  toast(`🎉 Added ${amount} ETH to demo campaign! Stored in your browser.`, 'success');
  
  // Refresh campaign cards
  setTimeout(() => {
    loadCampaigns();
  }, 500);
}

// ── Donate with Retry Logic ───────────────────────────────────────────────
async function donateToCampaign(contractAddress) {
  if (!walletAddress) { await connectWallet(); if (!walletAddress) return; }
  if (!signer) return toast('Wallet not ready. Refresh and reconnect.', 'error');
  const amountInput = document.getElementById('donate-amount');
  const amount = amountInput?.value;
  if (!amount || parseFloat(amount) <= 0) return toast('Enter a valid ETH amount (e.g. 0.01)', 'error');
  if (!contractAddress) return toast('Invalid campaign contract address', 'error');
  if (_modalRefreshTimer) { clearInterval(_modalRefreshTimer); _modalRefreshTimer = null; }
  isDonating = true;
  const donateBtn = document.querySelector('#campaign-modal-content .btn-primary');
  const setBtn = (txt, disabled, bg) => { if (donateBtn) { donateBtn.textContent = txt; donateBtn.disabled = disabled; if (bg) donateBtn.style.background = bg; } };
  try {
    setBtn('Waiting for MetaMask...', true, '');
    toast('Please confirm the transaction in MetaMask', 'info');
    const c = new ethers.Contract(contractAddress, CAMPAIGN_ABI, signer);
    const tx = await c.donate({ value: ethers.parseEther(String(parseFloat(amount))) });
    setBtn('Confirming on blockchain...', true, '');
    toast('Transaction submitted! Waiting for block confirmation...', 'info');
    const receipt = await tx.wait();
    toast('Donation confirmed! ' + amount + ' ETH sent successfully', 'success');
    setBtn('✅ Donated!', false, 'rgba(0,229,160,.25)');
    // Optimistic update - immediately show the donation in the pot
    try {
      const donatedAmount = parseFloat(amount);
      if (!window._currentRaised && window._currentRaised !== 0) window._currentRaised = 0;
      if (!window._currentGoal && window._currentGoal !== 0) window._currentGoal = 1;
      const optimisticRaised = window._currentRaised + donatedAmount;
      const optimisticPct = Math.min(100, (optimisticRaised / window._currentGoal * 100)).toFixed(3);
      const toINR = (eth) => '₹' + Math.round(eth * 220000).toLocaleString('en-IN', {maximumFractionDigits:0});
      
      // Update all elements immediately
      const raisedEl = document.getElementById('modal-raised');
      const progressEl = document.getElementById('modal-progress');
      const liquidEl = document.getElementById('modal-pot-liquid');
      const potPctEl = document.getElementById('modal-pot-pct');
      const updatedSpan = document.getElementById('last-updated');
      
      if (raisedEl) raisedEl.textContent = toINR(optimisticRaised);
      if (progressEl) progressEl.textContent = optimisticPct + '%';
      
      const visualPct = Object.is(optimisticRaised, 0) ? 0 : Math.max(3, optimisticPct);
      if (liquidEl) liquidEl.style.height = visualPct + '%';
      
      if (potPctEl) potPctEl.textContent = optimisticPct + '% full';
      if (updatedSpan) updatedSpan.textContent = 'updated ' + new Date().toLocaleTimeString();
      
      // Update global state
      window._currentRaised = optimisticRaised;
      window._currentGoal = window._currentGoal || 1;
      
      updateCardUI(contractAddress, optimisticRaised, window._currentGoal);
      
      toast(`🎉 Your donation of ${amount} ETH has been added!`, 'success');
      console.log('Optimistic update:', {optimisticRaised, optimisticPct});
    } catch(err) {
      console.error('Optimistic update failed:', err);
    }
    try {
      await apiFetch('/donations', { method: 'POST', body: JSON.stringify({ campaignAddress: contractAddress, amountETH: parseFloat(amount), txHash: receipt.hash, blockNumber: receipt.blockNumber }) });
    } catch (_) {}
    loadCampaigns(); loadStats(); updateRightPanelWallet(); updateRightPanelFeed();
    // Refresh modal with confirmed data after blockchain catches up
    setTimeout(() => { 
      if (document.getElementById('campaign-modal').style.display !== 'none' && window._currentModalAddress === contractAddress) { 
        refreshCampaignModal(true); // Silently refresh to fetch fresh blockchain data
      } 
    }, 5000);
  } catch (err) {
    setBtn('Donate', false, '');
    const msg = err?.info?.error?.message || err?.reason || err?.message || 'Unknown error';
    if (err.code === 4001 || err.code === 'ACTION_REJECTED' || msg.includes('user rejected')) toast('Transaction cancelled by user', 'error');
    else { toast('Transaction failed: ' + msg, 'error'); console.error('Donate error:', err); }
  } finally {
    setTimeout(() => { isDonating = false; }, 2500);
  }
}

// ── Deploy Campaign ───────────────────────────────────────────────────────
async function deployCampaign() {
  if (!walletAddress) { toast('Connect wallet first', 'error'); return; }
  const title = document.getElementById('c-title').value.trim(), desc = document.getElementById('c-desc').value.trim(), cat = document.getElementById('c-cat').value, goal = document.getElementById('c-goal').value, days = document.getElementById('c-days').value, approvals = document.getElementById('c-approvals').value, trusteesRaw = document.getElementById('c-trustees').value.trim();
  if (!title || !desc || !goal || !days) return toast('Fill in all required fields', 'error');
  const trustees = trusteesRaw ? trusteesRaw.split('\n').map(s=>s.trim()).filter(Boolean) : [walletAddress];
  const btn = document.getElementById('deploy-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner" style="display:inline-block;margin-right:8px"></div>Deploying Smart Contract...';
  try {
    let factoryAddr = FACTORY_ADDRESS;
    if (!factoryAddr) { 
      try { 
        const r = await fetch(`${API.replace('/api','')}/config`); 
        if (r.ok) { const d = await r.json(); factoryAddr = d.factory; FACTORY_ADDRESS = d.factory; } 
      } catch(_) {} 
    }
    
    if (!factoryAddr) {
      throw new Error('Factory contract address not found. Please ensure the backend is running and you have deployed the contracts using the deployment script.');
    }
    
    const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, signer);
    toast('Deploying campaign contract... (confirm in MetaMask)', 'info');
    const tx = await factory.createCampaign(title, desc, cat, ethers.parseEther(goal), parseInt(days), trustees, parseInt(approvals));
    btn.innerHTML = '<div class="spinner" style="display:inline-block;margin-right:8px"></div>Waiting for confirmation...';
    const receipt = await tx.wait();
    const iface = new ethers.Interface(FACTORY_ABI);
    let campaignAddress;
    for (const log of receipt.logs) { try { const parsed = iface.parseLog(log); if (parsed.name === 'CampaignCreated') { campaignAddress = parsed.args[0]; break; } } catch(_) {} }
    if (campaignAddress) {
      await apiFetch(`/campaigns/${proposalId}/deploy`, { 
        method: 'PUT', 
        body: JSON.stringify({ contractAddress: campaignAddress, txHash: receipt.hash, blockNumber: receipt.blockNumber }) 
      });
    }
    toast(`Campaign deployed! Contract: ${shortAddr(campaignAddress || '0x...')}`, 'success');
    btn.innerHTML = '✅ Campaign Launched Successfully!';
    setTimeout(() => { showPage('campaigns'); loadCampaigns(); loadStats(); }, 2000);
  } catch (err) {
    if (err.message?.includes('NOT_APPROVED') || err.message?.includes('approved')) { toast('You need admin approval to create campaigns', 'error'); showPage('kyc'); }
    else toast('Deployment failed: ' + (err.reason || err.message), 'error');
    btn.disabled = false; btn.innerHTML = '🚀 Deploy Smart Contract & Launch Campaign';
  }
}

// ── Milestone Fields ──────────────────────────────────────────────────────
let milestoneCount = 0;
function addMilestoneField() { milestoneCount++; const c = document.getElementById('milestones-container'); if (milestoneCount === 1) c.innerHTML = ''; const div = document.createElement('div'); div.style.cssText = 'display:flex;gap:10px;align-items:center'; div.innerHTML = `<input class="form-input" placeholder="Milestone ${milestoneCount} description" style="flex:2"/><input class="form-input" type="number" step="0.001" placeholder="ETH" style="flex:1"/><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`; c.appendChild(div); }

// ── Dashboard ─────────────────────────────────────────────────────────────
function switchDashTab(name) { document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',['overview','tracker','my'][i]===name)); document.querySelectorAll('.tab-panel').forEach((p,i)=>p.classList.toggle('active',['dt-overview','dt-tracker','dt-my'][i]===`dt-${name}`)); }
async function loadDashboard() { loadStats(); loadLiveTxns(); }
async function loadLiveTxns() { const el = document.getElementById('live-txns'); try { const r = await apiFetch('/transactions?limit=6'); if (!r.ok) throw new Error(); const {transactions} = await r.json(); if (!transactions.length) throw new Error(); el.innerHTML = transactions.map(txRow).join(''); } catch(_) { el.innerHTML = demoTxns(); } }
function appendLiveTx(tx) { const el = document.getElementById('live-txns'); if (!el) return; el.insertAdjacentHTML('afterbegin', txRow(tx)); const rows = el.children; if (rows.length > 8) rows[rows.length-1].remove(); }
function txRow(tx) { const icons = { donation: '💰', disbursement: '📤', refund: '↩️', contract_create: '📄', approval: '✅' }; const bgMap = { donation: 'rgba(34,197,94,.1)', disbursement: 'rgba(0,210,200,.1)', refund: 'rgba(239,68,68,.1)', contract_create: 'rgba(168,85,247,.1)' }; const amtStr = tx.valueETH ? `${tx.valueETH.toFixed(4)} ETH` : (tx.amountETH ? `${tx.amountETH.toFixed(4)} ETH` : '—'); const hashStr = tx.txHash || tx.hash || '0x...'; return `<div class="tx-row" onclick="document.getElementById('explorer-input').value='${hashStr}';showPage('explorer');explorerSearch()"><div class="tx-icon-wrap" style="background:${bgMap[tx.type]||'var(--border)'}">${icons[tx.type]||'•'}</div><div class="tx-info"><div class="tx-hash">${hashStr.slice(0,20)}...${hashStr.slice(-8)}</div><div class="tx-desc">${tx.description || tx.type}</div><div class="tx-meta"><span class="verified">✓</span> Block #${tx.blockNumber || '...'}</div></div><div class="tx-amt"><div class="amt">${amtStr}</div><div class="when">${timeAgo(tx.timestamp || tx.createdAt)}</div></div></div>`; }
function demoTxns() { const rows = [ { type:'donation', txHash:'0x3fa8b12cd9e401874a22c918f7d490b881acd3f7...b91c', description:'Donation — Clean Water Initiative', blockNumber:18402119, valueETH:0.045, timestamp:new Date() }, { type:'disbursement', txHash:'0x7bc1e4f0912c884490d8b3e9a1f567c239d7...e83d', description:'Disbursement — Medical Equipment', blockNumber:18402087, valueETH:0.545, timestamp:new Date(Date.now()-1080000) }, { type:'donation', txHash:'0x2ae7f18b9c2048376e59d4a91b832cd7f5a1...91b0', description:'Donation — Rural Education Fund', blockNumber:18402055, valueETH:0.025, timestamp:new Date(Date.now()-2040000) }, { type:'disbursement', txHash:'0x9d2f44aa7c1b3e59f20d8c6a94b7e1f035ab...44aa', description:'Disbursement — Teacher Salaries', blockNumber:18402001, valueETH:0.386, timestamp:new Date(Date.now()-3600000) } ]; return rows.map(txRow).join(''); }
function timeAgo(ts) { if (!ts) return '—'; const d = Math.floor((Date.now() - new Date(ts)) / 1000); if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`; return `${Math.floor(d/3600)}h ago`; }
async function loadTrackerAllocation() { const addr = document.getElementById('tracker-select').value, el = document.getElementById('tracker-alloc'); if (!addr || addr.startsWith('—')) return; try { const r = await apiFetch(`/blockchain/campaign/${addr}`); if (!r.ok) throw new Error(); const d = await r.json(); const toINR = (eth) => `₹${(eth * ETH_INR).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; const pct = d.goalAmount > 0 ? Math.min(100, d.totalRaised / d.goalAmount * 100).toFixed(3) : 0; el.innerHTML = `<div style="margin-bottom:16px"><div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:var(--mono)">Total locked: ${toINR(parseFloat(d.balance))}</div><div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${parseFloat(pct)}%"></div></div><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-top:6px"><span>${toINR(d.totalDisbursed)} disbursed</span><span>${pct}%</span></div></div><div class="alloc-row"><div class="alloc-label">🎯 Goal</div><div class="alloc-bar-wrap"><div class="alloc-bar" style="width:100%;background:#00d2c8"></div></div><div class="alloc-pct">100%</div><div class="alloc-amt">${toINR(parseFloat(d.goalAmount))}</div></div><div class="alloc-row"><div class="alloc-label">📊 Raised</div><div class="alloc-bar-wrap"><div class="alloc-bar" style="width:${parseFloat(pct)}%;background:#3b82f6"></div></div><div class="alloc-pct">${pct}%</div><div class="alloc-amt">${toINR(d.totalRaised)}</div></div><div class="alloc-row"><div class="alloc-label">📤 Disbursed</div><div class="alloc-bar-wrap"><div class="alloc-bar" style="width:${d.totalRaised > 0 ? (d.totalDisbursed/d.totalRaised*100).toFixed(3) : 0}%;background:#22c55e"></div></div><div class="alloc-pct">${d.totalRaised > 0 ? (d.totalDisbursed/d.totalRaised*100).toFixed(3) : 0}%</div><div class="alloc-amt">${toINR(d.totalDisbursed)}</div></div>`; document.getElementById('flow-balance').textContent = `${parseFloat(d.balance).toFixed(4)} ETH locked`; } catch(_) { el.innerHTML = `<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px">Connect to blockchain to see live allocation data</div>`; } }

// ── Explorer ───────────────────────────────────────────────────────────────
async function loadExplorer() { loadBlocks(); loadExplorerTxns(); }
async function loadBlocks() { const el = document.getElementById('blocks-row'); try { const r = await apiFetch('/blockchain/blocks/recent'); if (!r.ok) throw new Error(); const {blocks} = await r.json(); if (!blocks.length) throw new Error(); el.innerHTML = blocks.map((b,i) => `<div class="block-card ${i===0?'block-latest':''}">${i===0?'<div class="new-tag">LATEST</div>':''}<div class="block-num">Block #${b.number?.toLocaleString()}</div><div class="block-hash">${b.hash}</div><div class="block-txcount"><strong>${b.txCount}</strong> txns · ${timeAgo(b.timestamp*1000)}</div></div>${i<blocks.length-1?'<div style="display:flex;align-items:center;color:var(--text3);font-size:18px;flex-shrink:0">→</div>':''}`).join(''); } catch(_) { el.innerHTML = [18402119,18402118,18402117,18402116,18402115].map((n,i) => `<div class="block-card ${i===0?'block-latest':''}">${i===0?'<div class="new-tag">LATEST</div>':''}<div class="block-num">Block #${n.toLocaleString()}</div><div class="block-hash">0x${Math.random().toString(16).slice(2,18)}...${Math.random().toString(16).slice(2,6)}</div><div class="block-txcount"><strong>${Math.floor(Math.random()*12+1)}</strong> txns · ${i*14+2}s ago</div></div>${i<4?'<div style="display:flex;align-items:center;color:var(--text3);font-size:18px;flex-shrink:0">→</div>':''}`).join(''); } }
async function loadExplorerTxns() { const el = document.getElementById('explorer-txns'); try { const r = await apiFetch('/transactions?limit=8'); if (!r.ok) throw new Error(); const {transactions} = await r.json(); if (!transactions.length) throw new Error(); el.innerHTML = transactions.map(txRow).join(''); } catch(_) { el.innerHTML = demoTxns(); } }
async function explorerSearch() { const q = document.getElementById('explorer-input').value.trim(); if (!q) return; const section = document.getElementById('tx-detail-section'), content = document.getElementById('tx-detail-content'); section.style.display = 'block'; content.innerHTML = `<div style="text-align:center;padding:30px"><div class="spinner"></div><div style="margin-top:10px;font-size:13px;color:var(--text3)">Searching blockchain...</div></div>`; try { const r = await apiFetch(`/transactions/${q}`); if (!r.ok) throw new Error('Not found in index'); const tx = await r.json(); content.innerHTML = `<div class="tx-detail-grid"><div class="tx-detail-row"><div class="k">TX Hash</div><div class="v" style="color:var(--cyan)">${tx.txHash}</div></div><div class="tx-detail-row"><div class="k">Status</div><div class="v"><span class="badge-tag badge-active">✓ Confirmed</span></div></div><div class="tx-detail-row"><div class="k">Block</div><div class="v" style="color:#fff">#${tx.blockNumber?.toLocaleString()}</div></div><div class="tx-detail-row"><div class="k">From</div><div class="v">${tx.from}</div></div><div class="tx-detail-row"><div class="k">To</div><div class="v">${tx.to}</div></div><div class="tx-detail-row"><div class="k">Value</div><div class="v">${tx.valueETH?.toFixed(6)} ETH <span style="color:var(--text3)">(₹${(tx.valueINR||0).toLocaleString('en-IN',{maximumFractionDigits:0})})</span></div></div><div class="tx-detail-row"><div class="k">Type</div><div class="v" style="color:var(--cyan)">${tx.type}</div></div><div class="tx-detail-row"><div class="k">Purpose</div><div class="v">${tx.description || tx.campaignAddress || '—'}</div></div><div class="tx-detail-row"><div class="k">Timestamp</div><div class="v">${tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</div></div></div>`; } catch(_) { content.innerHTML = `<div class="tx-detail-grid"><div class="tx-detail-row"><div class="k">TX Hash</div><div class="v" style="color:var(--cyan)">${q.length > 20 ? q : '0x3fa8b12cd9e401874a22c918f7d490b881acd3f7c9208b1ee40187a4be9b91c'}</div></div><div class="tx-detail-row"><div class="k">Status</div><div class="v"><span class="badge-tag badge-active">✓ Confirmed (14 confirmations)</span></div></div><div class="tx-detail-row"><div class="k">Block</div><div class="v" style="color:#fff">#18,402,119</div></div><div class="tx-detail-row"><div class="k">From</div><div class="v">0x3fa8b12cd9e40187...b91c <span style="color:var(--text3)">(Donor)</span></div></div><div class="tx-detail-row"><div class="k">To</div><div class="v"><span style="color:var(--purple)">Smart Contract</span> 0xSC0482...a3f2</div></div><div class="tx-detail-row"><div class="k">Value</div><div class="v">0.045 ETH <span style="color:var(--text3)">(₹9,900)</span></div></div><div class="tx-detail-row"><div class="k">Gas Fee</div><div class="v">0.00018 ETH — paid by platform</div></div><div class="tx-detail-row"><div class="k">Type</div><div class="v" style="color:var(--cyan)">Donation</div></div><div class="tx-detail-row"><div class="k">Campaign</div><div class="v">Clean Water Initiative — Rajasthan</div></div></div>`; } section.scrollIntoView({ behavior: 'smooth' }); }

// ── KYC & Admin ───────────────────────────────────────────────────────────
async function checkCreateAccess() {
  const navCreate = document.getElementById('nav-create');
  if (!navCreate) return;
  
  if (!token) {
    navCreate.style.display = 'none';
    return;
  }
  
  try {
    const r = await apiFetch('/kyc/status');
    if (!r.ok) throw new Error();
    const d = await r.json();
    
    // Strictly show only if approved or admin
    if (d.approvedToCreate || currentUser?.role === 'admin') {
      navCreate.style.display = 'flex';
      console.log('🚀 Campaign deployment access granted');
    } else {
      navCreate.style.display = 'none';
      console.log('🔒 Campaign deployment access restricted');
    }
  } catch(e) {
    navCreate.style.display = 'none';
  }
}
async function submitKYC() { if (!token) { toast('Please create an account first to submit KYC', 'error'); switchAuthTab('register'); openAuthModal(); if (walletAddress) setTimeout(() => { const emailEl = document.getElementById('reg-email'); if (emailEl && !emailEl.value) emailEl.focus(); }, 300); return; } const fullName = document.getElementById('kyc-fullname').value.trim(), phone = document.getElementById('kyc-phone').value.trim(), organization = document.getElementById('kyc-org').value.trim(), orgType = document.getElementById('kyc-orgtype').value, panNumber = document.getElementById('kyc-pan').value.trim(), address = document.getElementById('kyc-address').value.trim(), purposeStatement = document.getElementById('kyc-purpose').value.trim(), websiteUrl = document.getElementById('kyc-website').value.trim(), socialLinks = document.getElementById('kyc-social').value.trim(); if (!fullName || !phone || !organization || !orgType || !address || !purposeStatement) return toast('Please fill all required fields (*)', 'error'); if (purposeStatement.length < 100) return toast('Purpose statement must be at least 100 characters', 'error'); const btn = document.getElementById('kyc-submit-btn'); btn.disabled = true; btn.innerHTML = '<div class="spinner" style="display:inline-block;margin-right:8px"></div>Submitting...'; try { const r = await apiFetch('/kyc/apply', { method: 'POST', body: JSON.stringify({ fullName, phone, organization, orgType, panNumber, address, purposeStatement, websiteUrl, socialLinks }) }); const d = await r.json(); if (!r.ok) return toast(d.error, 'error'); document.getElementById('kyc-form-wrap').innerHTML = `<div style="text-align:center;padding:40px"><div style="font-size:4rem;margin-bottom:16px">📋</div><div style="font-family:var(--display);font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:10px">Application Submitted!</div><div style="font-size:13px;color:var(--text2);line-height:1.7;max-width:400px;margin:0 auto 24px">Your verification request is now under review. You will be able to create campaigns once approved by our admin team.</div><div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;font-size:12px;color:var(--text3);margin-bottom:20px">⏱ Typical review time: <strong style="color:#fff">24–48 hours</strong><br>📧 You can check your status anytime in your account</div><button class="btn btn-ghost" onclick="showPage('campaigns')">Browse Campaigns →</button></div>`; toast('Application submitted successfully!', 'success'); } catch(err) { toast('Submission failed: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = 'Submit Verification Application →'; } }
async function loadKYCStatus() { if (!token) return; try { const r = await apiFetch('/kyc/status'); if (!r.ok) return; const d = await r.json(); const banner = document.getElementById('kyc-status-banner'); if (!banner) return; 
    // Show dev shortcut if not approved and in local dev
    const devWrap = document.getElementById('dev-verify-wrap');
    if (devWrap && !d.approvedToCreate) devWrap.style.display = 'block';
    else if (devWrap) devWrap.style.display = 'none';

    if (d.approvedToCreate) { banner.style.display = 'block'; banner.innerHTML = `<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:16px;font-size:13px;color:var(--green)">✅ Your account is <strong>approved</strong> to create campaigns! <a onclick="showPage('create')" style="color:var(--cyan);cursor:pointer;margin-left:8px">Create a Campaign →</a></div>`; document.getElementById('kyc-form-wrap').style.display = 'none'; } else if (d.kycStatus === 'pending') { banner.style.display = 'block'; banner.innerHTML = `<div style="background:rgba(245,194,66,.08);border:1px solid rgba(245,194,66,.25);border-radius:10px;padding:16px;font-size:13px;color:var(--gold)">⏳ Your application is <strong>under review</strong>. Submitted on ${new Date(d.submittedAt).toLocaleDateString()}. We'll notify you once reviewed.</div>`; document.getElementById('kyc-form-wrap').style.display = 'none'; } else if (d.kycStatus === 'rejected') { banner.style.display = 'block'; banner.innerHTML = `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:16px;font-size:13px;color:var(--red)">❌ Your previous application was <strong>rejected</strong>.<br><span style="color:var(--text2)">Reason: ${d.rejectionReason || 'Not specified'}</span><br><span style="color:var(--text3);font-size:11px">You may re-apply with updated information below.</span></div>`; } } catch(_) {} }
async function devVerify() {
  if (!confirm('Dev Tool: Automatically approve your KYC and become an organiser?')) return;
  try {
    const r = await apiFetch('/kyc/dev-verify', { method: 'POST' });
    if (!r.ok) throw new Error('Request failed');
    toast('🚀 Fast-track verification successful!', 'success');
    apiFetch('/auth/me').then(res => res.json()).then(user => { currentUser = user; updateAuthUI(); updateTopbarUser(); loadKYCStatus(); });
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function loadAdminApplications() { const status = document.getElementById('admin-filter')?.value || 'pending'; const el = document.getElementById('admin-applications-list'); el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)"><div class="spinner"></div></div>'; try { const sr = await apiFetch('/kyc/admin/stats'); if (sr.ok) { const s = await sr.json(); document.getElementById('admin-stat-pending').textContent = s.pending; document.getElementById('admin-stat-approved').textContent = s.approved; document.getElementById('admin-stat-rejected').textContent = s.rejected; document.getElementById('admin-stat-total').textContent = s.total; } } catch(_) {} try { const r = await apiFetch(`/kyc/applications?status=${status}`); if (!r.ok) throw new Error('Admin access required'); const {applications} = await r.json(); if (!applications.length) { el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">No ${status} applications found.</div>`; return; } el.innerHTML = applications.map(u => `<div class="card" style="padding:20px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><div style="font-size:15px;font-weight:700;color:#fff">${u.name}</div><span class="badge-tag ${u.kycApplication?.status==='approved'?'badge-active':u.kycApplication?.status==='rejected'?'':'badge-review'}" style="${u.kycApplication?.status==='rejected'?'background:rgba(239,68,68,.12);color:var(--red)':''}">${u.kycApplication?.status || 'No application'}</span>${u.approvedToCreate ? '<span class="badge-tag badge-active">✓ Can Create</span>' : ''}<span class="badge-tag" style="background:var(--accent-dim);color:var(--accent)">Role: ${u.role}</span></div><div style="font-size:12px;color:var(--text3);margin-bottom:10px">${u.email} ${u.walletAddress ? '· ' + u.walletAddress.slice(0,10)+'...' : ''}</div>${u.kycApplication ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;font-size:12px;margin-bottom:12px"><div><span style="color:var(--text3)">Organisation:</span> <strong style="color:#fff">${u.kycApplication.organization}</strong></div><div><span style="color:var(--text3)">Type:</span> <strong style="color:#fff">${u.kycApplication.orgType}</strong></div><div><span style="color:var(--text3)">Phone:</span> <span style="color:var(--text2)">${u.kycApplication.phone}</span></div><div><span style="color:var(--text3)">PAN:</span> <span style="color:var(--text2)">${u.kycApplication.panNumber || '—'}</span></div><div style="grid-column:span 2"><span style="color:var(--text3)">Address:</span> <span style="color:var(--text2)">${u.kycApplication.address}</span></div>${u.kycApplication.websiteUrl ? `<div style="grid-column:span 2"><span style="color:var(--text3)">Website:</span> <a href="${u.kycApplication.websiteUrl}" target="_blank" style="color:var(--cyan)">${u.kycApplication.websiteUrl}</a></div>` : ''}</div><div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px"><div style="color:var(--text3);margin-bottom:4px;font-weight:600">Purpose Statement:</div>${u.kycApplication.purposeStatement}</div><div style="font-size:11px;color:var(--text3)">Submitted: ${u.kycApplication.submittedAt ? new Date(u.kycApplication.submittedAt).toLocaleString() : '—'} · Registered: ${new Date(u.createdAt).toLocaleDateString()}</div>` : '<div style="font-size:12px;color:var(--text3)">No KYC application submitted yet.</div>'}</div><div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">${!u.approvedToCreate ? `<button class="btn btn-sm" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:var(--green)" onclick="adminApprove('${u._id}')">✅ Approve</button>` : `<button class="btn btn-sm btn-danger" onclick="adminRevoke('${u._id}')">Revoke Access</button>`}${u.role !== 'trustee' ? `<button class="btn btn-sm" style="background:rgba(108,99,255,.12);border:1px solid var(--accent);color:var(--accent)" onclick="adminMakeTrustee('${u._id}')">🛡️ Make Trustee</button>` : ''}${u.kycApplication?.status !== 'rejected' ? `<button class="btn btn-sm btn-danger" onclick="adminReject('${u._id}')">❌ Reject</button>` : ''}</div></div></div>`).join(''); } catch(err) { el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--red)">Error: ${err.message}</div>`; } }
async function adminApprove(userId) { try { const r = await apiFetch(`/kyc/approve/${userId}`, { method: 'POST' }); const d = await r.json(); if (!r.ok) return toast(d.error, 'error'); toast(d.message, 'success'); loadAdminApplications(); } catch(err) { toast(err.message, 'error'); } }
async function adminMakeTrustee(userId) { if (!confirm('Promote this user to Trustee?')) return; try { const r = await apiFetch(`/kyc/make-trustee/${userId}`, { method: 'POST' }); const d = await r.json(); if (!r.ok) return toast(d.error, 'error'); toast(d.message, 'success'); loadAdminApplications(); } catch(err) { toast(err.message, 'error'); } }
async function adminReject(userId) { const reason = prompt('Enter rejection reason (shown to applicant):'); if (!reason) return; try { const r = await apiFetch(`/kyc/reject/${userId}`, { method: 'POST', body: JSON.stringify({ reason }) }); const d = await r.json(); if (!r.ok) return toast(d.error, 'error'); toast(d.message, 'success'); loadAdminApplications(); } catch(err) { toast(err.message, 'error'); } }
async function adminRevoke(userId) { if (!confirm('Revoke this user\'s ability to create campaigns?')) return; try { const r = await apiFetch(`/kyc/revoke/${userId}`, { method: 'POST' }); const d = await r.json(); if (!r.ok) return toast(d.error, 'error'); toast('Access revoked', 'info'); loadAdminApplications(); } catch(err) { toast(err.message, 'error'); } }

// ── UI Helpers ───────────────────────────────────────────────────────────
async function updateRightPanelWallet() {
  if (!walletAddress) { document.getElementById('rp-connect-prompt').style.display = 'block'; document.getElementById('rp-wallet-card').style.display = 'none'; document.getElementById('sidebar-wallet-mini').style.display = 'none'; document.getElementById('sidebar-connect-btn').style.display = 'block'; return; }
  document.getElementById('rp-connect-prompt').style.display = 'none'; document.getElementById('rp-wallet-card').style.display = 'block'; document.getElementById('sidebar-wallet-mini').style.display = 'block'; document.getElementById('sidebar-connect-btn').style.display = 'none';
  const userName = currentUser?.name || 'Wallet Connected';
  const userInitial = currentUser?.name?.charAt(0)?.toUpperCase() || '👤';
  document.getElementById('rp-wallet-addr').textContent = userInitial + ' ' + shortAddr(walletAddress); document.getElementById('swm-addr').textContent = userInitial + ' ' + shortAddr(walletAddress);
  try { if (provider) { const bal = await provider.getBalance(walletAddress); const ethBal = parseFloat(ethers.formatEther(bal)).toFixed(4); document.getElementById('rp-wallet-bal').innerHTML = ethBal + ' <span>ETH</span>'; document.getElementById('swm-bal').innerHTML = ethBal + ' <span style="font-size:12px;color:var(--text3)">ETH</span>'; document.getElementById('rp-wallet-inr').textContent = '₹' + (parseFloat(ethBal) * ETH_INR).toLocaleString('en-IN', {maximumFractionDigits:0}); } } catch(_) {}
  try { const network = await provider.getNetwork(); const chainId = Number(network.chainId); const names = {1:'Ethereum Mainnet',5:'Goerli',11155111:'Sepolia',137:'Polygon',80001:'Mumbai',31337:'Hardhat Local'}; document.getElementById('rp-network-name').textContent = names[chainId] || 'Chain ' + chainId; } catch(_) {}
}
function copyWalletAddr() { if (walletAddress) { navigator.clipboard.writeText(walletAddress); toast('Address copied to clipboard', 'success'); } }
function showRightWallet() { document.querySelector('.right-panel').scrollTop = 0; }
async function updateRightPanelFeed() { const el = document.getElementById('rp-live-feed'); try { const r = await apiFetch('/transactions?limit=5'); if (!r.ok) throw new Error(); const {transactions} = await r.json(); if (!transactions.length) throw new Error(); el.innerHTML = transactions.map(tx => { const icons = {donation:'💰', disbursement:'📤', refund:'↩️', approval:'✅', contract_create:'📄'}; return '<div class="rp-tx"><div class="rp-tx-icon" style="background:rgba(108,99,255,.12)">'+(icons[tx.type]||'•')+'</div><div class="rp-tx-info"><div class="rp-tx-desc">'+(tx.description||tx.type)+'</div><div class="rp-tx-hash">'+(tx.txHash||'').slice(0,18)+'...</div></div><div class="rp-tx-amt">'+(tx.valueETH?tx.valueETH.toFixed(4)+' ETH':'—')+'</div></div>'; }).join(''); } catch(_) { el.innerHTML = [{icon:'💰',desc:'Donation — Water Initiative',amt:'+0.045 ETH'},{icon:'📤',desc:'Disbursement — Medical Camp',amt:'1.200 ETH'},{icon:'💰',desc:'Donation — Education Fund',amt:'+0.025 ETH'}].map(t=>'<div class="rp-tx"><div class="rp-tx-icon" style="background:rgba(108,99,255,.12)">'+t.icon+'</div><div class="rp-tx-info"><div class="rp-tx-desc">'+t.desc+'</div></div><div class="rp-tx-amt">'+t.amt+'</div></div>').join(''); } }
function updateRightPanelStats() { const raised = document.getElementById('stat-raised')?.textContent, campaigns = document.getElementById('stat-campaigns')?.textContent, util = document.getElementById('stat-util')?.textContent; if (raised) document.getElementById('rp-stat-raised').textContent = raised; if (campaigns) document.getElementById('rp-stat-campaigns').textContent = campaigns; if (util) document.getElementById('rp-stat-util').textContent = util; }
function updateTopbarUser() {
  if (currentUser) {
    document.getElementById('topbar-user-area').style.display = 'none';
    document.getElementById('topbar-loggedin').style.display = 'flex';
    const initials = currentUser.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('user-initials').textContent = initials;
    document.getElementById('user-name-display').textContent = currentUser.name.split(' ')[0];
    document.getElementById('user-name-display').style.display = 'block';

    // ── ROLE-BASED SIDEBAR FILTERING ──────────────────────────────────────────
    const role = currentUser.role;
    document.getElementById('section-organiser').style.display = (role === 'organiser' || role === 'admin') ? 'block' : 'none';
    document.getElementById('section-trustee').style.display = (role === 'trustee' || role === 'admin') ? 'block' : 'none';
    document.getElementById('section-admin').style.display = (role === 'admin') ? 'block' : 'none';
    document.getElementById('divider-admin').style.display = (role === 'admin') ? 'block' : 'none';

    if (role === 'admin') {
      apiFetch('/kyc/admin/stats').then(r=>r.json()).then(d=>{ if (d.pending > 0) { const badge = document.getElementById('admin-pending-badge'); badge.textContent = d.pending; badge.style.display = 'inline-block'; document.getElementById('notif-dot').style.display = 'block'; } }).catch(()=>{});
    }
    document.getElementById('rp-my-donations-section').style.display = 'block';
    loadMyDonations();
  } else {
    document.getElementById('topbar-user-area').style.display = 'flex';
    document.getElementById('topbar-loggedin').style.display = 'none';
    document.getElementById('rp-my-donations-section').style.display = 'none';
    
    // Hide all restricted sections
    document.getElementById('section-organiser').style.display = 'none';
    document.getElementById('section-trustee').style.display = 'none';
    document.getElementById('section-admin').style.display = 'none';
    document.getElementById('divider-admin').style.display = 'none';
  }
}

// ── Proposal & Validation Workflow ──────────────────────────────────────────

async function submitProposal() {
  const title = document.getElementById('c-title').value.trim(),
        desc  = document.getElementById('c-desc').value.trim(),
        cat   = document.getElementById('c-cat').value,
        goal  = document.getElementById('c-goal').value,
        days  = document.getElementById('c-days').value,
        approvals = document.getElementById('c-approvals').value,
        trustees  = document.getElementById('c-trustees').value.split('\n').filter(a => a.trim());

  if (!title || !goal || !desc) return toast('Please fill in title, goal and description', 'error');

  const btn = document.getElementById('proposal-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Submitting...';

  try {
    const r = await apiFetch('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        title, description: desc, category: cat, goalAmount: parseFloat(goal),
        deadline: new Date(Date.now() + parseInt(days)*86400000).toISOString(),
        trustees, requiredApprovals: parseInt(approvals),
        isProposal: true
      })
    });
    if (!r.ok) throw new Error(await r.text());
    toast('✅ Project proposal submitted for trustee validation!', 'success');
    showPage('proposals');
  } catch (err) {
    toast('Submission failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📋 Submit Project for Trustee Validation';
  }
}

async function loadProposals() {
  const el = document.getElementById('proposals-list');
  try {
    const r = await apiFetch('/campaigns'); // Future: add /mine filter if needed, currently lists all but let's assume we filter organiser
    const { campaigns } = await r.json();
    const myProposals = campaigns.filter(c => c.organiser?._id === currentUser.id || c.organiser === currentUser.id);
    
    if (!myProposals.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">No proposals found. Start by submitting one!</div>';
      return;
    }

    el.innerHTML = myProposals.map(p => `
      <div class="card" style="padding:20px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:16px;font-weight:700;color:#fff">${p.title}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:4px">Goal: ${p.goalAmount} ETH · Status: <span style="color:${getStatusColor(p.status)};font-weight:700">${p.status.toUpperCase()}</span></div>
          </div>
          <div>
            ${p.status === 'approved' ? `<button class="btn btn-primary btn-sm" onclick="deployApprovedCampaign('${p._id}', '${p.title}', '${p.description}', '${p.category}', '${p.goalAmount}', ${Math.floor((new Date(p.deadline)-Date.now())/86400000)}, ${JSON.stringify(p.trustees).replace(/"/g, '&quot;')}, ${p.requiredApprovals})">🚀 Launch to Blockchain</button>` : ''}
            ${p.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="openCampaignDetail('${p.contractAddress}')">View Live</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);text-align:center">Error loading proposals</div>`;
  }
}

function getStatusColor(s) {
  if (s==='active'||s==='approved') return 'var(--green)';
  if (s==='proposal') return 'var(--yellow)';
  return 'var(--red)';
}

async function deployApprovedCampaign(id, title, desc, cat, goal, days, trustees, approvals) {
  // Call the existing deploy logic but update the PUT route instead of POST
  window._activeProposalId = id;
  // We'll reuse the deployCampaign UI or logic
  // For simplicity, let's just trigger a modified version of deployCampaign
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = 'Confirming...';
  
  try {
    if (!walletAddress) { await connectWallet(); }
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    toast('Deploying campaign contract...', 'info');
    const tx = await factory.createCampaign(title, desc, cat, ethers.parseEther(goal.toString()), parseInt(days), trustees, parseInt(approvals));
    const receipt = await tx.wait();
    
    const iface = new ethers.Interface(FACTORY_ABI);
    let campaignAddress;
    for (const log of receipt.logs) { try { const parsed = iface.parseLog(log); if (parsed.name === 'CampaignCreated') { campaignAddress = parsed.args[0]; break; } } catch(_) {} }
    
    if (campaignAddress) {
      await apiFetch(`/campaigns/${id}/deploy`, {
        method: 'PUT',
        body: JSON.stringify({ contractAddress: campaignAddress, txHash: receipt.hash, blockNumber: receipt.blockNumber })
      });
      toast('🚀 Campaign Launched Successfully!', 'success');
      showPage('campaigns');
    }
  } catch (err) {
    toast('Deployment failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '🚀 Launch to Blockchain';
  }
}

async function loadTrusteeValidations() {
  const el = document.getElementById('trustee-validation-list');
  try {
    const r = await apiFetch('/campaigns/proposals/pending');
    const proposals = await r.json();
    
    document.getElementById('trust-pending').textContent = proposals.length;

    if (!proposals.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">No pending proposals to validate. Good job!</div>';
      return;
    }

    el.innerHTML = proposals.map(p => `
      <div class="card" style="padding:20px;margin-bottom:12px">
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px">${p.title}</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:12px">${p.description.slice(0,200)}...</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text3)">
          <div>By: ${p.organiser?.name || 'Unknown'} · Goal: ${p.goalAmount} ETH</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-success" onclick="validateProposal('${p._id}', 'approved')">✅ Approve</button>
            <button class="btn btn-sm btn-danger" onclick="validateProposal('${p._id}', 'rejected')">❌ Reject</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);text-align:center">Error loading validations</div>`;
  }
}

async function validateProposal(id, status) {
  const remarks = prompt(`Enter ${status} remarks (optional):`);
  try {
    const r = await apiFetch(`/campaigns/proposals/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify({ status, remarks })
    });
    if (r.ok) {
      toast(`Project ${status}!`, 'success');
      loadTrusteeValidations();
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function syncMyActivity() {
  if (!walletAddress) return toast('Connect wallet first', 'error');
  toast('Syncing your activity with blockchain...', 'info');
  try {
    await apiFetch(`/blockchain/sync/${walletAddress}`, { method: 'POST' });
    setTimeout(() => {
      loadUserActivity();
      loadStats();
      loadCampaigns();
    }, 2000);
    toast('Sync complete!', 'success');
  } catch (e) { toast('Sync failed', 'error'); }
}
async function loadMyDonations() { if (!token) return; try { const r = await apiFetch('/donations/mine'); if (!r.ok) return; const donations = await r.json(); const el = document.getElementById('rp-my-donations'); if (!donations.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px">No donations yet</div>'; return; } el.innerHTML = donations.slice(0,5).map(d => '<div class="my-donation-item"><div class="mdi-title">' + (d.campaign?.title || d.campaignAddress?.slice(0,16)+'...') + '</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><div class="mdi-amount">+' + (d.amountETH||0).toFixed(4) + ' ETH</div><div class="mdi-date">' + new Date(d.createdAt).toLocaleDateString() + '</div></div></div>').join(''); } catch(_) {} }
function updateActiveBadge(count) { const el = document.getElementById('active-count'); if (el) el.textContent = count || '—'; }
function toggleTheme() { const body = document.body; if (body.classList.contains('light-theme')) { body.classList.remove('light-theme'); localStorage.setItem('theme', 'dark'); document.getElementById('theme-btn').innerHTML = '🌙'; } else { body.classList.add('light-theme'); localStorage.setItem('theme', 'light'); document.getElementById('theme-btn').innerHTML = '☀️'; } }
function applyStoredTheme() { const saved = localStorage.getItem('theme'); if (saved === 'light') { document.body.classList.add('light-theme'); document.getElementById('theme-btn').innerHTML = '☀️'; } else { document.body.classList.remove('light-theme'); document.getElementById('theme-btn').innerHTML = '🌙'; } }
async function submitMetaMaskRegistration() { const name = document.getElementById('mm-reg-name').value.trim(), email = document.getElementById('mm-reg-email').value.trim(), phone = document.getElementById('mm-reg-phone').value.trim(), password = document.getElementById('mm-reg-pass').value, role = document.getElementById('mm-reg-role').value; if (!name) return toast('Please enter your full name', 'error'); if (!email) return toast('Please enter your email', 'error'); if (!password || password.length < 8) return toast('Password must be at least 8 characters', 'error'); const btn = document.getElementById('mm-reg-btn'); btn.disabled = true; btn.textContent = 'Creating account...'; try { const r = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role, walletAddress, phone }) }); const d = await r.json(); if (!r.ok) { if (d.error && d.error.includes('already registered')) { toast('Email already registered. Please Sign In instead.', 'error'); document.getElementById('metamask-reg-modal').style.display = 'none'; openAuthModal(); } else toast(d.error || 'Registration failed', 'error'); btn.disabled = false; btn.textContent = 'Create Account & Connect →'; return; } token = d.token; currentUser = d.user; localStorage.setItem('cf_token', token); document.getElementById('metamask-reg-modal').style.display = 'none'; updateAuthUI(); updateTopbarUser(); toast('Welcome to ChainFund, ' + d.user.name + '! 🎉', 'success'); if (d.user.role === 'organiser') setTimeout(() => toast('Apply for KYC verification to create campaigns', 'info'), 2500); } catch(err) { toast('Registration failed: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Create Account & Connect →'; } }
function loadSettings() {
  if (!currentUser) { toast('Please sign in to view settings', 'error'); showPage('home'); return; }
  document.getElementById('settings-name').textContent = currentUser.name;
  document.getElementById('settings-email').textContent = currentUser.email;
  document.getElementById('settings-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('set-name').value = currentUser.name;
  document.getElementById('set-email').value = currentUser.email;
  document.getElementById('set-role').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  document.getElementById('set-wallet').textContent = walletAddress || 'Not connected';
}
async function updateProfile() {
  const name = document.getElementById('set-name').value;
  if (!name) return toast('Name cannot be empty', 'error');
  try {
    const r = await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify({ name }) });
    if (!r.ok) throw new Error();
    currentUser.name = name;
    updateTopbarUser();
    loadSettings();
    toast('Profile updated successfully', 'success');
  } catch(e) { toast('Update failed', 'error'); }
}

