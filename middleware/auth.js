const User = require('../models/User');
const { verifyToken } = require('../utils/auth');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    req.user = null;
    next();
  }
};

// Require authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    return res.redirect('/auth/login');
  }
  next();
};

// Require admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    return res.redirect('/auth/login');
  }

  if (req.user.role !== 'admin') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    return res.status(403).render('error', { 
      title: 'Access Denied',
      message: 'Admin access required',
      error: { status: 403 }
    });
  }

  next();
};

// Optional authentication for views
const optionalAuth = async (req, res, next) => {
  await authenticate(req, res, () => {
    // Make user available to all views
    res.locals.user = req.user;
    res.locals.isAuthenticated = !!req.user;
    res.locals.isAdmin = req.user?.role === 'admin';
    next();
  });
};

module.exports = {
  authenticate,
  requireAuth,
  requireAdmin,
  optionalAuth
};




