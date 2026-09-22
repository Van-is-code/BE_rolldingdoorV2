const express = require("express");
const router = express.Router();
const QuickLink = require("../models/QuickLink");
const { rateLimit, clientIp } = require("../middleware/rateLimit");
const {
  serializeForPublic,
  publishCommand,
  recordLinkUsage,
} = require("../services/quickLinks");

/**
 * Endpoint CÔNG KHAI cho liên kết sử dụng nhanh — KHÔNG yêu cầu đăng nhập.
 *
 * Nguyên tắc bảo mật của file này:
 *  1. Chỉ làm đúng hai việc: đọc thông tin link, và gửi lệnh mở/đóng/dừng.
 *     Không đụng tới lịch sử, lịch hẹn giờ hay thông tin tài khoản.
 *  2. Không bao giờ lộ userId, username, id của link hay số lần đã dùng.
 *  3. Mọi phản hồi khi token sai / bị khoá / hết hạn đều dùng CÙNG một thông báo
 *     chung, để người lạ không dò được token nào tồn tại.
 *  4. Có giới hạn tần suất theo token và theo IP.
 *  5. Mọi lần dùng đều ghi log với source = "LINK" và quickLinkId.
 */

const GENERIC_INVALID = "Liên kết không hợp lệ hoặc đã hết hiệu lực.";

/** Chặn dò token: tối đa 20 lần tra cứu / 1 phút / IP. */
const lookupLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyBy: (req) => `lookup:${clientIp(req)}`,
  message: "Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
});

/** Chặn spam lệnh: tối đa 10 lệnh / 1 phút / token. */
const commandByTokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyBy: (req) => `cmd-token:${req.params.token}`,
  message: "Liên kết này đang gửi lệnh quá nhanh. Vui lòng chờ một lát.",
});

/** Chặn spam lệnh theo IP: tối đa 20 lệnh / 1 phút / IP. */
const commandByIpLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyBy: (req) => `cmd-ip:${clientIp(req)}`,
  message: "Bạn đang gửi lệnh quá nhanh. Vui lòng chờ một lát.",
});

/** Tìm link theo token. Trả về null nếu không có — người gọi tự xử lý thông báo chung. */
async function findByToken(token) {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) return null;
  return QuickLink.findOne({ where: { token } });
}

// GET /q/:token — thông tin tối thiểu để trang công khai hiển thị
router.get("/:token", lookupLimiter, async (req, res) => {
  try {
    const link = await findByToken(req.params.token);
    if (!link) return res.status(404).json({ message: GENERIC_INVALID });

    // Link bị khoá / hết hạn vẫn trả 200 kèm trường `status`, để trang công khai
    // hiển thị đúng lý do thay vì báo "không tồn tại". Người gọi đã có token đúng
    // nên việc này không lộ thêm thông tin gì.
    res.json(serializeForPublic(link));
  } catch (error) {
    console.error("Error fetching public link:", error);
    res.status(500).json({ message: "Lỗi server." });
  }
});

// POST /q/:token/command — gửi lệnh điều khiển cửa
router.post("/:token/command", commandByIpLimiter, commandByTokenLimiter, async (req, res) => {
  const { action } = req.body || {};

  try {
    const link = await findByToken(req.params.token);
    if (!link) return res.status(404).json({ message: GENERIC_INVALID });

    const status = QuickLink.statusOf(link);
    if (status === "locked") {
      return res.status(403).json({ message: "Liên kết này đã bị chủ tài khoản khoá." });
    }
    if (status === "expired") {
      return res.status(403).json({ message: "Liên kết này đã hết hạn sử dụng." });
    }

    if (!QuickLink.ACTIONS.includes(action)) {
      return res.status(400).json({ message: "Lệnh không hợp lệ." });
    }
    if (!link.allowedActions.includes(action)) {
      return res.status(403).json({ message: "Liên kết này không được phép thực hiện lệnh đó." });
    }

    const result = await publishCommand(req.mqttClient, action);
    if (!result.ok) {
      console.warn(`Quick link ${link.id} command failed: ${result.message}`);
      return res.status(result.status).json({ message: result.message });
    }

    try {
      await recordLinkUsage(link, action);
    } catch (logError) {
      // Lệnh ĐÃ tới cửa rồi — không được báo lỗi cho người dùng, chỉ log lại.
      console.error("Quick link usage logging failed:", logError.message);
    }

    console.log(`Quick link ${link.id} ("${link.label}") sent ${action}`);
    res.json({ message: "Đã gửi lệnh thành công." });
  } catch (error) {
    console.error("Error handling public command:", error);
    res.status(500).json({ message: "Lỗi server." });
  }
});

module.exports = router;
