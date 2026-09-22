const { DataTypes } = require("sequelize");
const crypto = require("crypto");
const { sequelize } = require("../config/db");
const User = require("./User");

/**
 * Liên kết sử dụng nhanh: cho phép điều khiển cửa mà KHÔNG cần đăng nhập.
 * Chủ tài khoản tạo link rồi gửi cho người khác (shipper, khách, người giúp việc...).
 *
 * Bảo mật:
 *  - token dài 32 ký tự ngẫu nhiên từ crypto.randomBytes (192 bit).
 *  - Mỗi link giới hạn được hành động (ví dụ chỉ cho MỞ, không cho ĐÓNG).
 *  - Có thể khoá (isLocked) hoặc hết hạn (expiresAt) bất cứ lúc nào.
 *  - Mọi lần dùng đều ghi vào bảng Logs với source = "LINK".
 */

const ACTIONS = ["OPEN", "CLOSE", "STOP"];

const QuickLink = sequelize.define(
  "QuickLink",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    /** Chuỗi bí mật nằm trong URL chia sẻ. */
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    /** Tên gợi nhớ do người tạo đặt, ví dụ "Shipper Giao Hàng Nhanh". */
    label: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    /** Tập hành động link được phép gửi. Mặc định cho cả ba. */
    allowedActions: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: ACTIONS,
    },
    /** null = vĩnh viễn, không bao giờ hết hạn. */
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    /** Khoá tạm thời mà không xoá link. */
    isLocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    usageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["userId"] }],
  },
);

QuickLink.belongsTo(User, { foreignKey: "userId" });

/** Sinh token ngẫu nhiên an toàn (32 ký tự base64url). */
QuickLink.generateToken = function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
};

QuickLink.ACTIONS = ACTIONS;

/**
 * Trạng thái hiệu lực của link.
 * @returns {"active"|"locked"|"expired"}
 */
QuickLink.statusOf = function statusOf(link, now = new Date()) {
  if (link.isLocked) return "locked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
};

module.exports = QuickLink;
