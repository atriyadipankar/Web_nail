const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  variant: {
    size: {
      type: String,
      required: true,
      enum: ['XS', 'S', 'M', 'L', 'XL']
    },
    design: {
      type: String,
      required: true
    }
  },
  image: String
});

const shippingInfoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  postalCode: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    required: true,
    trim: true
  }
});

const paymentInfoSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'completed'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['razorpay', 'cod', 'bank_transfer'],
    default: 'razorpay'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  paidAt: Date,
  refundedAt: Date,
  refundAmount: {
    type: Number,
    min: 0,
    default: 0
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  shipping: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  discount: {
    type: Number,
    min: 0,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    ],
    default: 'pending'
  },
  shippingInfo: shippingInfoSchema,
  paymentInfo: paymentInfoSchema,
  tracking: {
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    shippedAt: Date,
    deliveredAt: Date
  },
  notes: {
    customer: String,
    admin: String
  },
  refund: {
    requested: {
      type: Boolean,
      default: false
    },
    requestedAt: Date,
    reason: String,
    status: {
      type: String,
      enum: ['none', 'requested', 'approved', 'rejected', 'processed'],
      default: 'none'
    },
    processedAt: Date,
    amount: {
      type: Number,
      min: 0,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Find the last order of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const lastOrder = await this.constructor
      .findOne({
        createdAt: { $gte: today, $lt: tomorrow }
      })
      .sort({ createdAt: -1 });
    
    let sequence = 1;
    if (lastOrder && lastOrder.orderNumber) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-3));
      sequence = lastSequence + 1;
    }
    
    this.orderNumber = `ORD${year}${month}${day}${sequence.toString().padStart(3, '0')}`;
  }
  next();
});

// Index for efficient queries
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'paymentInfo.status': 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for order total items count
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for order status display
orderSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    pending: 'Pending Payment',
    confirmed: 'Order Confirmed',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for payment status display
orderSchema.virtual('paymentStatusDisplay').get(function() {
  const statusMap = {
    pending: 'Payment Pending',
    paid: 'Payment Completed',
    failed: 'Payment Failed',
    refunded: 'Refunded',
    completed: 'Completed'
  };
  return statusMap[this.paymentInfo.status] || this.paymentInfo.status;
});

module.exports = mongoose.model('Order', orderSchema);
