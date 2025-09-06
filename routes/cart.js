const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { requireAuth } = require('../middleware/auth');
const config = require('../config/config');
const stripe = require('stripe')(config.stripe.secretKey);

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

// Create Stripe checkout session
router.post('/create-checkout-session', requireAuth, [
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
        stripeSessionId: '' // Will be updated after session creation
      }
    });

    await order.save();

    // Create Stripe line items
    const lineItems = validatedCart.items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${item.title} (${item.variant.size}, ${item.variant.design})`,
          images: item.image ? [`${req.protocol}://${req.get('host')}${item.image}`] : []
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    // Add tax and shipping as line items
    if (validatedCart.tax > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tax'
          },
          unit_amount: Math.round(validatedCart.tax * 100)
        },
        quantity: 1
      });
    }

    if (validatedCart.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping'
          },
          unit_amount: Math.round(validatedCart.shipping * 100)
        },
        quantity: 1
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cart/checkout`,
      metadata: {
        orderId: order._id.toString(),
        userId: req.user._id.toString()
      },
      customer_email: req.user.email,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA']
      }
    });

    // Update order with session ID
    order.paymentInfo.stripeSessionId = session.id;
    await order.save();

    res.json({
      sessionId: session.id,
      orderId: order._id
    });
  } catch (error) {
    console.error('Checkout session creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




