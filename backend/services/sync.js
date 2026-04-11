const { ethers } = require("ethers");
const mongoose = require("mongoose");
const { Campaign, Transaction, SystemConfig } = require("../models");
const { getFactoryContract, getCampaignContract, getProvider } = require("./blockchain");

const ethToINR = () => parseFloat(process.env.ETH_INR_RATE || "220000");

/**
 * Syncs historical events for a specific campaign or the factory.
 * This ensures no data is lost during server downtime.
 */
async function syncHistoricalEvents(io) {
  const provider = getProvider();
  if (!provider) return;

  try {
    const currentBlock = await provider.getBlockNumber();
    const configKey = "last_synced_block";
    
    // 1. Get the last synced block from DB
    let config = await SystemConfig.findOne({ key: configKey });
    if (!config) {
      // Deep sync for fresh deployments: Scan the most recent 100k blocks (~2 weeks)
      const startBlock = Math.max(0, currentBlock - 100000);
      config = await SystemConfig.create({ key: configKey, value: startBlock });
    }

    const fromBlock = config.value + 1;
    if (fromBlock > currentBlock) {
      console.log("♾️  Database is already up to date with blockchain.");
      return;
    }

    console.log(`📡 Syncing historical events from block ${fromBlock} to ${currentBlock}...`);

    const CHUNK_SIZE = 10; // Reduced for Free Tier RPC (Alchemy limit is 10)
    const factory = getFactoryContract();
    const campaigns = await Campaign.find({});

    for (let currentFrom = fromBlock; currentFrom <= currentBlock; currentFrom += CHUNK_SIZE) {
      const currentTo = Math.min(currentFrom + CHUNK_SIZE - 1, currentBlock);
      console.log(`🔎 Scanning chunk: ${currentFrom} to ${currentTo}...`);
      
      // Throttle to respect Alchemy/Infura Free Tier rate limits (RPS)
      await new Promise(r => setTimeout(r, 80));

      // 2. Sync Factory Events (New Campaigns)
      const campaignCreatedFilter = factory.filters.CampaignCreated();
      const newCampaignLogs = await factory.queryFilter(campaignCreatedFilter, currentFrom, currentTo);
      
      for (const log of newCampaignLogs) {
        const [addr, organiser, title, category, goal, deadline] = log.args;
        console.log(`✨ Found missed campaign: ${title}`);
        
        let campaign = await Campaign.findOne({ contractAddress: addr.toLowerCase() });
        if (!campaign) {
          campaign = await Campaign.findOne({
            title: { $regex: new RegExp("^" + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") },
            organiserWallet: organiser.toLowerCase(),
            status: 'approved'
          });
          if (campaign) console.log(`🔗 Linking historical deployment to approved proposal: ${title}`);
        }

        await Campaign.findOneAndUpdate(
          { _id: campaign ? campaign._id : new mongoose.Types.ObjectId() },
          {
            contractAddress: addr.toLowerCase(),
            organiserWallet: organiser.toLowerCase(),
            title, category,
            goalAmount: parseFloat(ethers.formatEther(goal)),
            goalAmountINR: parseFloat(ethers.formatEther(goal)) * ethToINR(),
            deadline: new Date(Number(deadline) * 1000),
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            active: true,
            status: 'active'
          },
          { upsert: true }
        );
      }

      // 3. Sync Campaign Events (Parallelized across all campaigns within the chunk)
      await Promise.all(campaigns.map(async (campaign) => {
        try {
          const contract = getCampaignContract(campaign.contractAddress);
          const donationFilter = contract.filters.DonationReceived();
          const logs = await contract.queryFilter(donationFilter, currentFrom, currentTo);
          
          for (const log of logs) {
            const [donor, amount, timestamp] = log.args;
            const amountETH = parseFloat(ethers.formatEther(amount));
            
            const existing = await Transaction.findOne({ txHash: log.transactionHash });
            if (!existing) {
              await Transaction.create({
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                from: donor.toLowerCase(),
                to: campaign.contractAddress.toLowerCase(),
                valueETH: amountETH,
                type: "donation",
                campaignAddress: campaign.contractAddress.toLowerCase(),
                description: "Donation received (Synced)",
                timestamp: new Date(Number(timestamp) * 1000)
              });

              await Campaign.findOneAndUpdate(
                { contractAddress: campaign.contractAddress.toLowerCase() },
                { $inc: { totalRaised: amountETH, donorCount: 1 } }
              );
              console.log(`✅ Synced missed donation: ${amountETH} ETH for ${campaign.title}`);
            }
          }
        } catch (e) {
          console.warn(`⚠️  Failed to sync events for ${campaign.title}:`, e.message);
        }
      }));
    }

    // 4. Update the last synced block
    await SystemConfig.findOneAndUpdate({ key: configKey }, { value: currentBlock, lastUpdatedAt: new Date() });
    console.log(`🏁 Sync complete. Up to block: ${currentBlock}`);

    // Trigger UI update if socket IO is provided
    io?.emit("stats_update");

  } catch (err) {
    console.error("❌ Sync Service Error:", err.message);
  }
}

/**
 * Cross-references DB totals with actual On-Chain data to verify integrity.
 */
async function reconcileCampaignTotals() {
  const campaigns = await Campaign.find({ active: true });
  for (const c of campaigns) {
    try {
      const contract = getCampaignContract(c.contractAddress);
      const onChainRaised = await contract.totalRaised();
      const raisedETH = parseFloat(ethers.formatEther(onChainRaised));
      
      // 🛡️ ZERO-GUARD: Don't overwrite a healthy DB value with 0 from chain unless it's a fresh campaign (or very low).
      // This protects against transient RPC errors returning 0.
      if (raisedETH === 0 && c.totalRaised > 0) {
        console.warn(`⚠️  [Zero-Guard] Blockchain returned 0 for ${c.title}, but DB says ${c.totalRaised}. Ignoring update to prevent reset-to-zero bug.`);
        continue;
      }
      
      if (Math.abs(c.totalRaised - raisedETH) > 0.000001) {
        console.warn(`⚖️  Mismatch found for ${c.title}: DB=${c.totalRaised}, Chain=${raisedETH}. Reconciling...`);
        await Campaign.findByIdAndUpdate(c._id, { totalRaised: raisedETH });
      }
    } catch (e) {
      console.error(`❌ Reconciliation failed for ${c.title}:`, e.message);
    }
  }
}

module.exports = { syncHistoricalEvents, reconcileCampaignTotals };
