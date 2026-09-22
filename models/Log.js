const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Log = sequelize.define(
  "Log",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: "id",
      },
    },
    action: {
      type: DataTypes.ENUM("OPEN", "CLOSE", "STOP"),
      allowNull: false,
    },
    /**
     * APP       - người dùng bấm trong ứng dụng
     * SCHEDULED - bộ hẹn giờ của server tự chạy
     * LINK      - ai đó dùng liên kết chia sẻ nhanh
     */
    source: {
      type: DataTypes.ENUM("APP", "SCHEDULED", "LINK"),
      allowNull: false,
    },
    /** Chỉ có giá trị khi source = "LINK": link nào đã gửi lệnh. */
    quickLinkId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
  }
);

// Set up association
Log.belongsTo(User, { foreignKey: "userId" });

module.exports = Log;
