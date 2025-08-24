import express from 'express';
import Series from '../models/Series.js';
import Genre from '../models/Genre.js';
import path from 'path';
// Thêm middleware xác thực
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tạo phim bộ mới
router.post('/', async (req, res) => {
  console.log('req.body:', req.body);
  console.log('req.files:', req.files);
  try {
    let {
      name, genres, year, description, country, directors, actors, hasSubtitle
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
    const thumbnailFile = req.files.find(f => f.fieldname === "thumbnail");
    if (thumbnailFile) {
      thumbnailUrl = path.join('/uploads', thumbnailFile.filename);
    }

    // Lấy đường dẫn các file gallery
    let galleryUrls = [];
    galleryUrls = req.files
      .filter(f => f.fieldname === "gallery")
      .map(file => path.join('/uploads', file.filename));

    // Xử lý danh sách tập phim (episodes)
    let episodes = [];
    if (Array.isArray(req.body.episodes)) {
      req.body.episodes.forEach((ep, idx) => {
        const videoFile = req.files.find(f => f.fieldname === `episodes[${idx}][video]`);
        if (ep.name && videoFile) {
          episodes.push({
            name: ep.name,
            video: path.join('/uploads', videoFile.filename)
          });
        }
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
      hasSubtitle: hasSubtitle === "true" || hasSubtitle === true,
      comments: [] // Khởi tạo mảng bình luận rỗng
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
    // Lấy userId từ token đã xác thực
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

    // Lấy lại series với populate user cho comment
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
    // Lấy userId từ token đã xác thực
    const userId = req.user.userId;
    if (!userId) return res.status(400).json({ error: "Thiếu userId" });

    const series = await Series.findById(req.params.id);
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });

    const comment = series.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Không tìm thấy bình luận" });

    // Chỉ cho phép user đã đăng bình luận xóa
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ error: "Bạn không có quyền xóa bình luận này" });
    }

    // Sửa tại đây: dùng pull thay vì comment.remove()
    series.comments.pull({ _id: req.params.commentId });
    await series.save();

    // Lấy lại series với populate user cho comment
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
  console.log('req.body:', req.body);
  console.log('req.files:', req.files);
  try {
    const {
      name, genres, year, description, country, directors, actors, hasSubtitle
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
      description,
      country,
      directors: directorsArr,
      actors: actorsArr,
      hasSubtitle
    };

    // Thumbnail mới
    const thumbnailFile = req.files.find(f => f.fieldname === "thumbnail");
    if (thumbnailFile) {
      updateData.thumbnail = path.join('/uploads', thumbnailFile.filename);
    }

    // Gallery mới
    updateData.gallery = req.files
      .filter(f => f.fieldname === "gallery")
      .map(file => path.join('/uploads', file.filename));

    // Lấy series cũ để giữ lại video cũ nếu không upload mới
    const oldSeries = await Series.findById(req.params.id);

    // Xử lý danh sách tập phim cập nhật
    let episodes = [];

    // Trường hợp FE gửi từng trường riêng lẻ (episodes[0][name], ...)
    let idx = 0;
    let foundAny = false;
    while (req.body[`episodes[${idx}][name]`] !== undefined) {
      foundAny = true;
      let epName = req.body[`episodes[${idx}][name]`];
      let epVideo = "";
      const videoFile = req.files.find(f => f.fieldname === `episodes[${idx}][video]`);
      if (videoFile) {
        epVideo = path.join('/uploads', videoFile.filename);
      } else if (typeof req.body[`episodes[${idx}][video]`] === "string" && req.body[`episodes[${idx}][video]`]) {
        epVideo = req.body[`episodes[${idx}][video]`];
      } else if (oldSeries && oldSeries.episodes && oldSeries.episodes[idx]) {
        epVideo = oldSeries.episodes[idx]?.video || "";
      }
      if (epName && epVideo) {
        episodes.push({ name: epName, video: epVideo });
      }
      idx++;
    }

    // Trường hợp FE gửi dạng mảng (episodes: [...])
    if (!foundAny && Array.isArray(req.body.episodes)) {
      req.body.episodes.forEach((ep, idx) => {
        let epName = ep.name;
        let epVideo = "";
        const videoFile = req.files.find(f => f.fieldname === `episodes[${idx}][video]`);
        if (videoFile) {
          epVideo = path.join('/uploads', videoFile.filename);
        } else if (ep.video) {
          epVideo = ep.video;
        } else if (oldSeries && oldSeries.episodes && oldSeries.episodes[idx]) {
          epVideo = oldSeries.episodes[idx]?.video || "";
        }
        if (epName && epVideo) {
          episodes.push({ name: epName, video: epVideo });
        }
      });
    }

    // Nếu không có tập nào (do FE gửi thiếu), giữ lại toàn bộ tập cũ
    if (episodes.length === 0 && oldSeries && oldSeries.episodes) {
      episodes = oldSeries.episodes;
    }
    updateData.episodes = episodes;

    const series = await Series.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!series) return res.status(404).json({ error: "Không tìm thấy phim bộ" });

    // Thêm series._id vào movieId của các genre liên quan (nếu cập nhật genres)
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