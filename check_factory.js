const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const factoryAddr = process.env.FACTORY_ADDRESS;
  
  console.log("Checking factory:", factoryAddr);
  
  const abi = ["function getAllCampaigns() view returns (address[])"];
  const factory = new ethers.Contract(factoryAddr, abi, provider);
  
  try {
    const campaigns = await factory.getAllCampaigns();
    console.log("Total Campaigns:", campaigns.length);
    console.log("Campaign Addresses:", campaigns);
    
    // Check current block
    const currentBlock = await provider.getBlockNumber();
    console.log("Current Block:", currentBlock);
    
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
