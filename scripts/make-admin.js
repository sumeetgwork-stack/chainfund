/**
 * make-admin.js
 * Run: node scripts/make-admin.js <email>
 * Creates an admin user or promotes an existing user to admin.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("./backend/node_modules/mongoose");
const bcrypt   = require("./backend/node_modules/bcryptjs");

const ADMIN_EMAIL    = process.argv[2] || "admin@chainfund.in";
const ADMIN_PASSWORD = process.argv[3] || "Admin@1234";
const ADMIN_NAME     = "ChainFund Admin";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const { User } = require("../backend/models");

  let user = await User.findOne({ email: ADMIN_EMAIL });

  if (user) {
    user.role = "admin";
    user.approvedToCreate = true;
    await user.save();
    console.log(`✅ Promoted existing user "${user.name}" (${user.email}) to admin.`);
  } else {
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    user = await User.create({
      name:            ADMIN_NAME,
      email:           ADMIN_EMAIL,
      password:        hashed,
      role:            "admin",
      approvedToCreate: true,
      kycVerified:     true
    });
    console.log(`✅ Created new admin user:`);
    console.log(`   Email   : ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
  }

  console.log("\n🔑 Admin is now active. Sign in at the ChainFund app with these credentials.");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
