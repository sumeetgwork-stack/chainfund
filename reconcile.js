/**
 * reconcile.js
 * Scans donation events from Sepolia for all known campaigns
 * and upserts them into MongoDB so the DB matches on-chain.
 * Run: node backend/reconcile.js
 */
require("dotenv").config({ path: "./.env" });
const mongoose = require("./backend/node_modules/mongoose");
const { ethers } = require("./backend/node_modules/ethers");

const MONGODB_URI   = process.env.MONGODB_URI;
const RPC_URL       = process.env.SEPOLIA_RPC_URL;
const ETH_INR       = parseFloat(process.env.ETH_INR_RATE || "220000");
const CHUNK_SIZE    = 9; // Alchemy free tier max

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ MongoDB connected");

  const { Campaign, Transaction } = require("./backend/models");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const latestBlock = await provider.getBlockNumber();
  console.log("Latest block:", latestBlock);

  const CAMPAIGN_ABI = [
    "function totalRaised() view returns (uint256)",
    "event DonationReceived(address indexed donor, uint256 amount, uint256 timestamp)"
  ];

  const campaigns = await Campaign.find({ contractAddress: { $exists: true, $ne: null } });
  console.log(`Found ${campaigns.length} campaigns in DB`);

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let totalInserted = 0;

  for (const campaign of campaigns) {
    const addr = campaign.contractAddress;
    console.log(`\n📋 Campaign: ${campaign.title} (${addr})`);

    const contract = new ethers.Contract(addr, CAMPAIGN_ABI, provider);

    // Get real on-chain total
    const onChainRaised = parseFloat(ethers.formatEther(await contract.totalRaised()));
    console.log(`  On-chain raised: ${onChainRaised} ETH`);

    // Start from the block where the campaign was created
    const startBlock = campaign.blockNumber || Math.max(0, latestBlock - 50000);
    console.log(`  Scanning from block: ${startBlock} to ${latestBlock}`);

    let inserted = 0;
    let errorCount = 0;

    for (let from = startBlock; from <= latestBlock; from += CHUNK_SIZE + 1) {
      const to = Math.min(from + CHUNK_SIZE, latestBlock);
      try {
        const filter = contract.filters.DonationReceived();
        const events  = await contract.queryFilter(filter, from, to);

        for (const event of events) {
          const amountETH = parseFloat(ethers.formatEther(event.args.amount));
          const donor     = event.args.donor.toLowerCase();
          const txHash    = event.transactionHash;

          // Upsert into Transaction collection
          const existing = await Transaction.findOne({ txHash });
          if (!existing) {
            await Transaction.create({
              txHash,
              blockNumber:     event.blockNumber,
              from:            donor,
              to:              addr.toLowerCase(),
              valueETH:        amountETH,
              valueINR:        amountETH * ETH_INR,
              value:           event.args.amount.toString(),
              type:            "donation",
              campaignAddress: addr.toLowerCase(),
              description:     `Donation — ${campaign.title}`,
              timestamp:       new Date(Number(event.args.timestamp) * 1000),
              status:          "confirmed"
            });
            inserted++;
            totalInserted++;
            console.log(`  ✅ Saved: ${amountETH} ETH from ${donor.slice(0,10)}... (tx: ${txHash.slice(0,18)}...)`);
          }
        }
        // Small delay to prevent hitting rate limits
        await delay(200);
        errorCount = 0; // reset error count on success
      } catch (e) {
        if (e.message.includes("429") || e.message.includes("exceeded its compute units")) {
          console.warn(`  ⏳ Rate limited at ${from}. Retrying in 2 seconds...`);
          await delay(2000);
          from -= (CHUNK_SIZE + 1); // retry this block
          errorCount++;
          if (errorCount > 5) {
            console.error("  ❌ Too many rate limit errors, skipping this chunk.");
            errorCount = 0;
          }
        } else if (!e.message.includes("block range")) {
          console.warn(`  ⚠️  Chunk ${from}-${to}: ${e.message}`);
        }
      }
    }

    // Reconcile campaign totalRaised to match on-chain
    await Campaign.findByIdAndUpdate(campaign._id, { 
      totalRaised: onChainRaised,
      lastSyncedBlock: latestBlock
    });
    console.log(`  🔄 Synced DB state with on-chain data.`);
    console.log(`  📊 New transactions inserted: ${inserted}`);
  }

  console.log(`\n🎉 Reconciliation complete! Total new txns inserted: ${totalInserted}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
