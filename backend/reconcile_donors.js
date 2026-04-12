require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { Campaign, Transaction } = require('./models');

async function reconcile() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔄 Reconciling Donor Counts...');
  
  const campaigns = await Campaign.find({ contractAddress: { $ne: null } });
  
  for (const c of campaigns) {
    const donors = await Transaction.distinct('from', {
      campaignAddress: c.contractAddress.toLowerCase(),
      type: 'donation'
    });
    
    const count = donors.length;
    if (c.donorCount !== count) {
      console.log(`📊 Correcting ${c.title}: ${c.donorCount} -> ${count}`);
      await Campaign.findByIdAndUpdate(c._id, { donorCount: count });
    }
  }
  
  console.log('✅ Reconciliation complete.');
  process.exit(0);
}
reconcile().catch(err => { console.error(err); process.exit(1); });
