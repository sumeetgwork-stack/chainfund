const { ethers }  = require("ethers");
const { Campaign, Donation, Transaction } = require("../models");
const { getProvider, getFactoryContract, getCampaignContract } = require("./blockchain");
const { syncHistoricalEvents, reconcileCampaignTotals } = require("./sync");

const ethToINR = () => parseFloat(process.env.ETH_INR_RATE || "220000");

async function indexCampaignEvents(contractAddress, io) {
  try {
    const contract = getCampaignContract(contractAddress);

    // DonationReceived
    contract.on("DonationReceived", async (donor, amount, timestamp, event) => {
      try {
        const amountETH = parseFloat(ethers.formatEther(amount));
        const tx = event.log || event;
        const existing = await Transaction.findOne({ txHash: tx.transactionHash });
        if (existing) return;

        const txDoc = {
          txHash:          tx.transactionHash,
          blockNumber:     tx.blockNumber,
          from:            donor.toLowerCase(),
          to:              contractAddress.toLowerCase(),
          value:           amount.toString(),
          valueETH:        amountETH,
          valueINR:        amountETH * ethToINR(),
          type:            "donation",
          campaignAddress: contractAddress.toLowerCase(),
          description:     "Donation received",
          timestamp:       new Date(Number(timestamp) * 1000)
        };

        await Transaction.create(txDoc);

        await Campaign.findOneAndUpdate(
          { contractAddress: contractAddress.toLowerCase() },
          { $inc: { totalRaised: amountETH, donorCount: 1 } }
        );

        io?.emit("new_transaction", txDoc);
        io?.to(`campaign:${contractAddress}`).emit("new_donation", txDoc);
        io?.emit("stats_update"); // trigger frontend stats reload
        console.log(`💰 Donation: ${amountETH} ETH from ${donor} → ${contractAddress}`);
      } catch (e) { console.error("Donation index error:", e.message); }
    });

    // FundsDisbursed
    contract.on("FundsDisbursed", async (milestoneId, recipient, amount, event) => {
      try {
        const amountETH = parseFloat(ethers.formatEther(amount));
        const tx = event.log || event;

        const txDoc = {
          txHash:          tx.transactionHash,
          blockNumber:     tx.blockNumber,
          from:            contractAddress.toLowerCase(),
          to:              recipient.toLowerCase(),
          value:           amount.toString(),
          valueETH:        amountETH,
          valueINR:        amountETH * ethToINR(),
          type:            "disbursement",
          campaignAddress: contractAddress.toLowerCase(),
          milestoneId:     Number(milestoneId),
          description:     `Disbursement to ${recipient.slice(0,8)}...`,
          timestamp:       new Date()
        };

        await Transaction.findOneAndUpdate(
          { txHash: tx.transactionHash },
          txDoc,
          { upsert: true, new: true }
        );

        await Campaign.findOneAndUpdate(
          { contractAddress: contractAddress.toLowerCase() },
          { $inc: { totalDisbursed: amountETH } }
        );

        io?.emit("new_transaction", txDoc);
        console.log(`📤 Disbursed: ${amountETH} ETH → ${recipient}`);
      } catch (e) { console.error("Disbursement index error:", e.message); }
    });

    // RefundIssued
    contract.on("RefundIssued", async (donor, amount, event) => {
      try {
        const amountETH = parseFloat(ethers.formatEther(amount));
        const tx = event.log || event;

        await Transaction.findOneAndUpdate(
          { txHash: tx.transactionHash },
          {
            txHash: tx.transactionHash,
            from:   contractAddress.toLowerCase(),
            to:     donor.toLowerCase(),
            valueETH: amountETH,
            type:   "refund",
            campaignAddress: contractAddress.toLowerCase(),
            description: `Refund to ${donor.slice(0,8)}...`,
            timestamp: new Date()
          },
          { upsert: true }
        );
        io?.emit("new_transaction", { type: "refund", donor, amountETH });
      } catch (e) { console.error("Refund index error:", e.message); }
    });

    console.log(`👂 Listening to campaign: ${contractAddress}`);
  } catch (err) {
    console.warn(`⚠️  Cannot listen to ${contractAddress}:`, err.message);
  }
}

async function startListener(io) {
  const provider = getProvider();
  if (!provider) {
    console.warn("⚠️  No blockchain provider — event listener disabled");
    return;
  }

  try {
    const factory = getFactoryContract();

    // Listen for new campaigns
    factory.on("CampaignCreated", async (campaignAddress, organiser, title, category, goalAmount, deadline, timestamp, event) => {
      try {
        console.log(`🆕 New campaign: ${title} at ${campaignAddress}`);

        // Fetch full description from the contract itself
        let description = '';
        try {
          const campaignContract = getCampaignContract(campaignAddress);
          description = await campaignContract.description();
        } catch (_) {}

        // Save to DB with description
        await Campaign.findOneAndUpdate(
          { contractAddress: campaignAddress.toLowerCase() },
          {
            contractAddress: campaignAddress.toLowerCase(),
            organiserWallet: organiser.toLowerCase(),
            title, category,
            description: description || 'No description provided.',
            goalAmount:    parseFloat(ethers.formatEther(goalAmount)),
            goalAmountINR: parseFloat(ethers.formatEther(goalAmount)) * ethToINR(),
            deadline:      new Date(Number(deadline) * 1000),
            blockNumber:   (event.log || event).blockNumber,
            txHash:        (event.log || event).transactionHash
          },
          { upsert: true, new: true }
        );

        // Start indexing this campaign's events
        await indexCampaignEvents(campaignAddress, io);
        io?.emit("campaign_created", { address: campaignAddress, title });
      } catch (e) { console.error("Campaign created event error:", e.message); }
    });

    // Index all existing campaigns + backfill missing descriptions
    const existing = await Campaign.find({}, "contractAddress description");
    for (const c of existing) {
      // Backfill description if missing
      if (!c.description || c.description === 'undefined') {
        try {
          const cc = getCampaignContract(c.contractAddress);
          const desc = await cc.description();
          if (desc) await Campaign.findByIdAndUpdate(c._id, { description: desc });
          console.log(`📝 Backfilled description for ${c.contractAddress}`);
        } catch (_) {}
      }
      await indexCampaignEvents(c.contractAddress, io);
    }

    // Also fetch from factory
    try {
      const addrs = await factory.getAllCampaigns();
      for (const addr of addrs) {
        const known = existing.find(c => c.contractAddress === addr.toLowerCase());
        if (!known) await indexCampaignEvents(addr, io);
      }
    } catch (_) {}

    // ── Run Auto-Sync ──
    console.log("🔄 Starting historical blockchain sync...");
    await syncHistoricalEvents(io);
    await reconcileCampaignTotals();

    console.log("✅ Blockchain listener started");
  } catch (err) {
    console.warn("⚠️  Blockchain listener failed:", err.message);
  }
}

module.exports = { startListener, indexCampaignEvents };
