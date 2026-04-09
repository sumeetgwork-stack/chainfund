const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy Factory
  const Factory = await ethers.getContractFactory("FundraisingFactory");
  const factory = await Factory.deploy(deployer.address); // platform wallet = deployer for now
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("✅ FundraisingFactory deployed to:", factoryAddress);

  // Save addresses for backend
  const addresses = {
    factory: factoryAddress,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString()
  };

  const outputPath = path.join(__dirname, "../backend/deployedAddresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log("📄 Addresses saved to backend/deployedAddresses.json");

  // Also copy ABI
  const factoryArtifact = require("../backend/artifacts/contracts/FundraisingFactory.sol/FundraisingFactory.json");
  const campaignArtifact = require("../backend/artifacts/contracts/FundraisingCampaign.sol/FundraisingCampaign.json");

  const abiPath = path.join(__dirname, "../backend/abis");
  fs.mkdirSync(abiPath, { recursive: true });
  fs.writeFileSync(path.join(abiPath, "Factory.json"), JSON.stringify(factoryArtifact.abi, null, 2));
  fs.writeFileSync(path.join(abiPath, "Campaign.json"), JSON.stringify(campaignArtifact.abi, null, 2));
  console.log("📄 ABIs saved to backend/abis/");

  // Create sample campaign for demo
  console.log("\n🧪 Creating demo campaign...");
  const tx = await factory.createCampaign(
    "Clean Water Initiative — Rajasthan",
    "Providing safe drinking water to 5000 families in rural Rajasthan through blockchain-verified fund disbursement.",
    "Healthcare",
    ethers.parseEther("0.5"), // 0.5 ETH goal
    60,                        // 60 days
    [deployer.address],        // trustees (just deployer for demo)
    1                          // 1-of-1 multi-sig for demo
  );
  await tx.wait();
  console.log("✅ Demo campaign created");

  const campaigns = await factory.getAllCampaigns();
  console.log("Campaign address:", campaigns[0]);

  // Verify on Etherscan if on Sepolia
  if (addresses.network === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Etherscan...");
    try {
      const { run } = require("hardhat");
      await run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [deployer.address],
      });
      console.log("✅ Contract verified successfully");
    } catch (e) {
      console.warn("⚠️  Verification failed:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
