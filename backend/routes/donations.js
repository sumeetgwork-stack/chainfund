// routes/donations.js
const router   = require("express").Router();
const { Donation, Campaign, Transaction } = require("../models");
const auth         = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const ethToINR = () => parseFloat(process.env.ETH_INR_RATE || "220000");

// ── Record donation after blockchain confirmation ──────────────────────────
// optionalAuth: works for both logged-in users AND wallet-only users
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { campaignAddress, amountETH, txHash, blockNumber, blockTimestamp, donorWallet } = req.body;

    if (!campaignAddress || !amountETH || !txHash) {
      return res.status(400).json({ error: "campaignAddress, amountETH and txHash are required" });
    }

    const campaign = await Campaign.findOne({ contractAddress: campaignAddress.toLowerCase() });

    // Determine the donor wallet: prefer from JWT user, then from body, then null
    const resolvedWallet = req.user?.walletAddress || donorWallet || null;

    // --- Transaction record (primary: needed for Live Transactions + stats) ---
    const txDoc = {
      txHash,
      blockNumber,
      from: (resolvedWallet || "0x0000000000000000000000000000000000000000").toLowerCase(),
      to:   campaignAddress.toLowerCase(),
      valueETH: amountETH,
      valueINR: amountETH * ethToINR(),
      value: Math.round(amountETH * 1e18).toString(),
      type: "donation",
      campaignAddress: campaignAddress.toLowerCase(),
      description: campaign ? `Donation — ${campaign.title}` : "Donation received",
      timestamp: blockTimestamp ? new Date(blockTimestamp * 1000) : new Date()
    };

    const existingTx = await Transaction.findOne({ txHash });
    if (!existingTx) {
      await Transaction.create(txDoc);
      // Increment campaign totalRaised & donorCount
      await Campaign.findOneAndUpdate(
        { contractAddress: campaignAddress.toLowerCase() },
        { $inc: { totalRaised: amountETH, donorCount: 1 } }
      );
      req.io?.emit("new_transaction", txDoc);
      req.io?.emit("stats_update");
    }

    // --- Donation record (only if logged-in user) ---
    let donation = null;
    if (req.user) {
      try {
        donation = await Donation.create({
          campaign:        campaign?._id,
          campaignAddress: campaignAddress.toLowerCase(),
          donor:           req.user.id,
          donorWallet:     req.user.walletAddress,
          amountETH,
          amountINR:       amountETH * ethToINR(),
          txHash,
          blockNumber,
          blockTimestamp:  blockTimestamp ? new Date(blockTimestamp * 1000) : new Date(),
          status:          "confirmed"
        });
      } catch (e) {
        if (e.code !== 11000) throw e; // ignore duplicate
      }
    }

    req.io?.to(`campaign:${campaignAddress}`).emit("new_donation", donation || txDoc);
    res.status(201).json(donation || { ok: true, txDoc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Donation already recorded" });
    res.status(500).json({ error: err.message });
  }
});

// ── Get my donations (requires login) ─────────────────────────────────────
router.get("/mine", auth, async (req, res) => {
  try {
    const donations = await Donation
      .find({ donor: req.user.id })
      .populate("campaign", "title contractAddress")
      .sort({ createdAt: -1 });
    res.json(donations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
