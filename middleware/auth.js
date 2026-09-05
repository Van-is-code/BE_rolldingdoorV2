const jwt = require("jsonwebtoken");
const User = require("../models/User");

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "aGV0aG9uZ2N1YWN1b24=";

// Middleware xác thực token
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Không có quyền truy cập, vui lòng đăng nhập." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] }, // Exclude password field
    });
    if (!req.user) {
      return res.status(401).json({ message: "Người dùng không tồn tại." });
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ." });
  }
};

// Middleware kiểm tra quyền Admin
exports.isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Bạn không có quyền Admin." });
  }
};
