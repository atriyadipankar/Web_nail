const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// User: Get user's orders
router.get('/', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.product', 'title images');

    const total = await Order.countDocuments({ user: req.user._id });
    const totalPages = Math.ceil(total / limit);

    res.render('orders/list', {
      title: 'My Orders',
      orders,
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
    console.error('Orders list error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading orders',
      error: { status: 500 }
    });
  }
});

// User: Get single order
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('items.product', 'title images');

    if (!order) {
      return res.status(404).render('error', {
        title: 'Order Not Found',
        message: 'Order not found',
        error: { status: 404 }
      });
    }

    res.render('orders/detail', {
      title: `Order #${order.orderNumber}`,
      order
    });
  } catch (error) {
    console.error('Order detail error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading order',
      error: { status: 500 }
    });
  }
});

// Success page after payment
router.get('/success', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.redirect('/');
    }

    const order = await Order.findOne({
      'paymentInfo.stripeSessionId': session_id,
      user: req.user._id
    }).populate('items.product', 'title images');

    if (!order) {
      return res.status(404).render('error', {
        title: 'Order Not Found',
        message: 'Order not found',
        error: { status: 404 }
      });
    }

    res.render('orders/success', {
      title: 'Order Confirmed',
      order
    });
  } catch (error) {
    console.error('Order success page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading order confirmation',
      error: { status: 500 }
    });
  }
});

// Admin: Get all orders
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingInfo.name': { $regex: search, $options: 'i' } },
        { 'shippingInfo.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const orders = await Order.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email')
      .populate('items.product', 'title');

    const total = await Order.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get status counts for filter
    const statusCounts = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.render('admin/orders', {
      title: 'Manage Orders',
      orders,
      statusCounts,
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
    console.error('Admin orders error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading orders',
      error: { status: 500 }
    });
  }
});

// Admin: Get single order
router.get('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'title images');

    if (!order) {
      return res.status(404).render('error', {
        title: 'Order Not Found',
        message: 'Order not found',
        error: { status: 404 }
      });
    }

    res.render('admin/order-detail', {
      title: `Order #${order.orderNumber}`,
      order
    });
  } catch (error) {
    console.error('Admin order detail error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading order',
      error: { status: 500 }
    });
  }
});

// Admin: Update order status
router.put('/admin/:id/status', requireAdmin, [
  body('status')
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid status'),
  body('trackingNumber')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Tracking number cannot exceed 100 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { status, trackingNumber, notes } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order
    order.status = status;
    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
    }
    if (notes) {
      order.notes = notes;
    }

    await order.save();

    res.json({
      message: 'Order updated successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        trackingNumber: order.trackingNumber,
        notes: order.notes
      }
    });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Add order note
router.post('/admin/:id/notes', requireAdmin, [
  body('note')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Note must be between 1 and 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { note } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Add note to status history
    order.statusHistory.push({
      status: order.status,
      date: new Date(),
      note
    });

    await order.save();

    res.json({
      message: 'Note added successfully',
      note: {
        status: order.status,
        date: new Date(),
        note
      }
    });
  } catch (error) {
    console.error('Add order note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User: Cancel order (only if pending/confirmed)
router.put('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    order.status = 'cancelled';
    await order.save();

    // TODO: Handle refund if payment was processed

    res.json({
      message: 'Order cancelled successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });
  } catch (error) {
    console.error('Order cancellation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get order tracking info
router.get('/:id/tracking', async (req, res) => {
  try {
    // Allow access for order owner or admin
    let query = { _id: req.params.id };
    if (!req.user || req.user.role !== 'admin') {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      query.user = req.user._id;
    }

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      trackingNumber: order.trackingNumber,
      statusHistory: order.statusHistory,
      shippingInfo: order.shippingInfo
    });
  } catch (error) {
    console.error('Order tracking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




