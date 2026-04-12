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

        // Only increment donorCount if this is the first time this wallet is donating to this campaign
        const prevTx = await Transaction.findOne({
          from: donor.toLowerCase(),
          campaignAddress: contractAddress.toLowerCase(),
          type: "donation",
          txHash: { $ne: tx.transactionHash }
        });

        await Campaign.findOneAndUpdate(
          { contractAddress: contractAddress.toLowerCase() },
          { 
            $inc: { totalRaised: amountETH },
            ...(prevTx ? {} : { $inc: { donorCount: 1 } })
          }
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

async function syncCampaignFromChain(address, io) {
  try {
    const contract = getCampaignContract(address);
    const info = await contract.getCampaignInfo();
    
    // info indices based on FundraisingCampaign.sol:
    // 0:_organiser, 1:_title, 2:_category, 3:_goalAmount, 4:_totalRaised, 5:_totalDisbursed, 6:_deadline, 7:_active, 8:_goalReached, 9:_balance
    const [organiser, title, category, goalWei, totalRaisedWei, totalDisbursedWei, deadlineSec, active, goalReached] = info;

    const goalETH = parseFloat(ethers.formatEther(goalWei));
    const raisedETH = parseFloat(ethers.formatEther(totalRaisedWei));
    const disbursedETH = parseFloat(ethers.formatEther(totalDisbursedWei));
    const deadline = new Date(Number(deadlineSec) * 1000);

    // If deadline passed, it's effectively inactive even if the boolean is true
    const isActuallyActive = active && (deadline > new Date());

    await Campaign.findOneAndUpdate(
      { contractAddress: address.toLowerCase() },
      {
        contractAddress: address.toLowerCase(),
        organiserWallet: organiser.toLowerCase(),
        title, 
        category,
        goalAmount:    goalETH,
        goalAmountINR: goalETH * ethToINR(),
        totalRaised:   raisedETH,
        totalDisbursed: disbursedETH,
        deadline:      deadline,
        active:        isActuallyActive,
        status:        'active'
      },
      { upsert: true, new: true }
    );
    
    console.log(`📡 Deep Sync: Restored/Updated ${title} (${address})`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to deep sync ${address}:`, err.message);
    return false;
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
        await syncCampaignFromChain(campaignAddress, io);
        await indexCampaignEvents(campaignAddress, io);
        io?.emit("campaign_created", { address: campaignAddress, title });
      } catch (e) { console.error("Campaign created event error:", e.message); }
    });

    // 1. Fetch all campaigns from factory
    let allOnChain = [];
    try {
      allOnChain = await factory.getAllCampaigns();
      console.log(`🏢 Factory has ${allOnChain.length} campaigns on-chain.`);
    } catch (e) { console.warn("Could not fetch campaign list from factory:", e.message); }

    // 2. Deep Sync each campaign
    for (const addr of allOnChain) {
      await syncCampaignFromChain(addr, io);
      await indexCampaignEvents(addr.toLowerCase(), io);
    }

    // ── Run Auto-Sync ──
    console.log("🔄 Starting historical blockchain sync...");
    await syncHistoricalEvents(io);
    await reconcileCampaignTotals();

    console.log("✅ Blockchain listener started with Deep Sync enabled");
  } catch (err) {
    console.warn("⚠️  Blockchain listener failed:", err.message);
  }
}

module.exports = { startListener, indexCampaignEvents, syncCampaignFromChain };
