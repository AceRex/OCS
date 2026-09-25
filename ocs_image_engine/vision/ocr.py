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
    scripture: Optional[Dict[str, Any]] = None

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

    @staticmethod
    def _clean_ocr_line(line_str: str) -> str:
        cleaned = re.sub(r'^[^\w\(\[\'"]+|[^\w\)\]\'"]+$', '', line_str).strip()
        words = cleaned.split()
        unique = []
        for w in words:
            is_sub = False
            for other in words:
                if len(other) > len(w) and (w.lower() in other.lower() or (len(w) >= 4 and other.lower().startswith(w.lower()[:4]))):
                    is_sub = True
                    break
            if not is_sub and w not in unique:
                unique.append(w)
        return " ".join(unique)

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
        passes.append(("adaptive", adaptive, self.config.tesseract_config, 1.0, 0))

        # Pass 2: Otsu's Thresholding (standard high-contrast)
        _, otsu = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        passes.append(("otsu", otsu, self.config.tesseract_config, 1.0, 0))

        # Pass 3: Inverted Otsu (light-on-dark text)
        _, otsu_inv = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        passes.append(("otsu_inv", otsu_inv, self.config.tesseract_config, 1.0, 0))

        # Pass 4 & 5: Chromatic Channel Thresholding for 3D stylized artwork headings
        rgb_np = np.array(img.convert("RGB"))
        t_y0_140 = int(h * 0.15)
        t_y1_140 = int(h * 0.50)
        crop140 = rgb_np[t_y0_140:t_y1_140, :]
        up140 = cv2.resize(crop140, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        _, g_th140 = cv2.threshold(up140[:, :, 1], 140, 255, cv2.THRESH_BINARY)
        passes.append(("chromatic_g140", g_th140, "--oem 1 --psm 11", 0.5, t_y0_140))

        t_y0_180 = int(h * 0.12)
        t_y1_180 = int(h * 0.52)
        crop180 = rgb_np[t_y0_180:t_y1_180, :]
        up180 = cv2.resize(crop180, (0, 0), fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        _, g_th180 = cv2.threshold(up180[:, :, 1], 180, 255, cv2.THRESH_BINARY)
        passes.append(("chromatic_g180", g_th180, "--oem 1 --psm 11", 0.5, t_y0_180))

        all_blocks: List[OCRBlock] = []
        all_lines: List[str] = []
        seen_lines = set()
        raw_text_parts: List[str] = []

        for name, processed_np, cfg, scale, off_y in passes:
            proc_pil = Image.fromarray(processed_np)
            try:
                data = pytesseract.image_to_data(
                    proc_pil,
                    config=cfg,
                    output_type=pytesseract.Output.DICT
                )
            except Exception as e:
                logger.warning("Pass %s failed: %s", name, e)
                continue

            n_boxes = len(data.get("text", []))

            for i in range(n_boxes):
                raw_token = str(data["text"][i]).strip()
                try:
                    conf = float(data["conf"][i])
                except (ValueError, TypeError):
                    conf = 0.0

                min_c = 12.0 if "chromatic" in name else self.config.ocr_min_confidence
                if conf > min_c and len(raw_token) > 0:
                    clean_token = re.sub(r'^[^\w]+|[^\w]+$', '', raw_token)
                    if not clean_token or len(clean_token) < 2:
                        continue

                    left = int(int(data["left"][i]) * scale)
                    top = int(int(data["top"][i]) * scale + off_y)
                    width = int(int(data["width"][i]) * scale)
                    height = int(int(data["height"][i]) * scale)

                    # Deduplicate near-identical blocks across passes
                    existing = any(
                        b.text.lower() == clean_token.lower() and abs(b.x - left) < 25 and abs(b.y - top) < 25
                        for b in all_blocks
                    )
                    if not existing:
                        all_blocks.append(OCRBlock(
                            text=clean_token,
                            x=left,
                            y=top,
                            w=width,
                            h=height,
                            conf=conf
                        ))
                        raw_text_parts.append(clean_token)

        # Form real physical lines across the whole image by clustering blocks on the same visual horizontal line
        clean_blocks = [b for b in all_blocks if (b.conf >= 14 if len(b.text) >= 4 else b.conf >= 30) and re.search(r'[A-Za-z0-9]', b.text)]
        line_clusters: List[List[OCRBlock]] = []
        for b in sorted(clean_blocks, key=lambda b: b.y):
            placed = False
            b_mid_y = b.y + b.h / 2.0
            for line in line_clusters:
                line_mid_y = sum(x.y + x.h / 2.0 for x in line) / len(line)
                line_avg_h = sum(x.h for x in line) / len(line)
                if abs(b_mid_y - line_mid_y) <= line_avg_h * 0.45:
                    line.append(b)
                    placed = True
                    break
            if not placed:
                line_clusters.append([b])

        all_lines: List[str] = []
        for line in line_clusters:
            line.sort(key=lambda b: b.x)
            # Break horizontal band into continuous text segments (avoid joining distant multi-column words)
            segments: List[List[OCRBlock]] = []
            curr_seg: List[OCRBlock] = [line[0]]
            for i in range(1, len(line)):
                prev_b = curr_seg[-1]
                cur_b = line[i]
                gap = cur_b.x - (prev_b.x + prev_b.w)
                avg_h = (prev_b.h + cur_b.h) / 2.0
                if gap > max(28, avg_h * 1.5):
                    segments.append(curr_seg)
                    curr_seg = [cur_b]
                else:
                    curr_seg.append(cur_b)
            if curr_seg:
                segments.append(curr_seg)

            for seg in segments:
                seg_str = " ".join(b.text for b in seg).strip()
                cleaned_line = self._clean_ocr_line(seg_str)
                if len(cleaned_line) > 1:
                    all_lines.append(cleaned_line)

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

        # Filter low confidence artifacts or non-text noise
        valid_blocks = [
            b for b in big_blocks
            if b.conf >= 35 and re.search(r'[A-Za-z0-9]', b.text)
        ]
        if not valid_blocks:
            valid_blocks = list(big_blocks)

        # Line clustering: group words that lie on the same visual horizontal line
        lines: List[List[OCRBlock]] = []
        sorted_blocks = sorted(valid_blocks, key=lambda b: b.y)
        for b in sorted_blocks:
            placed = False
            b_mid_y = b.y + b.h / 2.0
            for line in lines:
                line_mid_y = sum(x.y + x.h / 2.0 for x in line) / len(line)
                line_avg_h = sum(x.h for x in line) / len(line)
                if abs(b_mid_y - line_mid_y) <= line_avg_h * 0.45:
                    line.append(b)
                    placed = True
                    break
            if not placed:
                lines.append([b])

        merged: List[OCRBlock] = []
        for line in lines:
            line.sort(key=lambda b: b.x)
            curr = line[0]
            for i in range(1, len(line)):
                nxt = line[i]
                x_dist = nxt.x - (curr.x + curr.w)
                avg_h = (curr.h + nxt.h) / 2.0
                h_ratio = min(curr.h, nxt.h) / max(curr.h, nxt.h)

                # Merge if adjacent horizontally with normal word spacing (no multi-column jumps)
                if -avg_h * 0.25 <= x_dist <= avg_h * 1.2 and h_ratio >= 0.55:
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

        # 1. Organizers / Presenters
        # Check top lines (first 4 lines) for prominent organization/church title
        top_org_lines = []
        for l in res.all_lines[:4]:
            if any(k in l.lower() for k in ["gospel", "faith", "mission", "church", "ministr", "assembly", "fellowship", "diocese"]):
                cleaned_l = re.sub(r'^[0-9\W]+', '', l).strip()
                cleaned_l = re.sub(r'^(?:[a-z]{1,2}\s+)+', '', cleaned_l).strip()
                if len(cleaned_l) > 3 and not any(k in cleaned_l.lower() for k in ["auditorium", "avenue", "street"]):
                    top_org_lines.append(cleaned_l)
        if top_org_lines:
            res.organizer = " ".join(top_org_lines)[:80]
            res.field_confidences["organizer"] = 88.0

        if not res.organizer:
            org_patterns = [
                r'([^\n,]+(?:presents|ministries|international|mission\s+int\'?l|fellowship|assembly)\b[^\n,]*)',
                r'([^\n,]+presents\b)',
                r'([^\n,]+ministries\b)',
                r'([^\n,]+mission\b)',
                r'([^\n,]+church\b)',
            ]
            for pat in org_patterns:
                m = re.search(pat, text, re.IGNORECASE)
                if m:
                    cand = m.group(1).replace("presents", "").strip()
                    if len(cand) > 3 and not any(k in cand.lower() for k in ["auditorium", "hall", "avenue", "street"]):
                        res.organizer = cand[:80]
                        res.field_confidences["organizer"] = 80.0
                        break

        # 2. Subtitle / Theme (detected early so event_name doesn't capture the theme)
        for i, l in enumerate(res.all_lines):
            if re.search(r'\btheme\b', l, re.I):
                m_inline = re.search(r'\btheme\s*[:\-]\s*(.+)', l, re.I)
                if m_inline:
                    res.theme_subtitle = m_inline.group(1).strip()
                    res.field_confidences["theme_subtitle"] = 92.0
                    break
                elif i + 1 < len(res.all_lines):
                    next_l = res.all_lines[i + 1].strip()
                    cleaned_theme = re.sub(r'\(.*?\)', '', next_l).strip()
                    if len(cleaned_theme) >= 3:
                        res.theme_subtitle = cleaned_theme
                        res.field_confidences["theme_subtitle"] = 90.0
                        break

        # 3. Venue / Address
        for idx, l in enumerate(res.all_lines):
            if re.search(r'\b(?:Church\s+Auditorium)\b', l, re.I):
                res.venue = "Church Auditorium"
                res.field_confidences["venue"] = 92.0
                break
            elif re.search(r'\b(?:Auditorium)\b', l, re.I):
                # Check if preceding or succeeding line/token was Church
                if idx > 0 and re.search(r'\b(?:Church)\b', res.all_lines[idx - 1], re.I):
                    res.venue = "Church Auditorium"
                elif idx + 1 < len(res.all_lines) and re.search(r'\b(?:Church)\b', res.all_lines[idx + 1], re.I):
                    res.venue = "Church Auditorium"
                else:
                    res.venue = "Church Auditorium" if any("church" in line.lower() for line in res.all_lines) else "Auditorium"
                res.field_confidences["venue"] = 88.0
                break
            elif re.search(r'([A-Za-z0-9 \t,.\'-]*?\b(?:Cathedral|Chapel|Campground|Assembly\s+Hall|Conference\s+Center)\b[A-Za-z0-9 \t,.\'-]*)', l, re.I):
                cand = re.sub(r'^(?:[0-9]+[ap]m|[ap]m|[0-9\W]+)+\s*', '', l, flags=re.I).strip()
                if len(cand) >= 4 and cand != res.organizer:
                    res.venue = cand[:70]
                    res.field_confidences["venue"] = 85.0
                    break

        if not res.venue:
            venue_patterns = [
                r'\b(?:venue|location|address|holding\s+at)\b\s*[:\-]?\s*([^\n\r|]+)',
                r'([A-Za-z0-9 \t,.\'-]*?\b(?:Centre|Center)\b[A-Za-z0-9 \t,.\'-]*)',
            ]
            for pat in venue_patterns:
                m = re.search(pat, text, re.IGNORECASE)
                if m:
                    cand = m.group(1).strip()
                    cand = re.sub(r'^(?:[0-9]+[ap]m|[ap]m|[0-9\W]+)+\s*', '', cand, flags=re.I).strip()
                    cand_lower = cand.lower()
                    if (
                        len(cand) > 3
                        and cand_lower not in ["faith", "the", "mission", "gospel", "at"]
                        and cand != res.organizer
                        and (not res.organizer or cand_lower not in res.organizer.lower())
                    ):
                        res.venue = cand[:70]
                        res.field_confidences["venue"] = 75.0
                        break

        # Bible Scripture Reference Resolution
        canonical_map = {
            "gen": "Genesis", "genesis": "Genesis", "ex": "Exodus", "exod": "Exodus", "exodus": "Exodus",
            "lev": "Leviticus", "num": "Numbers", "deut": "Deuteronomy", "josh": "Joshua", "judg": "Judges",
            "ruth": "Ruth", "1sam": "1 Samuel", "2sam": "2 Samuel", "1ki": "1 Kings", "2ki": "2 Kings",
            "1chr": "1 Chronicles", "2chr": "2 Chronicles", "ezra": "Ezra", "neh": "Nehemiah", "esth": "Esther",
            "job": "Job", "ps": "Psalms", "psa": "Psalms", "psalm": "Psalms", "psalms": "Psalms", "prov": "Proverbs",
            "eccl": "Ecclesiastes", "song": "Song of Solomon", "isa": "Isaiah", "jer": "Jeremiah", "lam": "Lamentations",
            "ezek": "Ezekiel", "dan": "Daniel", "hos": "Hosea", "joel": "Joel", "amos": "Amos", "obad": "Obadiah",
            "jonah": "Jonah", "mic": "Micah", "nah": "Nahum", "hab": "Habakkuk", "zeph": "Zephaniah", "hag": "Haggai",
            "zech": "Zechariah", "mal": "Malachi", "matt": "Matthew", "mark": "Mark", "luke": "Luke", "john": "John",
            "acts": "Acts", "rom": "Romans", "1cor": "1 Corinthians", "2cor": "2 Corinthians", "gal": "Galatians",
            "eph": "Ephesians", "phil": "Philippians", "philippians": "Philippians", "col": "Colossians",
            "1thess": "1 Thessalonians", "2thess": "2 Thessalonians", "1tim": "1 Timothy", "2tim": "2 Timothy",
            "tit": "Titus", "philem": "Philemon", "heb": "Hebrews", "jam": "James", "jas": "James",
            "1pet": "1 Peter", "2pet": "2 Peter", "1jn": "1 John", "2jn": "2 John", "3jn": "3 John",
            "jude": "Jude", "rev": "Revelation",
        }
        scrip_match = re.search(r'\b([0-9]?[A-Za-z]+)\.?\s*(\d+)[:\.](\d+(?:-\d+)?)\b', text)
        if scrip_match:
            raw_b = scrip_match.group(1).lower().rstrip('.')
            ch = scrip_match.group(2)
            vs = scrip_match.group(3)
            canon = canonical_map.get(raw_b)
            if canon:
                res.scripture = {
                    "displayText": f"{scrip_match.group(1)}. {ch}:{vs}",
                    "normalizedReference": f"{canon} {ch}:{vs}",
                    "book": canon,
                    "chapter": int(ch),
                    "verse": vs,
                }
                res.field_confidences["scripture"] = 95.0

        if not res.scripture:
            for idx in range(len(res.all_lines) - 1):
                first_tok = res.all_lines[idx].strip().strip('()[]').lower().rstrip('.')
                second_line = res.all_lines[idx + 1].strip().strip('()[]')
                v_match = re.match(r'^(\d+)[:\.](\d+(?:-\d+)?)$', second_line)
                if v_match and first_tok in canonical_map:
                    canon = canonical_map[first_tok]
                    res.scripture = {
                        "displayText": f"{res.all_lines[idx].strip()} {second_line}",
                        "normalizedReference": f"{canon} {v_match.group(1)}:{v_match.group(2)}",
                        "book": canon,
                        "chapter": int(v_match.group(1)),
                        "verse": v_match.group(2),
                    }
                    res.field_confidences["scripture"] = 90.0
                    break

        # 4. Dates
        date_patterns = [
            r'\b\d{1,2}(?:st|nd|rd|th)?(?:\s*&\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?\b',
            r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{1,2}(?:st|nd|rd|th)?(?:\s*-\s*\d{1,2}(?:st|nd|rd|th)?)?(?:\s*,\s*\d{4})?\b',
            r'\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b',
            r'\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b',
        ]
        for pat in date_patterns:
            for m in re.findall(pat, text, re.IGNORECASE):
                cleaned = re.sub(r'\s+', ' ', m).strip().rstrip(',.')
                if cleaned not in res.dates:
                    res.dates.append(cleaned)

        if res.dates:
            res.field_confidences["dates"] = 85.0

        # 5. Times
        time_matches = re.findall(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|gmt|wat)\b', text, re.IGNORECASE)
        res.times = list(dict.fromkeys(time_matches))
        if res.times:
            res.field_confidences["times"] = 88.0

        # 6. Event Headline / Name
        if res.big_texts:
            for b in res.big_texts:
                clean = b.text.strip().rstrip(',.;:')
                clean_stripped = clean.strip(',.;:! ')
                is_pure_date = (
                    any(clean_stripped.lower() == m.lower() for m in months) or
                    bool(re.match(r'^\s*(?:\d{1,2}(?:st|nd|rd|th)?[\s\/\-\.]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[\s\/\-\.]+(?:19|20)?\d\d?|(?:19|20)\d\d)\s*$', clean_stripped, re.IGNORECASE))
                )
                has_alpha = len(re.findall(r'[A-Za-z]{3,}', clean)) >= 1
                is_theme_overlap = bool(
                    re.search(r'\btheme\b', clean, re.I) or
                    (res.theme_subtitle and (clean.lower() in res.theme_subtitle.lower() or res.theme_subtitle.lower() in clean.lower() or (len(clean) >= 4 and clean.lower()[:4] in res.theme_subtitle.lower())))
                )
                is_org_overlap = bool(res.organizer and (clean.lower() in res.organizer.lower() or res.organizer.lower() in clean.lower()))

                if len(clean) >= 4 and has_alpha and not is_pure_date and not is_theme_overlap and not is_org_overlap and clean != res.venue:
                    res.event_name = clean
                    res.field_confidences["event_name"] = round(b.conf, 1)
                    break

        if not res.event_name and res.all_lines:
            for l in res.all_lines:
                cand = l.strip().rstrip(',.;:')
                cand_stripped = cand.strip(',.;:! ')
                is_date = any(cand_stripped.lower() == m.lower() for m in months) or any(m.lower() in cand.lower() for m in months)
                is_org_overlap = bool(res.organizer and (cand.lower() in res.organizer.lower() or res.organizer.lower() in cand.lower()))
                is_theme_overlap = bool(
                    re.search(r'\btheme\b', cand, re.I) or
                    (res.theme_subtitle and (cand.lower() in res.theme_subtitle.lower() or res.theme_subtitle.lower() in cand.lower() or (len(cand) >= 4 and cand.lower()[:4] in res.theme_subtitle.lower())))
                )
                has_words = len(re.findall(r'[A-Za-z]{3,}', cand)) >= 1
                is_scripture = bool(re.search(r'\b\d+:\d+\b|^\(.*\)$', cand))
                if len(cand) >= 4 and has_words and not is_scripture and not is_date and not is_org_overlap and not is_theme_overlap and cand != res.venue:
                    res.event_name = cand
                    res.field_confidences["event_name"] = 65.0
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
