// routes/donations.js
const router   = require("express").Router();
const { Donation, Campaign } = require("../models");
const auth     = require("../middleware/auth");

// Record donation after blockchain confirmation
router.post("/", auth, async (req, res) => {
  try {
    const { campaignAddress, amountETH, txHash, blockNumber, blockTimestamp } = req.body;
    const ethToINR = parseFloat(process.env.ETH_INR_RATE || "220000");

    const campaign = await Campaign.findOne({ contractAddress: campaignAddress.toLowerCase() });

    const donation = await Donation.create({
      campaign:        campaign?._id,
      campaignAddress: campaignAddress.toLowerCase(),
      donor:           req.user.id,
      donorWallet:     req.user.walletAddress,
      amountETH,
      amountINR:       amountETH * ethToINR,
      txHash,
      blockNumber,
      blockTimestamp:  blockTimestamp ? new Date(blockTimestamp * 1000) : new Date(),
      status:          "confirmed"
    });

    // Total Raised and Donor Count are handled directly by the Blockchain Listener
    // to prevent double-counting of donated amounts.

    req.io?.to(`campaign:${campaignAddress}`).emit("new_donation", donation);
    res.status(201).json(donation);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Donation already recorded" });
    res.status(500).json({ error: err.message });
  }
});

// Get my donations
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
