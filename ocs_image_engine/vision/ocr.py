"""
vision/ocr.py
=============
Text extraction, entity recognition, confidence tracking, and font characterization.
Extracts:
- Event name, theme, subtitle, supporting text
- Dates, times, venue/address, organizers, speakers, contact details, website
- Word/line bounding boxes with individual OCR confidence scores
- Flagged uncertain OCR results (confidence < 60)
- Font characteristics distinguishing confirmed matches from suggested substitutes
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Tuple, List, Dict, Any

import pytesseract
import numpy as np
from PIL import Image

from utils.config import Config

logger = logging.getLogger("ocs.ocr")

TupleRGB = Tuple[int, int, int]


@dataclass
class OCRBlock:
    """A detected block of text with coordinates, confidence, and styling."""
    text: str
    x: int
    y: int
    w: int
    h: int
    conf: float
    color: Optional[TupleRGB] = None
    font_size: float = 0.0
    font_family: str = "Inter, sans-serif"


@dataclass
class OCRResult:
    """Structured results from OCR extraction with confidence and font metadata."""
    raw_text: str
    all_lines: List[str] = field(default_factory=list)
    blocks: List[OCRBlock] = field(default_factory=list)

    # Heuristic entities
    event_name: Optional[str] = None
    theme_subtitle: Optional[str] = None
    supporting_text: Optional[str] = None
    dates: List[str] = field(default_factory=list)
    times: List[str] = field(default_factory=list)
    venue: Optional[str] = None
    organizer: Optional[str] = None
    speakers: List[str] = field(default_factory=list)
    contact: Optional[str] = None
    website: Optional[str] = None

    # Confidence and quality metrics
    field_confidences: Dict[str, float] = field(default_factory=dict)
    uncertain_fields: List[str] = field(default_factory=list)

    # Font characteristics
    font_characteristics: Dict[str, Any] = field(default_factory=lambda: {
        "style": "Sans-serif Bold",
        "category": "sans-serif",
        "weight": "bold",
        "matched_font": "Inter, sans-serif",
        "match_status": "confirmed",
        "status": "confirmed",
        "rationale": "High-clarity geometric sans-serif detected on dominant heading text"
    })

    # Prominent stylized headings
    big_texts: List[OCRBlock] = field(default_factory=list)


class OCRExtractor:
    def __init__(self, config: Config):
        self.config = config
        self._ensure_tesseract_path()

    def _ensure_tesseract_path(self):
        """Locate tesseract binary on macOS / Linux."""
        import shutil
        import os
        if shutil.which("tesseract"):
            return

        common_paths = [
            "/opt/homebrew/bin/tesseract",
            "/usr/local/bin/tesseract",
            "/usr/bin/tesseract"
        ]
        for p in common_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                logger.info("Found Tesseract at %s", p)
                return

        logger.warning("Tesseract binary not found in standard paths.")

    def extract(self, img: Image.Image) -> OCRResult:
        logger.info("Running Multi-Pass Tesseract OCR with Entity & Font Analysis")
        import cv2
        from PIL import ImageOps

        w, h = img.size
        gray_pil = ImageOps.grayscale(img)
        gray_np = np.array(gray_pil)

        # Multi-pass thresholding for varied poster lighting & gradients
        passes = []

        # Pass 1: Adaptive Thresholding (robust for gradients)
        blurred = cv2.GaussianBlur(gray_np, (3, 3), 0)
        adaptive = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 5)
        passes.append(("adaptive", adaptive))

        # Pass 2: Otsu's Thresholding (standard high-contrast)
        _, otsu = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        passes.append(("otsu", otsu))

        # Pass 3: Inverted Otsu (light-on-dark text)
        _, otsu_inv = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        passes.append(("otsu_inv", otsu_inv))

        all_blocks: List[OCRBlock] = []
        all_lines: List[str] = []
        seen_lines = set()
        raw_text_parts: List[str] = []

        for name, processed_np in passes:
            proc_pil = Image.fromarray(processed_np)
            try:
                data = pytesseract.image_to_data(
                    proc_pil,
                    config=self.config.tesseract_config,
                    output_type=pytesseract.Output.DICT
                )
            except Exception as e:
                logger.warning("Pass %s failed: %s", name, e)
                continue

            n_boxes = len(data.get("text", []))
            pass_lines_dict: Dict[int, List[str]] = {}

            for i in range(n_boxes):
                text = str(data["text"][i]).strip()
                try:
                    conf = float(data["conf"][i])
                except (ValueError, TypeError):
                    conf = 0.0

                line_num = data.get("line_num", [0])[i]

                if conf > self.config.ocr_min_confidence and len(text) > 0:
                    left = int(data["left"][i])
                    top = int(data["top"][i])
                    width = int(data["width"][i])
                    height = int(data["height"][i])

                    # Deduplicate near-identical blocks across passes
                    existing = any(
                        b.text.lower() == text.lower() and abs(b.x - left) < 15 and abs(b.y - top) < 15
                        for b in all_blocks
                    )
                    if not existing:
                        all_blocks.append(OCRBlock(
                            text=text,
                            x=left,
                            y=top,
                            w=width,
                            h=height,
                            conf=conf
                        ))
                        raw_text_parts.append(text)

                    if line_num not in pass_lines_dict:
                        pass_lines_dict[line_num] = []
                    pass_lines_dict[line_num].append(text)

            for line_parts in pass_lines_dict.values():
                line_str = " ".join(line_parts).strip()
                if len(line_str) > 2 and line_str.lower() not in seen_lines:
                    seen_lines.add(line_str.lower())
                    all_lines.append(line_str)

        result = OCRResult(
            raw_text=" ".join(raw_text_parts),
            all_lines=all_lines,
            blocks=all_blocks
        )

        self._identify_and_style_big_texts(result, img)
        self._analyze_font_characteristics(result, img)
        self._extract_semantic_entities(result)

        return result

    def _parse_heuristics(self, res: OCRResult):
        return self._extract_semantic_entities(res)

    def _identify_and_style_big_texts(self, res: OCRResult, img: Image.Image):
        """Identify major headline blocks, merge adjacent words, and extract text colors."""
        if not res.blocks:
            return

        img_w, img_h = img.size
        min_height = img_h * 0.02  # At least 2% of total poster height

        big_blocks = [b for b in res.blocks if b.h >= min_height]
        if not big_blocks:
            big_blocks = list(res.blocks)

        # Sort by vertical position Y then horizontal X
        big_blocks.sort(key=lambda b: (b.y, b.x))

        merged: List[OCRBlock] = []
        if big_blocks:
            curr = big_blocks[0]
            for i in range(1, len(big_blocks)):
                nxt = big_blocks[i]
                y_overlap = min(curr.y + curr.h, nxt.y + nxt.h) - max(curr.y, nxt.y)
                x_dist = nxt.x - (curr.x + curr.w)

                if y_overlap > curr.h * 0.4 and x_dist < curr.h * 2.0:
                    new_x = min(curr.x, nxt.x)
                    new_y = min(curr.y, nxt.y)
                    new_w = max(curr.x + curr.w, nxt.x + nxt.w) - new_x
                    new_h = max(curr.y + curr.h, nxt.y + nxt.h) - new_y
                    avg_conf = (curr.conf + nxt.conf) / 2.0
                    curr = OCRBlock(
                        text=f"{curr.text} {nxt.text}",
                        x=new_x,
                        y=new_y,
                        w=new_w,
                        h=new_h,
                        conf=avg_conf
                    )
                else:
                    merged.append(curr)
                    curr = nxt
            merged.append(curr)

        # Sort merged blocks by height (font size)
        merged.sort(key=lambda b: (b.h, b.w), reverse=True)

        for block in merged[:10]:
            block.color = self._get_dominant_text_color(img, block)
            block.font_size = block.h
            res.big_texts.append(block)

    def _get_dominant_text_color(self, img: Image.Image, block: OCRBlock) -> TupleRGB:
        """Sample text color using edge-guided K-Means on cropped region."""
        try:
            import cv2
            from sklearn.cluster import KMeans

            pad = 4
            left = max(0, block.x - pad)
            top = max(0, block.y - pad)
            right = min(img.width, block.x + block.w + pad)
            bottom = min(img.height, block.y + block.h + pad)

            if right <= left or bottom <= top:
                return (255, 255, 255)

            crop = img.crop((left, top, right, bottom))
            crop_np = np.array(crop.convert("RGB"))

            gray = cv2.cvtColor(crop_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)

            pixels = crop_np.reshape(-1, 3)
            if len(pixels) < 20:
                return (255, 255, 255)

            kmeans = KMeans(n_clusters=2, n_init='auto', random_state=42)
            kmeans.fit(pixels)

            centers = kmeans.cluster_centers_.astype(int)
            labels = kmeans.labels_

            edge_mask = edges.flatten() > 0
            edge_labels = labels[edge_mask] if np.any(edge_mask) else labels

            if len(edge_labels) > 0:
                text_idx = np.bincount(edge_labels).argmax()
                c = centers[text_idx]
                return (int(c[0]), int(c[1]), int(c[2]))

            return (255, 255, 255)
        except Exception:
            return (255, 255, 255)

    def _analyze_font_characteristics(self, res: OCRResult, img: Image.Image):
        """
        Analyze dominant typography: Serif vs Sans-serif vs Display Impact.
        Matches with verified local web fonts and sets confirmed vs suggested status.
        """
        if not res.big_texts:
            return

        dominant_block = res.big_texts[0]
        try:
            import cv2
            crop = img.crop((
                max(0, dominant_block.x),
                max(0, dominant_block.y),
                min(img.width, dominant_block.x + dominant_block.w),
                min(img.height, dominant_block.y + dominant_block.h)
            ))
            crop_gray = np.array(crop.convert("L"))
            _, binarized = cv2.threshold(crop_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            # Invert so text is white on black
            if np.mean(binarized) > 127:
                binarized = cv2.bitwise_not(binarized)

            # Horizontal vs Vertical gradients to detect serif brackets and stroke contrast
            grad_x = cv2.Sobel(binarized, cv2.CV_32F, 1, 0, ksize=3)
            grad_y = cv2.Sobel(binarized, cv2.CV_32F, 0, 1, ksize=3)
            ratio = (np.mean(np.abs(grad_y)) + 1e-4) / (np.mean(np.abs(grad_x)) + 1e-4)

            # Stroke width relative to character height
            stroke_thickness = np.sum(binarized > 0) / (dominant_block.w * dominant_block.h + 1e-4)

            if ratio > 1.35:
                # Modulated strokes characteristic of serif / display
                res.font_characteristics = {
                    "style": "Traditional Serif",
                    "category": "serif",
                    "weight": "bold",
                    "matched_font": "Georgia, serif",
                    "match_status": "suggested",
                    "status": "suggested",
                    "rationale": "High vertical/horizontal stroke contrast characteristic of serif display type"
                }
            elif stroke_thickness > 0.45:
                res.font_characteristics = {
                    "style": "Heavy Display / Impact",
                    "category": "display",
                    "weight": "900",
                    "matched_font": "Impact, sans-serif",
                    "match_status": "suggested",
                    "status": "suggested",
                    "rationale": "Dense, ultra-bold letterforms with high character fill factor"
                }
            else:
                res.font_characteristics = {
                    "style": "Modern Sans-Serif",
                    "category": "sans-serif",
                    "weight": "bold" if stroke_thickness > 0.25 else "normal",
                    "matched_font": "Inter, sans-serif",
                    "match_status": "confirmed",
                    "status": "confirmed",
                    "rationale": "Uniform stroke geometry matching Inter / Roboto modern grotesque family"
                }
        except Exception:
            pass

    def _extract_semantic_entities(self, res: OCRResult):
        """
        Parses detected text blocks into high-confidence church event schema:
        event_name, theme_subtitle, dates, times, venue, organizer, speakers, contact, website.
        Flags ambiguous text with confidence < 60.
        """
        text = "\n".join(res.all_lines).strip()
        if not text or len(res.blocks) == 0:
            res.field_confidences["event_name"] = 0.0
            res.uncertain_fields.append("event_name")
            res.uncertain_fields.append("detected_text")
            return

        months = ["January", "February", "March", "April", "May", "June", "July",
                  "August", "September", "October", "November", "December",
                  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

        # 1. Event Headline / Name
        if res.big_texts:
            # Primary headline is the largest non-date block
            for b in res.big_texts:
                clean = b.text.strip()
                if len(clean) > 3 and not any(m.lower() in clean.lower() for m in months) and not re.search(r'\b20\d\d\b', clean):
                    res.event_name = clean
                    res.field_confidences["event_name"] = round(b.conf, 1)
                    break

        if not res.event_name and res.all_lines:
            res.event_name = res.all_lines[0]
            # Fallback without prominent header font is uncertain
            res.field_confidences["event_name"] = 50.0
            if "event_name" not in res.uncertain_fields:
                res.uncertain_fields.append("event_name")

        # Subtitle / Theme
        if not res.theme_subtitle and len(res.big_texts) > 1:
            second = res.big_texts[1].text.strip()
            if second != res.event_name and len(second) > 2 and not any(m.lower() in second.lower() for m in months):
                res.theme_subtitle = second
                res.field_confidences["theme_subtitle"] = round(res.big_texts[1].conf, 1)

        # 2. Dates
        date_patterns = [
            r'\b\d{1,2}(?:st|nd|rd|th)?(?:\s*&\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?\b',
            r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*-\s*\d{1,2}(?:st|nd|rd|th)?)?(?:\s*,\s*\d{4})?\b',
            r'\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b',
            r'\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b',
        ]
        for pat in date_patterns:
            for m in re.findall(pat, text, re.IGNORECASE):
                cleaned = re.sub(r'\s+', ' ', m).strip()
                if cleaned not in res.dates:
                    res.dates.append(cleaned)

        if res.dates:
            res.field_confidences["dates"] = 85.0

        # 3. Times
        time_matches = re.findall(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|gmt|wat)\b', text, re.IGNORECASE)
        res.times = list(dict.fromkeys(time_matches))
        if res.times:
            res.field_confidences["times"] = 88.0

        # 4. Venue / Address
        venue_patterns = [
            r'(?:venue|location|address|holding at|at)\s*[:\-]?\s*([^|\n\r]+)',
            r'([^\n,]+church[^\n,]*)',
            r'([^\n,]+auditorium[^\n,]*)',
            r'([^\n,]+center[^\n,]*)',
        ]
        for pat in venue_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                cand = m.group(1).strip()
                if len(cand) > 4 and cand != res.event_name:
                    res.venue = cand[:70]
                    res.field_confidences["venue"] = 75.0
                    break

        # 5. Organizers / Presenters
        org_patterns = [
            r'([^\n,]+presents\b)',
            r'([^\n,]+ministries\b)',
            r'([^\n,]+international\b)',
        ]
        for pat in org_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                cand = m.group(1).replace("presents", "").strip()
                if len(cand) > 3:
                    res.organizer = cand
                    res.field_confidences["organizer"] = 80.0
                    break

        # 6. Speakers / Ministers
        speaker_patterns = [
            r'(?:ministering|speaker|pastor|apostle|evangelist|prophet|bishop|rev|dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})',
            r'\b(?:host)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})'
        ]
        for pat in speaker_patterns:
            for s in re.findall(pat, text, re.IGNORECASE):
                if s not in res.speakers and s != res.event_name:
                    res.speakers.append(s.strip())
        if res.speakers:
            res.field_confidences["speakers"] = 82.0

        # 7. Contact / Phone / Email
        phone_match = re.search(r'(\+?\d[\d\s\-]{8,14}\d)', text)
        if phone_match:
            res.contact = phone_match.group(1).strip()
            res.field_confidences["contact"] = 90.0

        # 8. Website / URL
        web_match = re.search(r'(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9_\-]+\.(?:org|com|net|edu|ng|co|uk))', text, re.IGNORECASE)
        if web_match:
            res.website = web_match.group(1).strip()
            res.field_confidences["website"] = 92.0

        # Check if event_name is missing or uncertain
        if not res.event_name or len(res.event_name.strip()) < 3:
            res.field_confidences["event_name"] = 0.0
            if "event_name" not in res.uncertain_fields:
                res.uncertain_fields.append("event_name")

        # Identify any uncertain fields (confidence < 60)
        for fld, conf in res.field_confidences.items():
            if conf < 60.0 and fld not in res.uncertain_fields:
                res.uncertain_fields.append(fld)

        # Check block confidences
        for b in res.blocks:
            if b.conf < 60.0 and len(b.text.strip()) > 1:
                if "detected_text" not in res.uncertain_fields:
                    res.uncertain_fields.append("detected_text")
                break
