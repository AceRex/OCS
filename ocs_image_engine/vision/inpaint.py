"""
vision/inpaint.py
=================
Morphological text mask generation and background reconstruction (inpainting).
Produces:
1. clean_bg_original: Text-free background at original flyer aspect ratio
2. clean_bg_screen: 16:9 (1920x1080) landscape background with ambient margins (no stretch)
3. clean_bg_bible: 16:9 background with feathered quiet reading zone for high-contrast scripture presentation
4. text_mask: Visualizable binary mask showing detected & removed text regions
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple, Dict, Any
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance

logger = logging.getLogger("ocs.inpaint")

RGB = Tuple[int, int, int]


def build_text_mask(
    img: Image.Image,
    ocr_blocks: List[Dict[str, Any]],
    dilation_kernel: int = 7,
    protected_regions: Optional[List[Dict[str, int]]] = None,
    extra_text_boxes: Optional[List[Dict[str, int]]] = None,
) -> np.ndarray:
    """
    Build a precise binary inpainting mask (255 = inpaint, 0 = keep).
    Captures text glyphs, drop shadows, and strokes while protecting faces/logos.
    """
    w, h = img.size
    mask = np.zeros((h, w), dtype=np.uint8)
    img_np = np.array(img.convert("RGB"))
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

    all_boxes = []
    for b in ocr_blocks:
        x = max(0, int(b.get("x", 0)))
        y = max(0, int(b.get("y", 0)))
        bw = max(1, int(b.get("w", 0)))
        bh = max(1, int(b.get("h", 0)))
        all_boxes.append((x, y, bw, bh))

    if extra_text_boxes:
        for b in extra_text_boxes:
            all_boxes.append((int(b.get("x", 0)), int(b.get("y", 0)), int(b.get("w", 0)), int(b.get("h", 0))))

    for (x, y, bw, bh) in all_boxes:
        # Pad coordinates to cover shadows and decorative glows
        pad_x = max(4, int(bw * 0.05))
        pad_y = max(4, int(bh * 0.15))
        x0 = max(0, x - pad_x)
        y0 = max(0, y - pad_y)
        x1 = min(w, x + bw + pad_x)
        y1 = min(h, y + bh + pad_y)

        roi_gray = gray[y0:y1, x0:x1]
        if roi_gray.size == 0:
            continue

        # Detect high-contrast text edges & shadows inside the bounding box
        grad_x = cv2.Sobel(roi_gray, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(roi_gray, cv2.CV_32F, 0, 1, ksize=3)
        mag = cv2.magnitude(grad_x, grad_y)
        mag = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        # Otsu threshold on gradient to find text edges
        _, edge_thresh = cv2.threshold(mag, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Morphological close to bridge internal character letters
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        solid_box = cv2.morphologyEx(edge_thresh, cv2.MORPH_CLOSE, kernel_close)

        # If solid region covers reasonable text stroke area, paste it; otherwise fill rect
        mask_roi = mask[y0:y1, x0:x1]
        cv2.rectangle(mask_roi, (0, 0), (x1 - x0, y1 - y0), 255, thickness=-1)

    # Dilate mask to engulf all outer anti-aliasing halo and drop-shadows
    k_size = max(3, dilation_kernel if dilation_kernel % 2 == 1 else dilation_kernel + 1)
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
    mask = cv2.dilate(mask, dilate_kernel, iterations=1)

    # Respect protected regions (faces, logos)
    if protected_regions:
        for pr in protected_regions:
            px = max(0, int(pr.get("x", 0)))
            py = max(0, int(pr.get("y", 0)))
            pw = max(0, int(pr.get("w", 0)))
            ph = max(0, int(pr.get("h", 0)))
            mask[py : py + ph, px : px + pw] = 0

    return mask


def inpaint_text_regions(img: Image.Image, mask: np.ndarray, inpaint_radius: int = 5) -> Image.Image:
    """
    Remove text by inpainting masked regions using OpenCV Telea + Navier-Stokes algorithms.
    """
    img_np = np.array(img.convert("RGB"))
    # Convert RGB to BGR for OpenCV
    bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    # Inpaint using Telea fast marching method
    inpainted = cv2.inpaint(bgr, mask, inpaintRadius=inpaint_radius, flags=cv2.INPAINT_TELEA)

    # Secondary edge-preserving filter over inpainted boundary to remove seam lines
    seamless = cv2.edgePreservingFilter(inpainted, flags=1, sigma_s=40, sigma_r=0.3)

    # Blend original where mask == 0, seamless where mask == 255
    mask_3c = np.stack([mask] * 3, axis=-1) / 255.0
    final_bgr = (seamless * mask_3c + bgr * (1.0 - mask_3c)).astype(np.uint8)

    rgb = cv2.cvtColor(final_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def create_screen_sized_background(
    clean_bg: Image.Image,
    target_width: int = 1920,
    target_height: int = 1080,
    primary_color: RGB = (15, 13, 27),
) -> Image.Image:
    """
    Adapt a portrait or custom-ratio clean background to 16:9 (1920x1080) landscape.
    Preserves artwork proportions without stretching; fills pillarbox margins with
    an ambient blurred-extension of the flyer's edges and theme palette.
    """
    ow, oh = clean_bg.size
    aspect = ow / oh
    target_aspect = target_width / target_height

    # If already roughly 16:9 landscape (within 5%), scale directly
    if abs(aspect - target_aspect) < 0.05:
        return clean_bg.resize((target_width, target_height), Image.LANCZOS)

    # Create 1920x1080 canvas
    canvas = Image.new("RGB", (target_width, target_height), primary_color)

    # 1. Background ambient fill: scaled & heavily blurred copy of the flyer
    bg_ambient = clean_bg.resize((target_width, target_height), Image.BILINEAR)
    bg_ambient = bg_ambient.filter(ImageFilter.GaussianBlur(radius=45))
    # Slightly darken ambient background so center remains prominent
    enhancer = ImageEnhance.Brightness(bg_ambient)
    bg_ambient = enhancer.enhance(0.7)
    canvas.paste(bg_ambient, (0, 0))

    # 2. Scale artwork to fit vertically inside 1080 height
    scale = target_height / oh
    new_w = int(ow * scale)
    new_h = target_height
    scaled_art = clean_bg.resize((new_w, new_h), Image.LANCZOS)

    # Subtle drop shadow on the center artwork edges
    art_x = (target_width - new_w) // 2
    canvas.paste(scaled_art, (art_x, 0))

    # Soft gradient blend along the left and right seams
    seam_w = min(60, new_w // 8)
    if seam_w > 5 and art_x > 0:
        draw = ImageDraw.Draw(canvas, "RGBA")
        # Left seam fade
        for i in range(seam_w):
            alpha = int(255 * (1.0 - (i / seam_w)) * 0.5)
            draw.line([(art_x + i, 0), (art_x + i, target_height)], fill=(primary_color[0], primary_color[1], primary_color[2], alpha))
        # Right seam fade
        for i in range(seam_w):
            alpha = int(255 * (1.0 - (i / seam_w)) * 0.5)
            draw.line([(art_x + new_w - i, 0), (art_x + new_w - i, target_height)], fill=(primary_color[0], primary_color[1], primary_color[2], alpha))

    return canvas


def create_bible_friendly_background(
    screen_bg: Image.Image,
    contrast_level: float = 0.5,
    dominant_color: RGB = (10, 10, 20),
) -> Image.Image:
    """
    Produce a Bible-friendly background with a quieter reading zone and high contrast.
    Applies a smooth, gradient-feathered darkening zone across the center/lower area
    while preserving the flyer's atmospheric art, palette, and textures around the edges.
    """
    w, h = screen_bg.size
    result = screen_bg.copy()
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Reading zone: center 85% width, center 75% height
    center_x = w // 2
    center_y = int(h * 0.52)
    radius_x = int(w * 0.44)
    radius_y = int(h * 0.38)

    # Base dark color from dominant theme color
    dr = max(0, min(255, int(dominant_color[0] * 0.3)))
    dg = max(0, min(255, int(dominant_color[1] * 0.3)))
    db = max(0, min(255, int(dominant_color[2] * 0.3)))

    max_alpha = int(255 * max(0.2, min(0.85, contrast_level)))

    # Radial feathered darkening
    steps = 40
    for s in range(steps, 0, -1):
        factor = s / steps
        rx = int(radius_x * factor)
        ry = int(radius_y * factor)
        cur_alpha = int(max_alpha * (1.0 - (factor ** 1.5)))
        bbox = [center_x - rx, center_y - ry, center_x + rx, center_y + ry]
        draw.ellipse(bbox, fill=(dr, dg, db, cur_alpha))

    # Bottom scrim for scripture reference box
    ref_scrim_h = int(h * 0.18)
    for y in range(ref_scrim_h):
        ratio = y / ref_scrim_h
        alpha = int(max_alpha * 0.7 * (ratio ** 1.2))
        draw.line([(0, h - ref_scrim_h + y), (w, h - ref_scrim_h + y)], fill=(dr, dg, db, alpha))

    # Composite overlay onto screen background
    result.paste(overlay, (0, 0), overlay)
    return result
