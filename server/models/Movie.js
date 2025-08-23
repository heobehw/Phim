import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const movieSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  genres:      [{ type: mongoose.Schema.Types.ObjectId, ref: "Genre" }],
  year:        { type: Number },
  type:        { type: String, enum: ["phim-le", "phim-bo"], required: true },
  episodes:    { type: Number },
  directors:   [{ type: String }],
  actors:      [{ type: String }],
  thumbnail:   { type: String },
  gallery:     [{ type: String }],
  description: { type: String },
  video:       { type: String },
  country:     { type: String },
  comments:    [commentSchema], // Danh sách bình luận theo user
  createdAt:   { type: Date, default: Date.now }
});

const Movie = mongoose.model("Movie", movieSchema);
export default Movie;