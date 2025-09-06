const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { requireAuth } = require('../middleware/auth');
const config = require('../config/config');
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret
});

const router = express.Router();

// Cart page
router.get('/', (req, res) => {
  res.render('cart/index', {
    title: 'Shopping Cart'
  });
});

// Add to cart (client-side handling, server validation)
router.post('/add', [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('size').notEmpty().withMessage('Size is required'),
  body('design').notEmpty().withMessage('Design is required'),
  body('quantity').isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { productId, size, design, quantity } = req.body;

    // Get product and validate
    const product = await Product.findById(productId);
    if (!product || !product.active) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Find variant and check stock
    const variant = product.variants.find(v => v.size === size && v.design === design);
    if (!variant) {
      return res.status(400).json({ message: 'Selected variant not available' });
    }

    if (variant.stock < quantity) {
      return res.status(400).json({ 
        message: `Only ${variant.stock} items available in stock`,
        availableStock: variant.stock
      });
    }

    // Return product data for client-side cart
    const cartItem = {
      productId: product._id,
      title: product.title,
      price: product.price,
      image: product.images.find(img => img.isPrimary)?.url || product.images[0]?.url,
      variant: {
        size,
        design
      },
      quantity,
      maxQuantity: Math.min(variant.stock, 10)
    };

    res.json({
      message: 'Item added to cart',
      item: cartItem
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Validate cart items (before checkout)
router.post('/validate', [
  body('items').isArray({ min: 1 }).withMessage('Cart cannot be empty'),
  body('items.*.productId').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1, max: 10 }).withMessage('Invalid quantity')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { items } = req.body;
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.active) {
        return res.status(400).json({
          message: `Product "${item.productId}" is no longer available`
        });
      }

      const variant = product.variants.find(v => 
        v.size === item.variant.size && v.design === item.variant.design
      );

      if (!variant) {
        return res.status(400).json({
          message: `Variant for "${product.title}" is no longer available`
        });
      }

      if (variant.stock < item.quantity) {
        return res.status(400).json({
          message: `Only ${variant.stock} items available for "${product.title}" (${variant.size}, ${variant.design})`
        });
      }

      const validatedItem = {
        product: product._id,
        title: product.title,
        price: product.price,
        quantity: item.quantity,
        variant: {
          size: variant.size,
          design: variant.design
        },
        image: product.images.find(img => img.isPrimary)?.url || product.images[0]?.url
      };

      validatedItems.push(validatedItem);
      subtotal += product.price * item.quantity;
    }

    const tax = subtotal * 0.08; // 8% tax
    const shipping = subtotal >= 50 ? 0 : 9.99; // Free shipping over $50
    const total = subtotal + tax + shipping;

    res.json({
      items: validatedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping: Math.round(shipping * 100) / 100,
      total: Math.round(total * 100) / 100
    });
  } catch (error) {
    console.error('Cart validation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Checkout page
router.get('/checkout', requireAuth, (req, res) => {
  res.render('cart/checkout', {
    title: 'Checkout'
  });
});

// Create Razorpay order
router.post('/create-razorpay-order', requireAuth, [
  body('items').isArray({ min: 1 }).withMessage('Cart cannot be empty'),
  body('shippingInfo.name').trim().notEmpty().withMessage('Name is required'),
  body('shippingInfo.phone').trim().notEmpty().withMessage('Phone is required'),
  body('shippingInfo.address').trim().notEmpty().withMessage('Address is required'),
  body('shippingInfo.city').trim().notEmpty().withMessage('City is required'),
  body('shippingInfo.state').trim().notEmpty().withMessage('State is required'),
  body('shippingInfo.postalCode').trim().notEmpty().withMessage('Postal code is required'),
  body('shippingInfo.country').trim().notEmpty().withMessage('Country is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { items, shippingInfo } = req.body;

    // Validate cart items
    const validationResponse = await fetch(`${req.protocol}://${req.get('host')}/cart/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items })
    });

    if (!validationResponse.ok) {
      const error = await validationResponse.json();
      return res.status(400).json(error);
    }

    const validatedCart = await validationResponse.json();

    // Create order in database (pending status)
    const order = new Order({
      user: req.user._id,
      items: validatedCart.items,
      subtotal: validatedCart.subtotal,
      tax: validatedCart.tax,
      shipping: validatedCart.shipping,
      total: validatedCart.total,
      shippingInfo,
      paymentInfo: {
        status: 'pending',
        amount: validatedCart.total,
        razorpayOrderId: '' // Will be updated after order creation
      }
    });

    await order.save();

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(validatedCart.total * 100), // Amount in paise (smallest currency unit)
      currency: 'INR',
      receipt: `order_${order._id}`,
      notes: {
        orderId: order._id.toString(),
        userId: req.user._id.toString(),
        userEmail: req.user.email
      }
    });

    // Update order with Razorpay order ID
    order.paymentInfo.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      razorpayOrderId: razorpayOrder.id,
      orderId: order._id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: config.razorpay.keyId,
      customerInfo: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || shippingInfo.phone
      },
      shippingInfo: shippingInfo
    });
  } catch (error) {
    console.error('Checkout session creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify Razorpay payment
router.post('/verify-payment', requireAuth, [
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('orderId').isMongoId().withMessage('Invalid order ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const crypto = require('crypto');
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    // Update order status
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    order.paymentInfo.status = 'completed';
    order.paymentInfo.razorpayPaymentId = razorpay_payment_id;
    order.status = 'confirmed';
    await order.save();

    // Update product stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        const variant = product.variants.find(v => 
          v.size === item.variant.size && v.design === item.variant.design
        );
        if (variant) {
          variant.stock -= item.quantity;
          await product.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




