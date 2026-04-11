const router    = require("express").Router();
const { ethers } = require("ethers");
const { getProvider, getFactoryContract, getCampaignContract } = require("../services/blockchain");
const { Transaction, Campaign, Donation, SystemConfig } = require("../models");
const { syncHistoricalEvents, reconcileCampaignTotals } = require("../services/sync");

/**
 * Get the current sync status of the indexer
 */
router.get("/sync-status", async (req, res) => {
  try {
    const provider = getProvider();
    const currentBlock = await provider.getBlockNumber();
    const config = await SystemConfig.findOne({ key: "last_synced_block" });
    const lastSyncedBlock = config ? config.value : 0;
    
    res.json({
      currentBlock,
      lastSyncedBlock,
      isSyncing: lastSyncedBlock < currentBlock,
      progress: currentBlock > 0 ? Math.min(100, (lastSyncedBlock / currentBlock * 100).toFixed(2)) : 0,
      gap: currentBlock - lastSyncedBlock
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live contract data
// getCampaignInfo() returns tuple:
// [0] organiser, [1] title, [2] category, [3] goalAmount,
// [4] totalRaised, [5] totalDisbursed, [6] deadline,
// [7] active, [8] goalReached, [9] balance
router.get("/campaign/:address", async (req, res) => {
  try {
    const c    = getCampaignContract(req.params.address);
    const info = await c.getCampaignInfo();
    const milestoneCount = await c.getMilestoneCount();

    const milestones = [];
    for (let i = 0; i < Number(milestoneCount); i++) {
      milestones.push(await c.getMilestone(i));
    }

    res.json({
      organiser:      info._organiser      || info[0],
      title:          info._title          || info[1],
      category:       info._category       || info[2],
      goalAmount:     ethers.formatEther(info._goalAmount     || info[3]),
      totalRaised:    ethers.formatEther(info._totalRaised    || info[4]),
      totalDisbursed: ethers.formatEther(info._totalDisbursed || info[5]),
      deadline:       Number(info._deadline || info[6]),
      active:         info._active         || info[7],
      goalReached:    info._goalReached    || info[8],
      balance:        ethers.formatEther(info._balance        || info[9]),
      milestones:     milestones.map(m => ({
        description:    m.desc           || m[0],
        targetAmount:   ethers.formatEther(m.targetAmount   || m[1]),
        releasedAmount: ethers.formatEther(m.releasedAmount || m[2]),
        completed:      m.completed      || m[3],
        approvalCount:  Number(m.approvalCount || m[4])
      }))
    });
    console.log(`📡 [Blockchain Route] Fetched live data for ${req.params.address}: Raised=${ethers.formatEther(info._totalRaised || info[4])}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all campaign addresses from factory
router.get("/campaigns", async (req, res) => {
  try {
    const factory = getFactoryContract();
    const addrs   = await factory.getAllCampaigns();
    res.json({ campaigns: addrs, count: addrs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ETH price
router.get("/eth-price", async (_req, res) => {
  const rate = parseFloat(process.env.ETH_INR_RATE || "220000");
  res.json({ ethToINR: rate, ethToUSD: rate / 83, timestamp: Date.now() });
});

// Recent blocks
router.get("/blocks/recent", async (_req, res) => {
  try {
    const provider = getProvider();
    const latest   = await provider.getBlockNumber();
    const blocks   = [];
    for (let i = latest; i > latest - 5 && i >= 0; i--) {
      const b = await provider.getBlock(i);
      if (b) blocks.push({
        number:    b.number,
        hash:      b.hash,
        txCount:   b.transactions.length,
        timestamp: b.timestamp,
        miner:     b.miner
      });
    }
    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message, blocks: [] });
  }
});

/**
 * Get internal transaction history for a campaign from DB
 */
router.get("/history/:address", async (req, res) => {
  try {
    const txs = await Transaction.find({
      $or: [
        { campaignAddress: req.params.address.toLowerCase() },
        { to: req.params.address.toLowerCase() }
      ]
    }).sort({ timestamp: -1 }).limit(50);
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger manual sync for a specific campaign or all
 */
router.post("/sync/:address", async (req, res) => {
  try {
    // In a real app, you might want to rate limit or authorize this
    const io = req.app.get("socketio");
    await syncHistoricalEvents(io);
    await reconcileCampaignTotals();
    res.json({ message: "Sync triggered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get all activities for a specific user wallet
 */
router.get("/user-activity/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    const donations = await Transaction.find({ from: wallet, type: "donation" }).sort({ timestamp: -1 });
    
    // Get unique campaign addresses donated to
    const campaignAddrs = [...new Set(donations.map(d => d.campaignAddress))];
    const campaigns = await Campaign.find({ contractAddress: { $in: campaignAddrs } });
    
    // Map campaign titles for UI
    const donationsWithTitle = donations.map(d => {
      const c = campaigns.find(camp => camp.contractAddress === d.campaignAddress);
      return {
        ...d.toObject(),
        campaignTitle: c ? c.title : "Unknown Campaign"
      };
    });

    const totalDonated = donations.reduce((sum, d) => sum + (d.valueETH || 0), 0);

    res.json({
      donations: donationsWithTitle,
      totalDonated,
      campaignsCount: campaignAddrs.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
