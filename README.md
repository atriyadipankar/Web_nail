# Nail Studio - E-commerce Platform

A complete e-commerce website for selling press-on colored and designed nails, built with Node.js, Express, MongoDB, Bootstrap 5, and Stripe payment integration.

## 🚀 Features

### Customer Features
- **Product Catalog**: Browse beautiful nail designs with search, filtering, and pagination
- **Product Details**: Multiple images, variant selection (size, design), stock checking
- **Shopping Cart**: Add/remove items, update quantities, persistent cart storage
- **Secure Checkout**: Stripe payment integration with order confirmation
- **User Authentication**: Secure signup/login with JWT tokens
- **Order Management**: Track orders, view order history
- **Responsive Design**: Mobile-friendly Bootstrap 5 interface

### Admin Features
- **Product Management**: Full CRUD operations for products and variants
- **Image Upload**: Upload and manage nail design images
- **Order Management**: Update order statuses, add tracking numbers
- **User Management**: View and manage user accounts
- **Analytics Dashboard**: Sales reports, product performance, order statistics
- **Inventory Management**: Track stock levels and low inventory alerts

### Technical Features
- **Secure Authentication**: bcrypt password hashing, HTTP-only cookies
- **Payment Processing**: Stripe Checkout with webhook verification
- **Image Processing**: Sharp for image optimization and resizing
- **Input Validation**: Server-side validation with express-validator
- **Security**: Helmet, CORS, rate limiting, CSRF protection
- **Database**: MongoDB with Mongoose ODM

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local installation or MongoDB Atlas)
- Razorpay account for payment processing

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nail-ecommerce
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/nail-ecommerce

   # JWT Secret
   JWT_SECRET=your-super-secret-jwt-key-change-in-production

   # Server
   PORT=3000
   NODE_ENV=development

   # Razorpay (Get these from your Razorpay dashboard)
   RAZORPAY_KEY_ID=rzp_test_your_key_id_here
   RAZORPAY_KEY_SECRET=your_key_secret_here
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

   # App Settings
   SESSION_SECRET=your-session-secret-change-in-production
   ADMIN_EMAIL=admin@nailstore.com
   ADMIN_PASSWORD=admin123
   ```

4. **Razorpay Setup**
   - Create a free account at [razorpay.com](https://razorpay.com)
   - Go to Dashboard → Settings → API Keys
   - Copy your Test Key ID and Secret
   - Update the `.env` file with your keys:
     ```env
     RAZORPAY_KEY_ID=rzp_test_your_actual_key_id
     RAZORPAY_KEY_SECRET=your_actual_key_secret
     ```
   - For webhooks, add your webhook secret (optional for development)

5. **Database Setup**
   Make sure MongoDB is running, then seed the database:
   ```bash
   npm run seed
   ```

6. **Start the server**
   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

7. **Access the application**
   - Website: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin

## 🔑 Default Credentials

After running the seed script:

**Admin Account:**
- Email: admin@nailstore.com
- Password: admin123

**Sample User Account:**
- Email: jane@example.com
- Password: password123

## 🏗️ Project Structure

```
nail-ecommerce/
├── config/                 # Configuration files
│   ├── config.js           # App configuration
│   └── database.js         # Database connection
├── middleware/             # Custom middleware
│   ├── auth.js             # Authentication middleware
│   └── upload.js           # File upload handling
├── models/                 # Mongoose models
│   ├── User.js             # User model
│   ├── Product.js          # Product model
│   └── Order.js            # Order model
├── routes/                 # Express routes
│   ├── auth.js             # Authentication routes
│   ├── products.js         # Product routes
│   ├── cart.js             # Cart routes
│   ├── orders.js           # Order routes
│   ├── admin.js            # Admin routes
│   └── webhook.js          # Stripe webhook
├── views/                  # EJS templates
│   ├── layouts/            # Layout templates
│   ├── auth/               # Authentication pages
│   ├── products/           # Product pages
│   ├── cart/               # Cart pages
│   ├── orders/             # Order pages
│   └── admin/              # Admin pages
├── public/                 # Static files
│   └── uploads/            # Uploaded images
├── scripts/                # Utility scripts
│   └── seed.js             # Database seeding
├── utils/                  # Utility functions
│   └── auth.js             # Auth utilities
├── server.js               # Main server file
└── package.json            # Dependencies and scripts
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/signup` - User registration
- `POST /auth/logout` - User logout
- `GET /auth/profile` - Get user profile
- `PUT /auth/profile` - Update user profile

### Products
- `GET /products` - Get all products
- `GET /products/:id` - Get single product
- `POST /products/admin` - Create product (Admin)
- `PUT /products/admin/:id` - Update product (Admin)
- `DELETE /products/admin/:id` - Delete product (Admin)

### Cart & Checkout
- `POST /cart/add` - Add item to cart
- `POST /cart/validate` - Validate cart items
- `POST /cart/create-checkout-session` - Create Stripe session

### Orders
- `GET /orders` - Get user orders
- `GET /orders/:id` - Get single order
- `PUT /orders/admin/:id/status` - Update order status (Admin)

## 🎨 Customization

### Styling
The application uses Bootstrap 5 with custom CSS variables for easy theming. Main colors can be modified in `views/layouts/main.ejs`:

```css
:root {
    --primary-color: #e91e63;
    --secondary-color: #f8bbd9;
    --accent-color: #ff4081;
}
```

### Product Categories
Available categories are defined in the Product model. To add new categories, update the enum in `models/Product.js`.

### Payment Configuration
Razorpay settings can be configured in the `.env` file. For production, make sure to:
1. Use live Razorpay keys (replace `rzp_test_` with `rzp_live_`)
2. Set up webhook endpoints at `/webhook/razorpay`
3. Configure proper CORS settings
4. Activate your Razorpay account for live transactions

## 🚀 Deployment

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
RAZORPAY_KEY_ID=rzp_live_your_live_key_id
RAZORPAY_KEY_SECRET=your_live_key_secret
RAZORPAY_WEBHOOK_SECRET=your_live_webhook_secret
```

### Deployment Steps
1. Set up MongoDB (MongoDB Atlas recommended)
2. Configure Razorpay webhooks for your domain at `/webhook/razorpay`
3. Set all environment variables
4. Deploy to your hosting platform (Heroku, DigitalOcean, etc.)
5. Run the seed script on production (optional)

### Recommended Hosting Platforms
- **Heroku**: Easy deployment with MongoDB Atlas
- **DigitalOcean App Platform**: Great performance and pricing
- **Railway**: Simple deployment with automatic SSL
- **Vercel**: Good for smaller applications

## 🧪 Development

### Code Quality
```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Database Management
```bash
# Seed database with sample data
npm run seed

# Connect to MongoDB shell
mongo nail-ecommerce
```

## 🔒 Security Considerations

- JWT tokens are stored in HTTP-only cookies
- Passwords are hashed with bcrypt
- Input validation on all routes
- Rate limiting to prevent abuse
- CSRF protection enabled
- Helmet for security headers
- Image uploads are processed and validated

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check the MONGODB_URI in .env

2. **Razorpay Payment Issues**
   - Verify Razorpay keys are correct
   - Check webhook configuration at `/webhook/razorpay`
   - Ensure webhook secret matches
   - Verify account is activated for live payments

3. **Image Upload Problems**
   - Check file permissions on uploads directory
   - Verify multer configuration
   - Ensure Sharp is installed correctly

4. **Session/Auth Issues**
   - Clear browser cookies
   - Check JWT_SECRET configuration
   - Verify cookie settings

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support, please create an issue in the repository or contact the development team.

---

**Happy selling! 💅✨**
# website
# website
# website
# website


# Web_nail
# web


# Web_nail
# Web_nail
