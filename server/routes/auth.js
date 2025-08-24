import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET; // Lấy từ .env

router.post('/register', async (req, res) => {
  try {
    const { displayName, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ displayName, email, password: hash });
    await user.save();
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Đăng nhập trả về token và user info
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Email không tồn tại" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Sai mật khẩu" });

    // Tạo JWT token
    const token = jwt.sign(
      { userId: user._id, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        displayName: user.displayName,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;