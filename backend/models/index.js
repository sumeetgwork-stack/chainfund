// models/index.js — All Mongoose models

const mongoose = require("mongoose");
const { Schema } = mongoose;

// ── User ──────────────────────────────────────────────────────────────────
const kycApplicationSchema = new Schema({
  fullName:           String,
  phone:              String,
  organization:       String,
  orgType:            String,
  panNumber:          String,
  address:            String,
  websiteUrl:         String,
  socialLinks:        String,
  purposeStatement:   String,
  status:             { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  submittedAt:        Date
});

const userSchema = new Schema({
  name:               { type: String, required: true, trim: true },
  email:              { type: String, required: true, unique: true, lowercase: true },
  password:           { type: String, required: true },
  walletAddress:      { type: String, lowercase: true },
  role:               { type: String, enum: ["donor","organiser","trustee","admin"], default: "donor" },
  kycVerified:        { type: Boolean, default: false },
  kycApplication:     kycApplicationSchema,
  approvedToCreate:   { type: Boolean, default: false },
  approvedBy:         { type: Schema.Types.ObjectId, ref: "User" },
  approvedAt:         Date,
  rejectionReason:    String,
  rejectedAt:         Date,
  createdAt:          { type: Date,   default: Date.now }
});

// ── Campaign (off-chain metadata mirrors on-chain) ─────────────────────────
const milestoneSchema = new Schema({
  description:   String,
  targetAmount:  Number,     // in ETH
  releasedAmount:{ type: Number, default: 0 },
  completed:     { type: Boolean, default: false },
  approvalCount: { type: Number,  default: 0 },
  completedAt:   Date
});

const campaignSchema = new Schema({
  contractAddress: { type: String, required: true, unique: true, lowercase: true },
  organiser:       { type: Schema.Types.ObjectId, ref: "User" },
  organiserWallet: { type: String, lowercase: true },
  title:           { type: String, required: true },
  description:     { type: String, required: true },
  category:        { type: String, enum: ["Healthcare","Education","Infrastructure","Relief","Environment","Other"] },
  imageUrl:        String,
  goalAmount:      Number,   // in ETH
  goalAmountINR:   Number,
  deadline:        Date,
  totalRaised:     { type: Number, default: 0 },
  totalDisbursed:  { type: Number, default: 0 },
  donorCount:      { type: Number, default: 0 },
  active:          { type: Boolean, default: true },
  goalReached:     { type: Boolean, default: false },
  milestones:      [milestoneSchema],
  trustees:        [String],          // wallet addresses
  requiredApprovals: Number,
  txHash:          String,            // creation tx hash
  blockNumber:     Number,
  lastSyncedBlock: { type: Number, default: 0 },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now }
});
campaignSchema.pre("save", function(next) { this.updatedAt = Date.now(); next(); });

// ── Donation ──────────────────────────────────────────────────────────────
const donationSchema = new Schema({
  campaign:        { type: Schema.Types.ObjectId, ref: "Campaign" },
  campaignAddress: { type: String, lowercase: true },
  donor:           { type: Schema.Types.ObjectId, ref: "User" },
  donorWallet:     { type: String, lowercase: true },
  amountETH:       Number,
  amountINR:       Number,
  txHash:          { type: String, unique: true },
  blockNumber:     Number,
  blockTimestamp:  Date,
  status:          { type: String, enum: ["pending","confirmed","failed"], default: "pending" },
  refunded:        { type: Boolean, default: false },
  createdAt:       { type: Date, default: Date.now }
});

// ── Transaction (all on-chain events) ─────────────────────────────────────
const transactionSchema = new Schema({
  txHash:          { type: String, required: true, unique: true },
  blockNumber:     Number,
  blockHash:       String,
  from:            { type: String, lowercase: true },
  to:              { type: String, lowercase: true },
  value:           String,         // wei as string (BigInt safe)
  valueETH:        Number,
  valueINR:        Number,
  type:            { type: String, enum: ["donation","disbursement","refund","contract_create","approval"] },
  campaign:        { type: Schema.Types.ObjectId, ref: "Campaign" },
  campaignAddress: { type: String, lowercase: true },
  milestoneId:     Number,
  description:     String,
  gasUsed:         String,
  gasPrice:        String,
  status:          { type: String, enum: ["pending","confirmed","failed"], default: "confirmed" },
  timestamp:       Date,
  createdAt:       { type: Date, default: Date.now }
});

// ── System Configuration (Sync Tracking) ──────────────────────────────────
const systemConfigSchema = new Schema({
  key:             { type: String, required: true, unique: true },
  value:           Schema.Types.Mixed,
  lastUpdatedAt:   { type: Date, default: Date.now }
});

// ── Exports ───────────────────────────────────────────────────────────────
const User         = mongoose.model("User",         userSchema);
const Campaign     = mongoose.model("Campaign",     campaignSchema);
const Donation     = mongoose.model("Donation",     donationSchema);
const Transaction  = mongoose.model("Transaction",  transactionSchema);
const SystemConfig = mongoose.model("SystemConfig", systemConfigSchema);

module.exports = { User, Campaign, Donation, Transaction, SystemConfig };
