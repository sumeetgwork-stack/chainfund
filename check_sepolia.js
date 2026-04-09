const { ethers } = require("ethers");
require("dotenv").config();

async function check() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpcUrl || rpcUrl.includes("YOUR_ALCHEMY_API_KEY")) {
    console.error("❌ SEPOLIA_RPC_URL is not configured correctly in .env");
    process.exit(1);
  }

  if (!privateKey || privateKey.length < 64) {
    console.error("❌ PRIVATE_KEY is not configured correctly in .env");
    process.exit(1);
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log("🔗 Connected to Sepolia via Alchemy");
    console.log("💳 Wallet Address:", wallet.address);
    
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    
    console.log("💰 Balance:", balanceEth, "ETH");
    
    if (parseFloat(balanceEth) < 0.05) {
      console.warn("⚠️  Warning: Balance is low. You might need more Sepolia ETH for deployment and demo campaigns.");
    } else {
      console.log("✅ Ready for deployment!");
    }
  } catch (err) {
    console.error("❌ Error connecting to blockchain:", err.message);
  }
}

check();
