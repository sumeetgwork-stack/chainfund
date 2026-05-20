// routes/webhooks.js — Razorpay webhook handler
const router = require("express").Router();
const crypto = require("crypto");
const { Donation, Campaign, Transaction } = require("../models");
const { recordOnChain, generateProofHash } = require("../services/donationLedger");

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "webhook_secret_placeholder";

// ── Razorpay Webhook ─────────────────────────────────────────────────────────
// Razorpay sends POST requests here when payment events occur
// Must use raw body for signature verification
router.post("/razorpay", async (req, res) => {
  try {
    // ── Verify webhook signature ─────────────────────────────────────────────
    const webhookSignature = req.headers["x-razorpay-signature"];
    if (!webhookSignature) {
      console.warn("⚠️ Webhook received without signature");
      return res.status(400).json({ error: "Missing signature" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      console.warn("⚠️ Webhook signature mismatch — possible tampering");
      return res.status(400).json({ error: "Invalid signature" });
    }

    // ── Handle event ─────────────────────────────────────────────────────────
    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`📩 Razorpay webhook: ${event}`);

    switch (event) {
      case "payment.captured": {
        const payment = payload.payment.entity;
        await handlePaymentCaptured(payment, req.io);
        break;
      }

      case "payment.failed": {
        const payment = payload.payment.entity;
        await handlePaymentFailed(payment);
        break;
      }

      case "refund.processed": {
        const refund = payload.refund.entity;
        await handleRefundProcessed(refund, req.io);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled webhook event: ${event}`);
    }

    // Always respond 200 to Razorpay (they retry on non-2xx)
    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    // Still return 200 to prevent Razorpay retries on our bugs
    res.json({ status: "ok", error: err.message });
  }
});

// ── Payment Captured Handler ─────────────────────────────────────────────────
async function handlePaymentCaptured(payment, io) {
  const paymentId = payment.id;
  const orderId   = payment.order_id;
  const amount    = payment.amount; // in paise
  const currency  = payment.currency;
  const notes     = payment.notes || {};

  console.log(`💰 Payment captured: ${paymentId} | ₹${amount / 100} | ${currency}`);

  // Check if already processed
  const existing = await Donation.findOne({ razorpayPaymentId: paymentId });
  if (existing) {
    // Already recorded via verify-payment endpoint, just ensure it's confirmed
    if (existing.status !== "confirmed") {
      existing.status = "confirmed";
      await existing.save();
    }

    // If blockchain recording hasn't happened yet, do it now
    if (!existing.blockchainTxHash || existing.blockchainTxHash === "pending") {
      const timestamp = existing.proofTimestamp || Math.floor(Date.now() / 1000);
      const result = await recordOnChain({
        paymentId,
        campaignAddress: existing.campaignAddress || "0x0000000000000000000000000000000000000000",
        amountPaise: amount,
        currency,
        timestamp
      });

      if (result.txHash) {
        existing.blockchainTxHash = result.txHash;
        existing.blockchainDonationId = result.donationId;
        await existing.save();
        console.log(`⛓️ Blockchain proof recorded for ${paymentId}: ${result.txHash}`);
      }
    }
    return;
  }

  // New payment — record it (fallback if verify-payment wasn't called)
  const campaignAddress = notes.campaignAddress || null;
  const campaignId      = notes.campaignId || null;

  let campaign = null;
  if (campaignAddress) {
    campaign = await Campaign.findOne({ contractAddress: campaignAddress.toLowerCase() });
  } else if (campaignId) {
    campaign = await Campaign.findById(campaignId);
  }

  const ethToINR = parseFloat(process.env.ETH_INR_RATE || "220000");
  const amountINR = amount / 100;
  const amountETH = amountINR / ethToINR;
  const timestamp = Math.floor(Date.now() / 1000);

  const proofHash = generateProofHash(
    paymentId,
    campaignAddress || "0x0000000000000000000000000000000000000000",
    amount,
    timestamp
  );

  try {
    await Donation.create({
      campaign:          campaign?._id,
      campaignAddress:   campaignAddress?.toLowerCase(),
      donor:             notes.donorId !== "anonymous" ? notes.donorId : null,
      amountETH,
      amountINR,
      amountPaise:       amount,
      currency,
      paymentMethod:     "fiat",
      razorpayOrderId:   orderId,
      razorpayPaymentId: paymentId,
      proofHash,
      proofTimestamp:     timestamp,
      txHash:            `fiat_${paymentId}`,
      status:            "confirmed"
    });
  } catch (e) {
    if (e.code !== 11000) throw e; // Ignore duplicates
  }

  // Update campaign stats
  if (campaign) {
    await Campaign.findByIdAndUpdate(campaign._id, {
      $inc: { totalRaised: amountETH, donorCount: 1 }
    });
  }

  // Record on blockchain
  const blockchainResult = await recordOnChain({
    paymentId,
    campaignAddress: campaignAddress || "0x0000000000000000000000000000000000000000",
    amountPaise: amount,
    currency,
    timestamp
  });

  if (blockchainResult.txHash) {
    await Donation.findOneAndUpdate(
      { razorpayPaymentId: paymentId },
      {
        blockchainTxHash: blockchainResult.txHash,
        blockchainDonationId: blockchainResult.donationId,
        proofHash: blockchainResult.proofHash
      }
    );
  }

  // Emit events
  if (io) {
    io.emit("new_transaction", { type: "donation", amountINR, campaignTitle: campaign?.title });
    io.emit("stats_update");
  }

  console.log(`✅ Webhook donation fully processed: ${paymentId}`);
}

// ── Payment Failed Handler ───────────────────────────────────────────────────
async function handlePaymentFailed(payment) {
  console.log(`❌ Payment failed: ${payment.id} | Reason: ${payment.error_description}`);

  await Donation.findOneAndUpdate(
    { razorpayPaymentId: payment.id },
    { status: "failed" }
  );
}

// ── Refund Processed Handler ─────────────────────────────────────────────────
async function handleRefundProcessed(refund, io) {
  console.log(`↩️ Refund processed: ${refund.id} | Payment: ${refund.payment_id} | ₹${refund.amount / 100}`);

  const donation = await Donation.findOneAndUpdate(
    { razorpayPaymentId: refund.payment_id },
    { refunded: true, status: "refunded" },
    { new: true }
  );

  if (donation?.campaign) {
    const ethToINR = parseFloat(process.env.ETH_INR_RATE || "220000");
    await Campaign.findByIdAndUpdate(donation.campaign, {
      $inc: { totalRaised: -(refund.amount / 100 / ethToINR) }
    });
  }

  if (io) io.emit("stats_update");
}

module.exports = router;
