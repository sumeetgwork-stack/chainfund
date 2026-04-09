// seedCampaigns.js
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO RUN (from chainfund root folder):
//   cd C:\Users\Sumeet\OneDrive\Desktop\chainfund
//   node scripts/seedCampaigns.js
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const path = require("path");
const fs   = require("fs");

// Use backend's node_modules to ensure same mongoose instance as models
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { ethers } = require(path.join(__dirname, "../backend/node_modules/ethers"));

const MONGO   = process.env.MONGODB_URI || "mongodb://localhost:27017/chainfund";
const RPC_URL = process.env.RPC_URL     || "http://127.0.0.1:8545";
const ETH_INR = parseFloat(process.env.ETH_INR_RATE || "220000");

const CAMPAIGNS = [
  {
    title:       "Clean Water Initiative — Rajasthan",
    description: "Providing safe drinking water to 5000 families in rural Rajasthan through solar-powered water purification plants and deep borewells. Funds released only after verified installation reports.",
    category:    "Healthcare",
    goalETH:     0.5,
    days:        60,
  },
  {
    title:       "Rural Education Fund — Bihar",
    description: "Building 12 schools and training 40 teachers in underserved Bihar districts. Smart contracts ensure funds reach verified NGO partners after milestone completion inspections.",
    category:    "Education",
    goalETH:     0.4,
    days:        90,
  },
  {
    title:       "Flood Relief — Assam 2025",
    description: "Emergency relief for 20,000 flood-displaced families in Assam. Food, shelter kits, and medical aid distributed via verified local coordinators. Every disbursement tracked on-chain.",
    category:    "Relief",
    goalETH:     0.8,
    days:        30,
  },
  {
    title:       "Reforestation Drive — Uttarakhand",
    description: "Planting 50,000 native trees across degraded forest land in Uttarakhand. Geo-tagged planting records stored on IPFS with blockchain hash. Survival monitoring at 3, 6, 12 months.",
    category:    "Environment",
    goalETH:     0.3,
    days:        120,
  },
  {
    title:       "Rural Health Camps — Odisha",
    description: "Funding 50 free medical camps across 25 villages in Odisha reaching 15,000 patients. Includes diagnostics, medicines, and specialist consultations. All vendor payments via smart contract.",
    category:    "Healthcare",
    goalETH:     0.6,
    days:        75,
  },
  {
    title:       "Digital Literacy Program — UP",
    description: "Teaching 10,000 rural women in Uttar Pradesh to use smartphones, digital banking, and online government services. Computer labs set up in 20 panchayat centres.",
    category:    "Education",
    goalETH:     0.35,
    days:        100,
  },
  {
    title:       "Solar Microgrids — Jharkhand Villages",
    description: "Installing solar microgrids in 30 off-grid villages in Jharkhand, bringing electricity to 3000 homes for the first time. Revenue sharing model ensures long-term sustainability.",
    category:    "Infrastructure",
    goalETH:     1.0,
    days:        150,
  },
  {
    title:       "Cyclone Relief — Andhra Pradesh",
    description: "Rebuilding 500 homes destroyed by Cyclone Mihir in coastal Andhra Pradesh. Materials sourced from verified local suppliers. Construction milestones verified by independent surveyors.",
    category:    "Relief",
    goalETH:     0.9,
    days:        45,
  },
  {
    title:       "Mangrove Restoration — Sundarbans",
    description: "Restoring 500 acres of mangrove forests in the Sundarbans delta, protecting 10 coastal villages from storm surges. Community-based monitoring with blockchain-logged GPS data.",
    category:    "Environment",
    goalETH:     0.45,
    days:        180,
  },
  {
    title:       "Street Children Rehabilitation — Mumbai",
    description: "Providing shelter, education, vocational training, and psychological support to 200 street children in Mumbai. Monthly audited fund utilisation reports published on-chain.",
    category:    "Other",
    goalETH:     0.25,
    days:        60,
  }
];

async function main() {
  console.log("🌱 ChainFund Campaign Seeder\n");

  // ── Connect MongoDB ────────────────────────────────────────────────────────
  console.log("Connecting to MongoDB:", MONGO);
  await mongoose.connect(MONGO, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 15000,
  });
  console.log("✅ MongoDB connected\n");

  // ── Load models AFTER connection is ready ─────────────────────────────────
  const { User, Campaign } = require("../backend/models");

  // ── Connect blockchain ─────────────────────────────────────────────────────
  const provider    = new ethers.JsonRpcProvider(RPC_URL);
  const signer      = await provider.getSigner(0);
  const deployerAddr = await signer.getAddress();
  const balance     = ethers.formatEther(await provider.getBalance(deployerAddr));

  console.log("✅ Blockchain:", RPC_URL);
  console.log("   Deployer:", deployerAddr);
  console.log("   Balance:", parseFloat(balance).toFixed(4), "ETH\n");

  // ── Load factory ───────────────────────────────────────────────────────────
  const addrPath = path.join(__dirname, "../backend/deployedAddresses.json");
  const abiPath  = path.join(__dirname, "../backend/abis/Factory.json");

  if (!fs.existsSync(addrPath)) {
    console.error("❌ deployedAddresses.json not found!");
    console.error("   Run this first:\n   cd .. && npx hardhat run scripts/deploy.js --network localhost");
    process.exit(1);
  }

  const { factory: factoryAddr } = JSON.parse(fs.readFileSync(addrPath));
  const factoryABI = JSON.parse(fs.readFileSync(abiPath));
  const factory    = new ethers.Contract(factoryAddr, factoryABI, signer);
  console.log("✅ Factory:", factoryAddr, "\n");

  // ── Find admin user for organiser ──────────────────────────────────────────
  const organiser = await User.findOne({ role: "admin" }).lean();
  console.log("Organiser:", organiser ? organiser.name : "Not found (campaigns will have no organiser)");

  // ── Deploy each campaign ───────────────────────────────────────────────────
  const campaignABI  = JSON.parse(fs.readFileSync(path.join(__dirname, "../backend/abis/Campaign.json")));
  const factoryIface = new ethers.Interface(factoryABI);

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < CAMPAIGNS.length; i++) {
    const c = CAMPAIGNS[i];
    process.stdout.write(`[${i+1}/${CAMPAIGNS.length}] ${c.title.slice(0,45)}... `);

    // Skip if already in DB
    const exists = await Campaign.findOne({ title: c.title });
    if (exists) {
      console.log("⏭  (already exists)");
      skipped++;
      continue;
    }

    try {
      const tx = await factory.createCampaign(
        c.title,
        c.description,
        c.category,
        ethers.parseEther(c.goalETH.toString()),
        c.days,
        [deployerAddr],
        1
      );
      const receipt = await tx.wait();

      // Get campaign address from event
      let campaignAddress = null;
      for (const log of receipt.logs) {
        try {
          const parsed = factoryIface.parseLog(log);
          if (parsed && parsed.name === "CampaignCreated") {
            campaignAddress = parsed.args[0];
            break;
          }
        } catch (_) {}
      }

      if (!campaignAddress) {
        const all = await factory.getAllCampaigns();
        campaignAddress = all[all.length - 1];
      }

      // Save to MongoDB
      await Campaign.create({
        contractAddress:  campaignAddress.toLowerCase(),
        organiser:        organiser?._id || null,
        organiserWallet:  deployerAddr.toLowerCase(),
        title:            c.title,
        description:      c.description,
        category:         c.category,
        goalAmount:       c.goalETH,
        goalAmountINR:    c.goalETH * ETH_INR,
        deadline:         new Date(Date.now() + c.days * 86400000),
        trustees:         [deployerAddr.toLowerCase()],
        requiredApprovals: 1,
        txHash:           receipt.hash,
        blockNumber:      receipt.blockNumber,
        active:           true,
        totalRaised:      0,
        donorCount:       0,
      });

      console.log("✅  " + campaignAddress.slice(0,12) + "...");
      created++;

      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log("❌  " + err.message.slice(0, 60));
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Created: ${created}  |  ⏭  Skipped: ${skipped}  |  Total: ${CAMPAIGNS.length}`);
  console.log(`\n🎉 Done! Open http://localhost:5000 → Campaigns to see them.\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("\n❌ Fatal Error:", err.message);
  console.error("\nTroubleshooting:");
  console.error("  1. Make sure 'npx hardhat node' is running");
  console.error("  2. Make sure MongoDB is running");
  console.error("  3. Run from: cd chainfund && node scripts/seedCampaigns.js");
  process.exit(1);
});
