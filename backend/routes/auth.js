const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { User } = require("../models");

const JWT_SECRET = process.env.JWT_SECRET || "chainfund_dev_secret_change_in_prod";

// ── Register ──────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, walletAddress, role, phone, upiId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email, and password required" });

    // Prevent self-registration as trustee or admin
    const safeRole = (role === "trustee" || role === "admin") ? "donor" : (role || "donor");

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 12);
    const user   = await User.create({ name, email, password: hashed, walletAddress: walletAddress?.toLowerCase(), role: safeRole, phone, upiId });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress, phone: user.phone, upiId: user.upiId }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress, phone: user.phone, upiId: user.upiId }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────
router.get("/me", require("../middleware/auth"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update wallet address ─────────────────────────────────────────────────
router.put("/wallet", require("../middleware/auth"), async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "Wallet address required" });
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { walletAddress: walletAddress.toLowerCase() },
      { new: true }
    ).select("-password");

    // If the user was already approved as an organiser, ensure their new wallet is whitelisted on-chain
    if (user.approvedToCreate && user.walletAddress) {
      try {
        const { getFactoryContract, getAdminSigner } = require("../services/blockchain");
        const factory = getFactoryContract();
        const signer  = getAdminSigner();
        // Fire and forget (don't block the endpoint)
        factory.connect(signer).setOrganiserAuthorization(user.walletAddress, true)
          .then(tx => console.log(`🔗 Wallet sync whitelist: ${user.walletAddress} | TX: ${tx.hash}`))
          .catch(e => console.error("❌ Auto wallet sync failed:", e.message));
      } catch (err) {
        console.error("❌ Could not connect to blockchain for wallet sync", err.message);
      }
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update Profile ────────────────────────────────────────────────────────
router.put("/profile", require("../middleware/auth"), async (req, res) => {
  try {
    const { name, phone, upiId } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, upiId },
      { new: true }
    ).select("-password");

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Change Password ───────────────────────────────────────────────────────
router.put("/change-password", require("../middleware/auth"), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) 
      return res.status(400).json({ error: "Current and new password required" });
      
    if (newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect current password" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Wallet-based login/registration ──────────────────────────────────────
router.post("/login-wallet", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "Wallet address required" });

    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    
    if (!user) {
      // New wallet user — return not found
      return res.status(404).json({ error: "No account linked to this wallet. Please create an account first." });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        walletAddress: user.walletAddress,
        phone: user.phone,
        upiId: user.upiId
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
