import express from 'express';
import cors from 'cors';
import './db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.js';
import genreRoutes from './routes/genre.js';
import movieRoutes from './routes/movie.js';
import seriesRoutes from './routes/series.js';

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const app = express();
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://capable-haupia-9a7bd3.netlify.app'
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer config chỉ cho thumbnail và gallery (KHÔNG nhận video nữa)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
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
// Xử lý lỗi file quá lớn
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File vượt quá giới hạn cho phép.' });
  }
  next(err);
});

// Phục vụ file tĩnh từ thư mục uploads
app.use('/uploads', express.static(uploadsDir));

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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(3001, () => console.log('Server running on port 3001'));
