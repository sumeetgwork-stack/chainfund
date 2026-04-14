const mongoose = require('mongoose');
const { Campaign, User } = require('../backend/models');

async function check() {
  await mongoose.connect('mongodb+srv://chainfund:adminofchainfund2026@cluster0.upqfqqq.mongodb.net/chainfund?retryWrites=true&w=majority&appName=Cluster0');
  const campaigns = await Campaign.find({});
  const users = await User.find({});
  
  console.log('--- CAMPAIGNS ---');
  campaigns.forEach(c => {
    console.log(`Title: ${c.title}, Status: ${c.status}, Active: ${c.active}, Category: ${c.category}`);
  });
  
  console.log('--- USERS ---');
  users.forEach(u => {
    console.log(`Name: ${u.name}, Role: ${u.role}`);
  });
  
  const validFilter = { status: { $nin: ["proposal", "rejected"] } };
  const totalCampaigns = await Campaign.countDocuments(validFilter);
  const totalDonors = await User.countDocuments({ role: { $ne: "admin" } });
  
  console.log(`--- COUNTS ---`);
  console.log(`Total Campaigns (Filtered): ${totalCampaigns}`);
  console.log(`Total Donors (Filtered): ${totalDonors}`);
  
  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
