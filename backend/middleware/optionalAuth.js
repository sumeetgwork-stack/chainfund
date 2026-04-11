const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "chainfund_dev_secret_change_in_prod";

// Like auth middleware but doesn't reject if no token present.
// req.user will be set if a valid token exists, null otherwise.
module.exports = function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};
