import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  password:    { type: String, required: true },
  role:        { type: Number, enum: [1, 2], default: 2 }, // 1: admin, 2: user
  createdAt:   { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
export default User;