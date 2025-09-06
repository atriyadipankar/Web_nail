const express = require('express');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const { upload, processDesignImage } = require('../middleware/upload');

const router = express.Router();

// Admin dashboard
router.get('/', requireAdmin, async (req, res) => {
  try {
    // Get dashboard statistics
    const [
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue,
      recentOrders,
      lowStockProducts,
      monthlyStats
    ] = await Promise.all([
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      User.countDocuments(),
      Order.aggregate([
        { $match: { 'paymentInfo.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email')
        .populate('items.product', 'title'),
      Product.aggregate([
        { $unwind: '$variants' },
        { $match: { 'variants.stock': { $lte: 5 }, active: true } },
        { $group: { 
          _id: '$_id', 
          title: { $first: '$title' },
          totalStock: { $sum: '$variants.stock' },
          variants: { $push: '$variants' }
        }},
        { $limit: 10 }
      ]),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            orders: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ['$paymentInfo.status', 'paid'] }, '$total', 0] } }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    const revenue = totalRevenue[0]?.total || 0;

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalRevenue: revenue
      },
      recentOrders,
      lowStockProducts,
      monthlyStats
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading dashboard',
      error: { status: 500 }
    });
  }
});

// Products management
router.get('/products', requireAdmin, async (req, res) => {
  try {
    const { 
      category, 
      status = 'all', 
      page = 1, 
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    
    if (status === 'active') {
      query.active = true;
    } else if (status === 'inactive') {
      query.active = false;
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    if (search) {
      sort.score = { $meta: 'textScore' };
    }
    
    const products = await Product.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get categories for filter
    const categories = await Product.distinct('category');

    res.render('admin/products', {
      title: 'Manage Products',
      products,
      categories,
      query: req.query,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        next: parseInt(page) + 1,
        prev: parseInt(page) - 1
      }
    });
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading products',
      error: { status: 500 }
    });
  }
});

// Product form (new/edit)
router.get('/products/new', requireAdmin, (req, res) => {
  res.render('admin/product-form', {
    title: 'Add New Product',
    product: null,
    action: 'create'
  });
});

router.get('/products/:id/edit', requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).render('error', {
        title: 'Product Not Found',
        message: 'Product not found',
        error: { status: 404 }
      });
    }
    
    res.render('admin/product-form', {
      title: 'Edit Product',
      product,
      action: 'edit'
    });
  } catch (error) {
    console.error('Product edit form error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading product',
      error: { status: 500 }
    });
  }
});

// Design image upload page
router.get('/designs', requireAdmin, async (req, res) => {
  try {
    // Get all uploaded design images
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const designsDir = path.join('public', 'uploads', 'designs');
      const files = await fs.readdir(designsDir);
      const designs = files
        .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
        .map(file => ({
          filename: file,
          url: `/uploads/designs/${file}`,
          uploadDate: new Date() // In a real app, you'd store this in DB
        }))
        .sort((a, b) => b.uploadDate - a.uploadDate);

      res.render('admin/designs', {
        title: 'Manage Design Images',
        designs
      });
    } catch (err) {
      // Directory doesn't exist or is empty
      res.render('admin/designs', {
        title: 'Manage Design Images',
        designs: []
      });
    }
  } catch (error) {
    console.error('Designs page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading designs',
      error: { status: 500 }
    });
  }
});

// Upload design image
router.post('/designs/upload', requireAdmin, upload.single('design'), processDesignImage, (req, res) => {
  try {
    if (!req.processedImage) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    res.json({
      message: 'Design image uploaded successfully',
      design: req.processedImage
    });
  } catch (error) {
    console.error('Design upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete design image
router.delete('/designs/:filename', requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    const { deleteImage } = require('../middleware/upload');
    
    await deleteImage(`/uploads/designs/${filename}`);
    
    res.json({ message: 'Design image deleted successfully' });
  } catch (error) {
    console.error('Design deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Users management
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { 
      role = 'all', 
      page = 1, 
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    
    if (role !== 'all') {
      query.role = role;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const users = await User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.render('admin/users', {
      title: 'Manage Users',
      users,
      query: req.query,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        next: parseInt(page) + 1,
        prev: parseInt(page) - 1
      }
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading users',
      error: { status: 500 }
    });
  }
});

// Update user role
router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      message: 'User role updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('User role update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Analytics
router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [
      salesData,
      topProducts,
      categoryStats,
      orderStatusStats
    ] = await Promise.all([
      // Daily sales for the period
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            'paymentInfo.status': 'paid'
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$total' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),
      
      // Top selling products
      Order.aggregate([
        { $match: { 'paymentInfo.status': 'paid' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            title: { $first: '$items.title' },
            totalSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 }
      ]),
      
      // Category performance
      Order.aggregate([
        { $match: { 'paymentInfo.status': 'paid' } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.category',
            orders: { $sum: 1 },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { revenue: -1 } }
      ]),
      
      // Order status distribution
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.render('admin/analytics', {
      title: 'Analytics',
      period: days,
      salesData,
      topProducts,
      categoryStats,
      orderStatusStats
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading analytics',
      error: { status: 500 }
    });
  }
});

module.exports = router;




