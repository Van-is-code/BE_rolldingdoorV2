require("dotenv").config();
const { Sequelize } = require("sequelize");

// Database configuration (Ưu tiên đọc từ .env để linh hoạt khi deploy)
const DATABASE_URL = process.env.DATABASE_URL || "postgres://thiepcuoi_coanh:jczhgjugsnvukpuo@localhost:5432/rolldingdoor_service2";
const USE_SSL = process.env.USE_SSL === "true";

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false, // Set to console.log để xem SQL queries
  dialectOptions: {
    ssl: USE_SSL ? { require: true, rejectUnauthorized: false } : false,
  },
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("Đã kết nối PostgreSQL...");
    
    // Sync models (tạo bảng nếu chưa tồn tại)
    await sequelize.sync({ alter: false });
    console.log("Database synchronized.");
  } catch (err) {
    console.error("Lỗi kết nối PostgreSQL:", err.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
