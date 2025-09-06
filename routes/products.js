const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { requireAdmin } = require('../middleware/auth');
const { upload, processProductImages, processDesignImage, deleteImage } = require('../middleware/upload');

const router = express.Router();

// Get all products (with filtering, sorting, pagination)
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      color, 
      minPrice, 
      maxPrice, 
      sort = 'newest', 
      page = 1,
      limit = 12,
      search
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    let query = { active: true };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (color && color !== 'all') {
      query.colors = { $in: [color] };
    }
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    
    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'price_asc':
        sortQuery.price = 1;
        break;
      case 'price_desc':
        sortQuery.price = -1;
        break;
      case 'rating':
        sortQuery['rating.average'] = -1;
        break;
      case 'newest':
        sortQuery.createdAt = -1;
        break;
      case 'oldest':
        sortQuery.createdAt = 1;
        break;
      case 'name_asc':
        sortQuery.title = 1;
        break;
      case 'name_desc':
        sortQuery.title = -1;
        break;
      default:
        sortQuery.createdAt = -1;
    }
    
    if (search) {
      sortQuery.score = { $meta: 'textScore' };
    }
    
    const products = await Product.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    
    // Get filter options
    const categories = await Product.distinct('category', { active: true });
    const colors = await Product.distinct('colors', { active: true });
    
    res.render('products/list', {
      title: 'All Products',
      products,
      categories,
      colors,
      query: req.query,
      pagination: {
        current: parseInt(page),
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        next: parseInt(page) + 1,
        prev: parseInt(page) - 1
      },
      results: {
        total,
        showing: products.length,
        start: skip + 1,
        end: skip + products.length
      }
    });
  } catch (error) {
    console.error('Products list error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading products',
      error: { status: 500 }
    });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product || !product.active) {
      return res.status(404).render('error', {
        title: 'Product Not Found',
        message: 'The product you are looking for does not exist',
        error: { status: 404 }
      });
    }
    
    // Get related products
    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      active: true
    }).limit(4);
    
    res.render('products/detail', {
      title: product.title,
      product,
      relatedProducts
    });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading product',
      error: { status: 500 }
    });
  }
});

// Admin: Create product (GET form)
router.get('/admin/new', requireAdmin, (req, res) => {
  res.render('admin/product-form', {
    title: 'Add New Product',
    product: null,
    action: 'create'
  });
});

// Admin: Edit product (GET form)
router.get('/admin/:id/edit', requireAdmin, async (req, res) => {
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

// Admin: Create product (POST)
router.post('/admin', requireAdmin, upload.array('images', 10), processProductImages, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be less than 1000 characters'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('category')
    .isIn(['classic', 'french', 'glitter', 'matte', 'chrome', 'stiletto', 'coffin', 'almond', 'square', 'round'])
    .withMessage('Invalid category'),
  body('colors')
    .custom((value) => {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error('At least one color is required');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, price, category, colors, tags, featured } = req.body;
    
    // Parse variants from form data
    const variants = [];
    if (req.body.variants) {
      const variantData = JSON.parse(req.body.variants);
      variants.push(...variantData);
    }

    const product = new Product({
      title,
      description,
      price: parseFloat(price),
      category,
      colors: Array.isArray(colors) ? colors : [colors],
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
      featured: featured === 'true',
      variants,
      images: req.processedImages || []
    });

    await product.save();

    res.json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Update product (PUT)
router.put('/admin/:id', requireAdmin, upload.array('images', 10), processProductImages, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be less than 1000 characters'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('category')
    .isIn(['classic', 'french', 'glitter', 'matte', 'chrome', 'stiletto', 'coffin', 'almond', 'square', 'round'])
    .withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, price, category, colors, tags, featured, active, existingImages } = req.body;
    
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Handle image updates
    let images = [];
    
    // Keep existing images that weren't removed
    if (existingImages) {
      const existingImageUrls = Array.isArray(existingImages) ? existingImages : [existingImages];
      images = product.images.filter(img => existingImageUrls.includes(img.url));
      
      // Delete removed images
      const removedImages = product.images.filter(img => !existingImageUrls.includes(img.url));
      for (const img of removedImages) {
        await deleteImage(img.url);
      }
    }
    
    // Add new images
    if (req.processedImages) {
      images.push(...req.processedImages);
    }

    // Parse variants from form data
    let variants = product.variants;
    if (req.body.variants) {
      variants = JSON.parse(req.body.variants);
    }

    // Update product
    Object.assign(product, {
      title,
      description,
      price: parseFloat(price),
      category,
      colors: Array.isArray(colors) ? colors : [colors],
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
      featured: featured === 'true',
      active: active !== 'false',
      variants,
      images
    });

    await product.save();

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Delete product
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete product images
    for (const image of product.images) {
      await deleteImage(image.url);
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Upload design image
router.post('/admin/upload-design', requireAdmin, upload.single('design'), processDesignImage, (req, res) => {
  try {
    if (!req.processedImage) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    res.json({
      message: 'Design image uploaded successfully',
      image: req.processedImage
    });
  } catch (error) {
    console.error('Design upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get product variants and stock
router.get('/:id/variants', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      variants: product.variants,
      totalStock: product.totalStock
    });
  } catch (error) {
    console.error('Variants fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check stock for specific variant
router.post('/:id/check-stock', [
  body('size').notEmpty().withMessage('Size is required'),
  body('design').notEmpty().withMessage('Design is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { size, design, quantity } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variant = product.variants.find(v => v.size === size && v.design === design);
    
    if (!variant) {
      return res.status(400).json({ 
        message: 'Variant not found',
        available: false 
      });
    }

    const available = variant.stock >= quantity;

    res.json({
      available,
      stock: variant.stock,
      message: available ? 'In stock' : 'Insufficient stock'
    });
  } catch (error) {
    console.error('Stock check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;




