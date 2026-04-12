# ChainFund Project Report

## 1. Introduction
In recent years, crowdfunding and charitable donations have seen massive growth, but they are consistently plagued by a fundamental flaw: **a lack of transparency**. Once a donor contributes to a campaign on conventional platforms, they lose all visibility into how their funds are utilized. 

**ChainFund** is a decentralized, Web3-powered fundraising platform designed to solve this trust deficit. By leveraging blockchain technology and smart contracts, ChainFund ensures that every transaction is immutable, public, and verifiable. It introduces a trustless ecosystem where funds are only disbursed when pre-defined, community-validated milestones are met, fundamentally shifting power back to the donors.

## 2. Objective & Scope

### Objective
The primary objective of ChainFund is to create a secure, transparent, and accountable ecosystem for fundraising. The platform aims to eliminate fraudulent campaigns and fund mismanagement by enforcing cryptographic rules on how and when money can be spent.

### Scope
The project encompasses a full-stack Web3 web application with the following scope:
*   **Smart Contracts:** Development of robust Solidity contracts deployed on the Ethereum (Sepolia) blockchain.
*   **Web3 Integration:** MetaMask wallet connection for signing transactions and transferring Ethereum (ETH).
*   **Role-Based Access Control:** Explicit platform roles including **Admins** (for KYC), **Organisers** (campaign creators), **Trustees** (independent validators), and **Donors** (contributors).
*   **Hybrid Architecture:** Synchronized Web2 database (MongoDB) for fast UI rendering, paired with a Web3 backbone as the ultimate source of truth.

## 3. Literature Survey, Limitations of Existing Systems & Problem Statement

### Literature Survey & Existing Systems
Traditional centralized platforms like GoFundMe, Kickstarter, and conventional NGOs rely entirely on trust. Users trust the platform and the campaign organiser to act honestly. 

### Limitations of Existing Systems
*   **Centralized Control & Censorship:** Central authorities can freeze funds or de-platform organisers arbitrarily.
*   **High Fees:** Intermediaries charge heavy percentage fees on donations.
*   **Post-Campaign Opacity (The "Black Hole"):** Donors have zero technical guarantees that their funds will actually be used for the stated cause after the withdrawal.
*   **Prevalence of Scams:** It is very easy to create fake identities and misappropriate funds.

### Problem Statement
*"How can we build a fundraising ecosystem that guarantees cryptographic proof of fund allocation, eliminates reliance on centralized trust, and prevents campaign organisers from misusing donated capital?"*

## 4. System Design and Architecture

ChainFund utilizes a **Hybrid Web2/Web3 Architecture** to balance decentralization with a smooth user experience.

*   **Frontend (User Interface):** Built using highly optimized HTML, CSS, and Vanilla JavaScript. It uses `ethers.js` to communicate with the user's MetaMask wallet and the Ethereum blockchain directly from the browser.
*   **Backend (API & Indexer):** A Node.js & Express server. It handles off-chain operations like user sessions, KYC document uploads, and proposal drafts. It includes a specialized indexer that listens to smart contract events on the blockchain and mirrors the verified data to the database.
*   **Database:** MongoDB. Used strictly as a read-only cache for fast dashboard loading and to store off-chain metadata (like email addresses and KYC details).
*   **Smart Contracts (Solidity):**
    *   `FundraisingFactory.sol`: The master contract that acts as a registry. It strictly controls who can deploy campaigns (only Admin-whitelisted wallets).
    *   `FundraisingCampaign.sol`: The escrow contract generated for each individual campaign. It holds the ETH securely.

## 5. Proposed Methodology & Implementation Details

ChainFund combats fraud using three major technical methodologies:

### A. Strict KYC & On-Chain Whitelisting
Before creating a campaign, an Organiser must submit their organizational details directly to a platform Admin. Once the Admin approves, the backend triggers an on-chain transaction (`setOrganiserAuthorization`) to the Factory contract. The blockchain will inherently block any non-whitelisted wallet from deploying a campaign.

### B. Multi-Sig Trustee Validation
To prevent spam, Organisers cannot deploy instantly. They must first submit a "Proposal" draft. This draft is sent to specialized **Trustees**. Only after a required threshold (M-of-N) of Trustees review and digitally sign the proposal will the system allow the Organiser to push the contract to the blockchain.

### C. Milestone-Based Disbursement
ChainFund replaces lump-sum withdrawals with conditional, milestone-based escrow. 
1. The Organiser breaks the project into distinct milestones (e.g., 20% for Foundation, 50% for Construction, 30% for Polish).
2. As donations arrive, they are locked inside the Smart Contract.
3. Once a milestone is physically completed, the Organiser requests a payout.
4. **Trustees** must cryptographic vote to verify the completion of the work.
5. Upon reaching the approval threshold, the Smart Contract automatically releases only the specific milestone fraction of the funds. 

## 6. Conclusion
ChainFund successfully demonstrates how blockchain technology can be applied to real-world social impact. By interlocking strict KYC verification, Multi-Signature Trustee approvals, and absolute Smart Contract-enforced milestones, it strips away the necessity of blind trust. It provides donors with total peace of mind, knowing their contributions are cryptographically protected and undeniably traced to real-world results.
