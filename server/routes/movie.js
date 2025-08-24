import express from 'express';
import Movie from '../models/Movie.js';
import Genre from '../models/Genre.js';
import path from 'path';
// Thêm middleware xác thực
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tạo phim mới
router.post('/', async (req, res) => {
  try {
    let {
      name, genres, year, type, episodes,
      directors, actors, description, country
    } = req.body;

    // Đảm bảo các trường là mảng và loại bỏ giá trị rỗng
    if (!Array.isArray(genres)) genres = genres ? [genres] : [];
    genres = genres.filter(g => g);
    if (!Array.isArray(directors)) directors = directors ? [directors] : [];
    directors = directors.filter(d => d);
    if (!Array.isArray(actors)) actors = actors ? [actors] : [];
    actors = actors.filter(a => a);

    // Lấy đường dẫn file thumbnail
    let thumbnailUrl = "";
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = path.join('/uploads', req.files.thumbnail[0].filename);
    }

    // Lấy đường dẫn các file gallery
    let galleryUrls = [];
    if (req.files && req.files.gallery) {
      galleryUrls = req.files.gallery.map(file => path.join('/uploads', file.filename));
    }

    // Lấy đường dẫn file video
    let videoUrl = "";
    if (req.files && req.files.video && req.files.video[0]) {
      videoUrl = path.join('/uploads', req.files.video[0].filename);
    }

    const movie = new Movie({
      name,
      genres,
      year,
      type,
      episodes,
      directors,
      actors,
      thumbnail: thumbnailUrl,
      gallery: galleryUrls,
      description,
      video: videoUrl,
      country,
      comments: [] // Khởi tạo mảng bình luận rỗng
    });

    await movie.save();

    // Thêm movie._id vào movieId của các genre liên quan
    if (Array.isArray(genres) && genres.length > 0) {
      await Genre.updateMany(
        { _id: { $in: genres } },
        { $addToSet: { movieId: movie._id } }
      );
    }

    res.status(201).json({ message: 'Movie created', movie });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lấy tất cả phim
router.get('/', async (req, res) => {
  try {
    const { sort = 'createdAt', limit = 100, genres, name } = req.query;
    const filter = {};
    if (genres) {
      const genreArr = Array.isArray(genres)
        ? genres
        : genres.split(',').map(g => g.trim());
      filter.genres = { $in: genreArr };
    }
    if (name) {
      filter.name = { $regex: name, $options: 'i' }; // tìm gần đúng, không phân biệt hoa thường
    }
    const movies = await Movie.find(filter)
      .populate('genres')
      .sort({ [sort]: -1 })
      .limit(Number(limit));
    res.json(movies);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy phim theo id
router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });
    if (!movie) return res.status(404).json({ error: "Không tìm thấy phim" });
    res.json(movie);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Thêm bình luận cho phim (chỉ cho phép user đã đăng nhập)
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    // Lấy userId từ token đã xác thực
    const userId = req.user.userId;
    if (!userId || !content) {
      return res.status(400).json({ error: "Thiếu userId hoặc nội dung bình luận" });
    }
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Không tìm thấy phim" });

    movie.comments.push({
      user: userId,
      content
    });
    await movie.save();

    // Lấy lại movie với populate user cho comment
    const updatedMovie = await Movie.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });

    res.json({ message: "Đã thêm bình luận", movie: updatedMovie });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/comment/:commentId', authMiddleware, async (req, res) => {
  try {
    // Lấy userId từ token đã xác thực
    const userId = req.user.userId;
    if (!userId) return res.status(400).json({ error: "Thiếu userId" });

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Không tìm thấy phim" });

    const comment = movie.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Không tìm thấy bình luận" });

    // Chỉ cho phép user đã đăng bình luận xóa
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ error: "Bạn không có quyền xóa bình luận này" });
    }

    // Sửa tại đây: dùng pull thay vì comment.remove()
    movie.comments.pull({ _id: req.params.commentId });
    await movie.save();

    // Lấy lại movie với populate user cho comment
    const updatedMovie = await Movie.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });

    res.json({ message: "Đã xóa bình luận", movie: updatedMovie });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cập nhật phim
router.put('/:id', async (req, res) => {
  try {
    const {
      name, genres, year, type, episodes,
      directors, actors, description, country
    } = req.body;

    // Đảm bảo các trường là mảng và loại bỏ giá trị rỗng
    let genresArr = genres;
    let directorsArr = directors;
    let actorsArr = actors;
    if (!Array.isArray(genresArr)) genresArr = genresArr ? [genresArr] : [];
    genresArr = genresArr.filter(g => g);
    if (!Array.isArray(directorsArr)) directorsArr = directorsArr ? [directorsArr] : [];
    directorsArr = directorsArr.filter(d => d);
    if (!Array.isArray(actorsArr)) actorsArr = actorsArr ? [actorsArr] : [];
    actorsArr = actorsArr.filter(a => a);

    let updateData = {
      name,
      genres: genresArr,
      year,
      type,
      episodes,
      directors: directorsArr,
      actors: actorsArr,
      description,
      country
    };

    // Thumbnail mới
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      updateData.thumbnail = path.join('/uploads', req.files.thumbnail[0].filename);
    }

    // Gallery mới
    if (req.files && req.files.gallery) {
      updateData.gallery = req.files.gallery.map(file => path.join('/uploads', file.filename));
    }

    // Video mới
    if (req.files && req.files.video && req.files.video[0]) {
      updateData.video = path.join('/uploads', req.files.video[0].filename);
    }

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!movie) return res.status(404).json({ error: "Không tìm thấy phim" });

    // Thêm movie._id vào movieId của các genre liên quan (nếu cập nhật genres)
    if (Array.isArray(genresArr) && genresArr.length > 0) {
      await Genre.updateMany(
        { _id: { $in: genresArr } },
        { $addToSet: { movieId: movie._id } }
      );
    }

    res.json({ message: "Đã cập nhật phim", movie });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Xóa phim
router.delete('/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ error: "Không tìm thấy phim" });
    res.json({ message: "Đã xóa phim", movie });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;