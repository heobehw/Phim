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

// Cấu hình Cloudinary trực tiếp (không dùng .env)
cloudinary.config({
  cloud_name: 'dnnrrdg5j',
  api_key: '599823167766762',
  api_secret: 'llrv8vZtZbieogIVYfjU-r-09d4'
});

// Multer storage cho Cloudinary (chỉ nhận ảnh)
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'xemphim',
    resource_type: 'image',
    public_id: Date.now() + '-' + file.originalname.replace(/\.[^/.]+$/, ''),
  }),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
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

// Không cần tạo thư mục uploads, không cần express.static('/uploads')

app.use('/api/auth', authRoutes);
app.use('/api/genre', upload.fields([
  { name: 'thumbnail', maxCount: 1 }
]), genreRoutes);
app.use('/api/movie', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), movieRoutes);
app.use('/api/series', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), seriesRoutes);

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File vượt quá giới hạn cho phép.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(3001, () => console.log('Server running on port 3001'));
