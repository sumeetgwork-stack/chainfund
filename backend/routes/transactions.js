// routes/transactions.js
const router = require("express").Router();
const { Transaction } = require("../models");

router.get("/", async (req, res) => {
  try {
    const { campaignAddress, type, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (campaignAddress) filter.campaignAddress = campaignAddress.toLowerCase();
    if (type) filter.type = type;

    const txs = await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(filter);
    res.json({ transactions: txs, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:hash", async (req, res) => {
  try {
    const tx = await Transaction.findOne({ txHash: req.params.hash })
      .populate("campaign", "title contractAddress");
    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────
// routes/blockchain.js — on-chain read/write proxied through backend
// ─────────────────────────────────────────────────────────────────────────
