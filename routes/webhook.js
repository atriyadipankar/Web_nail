const express = require('express');
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const config = require('../config/config');

const router = express.Router();

// Razorpay webhook endpoint
router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSignature = req.headers['x-razorpay-signature'];
  
  // Verify webhook signature
  const body = req.body.toString();
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(body)
    .digest('hex');

  if (webhookSignature !== expectedSignature) {
    console.error('Razorpay webhook signature verification failed');
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    const event = JSON.parse(body);
    
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      
      case 'order.paid':
        await handleOrderPaid(event.payload.order.entity);
        break;
      
      default:
        console.log(`Unhandled Razorpay event type: ${event.event}`);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment capture
async function handlePaymentCaptured(payment) {
  try {
    const orderId = payment.notes?.orderId;
    if (!orderId) {
      console.error('Order ID not found in payment notes:', payment.id);
      return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.error('Order not found for payment:', payment.id);
      return;
    }

    // Update order status
    order.paymentInfo.status = 'paid';
    order.paymentInfo.razorpayPaymentId = payment.id;
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
    console.error('Error handling payment captured:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(payment) {
  try {
    const orderId = payment.notes?.orderId;
    if (!orderId) {
      console.error('Order ID not found in payment notes:', payment.id);
      return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.error('Order not found for payment:', payment.id);
      return;
    }

    order.paymentInfo.status = 'failed';
    order.status = 'cancelled';
    await order.save();
    
    console.log(`Payment failed for order ${order.orderNumber}`);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Handle order paid event
async function handleOrderPaid(razorpayOrder) {
  try {
    const order = await Order.findOne({
      'paymentInfo.razorpayOrderId': razorpayOrder.id
    });

    if (!order) {
      console.error('Order not found for Razorpay order:', razorpayOrder.id);
      return;
    }

    order.paymentInfo.status = 'paid';
    order.paymentInfo.paidAt = new Date();
    order.status = 'confirmed';

    await order.save();
    console.log(`Order ${order.orderNumber} marked as paid`);
  } catch (error) {
    console.error('Error handling order paid:', error);
  }
}

module.exports = router;




