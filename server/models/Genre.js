import mongoose from 'mongoose';

const genreSchema = new mongoose.Schema({
  name:       { type: String, required: true, unique: true },
  thumbnail:  { type: String }, // Đường dẫn hoặc URL ảnh thumbnail
  movieId:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }], // Thêm dòng này
  createdAt:  { type: Date, default: Date.now }
});

const Genre = mongoose.model('Genre', genreSchema);
export default Genre;