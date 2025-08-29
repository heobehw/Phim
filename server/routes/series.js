import express from 'express';
import Series from '../models/Series.js';
import Genre from '../models/Genre.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tạo phim bộ mới (không dùng upload.any, chỉ nhận link file từ FE hoặc Cloudinary)
router.post('/', async (req, res) => {
  try {
    let {
      name, genres, year, description, country,
      directors, actors, hasSubtitle, thumbnail, gallery
    } = req.body;

    // Đảm bảo các trường là mảng và loại bỏ giá trị rỗng
    if (!Array.isArray(genres)) genres = genres ? [genres] : [];
    genres = genres.filter(g => g);
    if (!Array.isArray(directors)) directors = directors ? [directors] : [];
    directors = directors.filter(d => d);
    if (!Array.isArray(actors)) actors = actors ? [actors] : [];
    actors = actors.filter(a => a);

    // Thumbnail: nhận url từ FE hoặc Cloudinary
    let thumbnailUrl = "";
    if (thumbnail) thumbnailUrl = thumbnail;

    // Gallery: nhận mảng url từ FE hoặc Cloudinary
    let galleryUrls = [];
    if (gallery) {
      if (Array.isArray(gallery)) galleryUrls = gallery;
      else if (typeof gallery === "string") galleryUrls = [gallery];
    }

    // Xử lý danh sách tập phim (episodes) - giữ nguyên logic cũ
    let episodes = [];
    let idx = 0;
    while (
      typeof req.body[`episodes[${idx}][name]`] !== "undefined" ||
      typeof req.body[`episodes[${idx}][video]`] !== "undefined"
    ) {
      let epName = req.body[`episodes[${idx}][name]`];
      let epVideo = req.body[`episodes[${idx}][video]`];
      if (Array.isArray(epName)) epName = epName[0];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epName || epVideo) {
        episodes.push({
          name: epName || "",
          video: epVideo || ""
        });
      }
      idx++;
    }

    if (episodes.length === 0 && req.body['episodes[0][name]']) {
      episodes.push({
        name: req.body['episodes[0][name]'],
        video: req.body['episodes[0][video]'] || ""
      });
    }

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
    res.status(400).json({ error: err.message });
  }
});

// Cập nhật phim bộ
router.put('/:id', async (req, res) => {
  try {
    const {
      name, genres, year, description, country,
      directors, actors, hasSubtitle, thumbnail, gallery
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

    let updateData = {
      name,
      genres: genresArr,
      year,
      description,
      country,
      directors: directorsArr,
      actors: actorsArr,
      hasSubtitle
    };

    // Thumbnail mới (Cloudinary)
    if (thumbnail) updateData.thumbnail = thumbnail;

    // Gallery mới (Cloudinary)
    if (gallery) {
      if (Array.isArray(gallery)) updateData.gallery = gallery;
      else if (typeof gallery === "string") updateData.gallery = [gallery];
    }

    // Xử lý danh sách tập phim cập nhật (giữ nguyên logic cũ)
    let episodes = [];
    let idx = 0;
    while (
      typeof req.body[`episodes[${idx}][name]`] !== "undefined" ||
      typeof req.body[`episodes[${idx}][video]`] !== "undefined"
    ) {
      let epName = req.body[`episodes[${idx}][name]`];
      let epVideo = req.body[`episodes[${idx}][video]`];
      if (Array.isArray(epName)) epName = epName[0];
      if (Array.isArray(epVideo)) epVideo = epVideo[0];
      if (epName || epVideo) {
        episodes.push({
          name: epName || "",
          video: epVideo || ""
        });
      }
      idx++;
    }

    if (episodes.length === 0 && req.body['episodes[0][name]']) {
      episodes.push({
        name: req.body['episodes[0][name]'],
        video: req.body['episodes[0][video]'] || ""
      });
    }
    updateData.episodes = episodes;

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
    res.status(400).json({ error: err.message });
  }
});

export default router;
