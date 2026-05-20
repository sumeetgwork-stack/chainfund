// routes/fiatDonations.js — Handle Razorpay fiat payments + on-chain receipts
const router   = require("express").Router();
const crypto   = require("crypto");
const auth     = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { Donation, Campaign, Transaction } = require("../models");
const { recordOnChain, generateProofHash } = require("../services/donationLedger");

// Razorpay config
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || "rzp_test_placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret"
});

const ethToINR = () => parseFloat(process.env.ETH_INR_RATE || "220000");

// ── Step 1: Create Razorpay Order ────────────────────────────────────────────
// Frontend calls this to get an order ID before opening checkout
router.post("/create-order", optionalAuth, async (req, res) => {
  try {
    const { amount, currency, campaignAddress, campaignId } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Minimum donation is ₹1 (100 paise)" });
    }

    // Verify campaign exists
    let campaign = null;
    if (campaignAddress) {
      campaign = await Campaign.findOne({ contractAddress: campaignAddress.toLowerCase() });
    } else if (campaignId) {
      campaign = await Campaign.findById(campaignId);
    }

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount:   Math.round(amount), // Amount in paise
      currency: currency || "INR",
      receipt:  `cf_${campaign._id}_${Date.now()}`,
      notes: {
        campaignId:      campaign._id.toString(),
        campaignAddress: campaign.contractAddress || "",
        campaignTitle:   campaign.title,
        donorId:         req.user?.id || "anonymous",
        platform:        "chainfund"
      }
    });

    res.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  order.currency,
      campaignTitle: campaign.title,
      keyId:     process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder"
    });
  } catch (err) {
    console.error("❌ Create order error:", err);
    res.status(500).json({ error: "Failed to create payment order: " + err.message });
  }
});

// ── Step 2: Verify Payment & Record ──────────────────────────────────────────
// Frontend calls this after Razorpay checkout success to verify + record
router.post("/verify-payment", optionalAuth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      campaignAddress,
      campaignId,
      amount,         // in paise
      currency,
      donorName,
      donorEmail
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification data" });
    }

    // ── Verify Razorpay signature ────────────────────────────────────────────
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "placeholder_secret")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed — invalid signature" });
    }

    // ── Find campaign ────────────────────────────────────────────────────────
    let campaign = null;
    if (campaignAddress) {
      campaign = await Campaign.findOne({ contractAddress: campaignAddress.toLowerCase() });
    } else if (campaignId) {
      campaign = await Campaign.findById(campaignId);
    }

    const amountPaise = Math.round(amount || 0);
    const amountINR   = amountPaise / 100;
    const amountETH   = amountINR / ethToINR();
    const timestamp   = Math.floor(Date.now() / 1000);

    // ── Record on blockchain (async — don't block response) ──────────────────
    let blockchainResult = null;
    const recordPromise = recordOnChain({
      paymentId:       razorpay_payment_id,
      campaignAddress: campaign?.contractAddress || "0x0000000000000000000000000000000000000000",
      amountPaise,
      currency:        currency || "INR",
      timestamp
    }).then(result => {
      blockchainResult = result;
      // Update donation record with blockchain data once available
      if (result.txHash) {
        Donation.findOneAndUpdate(
          { razorpayPaymentId: razorpay_payment_id },
          {
            blockchainTxHash:  result.txHash,
            blockchainDonationId: result.donationId,
            proofHash:         result.proofHash,
            blockNumber:       result.blockNumber
          }
        ).catch(err => console.warn("⚠️ Failed to update donation with blockchain data:", err.message));
      }
    }).catch(err => {
      console.error("⚠️ On-chain recording failed (donation still valid):", err.message);
    });

    // ── Save donation to database ────────────────────────────────────────────
    const proofHash = generateProofHash(
      razorpay_payment_id,
      campaign?.contractAddress || "0x0000000000000000000000000000000000000000",
      amountPaise,
      timestamp
    );

    const donationDoc = {
      campaign:           campaign?._id,
      campaignAddress:    campaign?.contractAddress?.toLowerCase(),
      donor:              req.user?.id || null,
      donorWallet:        null, // Fiat payment — no wallet
      donorName:          donorName || req.user?.name || "Anonymous",
      donorEmail:         donorEmail || null,
      amountETH,
      amountINR,
      amountPaise,
      currency:           currency || "INR",
      paymentMethod:      "fiat",
      razorpayOrderId:    razorpay_order_id,
      razorpayPaymentId:  razorpay_payment_id,
      proofHash,
      proofTimestamp:     timestamp,
      txHash:             `fiat_${razorpay_payment_id}`, // Unique identifier for fiat donations
      status:             "confirmed"
    };

    let donation;
    try {
      donation = await Donation.create(donationDoc);
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ error: "Donation already recorded" });
      }
      throw e;
    }

    // ── Update campaign stats ────────────────────────────────────────────────
    if (campaign) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        $inc: { totalRaised: amountETH, donorCount: 1 }
      });
    }

    // ── Record in transactions collection ────────────────────────────────────
    const txDoc = {
      txHash:          `fiat_${razorpay_payment_id}`,
      from:            donorName || "Fiat Donor",
      to:              campaign?.contractAddress?.toLowerCase() || "platform",
      valueETH:        amountETH,
      valueINR:        amountINR,
      value:           amountPaise.toString(),
      type:            "donation",
      campaignAddress: campaign?.contractAddress?.toLowerCase(),
      description:     `Fiat Donation (${currency || "INR"}) — ${campaign?.title || "Unknown Campaign"}`,
      status:          "confirmed",
      timestamp:       new Date()
    };

    try {
      await Transaction.create(txDoc);
    } catch (e) {
      if (e.code !== 11000) console.warn("⚠️ Transaction record error:", e.message);
    }

    // ── Emit real-time events ────────────────────────────────────────────────
    if (req.io) {
      req.io.emit("new_transaction", txDoc);
      req.io.emit("stats_update");
      if (campaign?.contractAddress) {
        req.io.to(`campaign:${campaign.contractAddress}`).emit("new_donation", donationDoc);
      }
    }

    // ── Wait briefly for blockchain recording, then respond ──────────────────
    // Give it 3 seconds; if not done, respond anyway
    await Promise.race([
      recordPromise,
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);

    res.status(201).json({
      success: true,
      donation: {
        id:              donation._id,
        amountINR,
        amountETH,
        currency:        currency || "INR",
        campaignTitle:   campaign?.title,
        paymentId:       razorpay_payment_id,
        proofHash,
        blockchainTxHash: blockchainResult?.txHash || "pending",
        blockchainDonationId: blockchainResult?.donationId ?? "pending",
        verifyUrl:       blockchainResult?.txHash
          ? `https://polygonscan.com/tx/${blockchainResult.txHash}`
          : null
      }
    });
  } catch (err) {
    console.error("❌ Verify payment error:", err);
    res.status(500).json({ error: "Payment verification failed: " + err.message });
  }
});

// ── Verify a donation's blockchain proof ─────────────────────────────────────
router.get("/verify/:paymentId", async (req, res) => {
  try {
    const donation = await Donation.findOne({
      razorpayPaymentId: req.params.paymentId
    }).populate("campaign", "title contractAddress");

    if (!donation) {
      return res.status(404).json({ error: "Donation not found" });
    }

    // Reconstruct the proof hash
    const reconstructedHash = generateProofHash(
      donation.razorpayPaymentId,
      donation.campaignAddress || "0x0000000000000000000000000000000000000000",
      donation.amountPaise,
      donation.proofTimestamp
    );

    const hashMatch = reconstructedHash === donation.proofHash;

    res.json({
      verified:           hashMatch,
      donation: {
        amountINR:        donation.amountINR,
        currency:         donation.currency,
        campaignTitle:    donation.campaign?.title,
        paymentId:        donation.razorpayPaymentId,
        proofHash:        donation.proofHash,
        reconstructedHash,
        blockchainTxHash: donation.blockchainTxHash || null,
        recordedAt:       donation.createdAt
      },
      blockchainProof: donation.blockchainTxHash
        ? `https://polygonscan.com/tx/${donation.blockchainTxHash}`
        : "On-chain recording pending"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get fiat donation stats for a campaign ───────────────────────────────────
router.get("/campaign/:campaignId/stats", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const fiatDonations = await Donation.find({
      campaign: campaign._id,
      paymentMethod: "fiat"
    }).sort({ createdAt: -1 });

    const totalFiatINR = fiatDonations.reduce((sum, d) => sum + (d.amountINR || 0), 0);
    const totalFiatCount = fiatDonations.length;

    res.json({
      campaignTitle: campaign.title,
      totalFiatDonations: totalFiatCount,
      totalFiatAmountINR: totalFiatINR,
      donations: fiatDonations.map(d => ({
        amountINR:    d.amountINR,
        currency:     d.currency,
        donorName:    d.donorName || "Anonymous",
        proofHash:    d.proofHash,
        blockchainTx: d.blockchainTxHash,
        createdAt:    d.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
