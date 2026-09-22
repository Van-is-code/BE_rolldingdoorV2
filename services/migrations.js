const { sequelize } = require("../config/db");

/**
 * Migration chạy lúc khởi động.
 *
 * VÌ SAO CẦN: config/db.js gọi sequelize.sync({ alter: false }) — lệnh này chỉ TẠO
 * bảng chưa tồn tại, KHÔNG sửa bảng đã có. Nên với một database đang chạy:
 *   - bảng "QuickLinks" mới  -> sync tự tạo, không cần làm gì
 *   - thêm "LINK" vào enum   -> sync KHÔNG làm, phải ALTER thủ công
 *   - thêm cột "quickLinkId" -> sync KHÔNG làm, phải ALTER thủ công
 *
 * Mọi câu lệnh dưới đây đều idempotent: chạy lại nhiều lần vẫn an toàn,
 * và trên database mới tinh thì chúng là no-op.
 */

/** Tên type enum do Sequelize sinh ra: enum_<tên bảng>_<tên cột> */
const LOG_SOURCE_ENUM = "enum_Logs_source";

async function addEnumValue(enumName, value) {
  // Kiểm tra type có tồn tại chưa — database mới thì sync đã tạo sẵn với đủ giá trị.
  const [rows] = await sequelize.query(
    `SELECT 1 FROM pg_type WHERE typname = :enumName LIMIT 1`,
    { replacements: { enumName } },
  );
  if (rows.length === 0) return false;

  const [existing] = await sequelize.query(
    `SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = :enumName AND e.enumlabel = :value
      LIMIT 1`,
    { replacements: { enumName, value } },
  );
  if (existing.length > 0) return false;

  // Lưu ý: ALTER TYPE ... ADD VALUE không chạy được bên trong transaction,
  // nên gọi trực tiếp, không bọc transaction.
  await sequelize.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`);
  return true;
}

async function runMigrations() {
  const applied = [];

  try {
    if (await addEnumValue(LOG_SOURCE_ENUM, "LINK")) {
      applied.push(`enum ${LOG_SOURCE_ENUM} += 'LINK'`);
    }

    // Cột quickLinkId trên bảng Logs (nullable, chỉ dùng khi source = 'LINK').
    await sequelize.query(
      `ALTER TABLE "Logs" ADD COLUMN IF NOT EXISTS "quickLinkId" INTEGER`,
    );

    if (applied.length > 0) {
      console.log(`Migration đã áp dụng: ${applied.join(", ")}`);
    } else {
      console.log("Migration: database đã ở trạng thái mới nhất.");
    }
  } catch (error) {
    // Không cho app chết vì migration — nhưng phải log thật rõ.
    console.error("LỖI MIGRATION:", error.message);
    console.error(
      "Tính năng liên kết nhanh có thể không ghi được log. " +
        "Hãy chạy thủ công:\n" +
        `  ALTER TYPE "${LOG_SOURCE_ENUM}" ADD VALUE IF NOT EXISTS 'LINK';\n` +
        `  ALTER TABLE "Logs" ADD COLUMN IF NOT EXISTS "quickLinkId" INTEGER;`,
    );
  }
}

module.exports = { runMigrations };
