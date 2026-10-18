const jwt = require("jsonwebtoken");

exports.signAccessToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  const expiry = process.env.JWT_ACCESS_EXPIRES || "15m";

  if (!secret) throw new Error("JWT_SECRET is not set in environment");

  return jwt.sign(
    { ...payload, type: "access" },
    secret,
    { expiresIn: expiry }
  );
};

exports.signRefreshToken = (payload) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiry = process.env.JWT_REFRESH_EXPIRES || "7d";

  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set in environment");

  return jwt.sign(
    { id: payload.id, email: payload.email, type: "refresh" },
    secret,
    { expiresIn: expiry }
  );
};

exports.verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in environment");
  return jwt.verify(token, secret);
};

exports.verifyRefreshToken = (token) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set in environment");
  return jwt.verify(token, secret);
};