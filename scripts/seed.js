require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
const config = require('../config/config');

// Sample products data
const sampleProducts = [
  {
    title: "Classic French Manicure",
    description: "Timeless elegance with a modern twist. Perfect for any occasion with a clean, sophisticated look that never goes out of style.",
    price: 24.99,
    category: "french",
    colors: ["White", "Clear", "Pink"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop",
        alt: "Classic French Manicure",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Classic French", stock: 25 },
      { size: "S", design: "Classic French", stock: 30 },
      { size: "M", design: "Classic French", stock: 35 },
      { size: "L", design: "Classic French", stock: 20 },
      { size: "XL", design: "Classic French", stock: 15 }
    ],
    featured: true,
    tags: ["classic", "elegant", "wedding", "professional"]
  },
  {
    title: "Glitter Goddess",
    description: "Sparkle and shine with these stunning glitter nails. Perfect for parties, special events, or when you want to make a statement.",
    price: 29.99,
    category: "glitter",
    colors: ["Gold", "Silver", "Rose Gold", "Holographic"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=400&h=300&fit=crop",
        alt: "Glitter Goddess Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Gold Glitter", stock: 20 },
      { size: "S", design: "Gold Glitter", stock: 25 },
      { size: "M", design: "Gold Glitter", stock: 30 },
      { size: "L", design: "Gold Glitter", stock: 18 },
      { size: "XL", design: "Gold Glitter", stock: 12 },
      { size: "S", design: "Silver Glitter", stock: 22 },
      { size: "M", design: "Silver Glitter", stock: 28 },
      { size: "L", design: "Silver Glitter", stock: 15 }
    ],
    featured: true,
    tags: ["glitter", "party", "glamorous", "sparkle"]
  },
  {
    title: "Matte Black Elegance",
    description: "Sophisticated matte black finish for the modern woman. Chic, bold, and effortlessly stylish.",
    price: 22.99,
    category: "matte",
    colors: ["Matte Black"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=400&h=300&fit=crop",
        alt: "Matte Black Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Matte Black", stock: 18 },
      { size: "S", design: "Matte Black", stock: 24 },
      { size: "M", design: "Matte Black", stock: 28 },
      { size: "L", design: "Matte Black", stock: 22 },
      { size: "XL", design: "Matte Black", stock: 16 }
    ],
    featured: false,
    tags: ["matte", "modern", "chic", "professional"]
  },
  {
    title: "Chrome Mirror Finish",
    description: "Ultra-modern chrome finish that reflects light beautifully. Perfect for making a bold fashion statement.",
    price: 34.99,
    category: "chrome",
    colors: ["Chrome Silver", "Chrome Gold", "Chrome Rose Gold"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=400&h=300&fit=crop",
        alt: "Chrome Mirror Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Chrome Silver", stock: 15 },
      { size: "S", design: "Chrome Silver", stock: 20 },
      { size: "M", design: "Chrome Silver", stock: 25 },
      { size: "L", design: "Chrome Silver", stock: 18 },
      { size: "XL", design: "Chrome Silver", stock: 12 }
    ],
    featured: true,
    tags: ["chrome", "modern", "metallic", "trendy"]
  },
  {
    title: "Stiletto Drama",
    description: "Bold stiletto shape for maximum impact. These dramatic nails are perfect for special occasions and making a statement.",
    price: 39.99,
    category: "stiletto",
    colors: ["Red", "Black", "Nude", "Wine"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400&h=300&fit=crop",
        alt: "Stiletto Drama Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "S", design: "Red Stiletto", stock: 12 },
      { size: "M", design: "Red Stiletto", stock: 18 },
      { size: "L", design: "Red Stiletto", stock: 15 },
      { size: "XL", design: "Red Stiletto", stock: 10 }
    ],
    featured: false,
    tags: ["stiletto", "dramatic", "bold", "statement"]
  },
  {
    title: "Coffin Chic",
    description: "Trendy coffin shape with a sophisticated finish. Perfect balance of edgy and elegant for the fashion-forward individual.",
    price: 32.99,
    category: "coffin",
    colors: ["Nude Pink", "Lavender", "Mint Green"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1515688594390-b649af70d282?w=400&h=300&fit=crop",
        alt: "Coffin Chic Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Nude Pink Coffin", stock: 16 },
      { size: "S", design: "Nude Pink Coffin", stock: 22 },
      { size: "M", design: "Nude Pink Coffin", stock: 26 },
      { size: "L", design: "Nude Pink Coffin", stock: 20 },
      { size: "XL", design: "Nude Pink Coffin", stock: 14 }
    ],
    featured: true,
    tags: ["coffin", "trendy", "chic", "fashion"]
  },
  {
    title: "Almond Perfection",
    description: "Classic almond shape that elongates fingers beautifully. Versatile design suitable for any occasion or style preference.",
    price: 26.99,
    category: "almond",
    colors: ["Soft Pink", "Coral", "Peach"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1599948128020-9a44a5d5d4d9?w=400&h=300&fit=crop",
        alt: "Almond Perfection Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Soft Pink Almond", stock: 20 },
      { size: "S", design: "Soft Pink Almond", stock: 28 },
      { size: "M", design: "Soft Pink Almond", stock: 32 },
      { size: "L", design: "Soft Pink Almond", stock: 24 },
      { size: "XL", design: "Soft Pink Almond", stock: 18 }
    ],
    featured: false,
    tags: ["almond", "versatile", "elegant", "natural"]
  },
  {
    title: "Square Classic",
    description: "Timeless square shape with clean lines. Professional and polished look that's perfect for everyday wear.",
    price: 21.99,
    category: "square",
    colors: ["Clear", "Light Pink", "Beige"],
    images: [
      {
        url: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop",
        alt: "Square Classic Nails",
        isPrimary: true
      }
    ],
    variants: [
      { size: "XS", design: "Clear Square", stock: 25 },
      { size: "S", design: "Clear Square", stock: 30 },
      { size: "M", design: "Clear Square", stock: 35 },
      { size: "L", design: "Clear Square", stock: 28 },
      { size: "XL", design: "Clear Square", stock: 20 }
    ],
    featured: false,
    tags: ["square", "classic", "professional", "clean"]
  }
];

async function seedDatabase() {
  try {
    // Connect to database
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Product.deleteMany({});

    // Create admin user
    console.log('Creating admin user...');
    const adminUser = new User({
      name: 'Admin User',
      email: config.admin.email,
      password: config.admin.password,
      role: 'admin'
    });
    await adminUser.save();
    console.log(`Admin user created: ${adminUser.email}`);

    // Create sample regular user
    console.log('Creating sample user...');
    const sampleUser = new User({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
      role: 'user'
    });
    await sampleUser.save();
    console.log(`Sample user created: ${sampleUser.email}`);

    // Create products
    console.log('Creating sample products...');
    for (const productData of sampleProducts) {
      // Add rating data
      productData.rating = {
        average: Math.random() * 2 + 3, // Random rating between 3-5
        count: Math.floor(Math.random() * 50) + 5 // Random count between 5-55
      };

      const product = new Product(productData);
      await product.save();
      console.log(`Product created: ${product.title}`);
    }

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`👤 Users created: ${await User.countDocuments()}`);
    console.log(`🛍️  Products created: ${await Product.countDocuments()}`);
    console.log('\n🔐 Admin credentials:');
    console.log(`Email: ${config.admin.email}`);
    console.log(`Password: ${config.admin.password}`);
    console.log('\n👤 Sample user credentials:');
    console.log('Email: jane@example.com');
    console.log('Password: password123');
    console.log('\n🚀 Start the server with: npm start');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed script
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;




