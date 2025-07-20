const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.error('No Authorization header:', req.headers);
    return res.status(401).json({ error: 'No Authorization header provided' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.error('No token found in Authorization header:', authHeader);
    return res.status(401).json({ error: 'No token found in Authorization header' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.stack || err);
      return res.status(403).json({ error: 'Invalid or expired token', details: err.message });
    }
    req.user = user;
    next();
  });
}

exports.verifyToken = verifyToken;

exports.requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};
