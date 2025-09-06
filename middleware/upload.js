const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Ensure upload directories exist
const ensureUploadDirs = async () => {
  const dirs = [
    'public/uploads',
    'public/uploads/products',
    'public/uploads/designs'
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
    }
  }
};

// Initialize upload directories
ensureUploadDirs();

// Multer configuration for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, JPG, PNG, WebP) are allowed'));
    }
  }
});

// Process and save image
const processImage = async (buffer, filename, width = 800, height = 600) => {
  const processedBuffer = await sharp(buffer)
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return processedBuffer;
};

// Save processed image
const saveImage = async (buffer, directory, filename) => {
  const filepath = path.join('public/uploads', directory, filename);
  await fs.writeFile(filepath, buffer);
  return `/uploads/${directory}/${filename}`;
};

// Middleware to process product images
const processProductImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    const processedImages = [];

    for (const file of req.files) {
      const filename = `${uuidv4()}.jpg`;
      const processedBuffer = await processImage(file.buffer, filename);
      const url = await saveImage(processedBuffer, 'products', filename);
      
      processedImages.push({
        url,
        alt: file.originalname,
        isPrimary: processedImages.length === 0
      });
    }

    req.processedImages = processedImages;
    next();
  } catch (error) {
    console.error('Image processing error:', error);
    res.status(400).json({ message: 'Error processing images' });
  }
};

// Middleware to process design images
const processDesignImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const filename = `design_${uuidv4()}.jpg`;
    const processedBuffer = await processImage(req.file.buffer, filename, 400, 400);
    const url = await saveImage(processedBuffer, 'designs', filename);
    
    req.processedImage = {
      url,
      filename,
      originalName: req.file.originalname
    };

    next();
  } catch (error) {
    console.error('Design image processing error:', error);
    res.status(400).json({ message: 'Error processing design image' });
  }
};

// Delete image file
const deleteImage = async (imagePath) => {
  try {
    if (imagePath && imagePath.startsWith('/uploads/')) {
      const fullPath = path.join('public', imagePath);
      await fs.unlink(fullPath);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
  }
};

module.exports = {
  upload,
  processProductImages,
  processDesignImage,
  deleteImage,
  ensureUploadDirs
};




