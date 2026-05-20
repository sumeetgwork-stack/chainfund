// scripts/deployLedger.js — Deploy the DonationLedger contract
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n🚀 Deploying DonationLedger to ${network}...\n`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy DonationLedger
  const DonationLedger = await hre.ethers.getContractFactory("DonationLedger");
  const ledger = await DonationLedger.deploy();
  await ledger.waitForDeployment();

  const ledgerAddress = await ledger.getAddress();
  console.log("✅ DonationLedger deployed at:", ledgerAddress);
  console.log("   Owner:", await ledger.owner());

  // Save address to deployedAddresses.json
  const addrFile = path.join(__dirname, "../backend/deployedAddresses.json");
  let addresses = {};
  if (fs.existsSync(addrFile)) {
    addresses = JSON.parse(fs.readFileSync(addrFile));
  }
  addresses.donationLedger = ledgerAddress;
  fs.writeFileSync(addrFile, JSON.stringify(addresses, null, 2));
  console.log("\n📁 Address saved to backend/deployedAddresses.json");

  // Save ABI
  const artifact = await hre.artifacts.readArtifact("DonationLedger");
  const abiDir = path.join(__dirname, "../backend/abis");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    path.join(abiDir, "DonationLedger.json"),
    JSON.stringify(artifact.abi, null, 2)
  );
  console.log("📁 ABI saved to backend/abis/DonationLedger.json");

  // Verify on Etherscan/Polygonscan (if not localhost)
  if (network !== "localhost" && network !== "hardhat") {
    console.log("\n⏳ Waiting 30s before verification...");
    await new Promise(r => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", {
        address: ledgerAddress,
        constructorArguments: []
      });
      console.log("✅ Contract verified on block explorer!");
    } catch (err) {
      console.log("⚠️ Verification failed:", err.message);
    }
  }

  console.log("\n🎉 Deployment complete!");
  console.log("────────────────────────────────────────────────");
  console.log("Next steps:");
  console.log(`1. Add to .env: DONATION_LEDGER_ADDRESS=${ledgerAddress}`);
  console.log("2. Install Razorpay: cd backend && npm install razorpay");
  console.log("3. Add Razorpay keys to .env");
  console.log("4. Restart the backend server");
  console.log("────────────────────────────────────────────────\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
