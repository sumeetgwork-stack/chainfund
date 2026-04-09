# 🚀 ChainFund - Blockchain Fundraising Platform

> **Every rupee tracked on the blockchain.** A full-stack, production-ready SaaS platform where donors verify—in real time—exactly where their money went.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-brightgreen)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📖 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [Technology Stack](#-technology-stack)
- [API Documentation](#-api-documentation)
- [Smart Contracts](#-smart-contracts)
- [Contributing](#-contributing)
- [Support](#-support)

---

## ⭐ Features

### 🏗️ Smart Contracts
- **Factory Pattern** - Deploys individual campaign contracts
- **Escrow & Multi-Sig** - Trustees approve fund releases
- **Milestone-Based Release** - Funds only disbursed when milestones approved
- **Auto-Refund** - Automatic refunds if goal not met
- **Platform Fee** - 2% deducted on disbursements
- **Real-time Events** - All transactions broadcast via WebSocket

### 🔐 Backend
- **JWT Authentication** - Secure API access
- **Wallet Integration** - MetaMask sign-in
- **KYC Workflow** - Admin approval system for campaigns
- **Real-time Indexing** - Blockchain events synced to database
- **Rate Limiting** - DDoS protection
- **WebSocket** - Live transaction feed

### 🎨 Frontend
- **SPA (Single Page App)** - Fast, responsive UI
- **Campaign Management** - Browse, filter, create campaigns
- **Donation Interface** - MetaMask-integrated donations
- **Dashboard** - Real-time fund tracking
- **Block Explorer** - Search transactions
- **Admin Panel** - KYC review & approval
- **Light/Dark Theme** - User preference support

### 📊 Database
- **User Management** - Profiles, KYC, roles
- **Campaign Metadata** - Off-chain campaign info
- **Donation Records** - Full donation history
- **Transaction Index** - Complete on-chain event log

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- MetaMask browser extension

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd chainfund

# 2. Install dependencies
npm run install:all

# 3. Copy environment template
cp .env.example .env
# Edit .env with your configuration

# 4. Compile smart contracts
npm run compile
```

### Local Development

**Terminal 1 - Blockchain Node:**
```bash
npm run node
```

**Terminal 2 - Deploy Contracts:**
```bash
npm run deploy:local
node scripts/createAdmin.js
```

**Terminal 3 - Backend Server:**
```bash
npm run backend
```

**Browser:**
```
Open http://localhost:5000
```

---

## 📂 Project Structure

```
chainfund/
├── contracts/
│   ├── FundraisingFactory.sol      # Campaign factory
│   └── FundraisingCampaign.sol     # Individual campaign logic
├── backend/
│   ├── server.js                   # Express + Socket.io
│   ├── routes/
│   │   ├── auth.js                 # Authentication endpoints
│   │   ├── campaigns.js            # Campaign CRUD
│   │   ├── donations.js            # Donation recording
│   │   ├── transactions.js         # Transaction history
│   │   ├── blockchain.js           # On-chain reads
│   │   └── kyc.js                  # KYC workflows
│   ├── models/
│   │   └── index.js                # MongoDB schemas
│   ├── services/
│   │   ├── blockchain.js           # ethers.js provider
│   │   └── blockchainListener.js   # Event indexer
│   ├── middleware/
│   │   └── auth.js                 # JWT verification
│   └── abis/                       # Contract ABIs
├── frontend/
│   └── index.html                  # Single-page app
├── scripts/
│   ├── deploy.js                   # Contract deployment
│   └── createAdmin.js              # Admin setup
├── test/
│   └── Campaign.test.js            # Unit tests
├── Dockerfile                      # Container image
├── docker-compose.yml              # Full stack orchestration
├── SETUP.md                        # Deployment guide
├── VALIDATION.md                   # Testing checklist
└── FUNCTIONALITY.md                # Feature list
```

---

## 🌐 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

This starts:
- MongoDB (with authentication)
- Backend API (port 5000)
- Full frontend

### Testnet Deployment

```bash
# Sepolia Ethereum
npm run deploy:sepolia

# Polygon Mumbai
npm run deploy:mumbai
```

See [SETUP.md](SETUP.md) for detailed instructions.

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Solidity 0.8.20, Ethereum/Polygon |
| **Smart Contracts** | Hardhat, ethers.js |
| **Backend** | Node.js, Express, MongoDB |
| **Real-time** | Socket.io, WebSocket |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Authentication** | JWT, MetaMask |
| **DevOps** | Docker, Docker Compose |

---

## 📡 API Documentation

### Authentication

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/login-wallet
GET  /api/auth/me
PUT  /api/auth/wallet
```

### Campaigns

```
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:address
GET    /api/campaigns/:address/donations
GET    /api/campaigns/:address/transactions
GET    /api/campaigns/stats/platform
```

### Donations

```
POST   /api/donations
GET    /api/donations/mine
```

### Transactions

```
GET    /api/transactions
GET    /api/transactions/:hash
```

### Blockchain

```
GET    /api/blockchain/campaign/:address
GET    /api/blockchain/campaigns
GET    /api/blockchain/eth-price
GET    /api/blockchain/blocks/recent
```

### KYC & Admin

```
POST   /api/kyc/apply
GET    /api/kyc/status
GET    /api/kyc/applications
POST   /api/kyc/approve/:userId
POST   /api/kyc/reject/:userId
POST   /api/kyc/revoke/:userId
GET    /api/kyc/admin/stats
```

### Config & Health

```
GET    /config
GET    /api/health
```

---

## 🔗 Smart Contracts

### FundraisingFactory

Deploys individual campaign contracts.

```solidity
function createCampaign(
  string calldata _title,
  string calldata _description,
  string calldata _category,
  uint256 _goalAmount,
  uint256 _durationDays,
  address[] calldata _trustees,
  uint256 _requiredApprovals
) external returns (address);
```

### FundraisingCampaign

Individual campaign with escrow and milestone support.

```solidity
function donate() external payable
function addMilestone(string calldata _desc, uint256 _targetAmount) external
function approveMilestone(uint256 _milestoneId) external
function claimRefund() external
function closeCampaign() external onlyOrganiser
```

---

## 🧪 Testing

### Smart Contract Tests

```bash
npm test
```

### Manual Testing

See [VALIDATION.md](VALIDATION.md) for complete test checklist.

---

## 🔐 Security

- ✅ JWT authentication with 7-day expiry
- ✅ Password hashing with bcrypt
- ✅ Rate limiting (200 req/15 min)
- ✅ CORS configured for all origins
- ✅ Smart contract audit recommended before mainnet
- ✅ Environment variables for all secrets
- ✅ MongoDB connection authentication

### Pre-Production Checklist

- [ ] Change `JWT_SECRET` to random 32+ char string
- [ ] Change MongoDB admin password
- [ ] Use production RPC URLs (Infura/Alchemy)
- [ ] Enable HTTPS/SSL
- [ ] Set up monitoring (Sentry/LogRocket)
- [ ] Security audit smart contracts
- [ ] Configure backup strategy
- [ ] Load testing (k6/Artillery)

---

## 📞 Support

- 📚 **Documentation**: See [SETUP.md](SETUP.md), [VALIDATION.md](VALIDATION.md)
- 🐛 **Issues**: [GitHub Issues](#)
- 💬 **Community**: [Discord](#)
- 📧 **Email**: dev@chainfund.io

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Ethereum Foundation for Solidity
- OpenZeppelin for contract patterns
- Hardhat team for development tools
- MetaMask for wallet integration

---

## 🎯 Roadmap

- [ ] Governance token (DAO)
- [ ] Multi-chain deployment (Arbitrum, Optimism)
- [ ] Apple Pay / Google Pay integration
- [ ] Real-time notifications (push, email)
- [ ] Campaign analytics dashboard
- [ ] Batch donations
- [ ] AML/CFT compliance layer
- [ ] Mobile app (React Native)

---

**Ready to build transparent, blockchain-verified fundraising? Let's go! ⛓️**

```bash
npm run install:all && npm run compile && npm run node
# In another terminal:
npm run deploy:local && node scripts/createAdmin.js
# In another terminal:
npm run backend
# Then open http://localhost:5000
```
