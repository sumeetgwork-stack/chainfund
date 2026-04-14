const router    = require("express").Router();
const { Campaign, Donation, Transaction, User } = require("../models");
const auth      = require("../middleware/auth");
const { getProvider, getFactoryContract, getCampaignContract } = require("../services/blockchain");
const { ethers } = require("ethers");

// ── List all campaigns ────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, active, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (active !== undefined) {
      filter.active = active === "true";
      // If we're looking for active=true, we ONLY want status=active
      if (filter.active) filter.status = "active";
    }
    
    if (req.query.status === "all") {
      // Do not apply status filter, fetching everything
    } else if (req.query.status) {
      filter.status = req.query.status;
    } else if (!filter.status) {
      // Default: exclude proposals and rejected, but also exclude 'approved' from the main browse list
      // unless specifically requested. Usually 'approved' campaigns are only shown on the organiser's dashboard.
      filter.status = "active"; 
    }

    console.log("🔍 [Campaigns API] Query:", req.query, "Filter applied:", filter);

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
    
    // Organisers must be approved to submit even a proposal
    if (!requestingUser.approvedToCreate && requestingUser.role !== "admin")
      return res.status(403).json({
        error: "not_approved",
        message: "You need admin approval before starting campaigns. Please complete the KYC application.",
        kycStatus: requestingUser.kycApplication?.status || "not_submitted"
      });
    // ──────────────────────────────────────────────────────────────────────

    const {
      contractAddress, title, description, category,
      goalAmount, deadline, milestones, trustees,
      requiredApprovals, txHash, blockNumber, imageUrl,
      isProposal // New flag from frontend
    } = req.body;

    if (!title || !description || !goalAmount)
      return res.status(400).json({ error: "Title, description and goal are required" });

    const ethToINR = parseFloat(process.env.ETH_INR_RATE || "220000");

    const campaignData = {
      organiser:       req.user.id,
      organiserWallet: req.user.walletAddress,
      title, description, category, imageUrl,
      goalAmount, goalAmountINR: goalAmount * ethToINR,
      deadline: new Date(deadline),
      milestones: milestones || [],
      trustees: trustees || [],
      requiredApprovals: requiredApprovals || 1,
      status: isProposal ? "proposal" : "active",
      active: !isProposal // inactive if it's just a proposal
    };

    if (contractAddress) {
      campaignData.contractAddress = contractAddress.toLowerCase();
      campaignData.txHash = txHash;
      campaignData.blockNumber = blockNumber;
      campaignData.status = "active";
      campaignData.active = true;
    }

    const campaign = await Campaign.create(campaignData);

    // Emit to websocket
    req.io?.emit("campaign_created", campaign);

    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Trustee Validation Routes ─────────────────────────────────────────────

function requireTrustee(req, res, next) {
  if (req.user.role !== "trustee" && req.user.role !== "admin")
    return res.status(403).json({ error: "Trustee access required" });
  next();
}

// List pending proposals
router.get("/proposals/pending", auth, requireTrustee, async (req, res) => {
  try {
    const proposals = await Campaign.find({ status: "proposal" }).populate("organiser", "name email");
    res.json(proposals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate a proposal (Trustee approval/rejection)
router.post("/proposals/:id/validate", auth, requireTrustee, async (req, res) => {
  try {
    const { status, remarks } = req.body; // 'approved' or 'rejected'
    if (!["approved", "rejected"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Proposal not found" });

    if (status === "rejected") {
      campaign.status = "rejected";
      if (remarks) campaign.description += `\n\n[Rejection Remarks: ${remarks}]`;
      await campaign.save();
      req.io?.emit("proposal_decision", { id: campaign._id, status: "rejected" });
      return res.json({ success: true, message: "Proposal rejected", campaign });
    }

    // Fetch fresh user data to get the current linked wallet address
    const { User } = require("../models");
    const trusteeUser = await User.findById(req.user.id);
    const wallet = trusteeUser?.walletAddress?.toLowerCase();
    if (!wallet) return res.status(400).json({ error: "Your account must have a connected wallet address to validate proposals (Connect via MetaMask in the top right)." });

    if (!campaign.approvingTrustees) campaign.approvingTrustees = [];
    
    if (campaign.approvingTrustees.includes(wallet)) {
      return res.status(400).json({ error: "You have already approved this proposal" });
    }

    campaign.approvingTrustees.push(wallet);
    
    // Check if enough approvals reached
    const required = campaign.requiredApprovals || 1;
    let message = `Approval recorded (${campaign.approvingTrustees.length}/${required})`;
    
    if (campaign.approvingTrustees.length >= required) {
      campaign.status = "approved";
      message = "Proposal fully approved and ready for deployment!";
    }

    if (remarks) campaign.description += `\n\n[Trustee Approval: ${remarks}]`;
    
    await campaign.save();
    req.io?.emit("proposal_decision", { 
      id: campaign._id, 
      status: campaign.status, 
      approvals: campaign.approvingTrustees.length,
      required 
    });
    
    res.json({ success: true, message, campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Final Deployment (Organiser triggers after approval) ──────────────────
router.put("/:id/deploy", auth, async (req, res) => {
  try {
    const { contractAddress, txHash, blockNumber } = req.body;
    if (!contractAddress) return res.status(400).json({ error: "contractAddress required" });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    if (campaign.organiser.toString() !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorized" });

    if (campaign.status !== "approved" && req.user.role !== "admin")
      return res.status(400).json({ error: "Campaign must be approved by a trustee before deployment" });

    campaign.contractAddress = contractAddress.toLowerCase();
    campaign.txHash = txHash;
    campaign.blockNumber = blockNumber;
    campaign.status = "active";
    campaign.active = true;
    await campaign.save();

    res.json({ success: true, campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get single campaign ────────────────────────────────────────────────────
router.get("/:identifier", async (req, res) => {
  try {
    const id = req.params.identifier;
    let campaign;
    
    // Check if it's a valid MongoDB ID first
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      campaign = await Campaign.findById(id).populate("organiser", "name email");
    }
    
    // If not found by ID or not an ID, search by contract address
    if (!campaign) {
      campaign = await Campaign
        .findOne({ contractAddress: id.toLowerCase() })
        .populate("organiser", "name email");
    }

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Fetch live on-chain data if address is available
    if (campaign.contractAddress) {
      try {
        const contract = getCampaignContract(campaign.contractAddress);
      const info = await contract.getCampaignInfo();
      // Using named properties or indices for ethers v6 Result object compatibility
      const totalRaised    = parseFloat(ethers.formatEther(info._totalRaised    || info[4]));
      const totalDisbursed = parseFloat(ethers.formatEther(info._totalDisbursed || info[5]));
      
      campaign.set('totalRaised',    totalRaised,    { strict: false });
      campaign.set('totalDisbursed', totalDisbursed, { strict: false });
      campaign.set('active',         info._active      || info[7], { strict: false });
      campaign.set('goalReached',    info._goalReached || info[8], { strict: false });
      
      console.log(`📡 [Campaign Route] Live check for ${req.params.address}: Raised=${totalRaised}`);
      } catch (e) {
        console.warn(`Blockchain fetch failed for ${req.params.address}:`, e.message);
      }
    }

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
    const validFilter = { status: { $ne: "rejected" } };
    const [totalCampaigns, activeCampaigns, stats, categoryBreakdown, uniqueDonors] = await Promise.all([
      Campaign.countDocuments(validFilter),
      Campaign.countDocuments({ ...validFilter, active: true }),
      Campaign.aggregate([
        { $match: validFilter },
        { $group: {
          _id: null,
          totalRaised:    { $sum: "$totalRaised" },
          totalDisbursed: { $sum: "$totalDisbursed" }
        }}
      ]),
      Campaign.aggregate([
        { $match: validFilter },
        { $group: { _id: "$category", totalRaised: { $sum: "$totalRaised" }, count: { $sum: 1 } } }
      ]),
      User.countDocuments({ role: "donor" })
    ]);

    const s = stats[0] || { totalRaised: 0, totalDisbursed: 0 };

    // Log for diagnostics
    console.log(`📊 [Stats] totalCampaigns: ${totalCampaigns}, activeCampaigns: ${activeCampaigns}, totalDonors: ${uniqueDonors}`);

    res.json({
      totalCampaigns,
      activeCampaigns,
      totalRaised:    s.totalRaised,
      totalDisbursed: s.totalDisbursed,
      totalDonors:    uniqueDonors,
      utilizationRate: s.totalRaised > 0 ? (s.totalDisbursed / s.totalRaised * 100).toFixed(1) : 0,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
