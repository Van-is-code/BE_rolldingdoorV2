require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const { sequelize, connectDB } = require("./config/db");
const Scheduler = require("./services/Scheduler");
const { runMigrations } = require("./services/migrations");

// Import all models
const User = require("./models/User");
const Schedule = require("./models/Schedule");
const Log = require("./models/Log");
const QuickLink = require("./models/QuickLink");

// Config (Ưu tiên đọc từ .env, fallback cấu hình mặc định)
const HIVEMQ_CLUSTER_URL = process.env.HIVEMQ_CLUSTER_URL || "c131d19cf9b3498ab5655988b219498f.s1.eu.hivemq.cloud";
const HIVEMQ_USERNAME = process.env.HIVEMQ_USERNAME || "cbgbar";
const HIVEMQ_PASSWORD = process.env.HIVEMQ_PASSWORD || "@Van02092005";
const HIVEMQ_PORT = parseInt(process.env.HIVEMQ_PORT, 10) || 8883;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const API_PORT = process.env.PORT || 4000;

const app = express();

// --- Kết nối MQTT Client tới HiveMQ Cloud ---
const mqttOptions = {
  host: HIVEMQ_CLUSTER_URL,
  port: HIVEMQ_PORT,
  protocol: "mqtts",
  username: HIVEMQ_USERNAME,
  password: HIVEMQ_PASSWORD,
  clientId: `backend_nodejs_${Math.random().toString(16).substr(2, 8)}`,
  connectTimeout: 10000,
  reconnectPeriod: 1000,
  clean: true,
};

console.log(`Đang kết nối tới HiveMQ Broker: ${mqttOptions.protocol}://${mqttOptions.host}:${mqttOptions.port}`);
let mqttClient;
try {
  mqttClient = mqtt.connect(mqttOptions);
} catch (e) {
  console.error("Lỗi ngay khi gọi mqtt.connect:", e);
  process.exit(1);
}

// --- Các sự kiện của MQTT Client ---
mqttClient.on("connect", () => {
  console.log(">>> Đã kết nối thành công tới HiveMQ Broker!");
});

mqttClient.on("reconnect", () => {
  console.log("MQTT Client đang thử kết nối lại...");
});

mqttClient.on("error", (error) => {
  console.error("Lỗi MQTT Client:", error.message);
});

mqttClient.on("close", () => {
  console.log("MQTT Client đã ngắt kết nối.");
});

mqttClient.on("offline", () => {
  console.log("MQTT Client đang offline.");
});

mqttClient.on("message", (topic, message) => {
  console.log(`Received message on topic ${topic}: ${message.toString()}`);
});
// --- Kết thúc MQTT Client ---

// Khởi tạo Bộ hẹn giờ và truyền mqttClient vào
const scheduler = new Scheduler(mqttClient);

// Middlewares cho Express
app.use(cors());
app.use(express.json());

// Middleware để truyền mqttClient và scheduler vào các route
app.use((req, res, next) => {
  req.mqttClient = mqttClient;
  req.scheduler = scheduler;
  next();
});

// Định nghĩa Routes Express
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));
app.use("/api/quick-links", require("./routes/quickLinks"));

// Liên kết sử dụng nhanh — KHÔNG cần đăng nhập. Xem routes/public.js.
app.use("/q", require("./routes/public"));

// Kiểm tra sức khoẻ, dùng cho uptime monitor
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mqtt: mqttClient && mqttClient.connected ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

// Tạo tài khoản Admin
const createAdminAccount = async () => {
  try {
    const adminUser = await User.findOne({ where: { role: "admin" } });
    if (!adminUser && ADMIN_USERNAME && ADMIN_PASSWORD) {
      const newUser = await User.create({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        role: "admin",
      });
      console.log("Tài khoản Admin mặc định đã được tạo.");
    }
  } catch (error) {
    console.error("Lỗi khi tạo tài khoản Admin:", error);
  }
};

const bootstrap = async () => {
  try {
    await connectDB();
    // Phải chạy SAU sync: sync({alter:false}) không sửa được bảng/enum đã tồn tại.
    await runMigrations();
    await scheduler.start();
    await createAdminAccount();

    app.listen(API_PORT, () => {
      console.log(`API Server đang chạy trên port ${API_PORT}`);
    });
  } catch (error) {
    console.error("Lỗi khởi động ứng dụng:", error);
    process.exit(1);
  }
};

bootstrap();
