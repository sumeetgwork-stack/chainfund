# 🚀 ChainFund - Developer Quick Reference

## 📋 Essential Commands

```bash
# Setup
npm run install:all              # Install all dependencies
npm run compile                  # Compile Solidity contracts

# Development (3 terminals)
npm run node                     # Terminal 1: Hardhat blockchain
npm run deploy:local             # Terminal 2: Deploy contracts
node scripts/createAdmin.js      # Terminal 2: Create admin
npm run backend                  # Terminal 3: Start backend

# Testing
npm test                         # Run smart contract tests
npm run backend:test             # Run backend tests (if configured)

# Deployment
npm run deploy:sepolia           # Deploy to Sepolia testnet
npm run deploy:mumbai            # Deploy to Mumbai testnet

# Docker
docker-compose up -d             # Start full stack
docker-compose down              # Stop full stack
```

---

## 🔑 Default Accounts (Local)

**Admin Account** (created by script):
- Email: `admin@chainfund.io`
- Password: `Admin@123456`

**Hardhat Test Accounts** (in terminal where `npm run node` runs):
- Account 0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- All test accounts have 10,000 ETH

---

## 🌐 Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Email login |
| `POST` | `/api/auth/login-wallet` | Wallet login |
| `GET` | `/api/campaigns` | List campaigns |
| `POST` | `/api/campaigns` | Create campaign |
| `GET` | `/api/campaigns/:address` | Campaign details |
| `GET` | `/config` | Contract addresses |
| `GET` | `/api/health` | Health check |

---

## 🗄️ Database

```bash
# View MongoDB
mongosh localhost:27017/chainfund

# Collections:
db.users.find()
db.campaigns.find()
db.donations.find()
db.transactions.find()

# Clear all
db.dropDatabase()
```

---

## 🔐 Environment Variables

Most important:
```
RPC_URL=http://127.0.0.1:8545
MONGODB_URI=mongodb://localhost:27017/chainfund
JWT_SECRET=your_random_32_char_secret_here
ETH_INR_RATE=220000
```

---

## 🎨 Frontend Paths

| Path | Component |
|------|-----------|
| `/` | Home page |
| `?page=campaigns` | Campaign listing |
| `?page=dashboard` | Dashboard |
| `?page=create` | Create campaign |
| `?page=kyc` | KYC form |
| `?page=admin` | Admin panel |

---

## 📱 Frontend Pages

1. **Home** - Landing page with stats
2. **Campaigns** - Browse & filter campaigns
3. **Campaign Detail** - Modal with donation form
4. **Dashboard** - Metrics, fund tracker
5. **Explorer** - Block & transaction search
6. **Create Campaign** - SmartContract deployment
7. **KYC** - Verification form
8. **Admin Panel** - KYC review (admin only)

---

## 🔗 Contract Networks

```javascript
Localhost:  http://127.0.0.1:8545
Sepolia:    https://sepolia.infura.io/v3/YOUR_KEY
Mumbai:     https://polygon-mumbai.infura.io/v3/YOUR_KEY
```

---

## 📊 Key Flows

### User Registration → Campaign Creation
1. User signs up via email or MetaMask
2. User completes KYC application
3. Admin approves in Admin Panel
4. User can now deploy campaigns

### Donation Flow
1. User connects MetaMask wallet
2. Browse campaigns
3. Click donate → enter amount
4. Confirm in MetaMask
5. Transaction broadcasts
6. Real-time update in dashboard

### Admin Workflow
1. Log in with admin account
2. Admin Panel → Review applications
3. Approve/Reject users
4. User gets notification
5. Approved user can create campaigns

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 8545 in use | `lsof -i :8545` → `kill -9 <PID>` |
| Port 5000 in use | Change `PORT` in `.env` |
| MongoDB not running | Start: `mongod` |
| Cannot find deployedAddresses.json | Run `npm run deploy:local` |
| MetaMask not finding network | Add network: localhost:8545 |
| Insufficient funds | Use Hardhat test account or faucet |

---

## 📝 Smart Contract Functions

**Factory**
```solidity
factory.createCampaign(title, desc, category, goal, days, trustees, approvals)
factory.getAllCampaigns()
factory.getOrgCampaigns(organiser)
```

**Campaign**
```solidity
campaign.donate() // Send ETH
campaign.addMilestone(description, target)
campaign.approveMilestone(id)
campaign.claimRefund()
campaign.getCampaignInfo()
campaign.getMilestone(id)
```

---

## 🐳 Docker Cheatsheet

```bash
# Build
docker build -t chainfund:latest .

# Run
docker-compose up -d
docker-compose logs -f backend
docker-compose down

# Access DB
docker exec chainfund-db mongosh
```

---

## 🧪 Testing Checklist

- [ ] User registration works
- [ ] MetaMask connection works
- [ ] Campaign creation deploys contract
- [ ] Donation sends transaction
- [ ] Admin can approve KYC
- [ ] Dashboard updates in real-time
- [ ] Explorer search works
- [ ] Light/Dark theme toggles

---

## 📞 Quick Links

- Contracts: `./contracts/`
- Backend: `./backend/`
- Frontend: `./frontend/index.html`
- Docs: `./SETUP.md`, `./VALIDATION.md`
- Tests: `./test/Campaign.test.js`

---

**Last Updated:** April 2026
**Status:** ✅ Fully Functional
