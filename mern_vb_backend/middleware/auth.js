const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

exports.requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};
