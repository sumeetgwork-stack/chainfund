const router    = require("express").Router();
const { Campaign, Donation, Transaction } = require("../models");
const auth      = require("../middleware/auth");
const { getProvider, getFactoryContract, getCampaignContract } = require("../services/blockchain");
const { ethers } = require("ethers");

// ── List all campaigns ────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, active, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (active !== undefined) filter.active = active === "true";

    const campaigns = await Campaign
      .find(filter)
      .populate("organiser", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Campaign.countDocuments(filter);
    res.json({ campaigns, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create campaign (syncs on-chain & saves metadata) ─────────────────────
router.post("/", auth, async (req, res) => {
  try {
    // ── APPROVAL GUARD ─────────────────────────────────────────────────────
    const { User } = require("../models");
    const requestingUser = await User.findById(req.user.id);
    if (!requestingUser)
      return res.status(401).json({ error: "User not found" });
    if (!requestingUser.approvedToCreate && requestingUser.role !== "admin")
      return res.status(403).json({
        error: "not_approved",
        message: "You need admin approval before creating campaigns. Please complete the KYC application.",
        kycStatus: requestingUser.kycApplication?.status || "not_submitted"
      });
    // ──────────────────────────────────────────────────────────────────────

    const {
      contractAddress, title, description, category,
      goalAmount, deadline, milestones, trustees,
      requiredApprovals, txHash, blockNumber, imageUrl
    } = req.body;

    if (!contractAddress || !title)
      return res.status(400).json({ error: "contractAddress and title required" });

    // Compute INR estimate (rough: 1 ETH ≈ ₹2,20,000)
    const ethToINR = parseFloat(process.env.ETH_INR_RATE || "220000");

    const campaign = await Campaign.create({
      contractAddress: contractAddress.toLowerCase(),
      organiser:       req.user.id,
      organiserWallet: req.user.walletAddress,
      title, description, category, imageUrl,
      goalAmount, goalAmountINR: goalAmount * ethToINR,
      deadline: new Date(deadline),
      milestones: milestones || [],
      trustees: trustees || [],
      requiredApprovals: requiredApprovals || 1,
      txHash, blockNumber
    });

    // Emit to websocket
    req.io?.emit("campaign_created", campaign);

    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get single campaign ────────────────────────────────────────────────────
router.get("/:address", async (req, res) => {
  try {
    const campaign = await Campaign
      .findOne({ contractAddress: req.params.address.toLowerCase() })
      .populate("organiser", "name email");

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Fetch live on-chain data
    try {
      const contract = getCampaignContract(req.params.address);
      const info = await contract.getCampaignInfo();
      // Using named properties or indices for ethers v6 Result object compatibility
      const totalRaised    = parseFloat(ethers.formatEther(info._totalRaised    || info[4]));
      const totalDisbursed = parseFloat(ethers.formatEther(info._totalDisbursed || info[5]));
      
      campaign.set('totalRaised',    totalRaised,    { strict: false });
      campaign.set('totalDisbursed', totalDisbursed, { strict: false });
      campaign.set('active',         info._active      || info[7], { strict: false });
      campaign.set('goalReached',    info._goalReached || info[8], { strict: false });
      
      console.log(`📡 [Campaign Route] Live check for ${req.params.address}: Raised=${totalRaised}`);
    } catch (e) { console.warn(`Blockchain fetch failed for ${req.params.address}:`, e.message); }

    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get campaign donations ─────────────────────────────────────────────────
router.get("/:address/donations", async (req, res) => {
  try {
    const donations = await Donation
      .find({ campaignAddress: req.params.address.toLowerCase() })
      .populate("donor", "name")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(donations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get campaign transactions ──────────────────────────────────────────────
router.get("/:address/transactions", async (req, res) => {
  try {
    const txs = await Transaction
      .find({ campaignAddress: req.params.address.toLowerCase() })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats (platform-wide) ─────────────────────────────────────────────────
router.get("/stats/platform", async (req, res) => {
  try {
    const [totalCampaigns, activeCampaigns, stats, categoryBreakdown] = await Promise.all([
      Campaign.countDocuments(),
      Campaign.countDocuments({ active: true }),
      Campaign.aggregate([
        { $group: {
          _id: null,
          totalRaised:    { $sum: "$totalRaised" },
          totalDisbursed: { $sum: "$totalDisbursed" },
          totalDonors:    { $sum: "$donorCount" }
        }}
      ]),
      Campaign.aggregate([
        { $group: { _id: "$category", totalRaised: { $sum: "$totalRaised" }, count: { $sum: 1 } } }
      ])
    ]);

    const s = stats[0] || { totalRaised: 0, totalDisbursed: 0, totalDonors: 0 };
    res.json({
      totalCampaigns,
      activeCampaigns,
      totalRaised:    s.totalRaised,
      totalDisbursed: s.totalDisbursed,
      totalDonors:    s.totalDonors,
      utilizationRate: s.totalRaised > 0 ? (s.totalDisbursed / s.totalRaised * 100).toFixed(1) : 0,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
