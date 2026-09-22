/**
 * Giới hạn tần suất đơn giản, lưu trong bộ nhớ tiến trình.
 *
 * GIỚI HẠN CẦN BIẾT: bộ đếm nằm trong RAM của một tiến trình. Nếu deploy nhiều
 * instance (Koyeb scale > 1) thì mỗi instance đếm riêng, nên giới hạn thực tế
 * bằng ngưỡng × số instance. Với quy mô một cái cửa nhà thì chấp nhận được;
 * muốn chặt hơn phải dùng Redis.
 */

const buckets = new Map();

/** Dọn các bucket đã hết hạn để Map không phình mãi. */
function sweep(now) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

let lastSweep = 0;

/**
 * @param {object} options
 * @param {number} options.windowMs   Độ dài cửa sổ tính, mili giây
 * @param {number} options.max        Số request tối đa trong cửa sổ
 * @param {(req) => string} options.keyBy  Hàm lấy khoá phân nhóm
 * @param {string} options.message    Thông báo trả về khi vượt ngưỡng
 */
function rateLimit({ windowMs, max, keyBy, message }) {
  return (req, res, next) => {
    const now = Date.now();

    if (now - lastSweep > windowMs) {
      sweep(now);
      lastSweep = now;
    }

    const key = keyBy(req);
    let entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: message || `Thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`,
      });
    }

    next();
  };
}

/** Lấy IP client, có tính tới proxy của Koyeb/Heroku. */
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

module.exports = { rateLimit, clientIp };
