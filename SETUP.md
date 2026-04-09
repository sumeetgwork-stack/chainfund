# ChainFund - Full Setup & Deployment Guide

Welcome to **ChainFund** — blockchain-powered transparent fundraising. This guide will walk you through setting up the entire system locally and deploying to testnets.

---

## 📋 Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **MongoDB** (local or [Atlas](https://www.mongodb.com/cloud/atlas)) 
- **MetaMask** browser extension ([install](https://metamask.io))
- **Git** for version control
- Basic understanding of blockchain & smart contracts

---

## 🚀 Quick Start (Local Development)

### 1. Clone and Install Dependencies

```bash
git clone <repo-url>
cd chainfund
npm run install:all
```

This installs both root and backend dependencies.

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
RPC_URL=http://127.0.0.1:8545           # Hardhat local node
MONGODB_URI=mongodb://localhost:27017/chainfund
JWT_SECRET=your_secret_key_here_32_chars_minimum
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Test key (DO NOT USE FOR MAINNET!)
ETH_INR_RATE=220000                     # ETH to INR conversion rate
```

### 3. Compile Solidity Contracts

```bash
npm run compile
```

Output should be in `backend/artifacts/`.

### 4. Start Local Blockchain Node

Open **Terminal 1**:

```bash
npm run node
```

This starts a Hardhat local network on `http://127.0.0.1:8545`

### 5. Deploy Smart Contracts

Open **Terminal 2**:

```bash
npm run deploy:local
```

Expected output:
```
✅ FundraisingFactory deployed to: 0x...
📄 Addresses saved to backend/deployedAddresses.json
📄 ABIs saved to backend/abis/
✅ Demo campaign created
Campaign address: 0x...
```

### 6. Create Admin Account

```bash
node scripts/createAdmin.js
```

Admin credentials:
- Email: `admin@chainfund.io`
- Password: `Admin@123456`

**⚠️ Change password after first login!**

### 7. Start Backend Server

Open **Terminal 3**:

```bash
npm run backend
```

Expected output:
```
✅ MongoDB connected
👂 Listening to campaign: 0x...
🚀 ChainFund backend running on http://localhost:5000
```

### 8. Open Frontend

Visit: **[http://localhost:5000](http://localhost:5000)**

---

## 💰 Add Test ETH to MetaMask

1. MetaMask → Network → Localhost 8545
2. Copy an address from Hardhat output (press 'Ctrl+L' in Hardhat terminal)
3. Get test ETH: `npx hardhat faucet 0x... --network localhost`

---

## 📱 Testing the Platform

### Register & Sign In

1. Click **"Sign Up"** → Fill form → Create account
2. Or connect via **MetaMask** wallet

### Create a Campaign

1. Dashboard → **"Deploy Campaign"**
2. Fill in campaign details:
   - Title, description, category
   - Goal amount (e.g., 0.5 ETH)
   - Duration (60 days)
   - Trustees (leave blank for self)
3. Click **"Deploy"** → Confirm in MetaMask

### Donate

1. **"Browse Campaigns"** → Select campaign
2. Enter ETH amount → Click **"Donate"**
3. Confirm in MetaMask
4. Real-time balance updates + transaction history

### Admin Panel

1. Admin account → **"Admin Panel"**
2. Review KYC applications
3. Approve/reject organizers

---

## 🌐 Deploy to Testnet

### Deploy to Sepolia (Ethereum Testnet)

1. Get Sepolia test ETH from [faucet](https://sepoliafaucet.com)
2. Update `.env`:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=0x... # Your testnet deployer key
```

3. Deploy contracts:

```bash
npm run deploy:sepolia
```

4. Update `backend/deployedAddresses.json` with new factory address

5. Restart backend:

```bash
npm run backend
```

### Deploy to Mumbai (Polygon Testnet)

Same process as Sepolia, but:

```bash
npm run deploy:mumbai
```

---

## 🐳 Docker Deployment (Production)

### Build Docker Image

```bash
docker build -t chainfund:latest .
```

### Run with Docker Compose

```bash
docker-compose up -d
```

---

## 📊 Database Backup & Restore

### MongoDB Backup

```bash
mongodump --db chainfund --out ./backup
```

### Restore

```bash
mongorestore --db chainfund ./backup/chainfund
```

---

## 🔐 Security Checklist

- [ ] Change `JWT_SECRET` to a random 32+ character string
- [ ] Never commit `.env` or private keys to Git
- [ ] Use environment variables for all secrets
- [ ] Enable MongoDB authentication in production
- [ ] Migrate from test RPC to production Infura/Alchemy keys
- [ ] Use a hardware wallet for mainnet deployments
- [ ] Verify smart contracts on Etherscan
- [ ] Implement rate limiting (already in place)
- [ ] Set up HTTPS/SSL in production
- [ ] Regular security audits

---

## 🧪 Running Tests

### Smart Contract Tests

```bash
npm test
```

### Backend Tests (if Jest configured)

```bash
cd backend && npm test
```

---

## 📈 Monitoring & Logs

### Check Blockchain Events

All transactions are logged to console and MongoDB in real-time.

### Monitor Backend

```bash
pm2 start npm --name "chainfund-backend" -- run backend
pm2 logs chainfund-backend
```

---

## ❓ Troubleshooting

### "deployedAddresses.json not found"
→ Run `npm run deploy:local` first

### "MongoDB connection failed"
→ Ensure MongoDB is running: `mongod`

### "MetaMask not finding contract"
→ Make sure network in MetaMask is set to correct RPC URL

### "Transaction failed: not enough gas"
→ Increase gas price in Hardhat config or use test accounts with more ETH

### "Port 5000 already in use"
→ `lsof -i :5000` → `kill -9 <PID>` (or change PORT in `.env`)

---

## 📚 Project Structure

```
chainfund/
├── contracts/                    # Solidity smart contracts
│   ├── FundraisingFactory.sol   # Campaign deployer
│   └── FundraisingCampaign.sol  # Individual campaign logic
├── backend/
│   ├── server.js                # Express app + WebSocket
│   ├── routes/                  # API endpoints
│   ├── models/                  # MongoDB schemas
│   ├── services/                # Blockchain interaction
│   ├── middleware/              # Auth, CORS, etc.
│   └── abis/                    # Contract ABIs
├── frontend/
│   └── index.html               # Single-page app
├── scripts/
│   ├── deploy.js                # Contract deployment
│   └── createAdmin.js           # Admin setup
├── test/
│   └── Campaign.test.js         # Smart contract tests
└── hardhat.config.js            # Hardhat configuration
```

---

## 🔄 Continuous Integration

Set up GitHub Actions for:
- Smart contract compilation
- Unit test execution
- Contract deployment to testnets (on push to `main`)
- Frontend build verification

---

## 📞 Support

For issues, questions, or contributions:
- Create a GitHub issue
- Contact: dev@chainfund.io
- Community: [Discord](#)

---

## 📄 License

MIT License — See LICENSE file for details.

---

## 🎉 You're All Set!

Your ChainFund instance is now live. Start creating transparent, blockchain-verified fundraising campaigns!

**Remember:** Every rupee tracked on the blockchain. ⛓️
