const jwt = require('jsonwebtoken');

// Use the same JWT_SECRET from auth.controller.js
const JWT_SECRET = process.env.JWT_SECRET ;

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  console.log('🔐 DASHBOARD AUTH - Headers:', req.headers);
  console.log('🔐 DASHBOARD AUTH - Auth header:', auth);

  if (!auth) {
    console.log('❌ No authorization header');
    return res.status(401).json({ 
      success: false,
      message: 'Token missing' 
    });
  }

  const token = auth.split(' ')[1];
  console.log('🔑 Token received:', token ? token.substring(0, 20) + '...' : 'None');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token verified. Payload:', payload);
    
    const userRole = payload.role?.toString().trim();
    
    if (userRole !== 'super_admin' && userRole !== 'member') {
      console.log('❌ Invalid role for dashboard access:', userRole);
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Super admin or team member only.' 
      });
    }
    
    payload.role = userRole;
    req.user = payload;
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid token',
      error: err.message 
    });
  }
};