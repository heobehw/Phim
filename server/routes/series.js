import express from 'express';
import Series from '../models/Series.js';
import Genre from '../models/Genre.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tạo phim bộ mới (nhận file ảnh từ FE, lưu URL Cloudinary)
router.post('/', async (req, res) => {
  try {
    // Log toàn bộ req.body để debug
    console.log('All req.body keys:', Object.keys(req.body));
    console.log('Full req.body:', req.body);

    let {
      name, genres, year, description, country,
      directors, actors, hasSubtitle
    } = req.body;

    // Thumbnail: lấy từ Cloudinary nếu có file upload, nếu không thì lấy từ FE (URL)
    let thumbnailUrl = "";
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = req.files.thumbnail[0].path;
    } else if (req.body.thumbnail && typeof req.body.thumbnail === "string") {
      thumbnailUrl = req.body.thumbnail;
    }
    console.log('thumbnailUrl:', thumbnailUrl, typeof thumbnailUrl);

    // Gallery: lấy từ Cloudinary nếu có file upload, nếu không thì lấy từ FE (URL)
    let galleryUrls = [];
    if (req.files && req.files.gallery) {
      galleryUrls = req.files.gallery.map(f => f.path);
    } else if (req.body.gallery) {
      if (Array.isArray(req.body.gallery)) {
        galleryUrls = req.body.gallery.filter(img => typeof img === "string");
      } else if (typeof req.body.gallery === "string") {
        galleryUrls = [req.body.gallery];
      }
    }
    console.log('galleryUrls:', galleryUrls);

    // Đảm bảo các trường là mảng và loại bỏ giá trị rỗng
    if (!Array.isArray(genres)) genres = genres ? [genres] : [];
    genres = genres.filter(g => g);
    if (!Array.isArray(directors)) directors = directors ? [directors] : [];
    directors = directors.filter(d => d);
    if (!Array.isArray(actors)) actors = actors ? [actors] : [];
    actors = actors.filter(a => a);

    // Đọc đúng các trường tập phim từ FormData (chỉ lấy video, không cần tên tập)
    let episodes = [];
    let idx = 0;
    while (true) {
      const epVideoKey = `episodes[${idx}][video]`;
      if (!(epVideoKey in req.body)) break;
      let epVideo = req.body[epVideoKey];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epVideo && epVideo.trim() !== "") {
        episodes.push({ video: epVideo });
      }
      idx++;
    }
    // Nếu không có tập nào, fallback về logic cũ
    if (episodes.length === 0 && req.body['episodes[0][video]']) {
      let epVideo = req.body['episodes[0][video]'];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epVideo && epVideo.trim() !== "") {
        episodes.push({ video: epVideo });
      }
    }
    console.log('episodes:', episodes);

    const series = new Series({
      name,
      genres,
      year,
      description,
      country,
      directors,
      actors,
      thumbnail: thumbnailUrl,
      gallery: galleryUrls,
      episodes,
      hasSubtitle: hasSubtitle === "true" || hasSubtitle === true || hasSubtitle === "on",
      comments: []
    });

    await series.save();

    // Thêm series._id vào movieId của các genre liên quan
    if (Array.isArray(genres) && genres.length > 0) {
      await Genre.updateMany(
        { _id: { $in: genres } },
        { $addToSet: { movieId: series._id } }
      );
    }

    res.status(201).json({ message: 'Series created', series });
  } catch (err) {
    console.error('Error in POST /api/series:', err);
    res.status(400).json({ error: err.message });
  }
});

// Lấy tất cả phim bộ
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
      filter.name = { $regex: name, $options: 'i' };
    }
    const seriesList = await Series.find(filter)
      .populate('genres')
      .sort({ [sort]: -1 })
      .limit(Number(limit));
    res.json(seriesList);
  } catch (err) {
    console.error('Error in GET /api/series:', err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy phim bộ theo id
router.get('/:id', async (req, res) => {
  try {
    const series = await Series.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });
    res.json(series);
  } catch (err) {
    console.error('Error in GET /api/series/:id:', err);
    res.status(400).json({ error: err.message });
  }
});

// Thêm bình luận cho phim bộ (chỉ cho phép user đã đăng nhập)
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.userId;
    if (!userId || !content) {
      return res.status(400).json({ error: "Thiếu userId hoặc nội dung bình luận" });
    }
    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });

    series.comments.push({
      user: userId,
      content
    });
    await series.save();

    const updatedSeries = await Series.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });

    res.json({ message: "Đã thêm bình luận", series: updatedSeries });
  } catch (err) {
    console.error('Error in POST /api/series/:id/comment:', err);
    res.status(400).json({ error: err.message });
  }
});

// Xóa bình luận (chỉ cho phép user đã đăng bình luận xóa)
router.delete('/:id/comment/:commentId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(400).json({ error: "Thiếu userId" });

    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });

    const comment = series.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Không tìm thấy bình luận" });

    if (comment.user.toString() !== userId) {
      return res.status(403).json({ error: "Bạn không có quyền xóa bình luận này" });
    }

    series.comments.pull({ _id: req.params.commentId });
    await series.save();

    const updatedSeries = await Series.findById(req.params.id)
      .populate('genres')
      .populate({ path: 'comments.user', select: 'displayName' });

    res.json({ message: "Đã xóa bình luận", series: updatedSeries });
  } catch (err) {
    console.error('Error in DELETE /api/series/:id/comment/:commentId:', err);
    res.status(400).json({ error: err.message });
  }
});

// Cập nhật phim bộ
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT req.body:', req.body);

    const {
      name, genres, year, description, country,
      directors, actors, hasSubtitle
    } = req.body;

    let genresArr = genres;
    let directorsArr = directors;
    let actorsArr = actors;
    if (!Array.isArray(genresArr)) genresArr = genresArr ? [genresArr] : [];
    genresArr = genresArr.filter(g => g);
    if (!Array.isArray(directorsArr)) directorsArr = directorsArr ? [directorsArr] : [];
    directorsArr = directorsArr.filter(d => d);
    if (!Array.isArray(actorsArr)) actorsArr = actorsArr ? [actorsArr] : [];
    actorsArr = actorsArr.filter(a => a);

    // Thumbnail mới (Cloudinary hoặc URL)
    let thumbnailUrl = "";
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = req.files.thumbnail[0].path;
    } else if (req.body.thumbnail && typeof req.body.thumbnail === "string") {
      thumbnailUrl = req.body.thumbnail;
    }
    console.log('PUT thumbnailUrl:', thumbnailUrl, typeof thumbnailUrl);

    // Gallery mới (Cloudinary hoặc URL)
    let galleryUrls = [];
    if (req.files && req.files.gallery) {
      galleryUrls = req.files.gallery.map(f => f.path);
    } else if (req.body.gallery) {
      if (Array.isArray(req.body.gallery)) {
        galleryUrls = req.body.gallery.filter(img => typeof img === "string");
      } else if (typeof req.body.gallery === "string") {
        galleryUrls = [req.body.gallery];
      }
    }
    console.log('PUT galleryUrls:', galleryUrls);

    let updateData = {
      name,
      genres: genresArr,
      year,
      description,
      country,
      directors: directorsArr,
      actors: actorsArr,
      hasSubtitle,
      thumbnail: thumbnailUrl,
      gallery: galleryUrls
    };

    // Đọc đúng các trường tập phim từ FormData (chỉ lấy video, không cần tên tập)
    let episodes = [];
    let idx = 0;
    while (true) {
      const epVideoKey = `episodes[${idx}][video]`;
      if (!(epVideoKey in req.body)) break;
      let epVideo = req.body[epVideoKey];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epVideo && epVideo.trim() !== "") {
        episodes.push({ video: epVideo });
      }
      idx++;
    }
    if (episodes.length === 0 && req.body['episodes[0][video]']) {
      let epVideo = req.body['episodes[0][video]'];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epVideo && epVideo.trim() !== "") {
        episodes.push({ video: epVideo });
      }
    }
    updateData.episodes = episodes;
    console.log('PUT episodes:', episodes);

    const series = await Series.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });

    if (Array.isArray(genresArr) && genresArr.length > 0) {
      await Genre.updateMany(
        { _id: { $in: genresArr } },
        { $addToSet: { movieId: series._id } }
      );
    }

    res.json({ message: "Đã cập nhật phim bộ", series });
  } catch (err) {
    console.error('Error in PUT /api/series/:id:', err);
    res.status(400).json({ error: err.message });
  }
});

// Xóa phim bộ
router.delete('/:id', async (req, res) => {
  try {
    const series = await Series.findByIdAndDelete(req.params.id);
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });
    res.json({ message: "Đã xóa phim bộ", series });
  } catch (err) {
    console.error('Error in DELETE /api/series/:id:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
