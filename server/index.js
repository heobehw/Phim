import express from 'express';
import cors from 'cors';
import './db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs'; // Thêm dòng này
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

// Multer config cho tất cả file (thumbnail, gallery, video)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "video" || file.fieldname.endsWith('[video]')) {
      if (file.mimetype.startsWith("video/") || file.mimetype === "audio/mp3") {
        cb(null, true);
      } else {
        cb(new Error("Chỉ nhận file video hoặc mp3!"));
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
// Truyền upload.fields vào route phim để xử lý tất cả file
app.use('/api/movie', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'gallery', maxCount: 10 },
  { name: 'video', maxCount: 1 }
]), movieRoutes);
// Thêm route cho phim bộ
app.use('/api/series', upload.any(), seriesRoutes);
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(3001, () => console.log('Server running on port 3001'));