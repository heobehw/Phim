import express from 'express';
import Series from '../models/Series.js';
import Genre from '../models/Genre.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer(); // Không lưu file, chỉ nhận thông tin file từ Cloudinary middleware

const getFullUrl = (req, filePath) => {
  if (!filePath) return "";
  return filePath;
};

// Tạo phim bộ mới
router.post(
  '/',
  upload.any(), // Sử dụng upload.any() để không bị lỗi khi không có file
  async (req, res) => {
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
      const thumbnailFile = req.files?.find(f => f.fieldname === "thumbnail");
      if (thumbnailFile) thumbnailUrl = thumbnailFile.path;

      // Lấy url Cloudinary cho gallery
      let galleryUrls = [];
      if (req.files) {
        galleryUrls = req.files
          .filter(f => f.fieldname === "gallery")
          .map(f => f.path);
      }

      // Xử lý danh sách tập phim (episodes)
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

      if (Array.isArray(genres) && genres.length > 0) {
        await Genre.updateMany(
          { _id: { $in: genres } },
          { $addToSet: { movieId: series._id } }
        );
      }

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
  }
);

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
router.put(
  '/:id',
  upload.any(), // Sử dụng upload.any() để không bị lỗi khi không có file
  async (req, res) => {
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
      const thumbnailFile = req.files?.find(f => f.fieldname === "thumbnail");
      if (thumbnailFile) updateData.thumbnail = thumbnailFile.path;

      // Gallery mới (Cloudinary)
      if (req.files) {
        updateData.gallery = req.files
          .filter(f => f.fieldname === "gallery")
          .map(f => f.path);
      }

      // Lấy series cũ để giữ lại video cũ nếu không upload mới
      const oldSeries = await Series.findById(req.params.id);

      // Xử lý danh sách tập phim cập nhật
      let episodes = [];
      let idx = 0;
      let foundAny = false;
      while (req.body[`episodes[${idx}][name]`] !== undefined) {
        foundAny = true;
        let epName = req.body[`episodes[${idx}][name]`];
        let epVideo = "";
        // Không xử lý file video ở đây, chỉ lấy từ body
        if (typeof req.body[`episodes[${idx}][video]`] === "string") {
          epVideo = req.body[`episodes[${idx}][video]`];
        } else if (oldSeries && oldSeries.episodes && oldSeries.episodes[idx]) {
          epVideo = oldSeries.episodes[idx]?.video || "";
        }
        if (epName) {
          episodes.push({ name: epName, video: epVideo });
        }
        idx++;
      }

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

      const seriesObj = series.toObject();
      seriesObj.thumbnail = series.thumbnail;
      seriesObj.gallery = series.gallery;
      seriesObj.episodes = series.episodes.map(ep => ({
        ...ep,
        video: ep.video
      }));

      res.json({ message: "Đã cập nhật phim bộ", series: seriesObj });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

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
