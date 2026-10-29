module.exports = (...allowed) => (req, res, next) => {
  const role = req.user?.role;

  if (!allowed.includes(role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Requires: ${allowed.join(', ')}`,
    });
  }

  next();
};