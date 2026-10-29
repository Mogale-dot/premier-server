const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      success: false,
      message: 'Token missing',
    });
  }

  const token = auth.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token format',
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const userRole = payload.role?.toString().trim();

    /* PCL roles */
    const allowedRoles = ['admin', 'captain', 'player', 'member'];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Invalid role.',
      });
    }

    payload.role = userRole;
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: err.message,
    });
  }
};