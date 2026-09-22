const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Schedule = require("../models/Schedule");
const Log = require("../models/Log");
const QuickLink = require("../models/QuickLink");
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
    res.status(201).json({
      message: "Tạo người dùng thành công.",
      user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server." });
  }
});

/* ------------------------------------------------------------------ */
/* Quản lý tài khoản chính thức — chỉ Admin                            */
/* ------------------------------------------------------------------ */

// GET /auth/admin/users — danh sách tài khoản, KHÔNG bao giờ trả về mật khẩu
router.get("/admin/users", protect, isAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "username", "role", "createdAt", "updatedAt"],
      order: [["createdAt", "ASC"]],
    });
    res.json(users);
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ message: "Lỗi server." });
  }
});

// POST /auth/admin/users/:id/password — admin đặt lại mật khẩu cho tài khoản khác
router.post("/admin/users/:id/password", protect, isAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự." });
  }
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Tài khoản không tồn tại." });

    // hook beforeSave của model tự băm lại mật khẩu
    await user.update({ password: newPassword });
    console.log(`Admin ${req.user.username} reset password for ${user.username}`);
    res.json({ message: `Đã đặt lại mật khẩu cho "${user.username}".` });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Lỗi server." });
  }
});

// DELETE /auth/admin/users/:id — xoá tài khoản
router.delete("/admin/users/:id", protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Tài khoản không tồn tại." });

    if (user.id === req.user.id) {
      return res.status(400).json({ message: "Không thể tự xoá tài khoản đang đăng nhập." });
    }

    // Giữ lại ít nhất một admin, nếu không sẽ không ai quản trị được hệ thống.
    if (user.role === "admin") {
      const adminCount = await User.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ message: "Không thể xoá admin cuối cùng của hệ thống." });
      }
    }

    // Dọn dữ liệu phụ thuộc trước, tránh lỗi khoá ngoại.
    await QuickLink.destroy({ where: { userId: user.id } });

    // Cron job của các lịch này đang chạy trong RAM — phải dừng, nếu không
    // cửa vẫn tự mở/đóng theo lịch của tài khoản đã bị xoá.
    const schedules = await Schedule.findAll({ where: { userId: user.id } });
    for (const schedule of schedules) {
      req.scheduler?.removeJob(schedule.id);
    }
    await Schedule.destroy({ where: { userId: user.id } });

    // Giữ lại lịch sử để truy vết, chỉ gỡ liên kết tới tài khoản đã xoá.
    await Log.update({ userId: null }, { where: { userId: user.id } });

    const username = user.username;
    await user.destroy();
    console.log(`Admin ${req.user.username} deleted account ${username}`);
    res.json({ message: `Đã xoá tài khoản "${username}".` });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: `Lỗi server khi xoá tài khoản: ${error.message}` });
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
