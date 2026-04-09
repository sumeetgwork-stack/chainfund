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

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
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
  try {
    const data = require('./deployedAddresses.json');
    res.json(data);
  } catch (_) {
    res.status(404).json({ error: 'Not deployed yet. Run: npx hardhat run scripts/deploy.js --network localhost' });
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

// ── Database & Start ───────────────────────────────────────────────────────
const PORT    = process.env.PORT || 5000;
const MONGO   = process.env.MONGODB_URI || "mongodb://localhost:27017/chainfund";

mongoose.connect(MONGO)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => {
      console.log(`🚀 ChainFund backend running on http://localhost:${PORT}`);
    });
    // Start blockchain event listener
    startListener(io).catch(console.error);
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    console.log("Starting without DB (demo mode)...");
    server.listen(PORT, () => {
      console.log(`🚀 ChainFund backend running on http://localhost:${PORT} [No DB]`);
    });
  });

module.exports = { app, io };