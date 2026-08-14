"""
vision/ocr.py
=============
Text extraction from posters using Tesseract OCR.
Detects event names, dates, times, and locations.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

import pytesseract
import numpy as np
from PIL import Image

from utils.config import Config

logger = logging.getLogger("ocs.ocr")

@dataclass
class OCRBlock:
    """A detected block of text with coordinates and styling."""
    text: str
    x: int
    y: int
    w: int
    h: int
    conf: float
    color: Optional[Tuple[int, int, int]] = None  # RGB color of the text
    font_size: float = 0.0                        # Estimated font size in px
    font_family: str = "Inter"                    # Default font family

@dataclass
class OCRResult:
    """Structured results from OCR extraction."""
    raw_text: str
    all_lines: list[str] = field(default_factory=list)
    blocks: list[OCRBlock] = field(default_factory=list)
    
    # Heuristics
    event_name: Optional[str] = None
    dates: list[str] = field(default_factory=list)
    times: list[str] = field(default_factory=list)
    location: Optional[str] = None
    
    # Stylized Big Text
    big_texts: list[OCRBlock] = field(default_factory=list)

class OCRExtractor:
    def __init__(self, config: Config):
        self.config = config
        self._ensure_tesseract_path()
        
    def _ensure_tesseract_path(self):
        """Try to locate tesseract binary in common macOS paths if not in PATH."""
        import shutil
        import os
        if shutil.which("tesseract"):
            return
            
        common_paths = [
            "/opt/homebrew/bin/tesseract",
            "/usr/local/bin/tesseract"
        ]
        for p in common_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                logger.info("Found Tesseract at %s", p)
                return
        
        logger.warning("Tesseract binary not found. OCR will likely fail.")

    def extract(self, img: Image.Image) -> OCRResult:
        logger.info("Running Multi-Pass Tesseract OCR")
        
        from PIL import ImageOps, ImageFilter
        import cv2
        
        # Base image
        gray_pil = ImageOps.grayscale(img)
        gray_np = np.array(gray_pil)
        
        # Define Preprocessing Passes
        passes = []
        
        # Pass 1: Adaptive Thresholding (Great for gradients)
        adaptive = cv2.adaptiveThreshold(
            cv2.GaussianBlur(gray_np, (3, 3), 0), 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 5
        )
        passes.append(("adaptive", adaptive))
        
        # Pass 2: Otsu's Thresholding (Great for high-contrast text)
        _, otsu = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        passes.append(("otsu", otsu))
        
        # Pass 3: Inverted Otsu (For light-on-dark text)
        _, otsu_inv = cv2.threshold(gray_np, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        passes.append(("otsu_inv", otsu_inv))

        all_blocks = []
        all_lines = set()
        raw_text_parts = []
        
        for name, processed_np in passes:
            proc_pil = Image.fromarray(processed_np)
            # image_to_data returns everything we need, no need for image_to_string separately
            data = pytesseract.image_to_data(proc_pil, config=self.config.tesseract_config, output_type=pytesseract.Output.DICT)
            
            n_boxes = len(data['text'])
            current_pass_lines = {}
            
            for i in range(n_boxes):
                conf = float(data['conf'][i])
                text = data['text'][i].strip()
                line_num = data['line_num'][i]
                
                if conf > self.config.ocr_min_confidence and len(text) > 1:
                    # Collect blocks
                    if not any(b.text == text and abs(b.x - data['left'][i]) < 20 for b in all_blocks):
                        all_blocks.append(OCRBlock(
                            text=text,
                            x=data['left'][i], y=data['top'][i],
                            w=data['width'][i], h=data['height'][i],
                            conf=conf
                        ))
                        raw_text_parts.append(text)
                    
                    # Group into lines by line_num for this pass
                    if line_num not in current_pass_lines:
                        current_pass_lines[line_num] = []
                    current_pass_lines[line_num].append(text)
            
            # Add lines from this pass
            for line_parts in current_pass_lines.values():
                line = " ".join(line_parts).strip()
                if len(line) > 3:
                    all_lines.add(line)

        result = OCRResult(
            raw_text=" ".join(raw_text_parts),
            all_lines=list(all_lines),
            blocks=all_blocks
        )
        
        self._identify_and_style_big_texts(result, img)
        self._parse_heuristics(result)
        
        return result
    def _identify_and_style_big_texts(self, res: OCRResult, img: Image.Image):
        """Find the largest text blocks, merge adjacent ones, and extract colors."""
        if not res.blocks:
            return

        # 1. Filter for large blocks
        img_w, img_h = img.size
        min_height = img_h * 0.025 # 2.5% of height
        big_blocks = [b for b in res.blocks if b.h >= min_height]
        
        if not big_blocks:
            return

        # 2. Merge blocks that are on the same line and close to each other
        # Sort by Y then X
        big_blocks.sort(key=lambda b: (b.y, b.x))
        
        merged_blocks = []
        if big_blocks:
            curr = big_blocks[0]
            for i in range(1, len(big_blocks)):
                next_b = big_blocks[i]
                
                # Check if on same line (Y overlap) and close X
                y_overlap = min(curr.y + curr.h, next_b.y + next_b.h) - max(curr.y, next_b.y)
                x_dist = next_b.x - (curr.x + curr.w)
                
                if y_overlap > curr.h * 0.5 and x_dist < curr.h * 1.5:
                    # Merge
                    new_x = min(curr.x, next_b.x)
                    new_y = min(curr.y, next_b.y)
                    new_w = max(curr.x + curr.w, next_b.x + next_b.w) - new_x
                    new_h = max(curr.y + curr.h, next_b.y + next_b.h) - new_y
                    curr = OCRBlock(
                        text=curr.text + " " + next_b.text,
                        x=new_x, y=new_y, w=new_w, h=new_h,
                        conf=(curr.conf + next_b.conf) / 2
                    )
                else:
                    merged_blocks.append(curr)
                    curr = next_b
            merged_blocks.append(curr)

        # 3. Sort by Height (Font Size) first, then width
        merged_blocks.sort(key=lambda b: (b.h, b.w), reverse=True)
        
        for block in merged_blocks[:8]:
            # Extract color and estimate font size
            block.color = self._get_dominant_text_color(img, block)
            block.font_size = block.h
            block.font_family = "Outfit" 
            res.big_texts.append(block)

    def _get_dominant_text_color(self, img: Image.Image, block: OCRBlock) -> Tuple[int, int, int]:
        """Use K-Means and edge-aware selection to find text color."""
        try:
            # Crop with padding
            pad = 5
            left = max(0, block.x - pad)
            top = max(0, block.y - pad)
            right = min(img.width, block.x + block.w + pad)
            bottom = min(img.height, block.y + block.h + pad)
            
            crop = img.crop((left, top, right, bottom))
            crop_arr = np.array(crop.convert("RGB"))
            
            # Use Canny to find where the text edges are
            import cv2
            gray = cv2.cvtColor(crop_arr, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            
            # The pixels near the edges are definitely text (or boundary)
            # The pixels furthest from edges are either deep inside text or deep in background
            pixels = crop_arr.reshape(-1, 3)
            
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=2, n_init='auto')
            kmeans.fit(pixels)
            
            centers = kmeans.cluster_centers_.astype(int)
            labels = kmeans.labels_
            
            # Which cluster is more likely to be text?
            # Let's check which cluster has more pixels near edges
            edge_labels = labels[edges.flatten() > 0]
            if len(edge_labels) > 0:
                text_cluster = np.bincount(edge_labels).argmax()
                return tuple(centers[text_cluster])
            
            # Fallback to minority cluster
            count0 = np.sum(labels == 0)
            count1 = np.sum(labels == 1)
            return tuple(centers[0]) if count0 < count1 else tuple(centers[1])
            
        except Exception as e:
            logger.error("Detailed color extraction failed: %s", e)
            return (255, 255, 255)

    def _parse_heuristics(self, res: OCRResult):
        """Extract event name, dates, etc using aggressive proximity search."""
        try:
            text = res.raw_text
            if not text:
                return

            # 1. Regex Search (Combined Patterns)
            date_patterns = [
                r'\d{1,2}(?:st|nd|rd|th)?(?:\s*&\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?',
                r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*-\s*\d{1,2}(?:st|nd|rd|th)?)?',
                r'\d{1,2}/\d{1,2}/\d{2,4}',
                r'(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*'
            ]
            for pattern in date_patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for m in matches:
                    m = re.sub(r'\s+', ' ', m).strip()
                    if m not in res.dates:
                        res.dates.append(m)

            # 2. Aggressive Token Proximity Search (Handles stylized dates far apart in text)
            tokens = text.split()
            months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            
            month_indices = [i for i, t in enumerate(tokens) if any(t.startswith(m) for m in months)]
            day_indices = [i for i, t in enumerate(tokens) if re.match(r'^\d{1,2}(?:st|nd|rd|th)?$', t)]

            for mi in month_indices:
                for di in day_indices:
                    if abs(mi - di) <= 3: # Day and Month within 3 tokens of each other
                        potential_date = f"{tokens[min(mi, di)]} {tokens[max(mi, di)]}"
                        if not any(potential_date in d for d in res.dates):
                            res.dates.append(potential_date)

            # 3. Times
            time_matches = re.findall(r'\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|clock|gmt)', text, re.IGNORECASE)
            res.times = list(set(time_matches))
            
            # 4. Prominence-based Event Name (Largest Text)
            # Use the merged big_texts for the event name as it's more accurate for multi-word titles
            theme_match = re.search(r'(?:theme|topic|title|subject):\s*([^|\n]+)', text, re.IGNORECASE)
            if theme_match:
                res.event_name = theme_match.group(1).strip()

            if not res.event_name and res.big_texts:
                # The biggest block (by height/area) is likely the theme text
                # We already sorted big_texts by area in _identify_and_style_big_texts
                best_block = res.big_texts[0]
                # Filter out obvious dates/times that might be large
                for block in res.big_texts[:3]:
                    if len(block.text) > 3 and not any(m in block.text for m in months):
                        res.event_name = block.text
                        break
                
            # 5. Location
            loc_patterns = [
                r'(?:at|venue|location|church|place|address):\s*([^,\n.]+)',
                r'holding\s+at\s+([^,\n.]+)'
            ]
            for pattern in loc_patterns:
                loc_match = re.search(pattern, text, re.IGNORECASE)
                if loc_match:
                    res.location = loc_match.group(1).strip()
                    break
        except Exception as e:
            logger.error("Error in OCR heuristics: %s", e)
            # Fail gracefully – returning without parsed fields is better than a crash
