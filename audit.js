const fs = require('fs');
const c = fs.readFileSync('c:/Users/Sumeet/Desktop/chainfund/frontend/index.html', 'utf8');
const pages = ['page-home','page-campaigns','page-dashboard','page-my-activity','page-explorer','page-settings','page-kyc','page-create','page-proposals','page-trustee','page-admin'];
pages.forEach(p => {
  const re = new RegExp('id="' + p + '"', 'g');
  const matches = (c.match(re) || []).length;
  if (matches !== 1) console.log('⚠️ ', p, ':', matches, 'occurrences');
  else console.log('✅', p, ': 1');
});
