// scripts/createAdmin.js
// Run: node scripts/createAdmin.js
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const MONGO = process.env.MONGODB_URI || "mongodb://localhost:27017/chainfund";

async function main() {
  await mongoose.connect(MONGO);
  console.log("✅ MongoDB connected");

  // Load model
  const { User } = require("../backend/models");

  const email    = process.env.ADMIN_EMAIL    || "admin@chainfund.io";
  const password = process.env.ADMIN_PASSWORD || "Admin@123456";
  const name     = process.env.ADMIN_NAME     || "ChainFund Admin";

  const exists = await User.findOne({ email });
  if (exists) {
    if (exists.role !== "admin") {
      exists.role = "admin";
      exists.approvedToCreate = true;
      await exists.save();
      console.log(`✅ Upgraded ${email} to admin`);
    } else {
      console.log(`ℹ️  Admin ${email} already exists`);
    }
    await mongoose.disconnect();
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await User.create({
    name,
    email,
    password: hashed,
    role: "admin",
    approvedToCreate: true,
    kycVerified: true
  });

  console.log("✅ Admin account created!");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log("   ⚠️  Change this password after first login!");

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
