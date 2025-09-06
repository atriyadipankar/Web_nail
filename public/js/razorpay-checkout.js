// Razorpay Checkout Integration for Nail E-commerce

class RazorpayCheckout {
  constructor() {
    this.cart = JSON.parse(localStorage.getItem('cart') || '[]');
    this.isProcessing = false;
  }

  // Initialize checkout process
  async initiateCheckout(shippingInfo) {
    if (this.isProcessing) return;
    
    try {
      this.isProcessing = true;
      this.showLoader('Creating order...');

      // Validate cart
      if (this.cart.length === 0) {
        throw new Error('Cart is empty');
      }

      // Create Razorpay order
      const response = await fetch('/cart/create-razorpay-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: this.cart,
          shippingInfo: shippingInfo
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create order');
      }

      const orderData = await response.json();
      
      // Open Razorpay checkout
      this.openRazorpayCheckout(orderData);
      
    } catch (error) {
      console.error('Checkout error:', error);
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
      this.hideLoader();
    }
  }

  // Open Razorpay payment modal
  openRazorpayCheckout(orderData) {
    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Nail Studio',
      description: 'Premium Press-On Nails',
      image: '/images/logo.png', // Add your logo
      order_id: orderData.razorpayOrderId,
      
      // Customer details
      prefill: {
        name: orderData.customerInfo.name,
        email: orderData.customerInfo.email,
        contact: orderData.customerInfo.contact
      },
      
      // Shipping address
      shipping_address: {
        name: orderData.shippingInfo.name,
        line1: orderData.shippingInfo.address,
        city: orderData.shippingInfo.city,
        state: orderData.shippingInfo.state,
        postal_code: orderData.shippingInfo.postalCode,
        country: orderData.shippingInfo.country
      },
      
      // Theme
      theme: {
        color: '#e91e63'
      },
      
      // Payment methods
      method: {
        netbanking: true,
        card: true,
        upi: true,
        wallet: true
      },
      
      // Success handler
      handler: (response) => {
        this.handlePaymentSuccess(response, orderData.orderId);
      },
      
      // Modal settings
      modal: {
        ondismiss: () => {
          this.handlePaymentCancel();
        },
        escape: false,
        backdropclose: false
      },
      
      // Error handler
      error: (error) => {
        this.handlePaymentError(error);
      }
    };

    // Create Razorpay instance and open
    const rzp = new Razorpay(options);
    rzp.open();
  }

  // Handle successful payment
  async handlePaymentSuccess(response, orderId) {
    try {
      this.showLoader('Verifying payment...');
      
      // Verify payment with server
      const verifyResponse = await fetch('/cart/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          orderId: orderId
        })
      });

      if (!verifyResponse.ok) {
        throw new Error('Payment verification failed');
      }

      const result = await verifyResponse.json();
      
      // Clear cart and redirect
      localStorage.removeItem('cart');
      this.showSuccess('Payment successful! Redirecting...');
      
      setTimeout(() => {
        window.location.href = `/orders/${orderId}`;
      }, 2000);
      
    } catch (error) {
      console.error('Payment verification error:', error);
      this.showError('Payment verification failed. Please contact support.');
    } finally {
      this.hideLoader();
    }
  }

  // Handle payment cancellation
  handlePaymentCancel() {
    this.showInfo('Payment cancelled. You can try again.');
  }

  // Handle payment error
  handlePaymentError(error) {
    console.error('Payment error:', error);
    this.showError('Payment failed. Please try again.');
  }

  // UI Helper methods
  showLoader(message) {
    const loader = document.getElementById('checkout-loader');
    if (loader) {
      loader.innerHTML = `
        <div class="d-flex align-items-center justify-content-center p-4">
          <div class="spinner-border text-primary me-3" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span>${message}</span>
        </div>
      `;
      loader.style.display = 'block';
    }
  }

  hideLoader() {
    const loader = document.getElementById('checkout-loader');
    if (loader) {
      loader.style.display = 'none';
    }
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showInfo(message) {
    this.showToast(message, 'info');
  }

  showToast(message, type) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

    // Add to toast container
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }

    container.appendChild(toast);

    // Show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();

    // Remove from DOM after hiding
    toast.addEventListener('hidden.bs.toast', () => {
      toast.remove();
    });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  window.razorpayCheckout = new RazorpayCheckout();
  
  // Checkout form handler
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Get shipping info from form
      const formData = new FormData(checkoutForm);
      const shippingInfo = {
        name: formData.get('name'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        city: formData.get('city'),
        state: formData.get('state'),
        postalCode: formData.get('postalCode'),
        country: formData.get('country')
      };
      
      // Start checkout process
      window.razorpayCheckout.initiateCheckout(shippingInfo);
    });
  }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RazorpayCheckout;
}
