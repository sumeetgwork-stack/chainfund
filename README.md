# ⛓️ ChainFund — Blockchain Fundraising SaaS

> **Every rupee tracked on the blockchain.** A full-stack SaaS platform where donors can verify, in real time, exactly where their money went — using Ethereum smart contracts, an Express + MongoDB backend, and a MetaMask-connected frontend.

---

## 🏗️ Architecture

```
chainfund/
├── contracts/                  ← Solidity smart contracts
│   ├── FundraisingFactory.sol  ← Deploys & tracks all campaigns
│   └── FundraisingCampaign.sol ← Per-campaign escrow + milestones
│
├── scripts/
│   └── deploy.js               ← Hardhat deploy script
│
├── backend/                    ← Node.js + Express API
│   ├── server.js               ← Entry point + WebSocket (Socket.io)
│   ├── models/index.js         ← MongoDB schemas (User, Campaign, Donation, Transaction)
│   ├── routes/
│   │   ├── auth.js             ← JWT auth (register/login/me)
│   │   ├── campaigns.js        ← Campaign CRUD + stats
│   │   ├── donations.js        ← Donation recording
│   │   ├── transactions.js     ← On-chain tx index
│   │   └── blockchain.js       ← Live on-chain reads
│   ├── services/
│   │   ├── blockchain.js       ← ethers.js provider + contract helpers
│   │   └── blockchainListener.js ← Real-time event indexer
│   └── middleware/
│       └── auth.js             ← JWT middleware
│
├── frontend/
│   └── index.html              ← Single-page app (MetaMask + Socket.io)
│
├── hardhat.config.js
├── package.json
└── .env.example
```

---

## ⚡ Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- MetaMask browser extension

### 1. Install dependencies

```bash
# Root (Hardhat + contracts)
npm install

# Backend
cd backend && npm install && cd ..
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your values (MongoDB URI, JWT secret, etc.)
```

### 3. Start local blockchain

```bash
# Terminal 1 — Hardhat local node (keeps running)
npx hardhat node
```

This gives you 20 funded test accounts. **Copy one private key** and add it to `.env` as `PRIVATE_KEY`.

### 4. Compile & deploy contracts

```bash
# Terminal 2
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

This will:
- Deploy `FundraisingFactory` contract
- Create a demo campaign
- Save addresses to `backend/deployedAddresses.json`
- Save ABIs to `backend/abis/`

### 5. Start the backend

```bash
# Terminal 3
cd backend && npm run dev
# → Running on http://localhost:5000
```

### 6. Open the frontend

```bash
# Option A: served by backend
open http://localhost:5000

# Option B: open directly
open frontend/index.html
```

### 7. Connect MetaMask

- Add **Hardhat Local** network to MetaMask:
  - Network name: `Hardhat Local`
  - RPC URL: `http://127.0.0.1:8545`
  - Chain ID: `31337`
  - Currency: `ETH`
- Import a test account using a private key from `npx hardhat node` output

---

## 🔗 Smart Contracts

### FundraisingFactory

Deploys individual campaign contracts and maintains a registry.

| Function | Description |
|---|---|
| `createCampaign(...)` | Deploy a new campaign smart contract |
| `getAllCampaigns()` | Get all campaign contract addresses |
| `getOrgCampaigns(address)` | Get campaigns by organiser |

**Event:** `CampaignCreated(address, organiser, title, category, goal, deadline, timestamp)`

---

### FundraisingCampaign

Per-campaign escrow with milestone-gated disbursements.

| Function | Description |
|---|---|
| `donate()` | Send ETH to the campaign (payable) |
| `addMilestone(desc, amount)` | Add a disbursement milestone |
| `approveMilestone(id)` | Trustee approves milestone (triggers release at M-of-N) |
| `requestDisbursement(recipient, amount)` | Direct disbursement (no milestones) |
| `claimRefund()` | Auto-refund if deadline passed & goal not met |
| `closeCampaign()` | Mark campaign as completed |
| `getCampaignInfo()` | Full campaign state view |

**Events:** `DonationReceived`, `FundsDisbursed`, `RefundIssued`, `MilestoneApproved`, `CampaignCompleted`

**Security features:**
- ✅ Multi-signature approval (M-of-N trustees)
- ✅ 2% platform fee auto-deducted on disbursement
- ✅ Auto-refund if goal not reached by deadline
- ✅ Immutable on-chain audit trail for every transaction

---

## 🌐 Backend API

Base URL: `http://localhost:5000/api`

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT token |
| GET | `/auth/me` | Get current user |
| PUT | `/auth/wallet` | Link wallet address |

### Campaigns
| Method | Endpoint | Description |
|---|---|---|
| GET | `/campaigns` | List campaigns (filter by category, active) |
| POST | `/campaigns` | Register campaign (after on-chain deploy) |
| GET | `/campaigns/:address` | Get campaign + live on-chain data |
| GET | `/campaigns/:address/donations` | Campaign donations |
| GET | `/campaigns/:address/transactions` | Campaign transactions |
| GET | `/campaigns/stats/platform` | Platform-wide statistics |

### Blockchain (live reads)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/blockchain/campaign/:address` | Live contract state |
| GET | `/blockchain/campaigns` | All campaign addresses from factory |
| GET | `/blockchain/blocks/recent` | Latest 5 blocks |
| GET | `/blockchain/eth-price` | ETH → INR rate |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| GET | `/transactions` | All indexed transactions |
| GET | `/transactions/:hash` | Transaction detail |

---

## 🌍 Deploy to Testnet (Sepolia)

1. Get Sepolia ETH from faucet: https://sepoliafaucet.com
2. Get an Infura/Alchemy API key
3. Update `.env`:
   ```
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
   PRIVATE_KEY=your_actual_private_key
   ```
4. Deploy:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```
5. Verify on Etherscan:
   ```bash
   npx hardhat verify --network sepolia FACTORY_ADDRESS PLATFORM_WALLET_ADDRESS
   ```

---

## 🚀 Production Deployment

### Backend (Railway / Render / EC2)
```bash
# Set environment variables in your platform
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<strong-random-secret>
RPC_URL=https://mainnet.infura.io/v3/...
```

### Frontend
- Already served by the Express backend at `/`
- Or deploy `frontend/index.html` to Vercel / Netlify / IPFS

### Database
- MongoDB Atlas (free tier works for small volume)
- Connection string in `MONGODB_URI`

---

## 🔒 Security Notes

- **Never commit `.env` or private keys to git** — add `.env` to `.gitignore`
- Use a **dedicated deployer wallet** with only enough ETH for gas
- For production: integrate Chainlink oracle for live ETH/INR rate
- Smart contracts should be audited before mainnet deployment (CertiK, Trail of Bits, etc.)
- Enable rate limiting and HTTPS in production

---

## 🧪 Running Tests

```bash
npx hardhat test
```

Sample test cases cover:
- Campaign creation and donation
- Milestone approval and disbursement
- Auto-refund on expired campaigns
- Multi-sig enforcement

---

## 📦 Tech Stack

| Layer | Tech |
|---|---|
| **Smart Contracts** | Solidity 0.8.20, Hardhat, OpenZeppelin patterns |
| **Blockchain** | Ethereum (Hardhat local / Sepolia / Mainnet) |
| **Backend** | Node.js, Express, MongoDB, Mongoose |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Real-time** | Socket.io (WebSocket for live tx feed) |
| **Web3** | ethers.js v6 |
| **Frontend** | Vanilla JS + ethers.js UMD + Socket.io |
| **Wallet** | MetaMask (EIP-1193) |

---

## 📄 License

MIT — Build freely, donate transparently.
