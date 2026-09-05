const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { protect, isAdmin } = require("../middleware/auth");

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "aGV0aG9uZ2N1YWN1b24=";

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu." });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu." });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

// POST /auth/admin/create-user (Chỉ Admin được tạo)
router.post("/admin/create-user", protect, isAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Vui lòng nhập đủ tên và mật khẩu." });
  }
  try {
    const userExists = await User.findOne({ where: { username } });
    if (userExists) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại." });
    }
    const user = await User.create({
      username,
      password,
      role: role || "user",
    });
    res.status(201).json({ message: "Tạo người dùng thành công." });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

// POST /auth/change-password (User tự đổi)
router.post("/change-password", protect, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const user = await User.findByPk(req.user.id);
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu cũ không đúng." });
    }
    await user.update({ password: newPassword });
    res.json({ message: "Đổi mật khẩu thành công." });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

module.exports = router;
