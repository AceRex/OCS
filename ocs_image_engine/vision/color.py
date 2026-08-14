"""
vision/color.py
===============
Dominant color extraction using K-Means clustering.
Analyzes mood and suggests background/text colors.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Tuple

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

from utils.config import Config
from utils.image_utils import rgb_to_hex, luminance, is_dark

logger = logging.getLogger("ocs.color")

RGB = Tuple[int, int, int]

@dataclass
class ColorPalette:
    """Extracted color information from a poster."""
    dominant: list[RGB]
    hex_palette: list[str]
    mood: str                       # "dark" | "light" | "vibrant" | "muted"
    background_colors: list[RGB]    # recommended BG colors
    lower_third_colors: list[RGB]   # [base, accent, border]
    text_color: RGB                 # recommended text color (high contrast)
    accent_color: RGB
    secondary_accent: RGB           # a second vibrant color if found
    all_colors: list[RGB]           # entire extracted palette

class ColorExtractor:
    def __init__(self, config: Config):
        self.config = config

    def extract(self, img: Image.Image) -> ColorPalette:
        logger.info("Extracting color palette using K-Means")
        
        # Downsample for speed
        img_small = img.resize((150, 150), Image.NEAREST)
        pixels = np.array(img_small).reshape(-1, 3)
        
        # Filter out very dark or very desaturated pixels if needed?
        # For now, use all pixels
        
        # Use more clusters for 'all colors'
        kmeans = KMeans(n_clusters=10, n_init='auto')
        kmeans.fit(pixels)
        
        colors = kmeans.cluster_centers_.astype(int)
        
        # Sort colors by frequency (how many pixels belong to each cluster)
        labels = kmeans.labels_
        counts = np.bincount(labels)
        sorted_indices = np.argsort(counts)[::-1]
        
        dominant = [tuple(colors[i]) for i in sorted_indices]
        hex_palette = [rgb_to_hex(c) for c in dominant]
        
        # ── Find Vibrant Accents ───────────────────────────────────────────
        # Accents are often high saturation but low frequency
        import colorsys
        accents = []
        for c in dominant:
            h, s, v = colorsys.rgb_to_hsv(c[0]/255, c[1]/255, c[2]/255)
            if s > 0.4 and v > 0.4: # Vibrant and not too dark
                accents.append(c)
        
        main_accent = accents[0] if accents else dominant[0]
        sec_accent = accents[1] if len(accents) > 1 else (dominant[1] if len(dominant) > 1 else main_accent)
        
        # ── Analyze Mood ───────────────────────────────────────────────────
        avg_lum = np.mean([luminance(c) for c in dominant])
        avg_sat = self._calculate_avg_saturation(pixels)
        
        if avg_lum < 0.35:
            mood = "dark"
        elif avg_lum > 0.65:
            mood = "light"
        elif avg_sat > 0.45:
            mood = "vibrant"
        else:
            mood = "muted"
            
        # ── Recommendations ───────────────────────────────────────────────
        # Background: usually the most dominant dark color or a desaturated version
        dark_colors = [c for c in dominant if is_dark(c)]
        bg_base = dark_colors[0] if dark_colors else dominant[-1]
        
        # Lower Third: Base color (dark/muted) + Accent (vibrant)
        lt_base = bg_base
        lt_accent = main_accent
        lt_border = sec_accent
        
        # Text: high contrast with LT base using WCAG-like check
        # We check contrast against bg_base (standard for most overlays)
        def get_best_text(bg: RGB) -> RGB:
            lum = luminance(bg)
            return (255, 255, 255) if lum < 0.5 else (10, 10, 10)
            
        text_color = get_best_text(lt_base)
            
        return ColorPalette(
            dominant=dominant[:6],
            hex_palette=hex_palette[:6],
            mood=mood,
            background_colors=[bg_base],
            lower_third_colors=[lt_base, lt_accent, lt_border],
            text_color=text_color,
            accent_color=main_accent,
            secondary_accent=sec_accent,
            all_colors=dominant
        )

    def _calculate_avg_saturation(self, pixels: np.ndarray) -> float:
        import colorsys
        sats = [colorsys.rgb_to_hsv(r/255, g/255, b/255)[1] for r, g, b in pixels[::10]]
        return float(np.mean(sats))
