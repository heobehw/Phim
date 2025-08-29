import express from 'express';
import Series from '../models/Series.js';
import Genre from '../models/Genre.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Hàm trả về đường dẫn đầy đủ cho file (Cloudinary đã là url đầy đủ)
const getFullUrl = (req, filePath) => {
  if (!filePath) return "";
  return filePath;
};

// Tạo phim bộ mới
router.post('/', async (req, res) => {
  try {
    let {
      name, genres, year, description, country, directors, actors, hasSubtitle
    } = req.body;

    if (!Array.isArray(genres)) genres = genres ? [genres] : [];
    genres = genres.filter(g => g);
    if (!Array.isArray(directors)) directors = directors ? [directors] : [];
    directors = directors.filter(d => d);
    if (!Array.isArray(actors)) actors = actors ? [actors] : [];
    actors = actors.filter(a => a);

    // Lấy url Cloudinary cho thumbnail
    let thumbnailUrl = "";
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      thumbnailUrl = req.files.thumbnail[0].path;
    }

    // Lấy url Cloudinary cho gallery
    let galleryUrls = [];
    if (req.files && req.files.gallery) {
      galleryUrls = req.files.gallery.map(file => file.path);
    }

    // Xử lý danh sách tập phim (episodes)
    let episodes = [];
    let idx = 0;
    // Nhận tập phim dạng multipart/form-data: episodes[0][name], episodes[0][video], ...
    while (req.body[`episodes[${idx}][name]`] !== undefined) {
      let epName = req.body[`episodes[${idx}][name]`];
      let epVideo = "";
      if (req.files && req.files[`episodes[${idx}][video]`] && req.files[`episodes[${idx}][video]`][0]) {
        epVideo = req.files[`episodes[${idx}][video]`][0].path;
      } else if (typeof req.body[`episodes[${idx}][video]`] === "string") {
        epVideo = req.body[`episodes[${idx}][video]`];
      }
      if (epName) {
        episodes.push({ name: epName, video: epVideo });
      }
      idx++;
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
      hasSubtitle: hasSubtitle === "true" || hasSubtitle === true,
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

    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesObj = series.toObject();
    seriesObj.thumbnail = getFullUrl(req, series.thumbnail);
    seriesObj.gallery = series.gallery.map(img => getFullUrl(req, img));
    seriesObj.episodes = series.episodes.map(ep => ({
      ...ep,
      video: getFullUrl(req, ep.video)
    }));

    res.status(201).json({ message: 'Series created', series: seriesObj });
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
    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesWithFullUrl = seriesList.map(s => {
      const obj = s.toObject();
      obj.thumbnail = getFullUrl(req, s.thumbnail);
      obj.gallery = s.gallery.map(img => getFullUrl(req, img));
      obj.episodes = s.episodes.map(ep => ({
        ...ep,
        video: getFullUrl(req, ep.video)
      }));
      return obj;
    });
    res.json(seriesWithFullUrl);
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
    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesObj = series.toObject();
    seriesObj.thumbnail = getFullUrl(req, series.thumbnail);
    seriesObj.gallery = series.gallery.map(img => getFullUrl(req, img));
    seriesObj.episodes = series.episodes.map(ep => ({
      ...ep,
      video: getFullUrl(req, ep.video)
    }));
    res.json(seriesObj);
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

    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesObj = updatedSeries.toObject();
    seriesObj.thumbnail = getFullUrl(req, updatedSeries.thumbnail);
    seriesObj.gallery = updatedSeries.gallery.map(img => getFullUrl(req, img));
    seriesObj.episodes = updatedSeries.episodes.map(ep => ({
      ...ep,
      video: getFullUrl(req, ep.video)
    }));

    res.json({ message: "Đã thêm bình luận", series: seriesObj });
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

    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesObj = updatedSeries.toObject();
    seriesObj.thumbnail = getFullUrl(req, updatedSeries.thumbnail);
    seriesObj.gallery = updatedSeries.gallery.map(img => getFullUrl(req, img));
    seriesObj.episodes = updatedSeries.episodes.map(ep => ({
      ...ep,
      video: getFullUrl(req, ep.video)
    }));

    res.json({ message: "Đã xóa bình luận", series: seriesObj });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cập nhật phim bộ
router.put('/:id', async (req, res) => {
  try {
    const {
      name, genres, year, description, country, directors, actors, hasSubtitle
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
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      updateData.thumbnail = req.files.thumbnail[0].path;
    }

    // Gallery mới (Cloudinary)
    if (req.files && req.files.gallery) {
      updateData.gallery = req.files.gallery.map(file => file.path);
    }

    // Lấy series cũ để giữ lại video cũ nếu không upload mới
    const oldSeries = await Series.findById(req.params.id);

    // Xử lý danh sách tập phim cập nhật
    let episodes = [];
    let idx = 0;
    let foundAny = false;
    // Nhận tập phim dạng multipart/form-data: episodes[0][name], episodes[0][video], ...
    while (req.body[`episodes[${idx}][name]`] !== undefined) {
      foundAny = true;
      let epName = req.body[`episodes[${idx}][name]`];
      let epVideo = "";
      if (req.files && req.files[`episodes[${idx}][video]`] && req.files[`episodes[${idx}][video]`][0]) {
        epVideo = req.files[`episodes[${idx}][video]`][0].path;
      } else if (typeof req.body[`episodes[${idx}][video]`] === "string") {
        epVideo = req.body[`episodes[${idx}][video]`];
      } else if (oldSeries && oldSeries.episodes && oldSeries.episodes[idx]) {
        epVideo = oldSeries.episodes[idx]?.video || "";
      }
      if (epName) {
        episodes.push({ name: epName, video: epVideo });
      }
      idx++;
    }

    // Nếu không có tập nào mới, giữ lại tập cũ
    if (!foundAny && oldSeries && oldSeries.episodes) {
      episodes = oldSeries.episodes;
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

    // Trả về đường dẫn đầy đủ cho thumbnail, gallery, video trong episodes
    const seriesObj = series.toObject();
    seriesObj.thumbnail = getFullUrl(req, series.thumbnail);
    seriesObj.gallery = series.gallery.map(img => getFullUrl(req, img));
    seriesObj.episodes = series.episodes.map(ep => ({
      ...ep,
      video: getFullUrl(req, ep.video)
    }));

    res.json({ message: "Đã cập nhật phim bộ", series: seriesObj });
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
