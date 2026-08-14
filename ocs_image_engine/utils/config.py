"""
utils/config.py
===============
Central configuration for the OCS Image Engine.
All tunable parameters live here — no magic numbers scattered through code.
"""

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    # ── Paths ──────────────────────────────────────────────────────────────
    root_dir: Path = Path(__file__).parent.parent
    output_dir: Path = root_dir / "output"
    models_dir: Path = root_dir / "models"
    data_dir: Path = root_dir / "data" / "training"

    # ── Image sizes ────────────────────────────────────────────────────────
    # GAN training resolution (power of 2 for stable training)
    gan_image_size: int = 256

    # Background output resolution (16:9)
    background_width: int = 1920
    background_height: int = 1080

    # Lower third output (16:9, cropped to bottom third)
    lower_third_width: int = 1920
    lower_third_height: int = 360

    # ── Color extraction ───────────────────────────────────────────────────
    # K-means clusters for dominant color extraction
    color_clusters: int = 6
    # Minimum saturation to count a color as "dominant" (0–255)
    min_saturation: int = 30

    # ── Vision / OCR ──────────────────────────────────────────────────────
    # Tesseract config string
    tesseract_config: str = "--oem 3 --psm 12"
    # Minimum confidence for OCR results (0–100)
    ocr_min_confidence: int = 20

    # ── Theme classifier CNN ───────────────────────────────────────────────
    classifier_input_size: int = 224
    classifier_weights: str = "models/theme_classifier.pth"
    # Theme labels (must match training order)
    theme_labels: list = field(default_factory=lambda: [
        "religious", "corporate", "concert", "sports", "wedding", 
        "conference", "festival", "charity", "political", "general"
    ])

    # Mood labels
    mood_labels: list = field(default_factory=lambda: [
        "warm", "cool", "dark", "vibrant", "neutral", "muted"
    ])

    # ── GAN training ──────────────────────────────────────────────────────
    gan_latent_dim: int = 128
    gan_batch_size: int = 8
    gan_epochs: int = 200
    gan_lr_generator: float = 0.0002
    gan_lr_discriminator: float = 0.0002
    gan_beta1: float = 0.5          # Adam β1 (lower = more stable GAN training)
    gan_beta2: float = 0.999
    gan_lambda_l1: float = 100.0    # L1 loss weight (sharpness)
    gan_save_every: int = 10        # Save checkpoint every N epochs
    gan_sample_every: int = 5       # Save sample images every N epochs
    gan_ema_decay: float = 0.999    # EMA for stable sampling

    # ── GAN generator architecture ────────────────────────────────────────
    # Number of base feature maps (doubled per encoder level)
    gen_base_features: int = 64

    # ── GAN discriminator ─────────────────────────────────────────────────
    disc_base_features: int = 64

    # ── Inference ─────────────────────────────────────────────────────────
    # How many background variants to generate
    num_background_suggestions: int = 3
    # How many lower-third variants to generate
    num_lower_third_suggestions: int = 3
    # Noise diversity multiplier per suggestion (higher = more variation)
    suggestion_diversity: float = 1.2

    # ── Device ────────────────────────────────────────────────────────────
    # "cuda" | "mps" | "cpu"  — auto-detected in engine.py
    device: str = "cpu"

    def __post_init__(self):
        # We don't auto-create directories here to prevent premature electronmon restarts
        pass
