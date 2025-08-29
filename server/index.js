import express from 'express';
import cors from 'cors';
import './db.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import authRoutes from './routes/auth.js';
import genreRoutes from './routes/genre.js';
import movieRoutes from './routes/movie.js';
import seriesRoutes from './routes/series.js';

// Cấu hình Cloudinary trực tiếp
cloudinary.config({
  cloud_name: 'dnnrrdg5j',
  api_key: '599823167766762',
  api_secret: 'llrv8vZtZbieogIVYfjU-r-09d4',
});

// Multer storage dùng Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'movies',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, crop: "limit" }],
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB cho ảnh
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "thumbnail" || file.fieldname === "gallery") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Chỉ nhận file ảnh!"));
      }
    } else {
      cb(null, true);
    }
  }
});

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://capable-haupia-9a7bd3.netlify.app'
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Không cần phục vụ file tĩnh uploads nữa

app.use('/api/auth', authRoutes);
app.use('/api/genre', upload.fields([
  { name: 'thumbnail', maxCount: 1 }
]), genreRoutes);
// Chỉ nhận thumbnail và gallery, KHÔNG nhận video
app.use('/api/movie', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), movieRoutes);
// Series cũng chỉ nhận thumbnail và gallery
app.use('/api/series', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), seriesRoutes);

// Xử lý lỗi file quá lớn
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File vượt quá giới hạn cho phép.' });
  }
  next(err);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(3001, () => console.log('Server running on port 3001'));
