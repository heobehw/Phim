import mongoose from "mongoose";

const episodeSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  video: { type: String, required: true }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const seriesSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String },
  genres:      [{ type: mongoose.Schema.Types.ObjectId, ref: "Genre" }],
  year:        { type: Number },
  episodes:    [episodeSchema], // Mảng object, mỗi object là 1 tập
  directors:   [{ type: String }],
  actors:      [{ type: String }],
  thumbnail:   { type: String },
  gallery:     [{ type: String }],
  country:     { type: String },
  hasSubtitle: { type: Boolean, default: false }, // Có phụ đề hay không
  comments:    [commentSchema], // Danh sách bình luận theo user
  createdAt:   { type: Date, default: Date.now }
});

const Series = mongoose.model("Series", seriesSchema);
export default Series;