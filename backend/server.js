require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express      = require("express");
const cors         = require("cors");
const mongoose     = require("mongoose");
const http         = require("http");
const { Server }   = require("socket.io");
const path         = require("path");
const rateLimit    = require("express-rate-limit");

const authRoutes       = require("./routes/auth");
const campaignRoutes   = require("./routes/campaigns");
const donationRoutes   = require("./routes/donations");
const txRoutes         = require("./routes/transactions");
const blockchainRoutes = require("./routes/blockchain");
const kycRoutes        = require("./routes/kyc");
const { startListener } = require("./services/blockchainListener");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Rate limiting (generous for dashboard polling/socket activity)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 });
app.use("/api/", limiter);

// Attach io to req for use in routes
app.use((req, _res, next) => { req.io = io; next(); });

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/auth",        authRoutes);
app.use("/api/campaigns",   campaignRoutes);
app.use("/api/donations",   donationRoutes);
app.use("/api/transactions",txRoutes);
app.use("/api/blockchain",  blockchainRoutes);
app.use("/api/kyc",         kycRoutes);

// Serve factory address to frontend
app.get('/config', (_req, res) => {
  const factoryAddress = process.env.FACTORY_ADDRESS;
  if (factoryAddress) {
    return res.json({ factory: factoryAddress });
  }

  try {
    const data = require('./deployedAddresses.json');
    res.json(data);
  } catch (_) {
    res.json({ factory: null, error: 'Factory address not configured. Set FACTORY_ADDRESS env var.' });
  }
});

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: Date.now() }));

// Serve frontend for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ── WebSocket ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("subscribe_campaign", (address) => socket.join(`campaign:${address}`));
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

const { Campaign, SystemConfig } = require("./models");

// ── Database & Start ───────────────────────────────────────────────────────
const PORT    = process.env.PORT || 5000;
const MONGO   = process.env.MONGODB_URI || "mongodb://localhost:27017/chainfund";

// 1. Immediately start the server to satisfy Render health checks
server.listen(PORT, () => {
  console.log(`🚀 ChainFund backend listening on port ${PORT}`);
  console.log("⏳ Connecting to database in background...");
});

// 2. Connect to MongoDB in the background
mongoose.connect(MONGO)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // ── Database Cleanup (Remove M.A.D and corrupted entries) ────────────────
    try {
      const deletedCorrupted = await Campaign.deleteMany({ 
        $or: [
          { title: /M\.A\.D/i },
          { contractAddress: { $exists: false } },
          { contractAddress: null },
          { contractAddress: "" }
        ] 
      });
      if (deletedCorrupted.deletedCount > 0) {
        console.log(`🧹 Cleanup: Removed ${deletedCorrupted.deletedCount} corrupted/M.A.D campaigns`);
      }
    } catch (e) {
      console.warn("⚠️ Cleanup failed:", e.message);
    }

    // 3. Start blockchain event listener only after DB is ready
    startListener(io).catch(err => {
      console.error("⚠️  Blockchain listener failed to start:", err.message);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    console.log("⚠️  Platform running in limited 'No-DB' mode.");
  });

module.exports = { app, io };