# Project Analysis: ChainFund

ChainFund is a **Blockchain Fundraising SaaS** platform designed to offer transparent, real-time tracking of donations using Ethereum smart contracts, matched with a Node.js/MongoDB centralized orchestration layer.

## 🏗️ Architecture Overview

The project follows a standard Web3 hybrid approach: smart contracts for the core trust layer, a traditional backend for fast off-chain indexing and relationship management, and a lightweight Web3-enabled frontend.

### 1. Smart Contracts Layer (`/contracts`)
Written in Solidity (0.8.20+) and developed using the Hardhat framework.
- **`FundraisingFactory.sol`:** Acts as the decentralized registry. It creates (deploys) new individual campaign contracts and keeps track of them.
- **`FundraisingCampaign.sol`:** A per-campaign escrow contract acting as the decentralized vault. It enforces strong security patterns:
  - **Milestone-gated disbursements:** Funds are unlocked sequentially using M-of-N multi-signature approvals by designated trustees.
  - **Auto-Refunds:** Donors can automatically claim refunds if a goal isn’t met by its scheduled deadline.
  - **Platform Fee:** Embeds automatic deduction of a 2% platform fee upon successful disbursement.

### 2. Backend API Layer (`/backend`)
A centralized Node.js/Express API powered by **MongoDB / Mongoose**.
- **On-chain State Tracking:** Utilizes `ethers.js` (v6) alongside a dedicated blockchain listener service (`services/blockchainListener.js`) to index live transactions, maintaining a fast off-chain database replica.
- **Real-time Engine:** Employs **Socket.io** to emit live platform updates and transaction broadcasts back to clients for a responsive experience.
- **Standard Authentication:** Uses JWT tokens (`routes/auth.js`) for user sessions, paired with Web3 wallet linking.

### 3. Frontend Layer (`/frontend`)
The presentation layer is deployed as a massive Single-Page Application (SPA).
- Relies on **Vanilla HTML/JS**, housed inside a dense `index.html` file (141.6KB).
- **Web3 Integration:** Directly interfaces with **MetaMask** for signing transactions (donations) using the UMD version of `ethers.js`. 
- **Real-time updates:** Actively listens to WebSocket streams to refresh live metrics immediately after blockchain blocks are mined.

### 4. Infrastructure & Tooling
- **Docker/Containerization:** The repository comes packaged with a `Dockerfile` and `docker-compose.yml`, laying down the CI/CD groundwork for cloud execution. 
- **Documentation:** Robust setup and protocol guides including `FUNCTIONALITY.md`, `QUICK_REFERENCE.md`, `SETUP.md`, and `VALIDATION.md`.

---

> [!TIP]
> **Key Takeaway**
> The project successfully marries **immutable data** on the blockchain with a **high-performance web backend**. By delegating trust logic (escrow, refund logic) to the `contracts/` while pushing complex UI queries and live indexing to the `backend/`, the architecture retains standard SaaS scalability while remaining fundamentally transparent to the donor.
