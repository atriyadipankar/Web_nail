const express = require('express');
const stripe = require('stripe')(require('../config/config').stripe.secretKey);
const Order = require('../models/Order');
const Product = require('../models/Product');
const config = require('../config/config');

const router = express.Router();

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session) {
  try {
    const orderId = session.metadata.orderId;
    const order = await Order.findById(orderId);

    if (!order) {
      console.error('Order not found for session:', session.id);
      return;
    }

    // Update order status
    order.paymentInfo.status = 'paid';
    order.paymentInfo.stripePaymentIntentId = session.payment_intent;
    order.paymentInfo.paidAt = new Date();
    order.status = 'confirmed';

    await order.save();

    // Update product stock
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        const variant = product.variants.find(v => 
          v.size === item.variant.size && v.design === item.variant.design
        );
        
        if (variant && variant.stock >= item.quantity) {
          variant.stock -= item.quantity;
          await product.save();
        }
      }
    }

    console.log(`Order ${order.orderNumber} confirmed and stock updated`);
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}

// Handle successful payment intent
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    const order = await Order.findOne({
      'paymentInfo.stripePaymentIntentId': paymentIntent.id
    });

    if (order) {
      order.paymentInfo.status = 'paid';
      order.paymentInfo.paidAt = new Date();
      
      if (order.status === 'pending') {
        order.status = 'confirmed';
      }

      await order.save();
      console.log(`Payment confirmed for order ${order.orderNumber}`);
    }
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
}

// Handle failed payment intent
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    const order = await Order.findOne({
      'paymentInfo.stripePaymentIntentId': paymentIntent.id
    });

    if (order) {
      order.paymentInfo.status = 'failed';
      order.status = 'cancelled';
      await order.save();
      console.log(`Payment failed for order ${order.orderNumber}`);
    }
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}

module.exports = router;




