const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");

let _provider, _factory;

function getProvider() {
  if (_provider) return _provider;

  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8545";
  try {
    _provider = new ethers.JsonRpcProvider(rpcUrl);
    console.log("⛓️  Blockchain provider connected:", rpcUrl.includes("alchemy") ? "Alchemy (Sepolia)" : rpcUrl);
  } catch (e) {
    console.warn("⚠️  Blockchain provider unavailable:", e.message);
    _provider = null;
  }
  return _provider;
}

function getFactoryContract() {
  const provider = getProvider();
  if (!provider) throw new Error("No provider");

  const addrFile = path.join(__dirname, "../deployedAddresses.json");
  const abiFile  = path.join(__dirname, "../abis/Factory.json");

  if (!fs.existsSync(addrFile)) throw new Error("deployedAddresses.json not found — run deploy first");
  if (!fs.existsSync(abiFile))  throw new Error("Factory ABI not found — run deploy first");

  const { factory } = JSON.parse(fs.readFileSync(addrFile));
  const abi          = JSON.parse(fs.readFileSync(abiFile));

  if (!_factory) _factory = new ethers.Contract(factory, abi, provider);
  return _factory;
}

function getCampaignContract(address) {
  const provider = getProvider();
  if (!provider) throw new Error("No provider");

  const abiFile = path.join(__dirname, "../abis/Campaign.json");
  if (!fs.existsSync(abiFile)) throw new Error("Campaign ABI not found — run deploy first");

  const abi = JSON.parse(fs.readFileSync(abiFile));
  return new ethers.Contract(address, abi, provider);
}

function getAdminSigner() {
  const provider = getProvider();
  if (!provider) throw new Error("No provider");
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not found in environment — required for admin functions");
  return new ethers.Wallet(pk, provider);
}

module.exports = { getProvider, getFactoryContract, getCampaignContract, getAdminSigner };
