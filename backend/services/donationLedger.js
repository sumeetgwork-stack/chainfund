// services/donationLedger.js — Interact with DonationLedger smart contract
const { ethers } = require("ethers");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");

let _ledgerContract = null;

/**
 * Get the DonationLedger contract instance (read-only)
 */
function getLedgerContract() {
  if (_ledgerContract) return _ledgerContract;

  const { getProvider } = require("./blockchain");
  const provider = getProvider();
  if (!provider) throw new Error("No blockchain provider available");

  const ledgerAddress = process.env.DONATION_LEDGER_ADDRESS;
  if (!ledgerAddress) throw new Error("DONATION_LEDGER_ADDRESS not set in environment");

  const abiFile = path.join(__dirname, "../abis/DonationLedger.json");
  const artifactFile = path.join(__dirname, "../artifacts/contracts/DonationLedger.sol/DonationLedger.json");

  let abi;
  if (fs.existsSync(abiFile)) {
    abi = JSON.parse(fs.readFileSync(abiFile));
  } else if (fs.existsSync(artifactFile)) {
    const artifact = JSON.parse(fs.readFileSync(artifactFile));
    abi = artifact.abi;
  } else {
    throw new Error("DonationLedger ABI not found — run 'npx hardhat compile' first");
  }
  _ledgerContract = new ethers.Contract(ledgerAddress, abi, provider);
  return _ledgerContract;
}

/**
 * Get a signer-connected DonationLedger contract (for write operations)
 */
function getLedgerWithSigner() {
  const contract = getLedgerContract();
  const { getAdminSigner } = require("./blockchain");
  const signer = getAdminSigner();
  return contract.connect(signer);
}

/**
 * Generate proof hash for a fiat donation
 * SHA-256 of: razorpayPaymentId + campaignAddress + amountPaise + timestamp
 *
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} campaignAddress - Campaign contract address
 * @param {number} amountPaise - Amount in paise
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string} 0x-prefixed bytes32 hash
 */
function generateProofHash(paymentId, campaignAddress, amountPaise, timestamp) {
  const data = `${paymentId}:${campaignAddress.toLowerCase()}:${amountPaise}:${timestamp}`;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  return "0x" + hash;
}

/**
 * Generate hash of payment ID (for duplicate prevention on-chain)
 */
function hashPaymentId(paymentId) {
  const hash = crypto.createHash("sha256").update(paymentId).digest("hex");
  return "0x" + hash;
}

/**
 * Record a fiat donation proof on the blockchain
 *
 * @param {Object} donationData
 * @param {string} donationData.paymentId - Razorpay payment ID
 * @param {string} donationData.campaignAddress - Campaign contract address
 * @param {number} donationData.amountPaise - Amount in paise (₹500 = 50000)
 * @param {string} donationData.currency - "INR" or "USD"
 * @param {number} donationData.timestamp - Unix timestamp
 * @returns {Object} { txHash, donationId, proofHash }
 */
async function recordOnChain(donationData) {
  const { paymentId, campaignAddress, amountPaise, currency, timestamp } = donationData;

  const proofHash     = generateProofHash(paymentId, campaignAddress, amountPaise, timestamp);
  const paymentIdHash = hashPaymentId(paymentId);

  try {
    const ledger = getLedgerWithSigner();

    // Check if already recorded
    const alreadyRecorded = await ledger.isPaymentRecorded(paymentIdHash);
    if (alreadyRecorded) {
      console.log(`⚠️ Payment ${paymentId} already recorded on-chain, skipping`);
      return { alreadyRecorded: true, proofHash };
    }

    // Record on-chain
    const tx = await ledger.recordDonation(
      proofHash,
      paymentIdHash,
      campaignAddress || ethers.ZeroAddress,
      amountPaise,
      currency || "INR"
    );

    console.log(`⛓️ Recording fiat donation on-chain... TX: ${tx.hash}`);
    const receipt = await tx.wait();

    // Parse the event to get the donationId
    let donationId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = ledger.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "FiatDonationRecorded") {
          donationId = Number(parsed.args.donationId);
          break;
        }
      } catch (_) { /* not our event */ }
    }

    console.log(`✅ Fiat donation recorded on-chain! ID: ${donationId}, TX: ${tx.hash}`);

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      donationId,
      proofHash,
      alreadyRecorded: false
    };
  } catch (err) {
    console.error("❌ Failed to record donation on-chain:", err.message);
    // Don't throw — fiat payment was already successful, on-chain recording is supplementary
    return {
      error: err.message,
      proofHash,
      txHash: null,
      donationId: null,
      alreadyRecorded: false
    };
  }
}

/**
 * Verify a donation against on-chain proof
 *
 * @param {number} donationId - On-chain donation ID
 * @param {string} paymentId - Original Razorpay payment ID
 * @param {string} campaignAddress - Campaign contract address
 * @param {number} amountPaise - Amount in paise
 * @param {number} timestamp - Original Unix timestamp
 * @returns {Object} { verified, onChainData }
 */
async function verifyOnChain(donationId, paymentId, campaignAddress, amountPaise, timestamp) {
  try {
    const ledger = getLedgerContract();
    const proofHash = generateProofHash(paymentId, campaignAddress, amountPaise, timestamp);

    const isValid = await ledger.verifyDonation(donationId, proofHash);
    const onChainData = await ledger.getDonation(donationId);

    return {
      verified: isValid,
      proofHash,
      onChainData: {
        campaign: onChainData.campaign,
        amountPaise: Number(onChainData.amountPaise),
        currency: onChainData.currency,
        timestamp: Number(onChainData.timestamp),
        verified: onChainData.verified
      }
    };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

module.exports = {
  getLedgerContract,
  generateProofHash,
  hashPaymentId,
  recordOnChain,
  verifyOnChain
};
