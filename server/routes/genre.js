import express from 'express';
import Genre from '../models/Genre.js';
import path from 'path';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, movieId } = req.body; // nhận movieId từ body
    let thumbnailUrl = "";
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = path.join('/uploads', req.files.thumbnail[0].filename);
    }
    const genre = new Genre({ name, thumbnail: thumbnailUrl, movieId });
    await genre.save();
    res.status(201).json({ message: 'Genre created', genre });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, movieId } = req.body; // nhận movieId từ body
    let thumbnailUrl = undefined;
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = path.join('/uploads', req.files.thumbnail[0].filename);
    }
    const updateData = { name };
    if (movieId) updateData.movieId = movieId;
    if (thumbnailUrl) updateData.thumbnail = thumbnailUrl;
    const genre = await Genre.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!genre) return res.status(404).json({ error: "Không tìm thấy thể loại" });
    res.json({ message: "Đã cập nhật thể loại", genre });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const genre = await Genre.findByIdAndDelete(req.params.id);
    if (!genre) return res.status(404).json({ error: "Không tìm thấy thể loại" });
    res.json({ message: "Đã xóa thể loại", genre });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/movies', async (req, res) => {
  try {
    // Tìm các phim có genres chứa id thể loại này
    const movies = await Movie.find({ genres: { $in: [req.params.id] } });
    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy tất cả thể loại
router.get('/', async (req, res) => {
  try {
    const genres = await Genre.find();
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy thể loại theo id
router.get('/:id', async (req, res) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) return res.status(404).json({ error: "Không tìm thấy thể loại" });
    res.json(genre);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy tất cả phim theo id thể loại
router.get('/api/genre/:id/movies', async (req, res) => {
  try {
    const movies = await Movie.find({ genres: { $in: [req.params.id] } });
    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;