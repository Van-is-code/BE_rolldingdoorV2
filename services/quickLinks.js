const QuickLink = require("../models/QuickLink");
const Log = require("../models/Log");

const MQTT_TOPIC_COMMAND = "door/command";

/** Đơn vị thời hạn link được phép dùng. "never" = vĩnh viễn. */
const DURATION_UNITS = ["hour", "day", "month", "never"];

const MAX_DURATION = {
  hour: 24 * 365, // ~1 năm tính theo giờ
  day: 365,
  month: 120, // 10 năm
};

/**
 * Tính thời điểm hết hạn từ {durationUnit, durationValue}.
 * Tính ở server để không phụ thuộc đồng hồ của máy client.
 *
 * @returns {{ ok: true, expiresAt: Date|null } | { ok: false, message: string }}
 */
function resolveExpiry(durationUnit, durationValue, now = new Date()) {
  if (!DURATION_UNITS.includes(durationUnit)) {
    return {
      ok: false,
      message: `durationUnit phải là một trong: ${DURATION_UNITS.join(", ")}.`,
    };
  }

  if (durationUnit === "never") {
    return { ok: true, expiresAt: null };
  }

  const value = Number(durationValue);
  if (!Number.isInteger(value) || value < 1) {
    return { ok: false, message: "durationValue phải là số nguyên lớn hơn 0." };
  }
  if (value > MAX_DURATION[durationUnit]) {
    return {
      ok: false,
      message: `durationValue tối đa là ${MAX_DURATION[durationUnit]} cho đơn vị "${durationUnit}".`,
    };
  }

  const expiresAt = new Date(now.getTime());
  if (durationUnit === "hour") {
    expiresAt.setUTCHours(expiresAt.getUTCHours() + value);
  } else if (durationUnit === "day") {
    expiresAt.setUTCDate(expiresAt.getUTCDate() + value);
  } else {
    // setUTCMonth tự xử lý tràn tháng: 31/01 + 1 tháng -> 03/03 (hoặc 02/03 năm nhuận).
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + value);
  }

  return { ok: true, expiresAt };
}

/** Kiểm tra và chuẩn hoá danh sách hành động cho phép. */
function normalizeActions(input) {
  if (input === undefined || input === null) {
    return { ok: true, actions: [...QuickLink.ACTIONS] };
  }
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: "allowedActions phải là mảng có ít nhất 1 hành động." };
  }
  const unique = [...new Set(input)];
  const invalid = unique.filter((a) => !QuickLink.ACTIONS.includes(a));
  if (invalid.length > 0) {
    return {
      ok: false,
      message: `Hành động không hợp lệ: ${invalid.join(", ")}. Chỉ chấp nhận ${QuickLink.ACTIONS.join(", ")}.`,
    };
  }
  // Giữ đúng thứ tự OPEN, CLOSE, STOP cho ổn định.
  return { ok: true, actions: QuickLink.ACTIONS.filter((a) => unique.includes(a)) };
}

/**
 * Dạng dữ liệu trả về cho CHỦ link (đã đăng nhập).
 * Có kèm token để người dùng copy lại đường dẫn chia sẻ.
 */
function serializeForOwner(link) {
  return {
    id: link.id,
    token: link.token,
    label: link.label,
    allowedActions: link.allowedActions,
    expiresAt: link.expiresAt,
    isLocked: link.isLocked,
    status: QuickLink.statusOf(link),
    usageCount: link.usageCount,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

/**
 * Dạng dữ liệu trả về cho NGƯỜI LẠ đang mở link (chưa đăng nhập).
 * KHÔNG lộ id, userId, tên chủ tài khoản, số lần dùng hay ngày tạo.
 */
function serializeForPublic(link) {
  return {
    label: link.label,
    allowedActions: link.allowedActions,
    expiresAt: link.expiresAt,
    status: QuickLink.statusOf(link),
  };
}

/** Sinh token chưa bị trùng trong bảng. */
async function generateUniqueToken(maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = QuickLink.generateToken();
    const existing = await QuickLink.findOne({ where: { token } });
    if (!existing) return token;
  }
  throw new Error("Không sinh được token duy nhất sau nhiều lần thử.");
}

/**
 * Gửi lệnh qua MQTT rồi ghi log. Dùng chung cho cả link công khai.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
function publishCommand(mqttClient, action) {
  return new Promise((resolve) => {
    if (!mqttClient || !mqttClient.connected) {
      return resolve({
        ok: false,
        status: 503,
        message: "Không thể gửi lệnh: MQTT client không kết nối.",
      });
    }

    mqttClient.publish(MQTT_TOPIC_COMMAND, action, { qos: 1 }, (err) => {
      if (err) {
        return resolve({
          ok: false,
          status: 500,
          message: `Lỗi khi gửi lệnh MQTT: ${err.message}`,
        });
      }
      resolve({ ok: true });
    });
  });
}

/** Ghi log cho một lần dùng link và cập nhật thống kê của link. */
async function recordLinkUsage(link, action) {
  const now = new Date();
  await Promise.all([
    Log.create({
      userId: link.userId,
      action,
      source: "LINK",
      quickLinkId: link.id,
      timestamp: now,
    }),
    link.update({ usageCount: link.usageCount + 1, lastUsedAt: now }),
  ]);
}

module.exports = {
  DURATION_UNITS,
  MAX_DURATION,
  MQTT_TOPIC_COMMAND,
  resolveExpiry,
  normalizeActions,
  serializeForOwner,
  serializeForPublic,
  generateUniqueToken,
  publishCommand,
  recordLinkUsage,
};
