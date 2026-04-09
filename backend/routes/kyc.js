// routes/kyc.js — KYC application + admin approval system
const router = require("express").Router();
const { User } = require("../models");
const auth    = require("../middleware/auth");

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

// ── Submit KYC Application ─────────────────────────────────────────────────
router.post("/apply", auth, async (req, res) => {
  try {
    const { fullName, phone, organization, orgType, panNumber, address, purposeStatement, websiteUrl, socialLinks } = req.body;
    if (!fullName || !phone || !organization || !orgType || !purposeStatement)
      return res.status(400).json({ error: "All required fields must be filled" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.approvedToCreate)
      return res.status(400).json({ error: "Already approved to create campaigns" });
    if (user.kycApplication?.status === "pending")
      return res.status(400).json({ error: "Application already under review" });

    user.kycApplication = {
      fullName, phone, organization, orgType,
      panNumber, address, purposeStatement,
      websiteUrl, socialLinks,
      submittedAt: new Date(),
      status: "pending"
    };
    await user.save();

    req.io?.emit("kyc_application", { userId: user._id, name: user.name, email: user.email, org: organization });
    res.json({ success: true, message: "Application submitted successfully. You will be notified once reviewed." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get my KYC status ──────────────────────────────────────────────────────
router.get("/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("kycApplication approvedToCreate rejectionReason approvedAt");
    res.json({
      approvedToCreate: user.approvedToCreate,
      kycStatus:        user.kycApplication?.status || "not_applied",
      submittedAt:      user.kycApplication?.submittedAt,
      approvedAt:       user.approvedAt,
      rejectionReason:  user.rejectionReason,
      application:      user.kycApplication
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: List applications ───────────────────────────────────────────────
router.get("/applications", auth, requireAdmin, async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = {};
    if (status !== "all") filter["kycApplication.status"] = status;
    const users = await User.find(filter)
      .select("name email walletAddress kycApplication approvedToCreate createdAt")
      .sort({ "kycApplication.submittedAt": -1 });
    const total = await User.countDocuments(filter);
    res.json({ applications: users, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/approve/:userId", auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔗 ON-CHAIN AUTHORIZATION
    try {
      const { getFactoryContract, getAdminSigner } = require("../services/blockchain");
      if (user.walletAddress) {
        const factory = getFactoryContract();
        const signer  = getAdminSigner();
        const tx      = await factory.connect(signer).setOrganiserAuthorization(user.walletAddress, true);
        console.log(`🔗 Whitelisting organiser on-chain: ${user.walletAddress} | TX: ${tx.hash}`);
        await tx.wait(); // Wait for confirmation to ensure security
      }
    } catch(e) {
      console.error("❌ On-chain whitelisting failed:", e.message);
      // We still update the DB, but warn the user. 
      // In a strict prod environment, we might want to fail the whole request here.
    }

    user.approvedToCreate      = true;
    user.role                  = "organiser";
    user.kycApplication.status = "approved";
    user.approvedBy            = req.user.id;
    user.approvedAt            = new Date();
    await user.save();
    req.io?.emit("kyc_decision", { userId: user._id.toString(), status: "approved" });
    res.json({ success: true, message: `${user.name} approved and whitelisted on-chain` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Reject ──────────────────────────────────────────────────────────
router.post("/reject/:userId", auth, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "Rejection reason required" });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.approvedToCreate      = false;
    user.kycApplication.status = "rejected";
    user.rejectionReason       = reason;
    user.rejectedAt            = new Date();
    await user.save();
    req.io?.emit("kyc_decision", { userId: user._id.toString(), status: "rejected" });
    res.json({ success: true, message: `${user.name} rejected` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Revoke ──────────────────────────────────────────────────────────
router.post("/revoke/:userId", auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.approvedToCreate = false;
    user.role             = "donor";
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN: Stats ───────────────────────────────────────────────────────────
router.get("/admin/stats", auth, requireAdmin, async (req, res) => {
  try {
    const [pending, approved, rejected, total] = await Promise.all([
      User.countDocuments({ "kycApplication.status": "pending" }),
      User.countDocuments({ approvedToCreate: true }),
      User.countDocuments({ "kycApplication.status": "rejected" }),
      User.countDocuments()
    ]);
    res.json({ pending, approved, rejected, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DEV ONLY: Auto-verify current user (for testing) ─────────────────────
router.post("/dev-verify", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔗 ON-CHAIN AUTHORIZATION
    try {
      const { getFactoryContract, getAdminSigner } = require("../services/blockchain");
      if (user.walletAddress) {
        const factory = getFactoryContract();
        const signer  = getAdminSigner();
        const tx      = await factory.connect(signer).setOrganiserAuthorization(user.walletAddress, true);
        console.log(`🔗 [DEV] Whitelisting organiser on-chain: ${user.walletAddress} | TX: ${tx.hash}`);
        await tx.wait();
      }
    } catch(e) { console.error("❌ On-chain dev-whitelisting failed:", e.message); }

    user.approvedToCreate      = true;
    user.role                  = "organiser";
    user.kycApplication.status = "approved";
    user.approvedAt            = new Date();

    await user.save();
    req.io?.emit("kyc_decision", { userId: user._id.toString(), status: "approved" });

    res.json({ success: true, message: "Developer auto-verification and on-chain whitelisting successful!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
