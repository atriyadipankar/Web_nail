require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const config = require('./config/config');
const connectDB = require('./config/database');
const { optionalAuth } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

const app = express();

// Connect to database
connectDB();

// Trust proxy for production
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
    },
  },
}));

// CORS
app.use(cors({
  origin: config.nodeEnv === 'production' ? false : true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Webhook route (before body parsing middleware)
app.use('/webhook', webhookRoutes);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Global middleware for authentication
app.use(optionalAuth);

// Global variables for views
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.stripePublishableKey = config.stripe.publishableKey;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/admin', adminRoutes);

// Home route
app.get('/', async (req, res) => {
  try {
    const Product = require('./models/Product');
    
    // Get featured products
    const featuredProducts = await Product.find({ 
      featured: true, 
      active: true 
    }).limit(8);
    
    // Get latest products if no featured products
    let products = featuredProducts;
    if (products.length === 0) {
      products = await Product.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(8);
    }

    res.render('home', { 
      title: 'Premium Press-On Nails',
      products,
      layout: 'layouts/main'
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).render('error', {
      title: 'Server Error',
      message: 'Something went wrong',
      error: { status: 500 }
    });
  }
});

// Search route
app.get('/search', async (req, res) => {
  try {
    const Product = require('./models/Product');
    const { q, category, color, minPrice, maxPrice, sort, page = 1 } = req.query;
    
    const limit = 12;
    const skip = (page - 1) * limit;
    
    // Build query
    let query = { active: true };
    
    if (q) {
      query.$text = { $search: q };
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (color && color !== 'all') {
      query.colors = { $in: [color] };
    }
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    
    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'price_asc':
        sortQuery.price = 1;
        break;
      case 'price_desc':
        sortQuery.price = -1;
        break;
      case 'rating':
        sortQuery['rating.average'] = -1;
        break;
      case 'newest':
        sortQuery.createdAt = -1;
        break;
      default:
        sortQuery.createdAt = -1;
    }
    
    if (q) {
      sortQuery.score = { $meta: 'textScore' };
    }
    
    const products = await Product.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);
    
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    
    // Get categories and colors for filters
    const categories = await Product.distinct('category', { active: true });
    const colors = await Product.distinct('colors', { active: true });
    
    res.render('search', {
      title: 'Search Products',
      products,
      categories,
      colors,
      query: req.query,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        next: parseInt(page) + 1,
        prev: parseInt(page) - 1
      },
      results: {
        total,
        showing: products.length,
        start: skip + 1,
        end: skip + products.length
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).render('error', {
      title: 'Search Error',
      message: 'Something went wrong with your search',
      error: { status: 500 }
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist',
    error: { status: 404 }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large' });
  }
  
  if (err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ message: err.message });
  }
  
  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({ message: `${field} already exists` });
  }
  
  // Default error
  const status = err.status || 500;
  const message = config.nodeEnv === 'production' ? 'Something went wrong' : err.message;
  
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.status(status).json({ message });
  } else {
    res.status(status).render('error', {
      title: 'Error',
      message,
      error: { status }
    });
  }
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});




