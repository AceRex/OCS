"""
utils/image_utils.py
====================
Shared PIL / NumPy helpers used across the vision and GAN pipelines.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Tuple

import numpy as np
import torch
import torchvision.transforms.functional as TF
from PIL import Image, ImageFilter, ImageEnhance

logger = logging.getLogger("ocs.image_utils")


# ──────────────────────────────────────────────────────────────────────────────
#  Loading & saving
# ──────────────────────────────────────────────────────────────────────────────

def load_image(path: str | Path, mode: str = "RGB") -> Image.Image:
    """Load any supported image format and convert to *mode*."""
    img = Image.open(str(path)).convert(mode)
    logger.debug("Loaded image %s  size=%s", path, img.size)
    return img


def save_image(img: Image.Image, path: str | Path, quality: int = 95) -> Path:
    """Save a PIL image; creates parent directories as needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fmt = "PNG" if path.suffix.lower() == ".png" else "JPEG"
    img.save(str(path), format=fmt, quality=quality)
    logger.info("Saved → %s", path)
    return path


def bytes_to_image(raw: bytes) -> Image.Image:
    """Convert raw bytes (from file upload) to a PIL Image."""
    return Image.open(io.BytesIO(raw)).convert("RGB")


# ──────────────────────────────────────────────────────────────────────────────
#  Tensor ↔ PIL conversions
# ──────────────────────────────────────────────────────────────────────────────

def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    """
    Convert a (C, H, W) tensor in range [-1, 1] to a PIL RGB image.
    GAN generators output tanh-activated tensors → this maps them to [0, 255].
    """
    tensor = tensor.detach().cpu().clamp(-1.0, 1.0)
    tensor = (tensor + 1.0) / 2.0          # [-1,1] → [0,1]
    return TF.to_pil_image(tensor)


def pil_to_tensor(img: Image.Image, size: int | None = None) -> torch.Tensor:
    """
    Convert a PIL image to a (C, H, W) tensor in range [-1, 1].
    Optionally resize to *size* × *size*.
    """
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    t = TF.to_tensor(img)               # [0,1], C×H×W
    return t * 2.0 - 1.0               # [0,1] → [-1,1]


def numpy_to_pil(arr: np.ndarray) -> Image.Image:
    """Convert a uint8 H×W×C NumPy array to a PIL image."""
    if arr.dtype != np.uint8:
        arr = (arr * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def pil_to_numpy(img: Image.Image) -> np.ndarray:
    """Convert a PIL image to a float32 H×W×C array in [0, 1]."""
    return np.array(img).astype(np.float32) / 255.0


# ──────────────────────────────────────────────────────────────────────────────
#  Resizing / cropping
# ──────────────────────────────────────────────────────────────────────────────

def resize_contain(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    """Resize *img* to fit within (max_w, max_h), preserving aspect ratio."""
    img.thumbnail((max_w, max_h), Image.LANCZOS)
    return img


def center_crop(img: Image.Image, w: int, h: int) -> Image.Image:
    """Crop *img* to (w, h) from the centre."""
    iw, ih = img.size
    left = (iw - w) // 2
    top = (ih - h) // 2
    return img.crop((left, top, left + w, top + h))


def pad_to_square(img: Image.Image, fill: Tuple[int, int, int] = (0, 0, 0)) -> Image.Image:
    """Pad *img* to a square with *fill* colour."""
    w, h = img.size
    side = max(w, h)
    new = Image.new("RGB", (side, side), fill)
    new.paste(img, ((side - w) // 2, (side - h) // 2))
    return new


# ──────────────────────────────────────────────────────────────────────────────
#  Color utilities
# ──────────────────────────────────────────────────────────────────────────────

def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    hex_str = hex_str.lstrip("#")
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))  # type: ignore


def luminance(rgb: Tuple[int, int, int]) -> float:
    """Perceived luminance [0, 1] — used to decide text colour contrast."""
    r, g, b = (c / 255.0 for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_dark(rgb: Tuple[int, int, int]) -> bool:
    return luminance(rgb) < 0.5


def complementary(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    """Return the RGB complementary colour."""
    return (255 - rgb[0], 255 - rgb[1], 255 - rgb[2])


def desaturate(rgb: Tuple[int, int, int], factor: float = 0.5) -> Tuple[int, int, int]:
    """Blend *rgb* toward grey by *factor* (0 = no change, 1 = full grey)."""
    grey = int(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2])
    return tuple(int(c * (1 - factor) + grey * factor) for c in rgb)  # type: ignore


# ──────────────────────────────────────────────────────────────────────────────
#  Image effects (used by sampler to post-process GAN outputs)
# ──────────────────────────────────────────────────────────────────────────────

def apply_blur(img: Image.Image, radius: float = 2.0) -> Image.Image:
    return img.filter(ImageFilter.GaussianBlur(radius))


def apply_vignette(img: Image.Image, strength: float = 0.5) -> Image.Image:
    """
    Darken the edges of *img* with a circular vignette.
    *strength* ∈ [0, 1] — higher = darker edges.
    """
    w, h = img.size
    arr = pil_to_numpy(img)

    cx, cy = w / 2, h / 2
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_dist = np.sqrt(cx ** 2 + cy ** 2)
    mask = 1.0 - strength * (dist / max_dist) ** 2
    mask = np.clip(mask, 0, 1)[..., np.newaxis]

    result = (arr * mask * 255).clip(0, 255).astype(np.uint8)
    return numpy_to_pil(result)


def color_grade(
    img: Image.Image,
    palette: list[Tuple[int, int, int]],
    strength: float = 0.15,
) -> Image.Image:
    """
    Subtly tint *img* toward the dominant palette color.
    *strength* ∈ [0, 1].
    """
    if not palette:
        return img
    tint = palette[0]
    tint_img = Image.new("RGB", img.size, tint)
    return Image.blend(img, tint_img, alpha=strength)


def upscale(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """High-quality upscale using LANCZOS resampling."""
    return img.resize((target_w, target_h), Image.LANCZOS)


def sharpen(img: Image.Image, factor: float = 1.5) -> Image.Image:
    return ImageEnhance.Sharpness(img).enhance(factor)
