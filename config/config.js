module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nail-ecommerce',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
  nodeEnv: process.env.NODE_ENV || 'development',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@nailstore.com',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
};

