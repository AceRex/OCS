"""
vision/analyzer.py
==================
Orchestrates all vision subsystems into a single PosterAnalysis result.

Pipeline:
  1. OCR        → text, title, dates, event name, location
  2. Color      → dominant palette, mood, BG/LT color suggestions
  3. Classifier → event theme (religious, corporate, concert, ...)
  4. Layout     → image regions, text density, composition analysis

The PosterAnalysis dataclass is the input to the GAN pipeline.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import cv2
from PIL import Image
from utils.config import Config
from utils.image_utils import load_image, resize_contain
from vision.ocr import OCRExtractor, OCRResult
from vision.color import ColorExtractor, ColorPalette
from vision.classifier import ThemeClassifier
from vision.face_detector import FaceDetector, FaceRegion

logger = logging.getLogger("ocs.analyzer")

RGB = Tuple[int, int, int]


@dataclass
class ImageRegion:
    """A detected visual region in the poster (image/graphic area)."""
    x: int
    y: int
    width: int
    height: int
    region_type: str        # "photo" | "graphic" | "logo" | "text_block" | "shape"
    relative_area: float    # fraction of total image area
    shape_type: Optional[str] = None # "rect" | "circle" | "line"


@dataclass
class LayoutAnalysis:
    """Coarse composition analysis of the poster."""
    has_large_image: bool           # poster has a dominant photo/graphic
    text_density: float             # 0 (mostly image) → 1 (mostly text)
    primary_image_region: Optional[ImageRegion]
    safe_zones: list[str]           # areas with few/no text: "top"|"bottom"|"left"|"right"
    composition: str                # "full-bleed" | "split" | "minimal" | "busy"


@dataclass
class PosterAnalysis:
    """Complete structured analysis of an event poster."""

    # Source
    source_path: Optional[str] = None
    image_width: int = 0
    image_height: int = 0

    # OCR results
    ocr: Optional[OCRResult] = None

    # Color results
    palette: Optional[ColorPalette] = None

    # Theme classification
    theme: str = "general"
    theme_confidence: float = 0.0
    theme_alternatives: list[dict] = field(default_factory=list)

    # Layout
    layout: Optional[LayoutAnalysis] = None

    # Detected Faces (Speakers)
    faces: list[FaceRegion] = field(default_factory=list)

    # Graphical Elements
    elements: list[ImageRegion] = field(default_factory=list)

    # Derived metadata (used by GAN conditioning)
    event_name: Optional[str] = None
    event_date: Optional[str] = None
    event_location: Optional[str] = None
    primary_color: Optional[RGB] = None
    secondary_color: Optional[RGB] = None
    background_suggestion: Optional[RGB] = None
    lower_third_suggestion: Optional[RGB] = None
    text_color: Optional[RGB] = None
    mood: str = "neutral"

    def summary(self) -> dict:
        """Serialisable summary for suggestions.json output."""
        return {
            "event_name": self.event_name,
            "event_date": self.event_date,
            "event_location": self.event_location,
            "theme": self.theme,
            "theme_confidence": float(self.theme_confidence),
            "mood": self.mood,
            "palette_hex": self.palette.hex_palette if self.palette else [],
            "primary_color": [int(c) for c in self.primary_color] if self.primary_color else None,
            "secondary_color": [int(c) for c in self.secondary_color] if self.secondary_color else None,
            "accent_color": [int(c) for c in self.palette.accent_color] if self.palette else None,
            "secondary_accent": [int(c) for c in self.palette.secondary_accent] if self.palette else None,
            "text_color": [int(c) for c in self.text_color] if self.text_color else [255, 255, 255],
            "text_extracted": self.ocr.all_lines if self.ocr else [],
            "dates_found": self.ocr.dates if self.ocr else [],
            "times_found": self.ocr.times if self.ocr else [],
            "layout_composition": self.layout.composition if self.layout else "unknown",
            "safe_zones": self.layout.safe_zones if self.layout else [],
            "recreated_text": [
                {
                    "text": b.text,
                    "color": [int(c) for c in b.color] if b.color else [255, 255, 255],
                    "font_size": float(b.font_size),
                    "font_family": b.font_family,
                    "position": {
                        "x": int(b.x), "y": int(b.y), "w": int(b.w), "h": int(b.h)
                    }
                }
                for b in self.ocr.big_texts
            ] if self.ocr else [],
            "faces": [
                {
                    "x": int(f.x), "y": int(f.y), "w": int(f.w), "h": int(f.h),
                    "label": "speaker"
                } for f in self.faces
            ],
            "elements": [
                {
                    "x": int(e.x), "y": int(e.y), "w": int(e.width), "h": int(e.height),
                    "type": e.region_type,
                    "shape": e.shape_type
                } for e in self.elements
            ]
        }


class PosterAnalyzer:
    """
    Runs OCR, color extraction, and theme classification on a poster image.
    Returns a PosterAnalysis dataclass that drives GAN conditioning.
    """

    def __init__(self, config: Config):
        self.config = config
        logger.info("Initialising PosterAnalyzer subsystems")
        self.ocr = OCRExtractor(config)
        self.color = ColorExtractor(config)
        self.classifier = ThemeClassifier(config)
        self.face_detector = FaceDetector()

    # ──────────────────────────────────────────────────────────────────────
    #  Public API
    # ──────────────────────────────────────────────────────────────────────

    def analyze(self, img_or_path) -> PosterAnalysis:
        """
        Analyze a poster image and return a PosterAnalysis.

        Args:
            img_or_path: PIL.Image or str/Path to an image file.
        """
        if isinstance(img_or_path, (str, Path)):
            img = load_image(img_or_path)
            source_path = str(img_or_path)
        else:
            img = img_or_path.convert("RGB")
            source_path = None

        # Work on a high-resolution copy for OCR precision
        work_img = resize_contain(img.copy(), 2400, 2400)
        w, h = work_img.size

        logger.info("Analyzing poster  size=%s", (w, h))

        # ── Run all subsystems ─────────────────────────────────────────────
        ocr_result = self._run_ocr(work_img)
        palette = self._run_color(work_img)
        theme_preds = self._run_classifier(work_img)
        layout = self._run_layout(work_img, ocr_result)
        faces = self._run_face_detection(work_img)
        elements = self._run_element_detection(work_img)

        # ── Assemble PosterAnalysis ────────────────────────────────────────
        top_theme = theme_preds[0] if theme_preds else {"theme": "general", "confidence": 0.0}

        primary = palette.dominant[0] if palette.dominant else (30, 30, 60)
        secondary = palette.dominant[1] if len(palette.dominant) > 1 else primary
        bg_sug = palette.background_colors[0] if palette.background_colors else (10, 10, 20)
        lt_sug = palette.lower_third_colors[0] if palette.lower_third_colors else (10, 10, 20)

        analysis = PosterAnalysis(
            source_path=source_path,
            image_width=w,
            image_height=h,
            ocr=ocr_result,
            palette=palette,
            theme=top_theme["theme"],
            theme_confidence=top_theme["confidence"],
            theme_alternatives=theme_preds[1:],
            layout=layout,
            event_name=ocr_result.event_name,
            event_date=ocr_result.dates[0] if ocr_result.dates else None,
            event_location=ocr_result.location,
            primary_color=primary,
            secondary_color=secondary,
            background_suggestion=bg_sug,
            lower_third_suggestion=lt_sug,
            text_color=palette.text_color,
            mood=palette.mood,
            faces=faces,
            elements=elements
        )

        logger.info(
            "Analysis complete — theme=%s (%.0f%%)  mood=%s  "
            "event='%s'  date='%s'",
            analysis.theme,
            analysis.theme_confidence * 100,
            analysis.mood,
            analysis.event_name,
            analysis.event_date,
        )
        return analysis

    # ──────────────────────────────────────────────────────────────────────
    #  Subsystem runners (isolated for unit testing)
    # ──────────────────────────────────────────────────────────────────────

    def _run_ocr(self, img: Image.Image) -> OCRResult:
        try:
            return self.ocr.extract(img)
        except Exception as exc:
            logger.warning("OCR failed: %s — continuing without text", exc)
            from vision.ocr import OCRResult
            return OCRResult(raw_text="")

    def _run_color(self, img: Image.Image) -> ColorPalette:
        try:
            return self.color.extract(img)
        except Exception as exc:
            logger.warning("Color extraction failed: %s", exc)
            from vision.color import ColorPalette
            return ColorPalette(
                dominant=[(30, 30, 60)],
                hex_palette=["#1E1E3C"],
                mood="dark",
                background_colors=[(10, 10, 20)],
                lower_third_colors=[(10, 10, 20)],
                text_color=(240, 240, 240),
                accent_color=(100, 100, 255),
            )

    def _run_classifier(self, img: Image.Image) -> list[dict]:
        try:
            return self.classifier.predict(img, top_k=3)
        except Exception as exc:
            logger.warning("Theme classification failed: %s", exc)
            return [{"theme": "general", "confidence": 0.0}]

    def _run_face_detection(self, img: Image.Image) -> list[FaceRegion]:
        try:
            return self.face_detector.detect_and_crop(img)
        except Exception as exc:
            logger.warning("Face detection failed: %s", exc)
            return []

    def _run_element_detection(self, img: Image.Image) -> list[ImageRegion]:
        """Detect shapes like boxes, lines, and circles used in the poster."""
        try:
            arr = np.array(img.convert("RGB"))
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            # Threshold to get strong shapes
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            elements = []
            img_area = img.width * img.height
            
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < 500: # Ignore tiny noise
                    continue
                    
                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
                x, y, w, h = cv2.boundingRect(cnt)
                
                rel_area = area / img_area
                
                shape_type = "other"
                if len(approx) == 4:
                    shape_type = "rect"
                elif len(approx) > 8:
                    shape_type = "circle"
                elif w / h > 10 or h / w > 10:
                    shape_type = "line"
                
                elements.append(ImageRegion(
                    x=int(x), y=int(y), width=int(w), height=int(h),
                    region_type="shape",
                    relative_area=float(rel_area),
                    shape_type=shape_type
                ))
            
            return elements
        except Exception as exc:
            logger.warning("Element detection failed: %s", exc)
            return []

    def _run_layout(self, img: Image.Image, ocr: OCRResult) -> LayoutAnalysis:
        """
        Coarse layout analysis using pixel statistics and OCR block positions.
        No ML model needed here — rule-based is sufficient.
        """
        try:
            return self._analyse_layout(img, ocr)
        except Exception as exc:
            logger.warning("Layout analysis failed: %s", exc)
            return LayoutAnalysis(
                has_large_image=True,
                text_density=0.5,
                primary_image_region=None,
                safe_zones=["bottom"],
                composition="full-bleed",
            )

    def _analyse_layout(self, img: Image.Image, ocr: OCRResult) -> LayoutAnalysis:
        w, h = img.size
        arr = np.array(img.convert("RGB"))
        
        # ── Edge density → detect graphic-heavy regions ────────────────────
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150)

        # Divide into 9 zones (3×3 grid)
        zones = self._split_zones(edges, 3, 3)
        zone_density = [float(z.mean() / 255.0) for z in zones]

        # Overall image-vs-text density
        # High std dev in gray values → high contrast/texture (likely image)
        # Low std dev → flat color (likely text background)
        text_density = 1.0 - float(np.std(gray) / 128.0)
        text_density = float(np.clip(text_density, 0.0, 1.0))

        # ── Detect if a large image region exists ─────────────────────────
        # Use HSV saturation channel: high saturation = likely photo/graphic
        hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
        sat_map = hsv[:, :, 1] / 255.0
        high_sat_frac = float((sat_map > 0.3).mean())
        has_large_image = high_sat_frac > 0.25

        # ── Safe zones (areas with little text) ───────────────────────────
        safe_zones = self._find_safe_zones(img, ocr, w, h)

        # ── Composition classification ────────────────────────────────────
        composition = self._classify_composition(text_density, has_large_image, ocr)

        # ── Primary image region ──────────────────────────────────────────
        primary_region = self._find_primary_image_region(hsv, w, h)

        return LayoutAnalysis(
            has_large_image=has_large_image,
            text_density=text_density,
            primary_image_region=primary_region,
            safe_zones=safe_zones,
            composition=composition,
        )

    def _split_zones(self, arr: np.ndarray, rows: int, cols: int) -> list:
        h, w = arr.shape[:2]
        row_h = h // rows
        col_w = w // cols
        zones = []
        for r in range(rows):
            for c in range(cols):
                zone = arr[r*row_h:(r+1)*row_h, c*col_w:(c+1)*col_w]
                zones.append(zone)
        return zones

    def _find_safe_zones(
        self, img: Image.Image, ocr: OCRResult, w: int, h: int
    ) -> list[str]:
        """
        Find image edges where there's minimal OCR text.
        These are good areas for lower-thirds or background overlays.
        """
        safe = []
        if not ocr.blocks:
            return ["top", "bottom", "left", "right"]

        # Threshold: an edge is "safe" if < 10% of its area has text blocks
        threshold = 0.10
        edge_h = int(h * 0.25)     # top/bottom 25%
        edge_w = int(w * 0.25)     # left/right 25%

        def text_coverage(x1, y1, x2, y2) -> float:
            count = sum(
                1 for b in ocr.blocks
                if x1 <= b.x <= x2 and y1 <= b.y <= y2
            )
            return count / max(len(ocr.blocks), 1)

        if text_coverage(0, 0, w, edge_h) < threshold:
            safe.append("top")
        if text_coverage(0, h - edge_h, w, h) < threshold:
            safe.append("bottom")
        if text_coverage(0, 0, edge_w, h) < threshold:
            safe.append("left")
        if text_coverage(w - edge_w, 0, w, h) < threshold:
            safe.append("right")

        return safe if safe else ["bottom"]

    def _classify_composition(
        self, text_density: float, has_large_image: bool, ocr: OCRResult
    ) -> str:
        num_text_blocks = len(ocr.blocks) if ocr else 0
        if num_text_blocks > 20:
            return "busy"
        if not has_large_image and num_text_blocks < 5:
            return "minimal"
        if has_large_image and num_text_blocks > 5:
            return "split"
        return "full-bleed"

    def _find_primary_image_region(
        self, hsv_img: np.ndarray, w: int, h: int
    ) -> Optional[ImageRegion]:
        """
        Detect the largest high-saturation region (likely a photo or graphic).
        Uses a simple 4×4 grid search on the pre-calculated HSV saturation channel.
        """
        sat = hsv_img[:, :, 1]   # saturation channel
        
        # Find the 4×4 cell with highest average saturation
        rows, cols = 4, 4
        cell_h = h // rows
        cell_w = w // cols
        best_sat = -1
        best_cell = (0, 0)

        for r in range(rows):
            for c in range(cols):
                cell = sat[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w]
                avg = float(cell.mean())
                if avg > best_sat:
                    best_sat = avg
                    best_cell = (r, c)

        r, c = best_cell
        return ImageRegion(
            x=c * cell_w,
            y=r * cell_h,
            width=cell_w,
            height=cell_h,
            region_type="photo" if best_sat > 80 else "graphic",
            relative_area=(cell_h * cell_w) / (h * w),
        )
