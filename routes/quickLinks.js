const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const QuickLink = require("../models/QuickLink");
const {
  resolveExpiry,
  normalizeActions,
  serializeForOwner,
  generateUniqueToken,
} = require("../services/quickLinks");

/**
 * CRUD liên kết sử dụng nhanh — TẤT CẢ đều yêu cầu đăng nhập.
 * Người dùng chỉ thấy và sửa được link của chính mình.
 * Endpoint công khai (không cần đăng nhập) nằm ở routes/public.js.
 */

const MAX_LINKS_PER_USER = 50;
const MAX_LABEL_LENGTH = 120;

function validateLabel(label) {
  if (typeof label !== "string" || label.trim().length === 0) {
    return { ok: false, message: "Vui lòng nhập tên gợi nhớ cho liên kết." };
  }
  if (label.trim().length > MAX_LABEL_LENGTH) {
    return { ok: false, message: `Tên gợi nhớ tối đa ${MAX_LABEL_LENGTH} ký tự.` };
  }
  return { ok: true, label: label.trim() };
}

/** Tìm link theo id và kiểm tra quyền sở hữu. */
async function findOwnedLink(id, userId) {
  const link = await QuickLink.findByPk(id);
  if (!link) return { error: { status: 404, message: "Liên kết không tồn tại." } };
  if (link.userId !== userId) {
    return { error: { status: 403, message: "Bạn không có quyền với liên kết này." } };
  }
  return { link };
}

// GET /api/quick-links — danh sách link của chính mình, mới nhất trước
router.get("/", protect, async (req, res) => {
  try {
    const links = await QuickLink.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
    });
    res.json(links.map(serializeForOwner));
  } catch (error) {
    console.error("Error fetching quick links:", error);
    res.status(500).json({ message: `Lỗi server khi lấy danh sách liên kết: ${error.message}` });
  }
});

// POST /api/quick-links — tạo link mới
router.post("/", protect, async (req, res) => {
  const { label, durationUnit, durationValue, allowedActions } = req.body;

  const labelCheck = validateLabel(label);
  if (!labelCheck.ok) return res.status(400).json({ message: labelCheck.message });

  const expiry = resolveExpiry(durationUnit, durationValue);
  if (!expiry.ok) return res.status(400).json({ message: expiry.message });

  const actions = normalizeActions(allowedActions);
  if (!actions.ok) return res.status(400).json({ message: actions.message });

  try {
    const count = await QuickLink.count({ where: { userId: req.user.id } });
    if (count >= MAX_LINKS_PER_USER) {
      return res.status(400).json({
        message: `Mỗi tài khoản chỉ được tạo tối đa ${MAX_LINKS_PER_USER} liên kết. Hãy xoá bớt link cũ.`,
      });
    }

    const link = await QuickLink.create({
      userId: req.user.id,
      token: await generateUniqueToken(),
      label: labelCheck.label,
      allowedActions: actions.actions,
      expiresAt: expiry.expiresAt,
      isLocked: false,
    });

    console.log(`Quick link created: ${link.id} by ${req.user.username}`);
    res.status(201).json(serializeForOwner(link));
  } catch (error) {
    console.error("Error creating quick link:", error);
    res.status(500).json({ message: `Lỗi server khi tạo liên kết: ${error.message}` });
  }
});

// PATCH /api/quick-links/:id — sửa tên, khoá/mở khoá, gia hạn, đổi quyền
router.patch("/:id", protect, async (req, res) => {
  const { label, isLocked, durationUnit, durationValue, allowedActions } = req.body;

  try {
    const { link, error } = await findOwnedLink(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const updates = {};

    if (label !== undefined) {
      const labelCheck = validateLabel(label);
      if (!labelCheck.ok) return res.status(400).json({ message: labelCheck.message });
      updates.label = labelCheck.label;
    }

    if (isLocked !== undefined) {
      if (typeof isLocked !== "boolean") {
        return res.status(400).json({ message: "isLocked phải là true hoặc false." });
      }
      updates.isLocked = isLocked;
    }

    // Gia hạn: tính lại mốc hết hạn kể từ THỜI ĐIỂM HIỆN TẠI, không cộng dồn.
    if (durationUnit !== undefined) {
      const expiry = resolveExpiry(durationUnit, durationValue);
      if (!expiry.ok) return res.status(400).json({ message: expiry.message });
      updates.expiresAt = expiry.expiresAt;
    }

    if (allowedActions !== undefined) {
      const actions = normalizeActions(allowedActions);
      if (!actions.ok) return res.status(400).json({ message: actions.message });
      updates.allowedActions = actions.actions;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Không có thông tin nào để cập nhật." });
    }

    await link.update(updates);
    console.log(`Quick link updated: ${link.id} by ${req.user.username}`);
    res.json(serializeForOwner(link));
  } catch (error) {
    console.error("Error updating quick link:", error);
    res.status(500).json({ message: `Lỗi server khi cập nhật liên kết: ${error.message}` });
  }
});

// POST /api/quick-links/:id/rotate — đổi token, huỷ hiệu lực đường dẫn cũ
router.post("/:id/rotate", protect, async (req, res) => {
  try {
    const { link, error } = await findOwnedLink(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    await link.update({ token: await generateUniqueToken() });
    console.log(`Quick link rotated: ${link.id} by ${req.user.username}`);
    res.json(serializeForOwner(link));
  } catch (error) {
    console.error("Error rotating quick link:", error);
    res.status(500).json({ message: `Lỗi server khi đổi liên kết: ${error.message}` });
  }
});

// DELETE /api/quick-links/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const { link, error } = await findOwnedLink(req.params.id, req.user.id);
    if (error) return res.status(error.status).json({ message: error.message });

    await link.destroy();
    console.log(`Quick link deleted: ${req.params.id} by ${req.user.username}`);
    res.json({ message: "Đã xoá liên kết." });
  } catch (error) {
    console.error("Error deleting quick link:", error);
    res.status(500).json({ message: `Lỗi server khi xoá liên kết: ${error.message}` });
  }
});

module.exports = router;
