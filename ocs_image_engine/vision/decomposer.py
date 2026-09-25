"""
vision/decomposer.py
====================
Smart Flyer Decomposition & Visual Region Extraction V2 for OCS Design Lab.

Decomposes flattened flyers/posters into structured, reusable visual assets:
- Logos (emblems, badges, subtitles unified)
- Visual Groups (stylized titles, compositions, brush artwork)
- Text Groups (hierarchically clustered lines and paragraphs)
- Icons (Bible, clock, pin, glyphs)
- Subjects (people, silhouettes, figures)
- Sections (cards, badges, containers)

Preserves exact source coordinates and supports source-resolution extraction.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("ocs.decomposer")


@dataclass
class VisualRegion:
    id: str
    type: str  # "logo" | "visual_group" | "text_group" | "subject" | "icon" | "section" | "graphic_shape"
    label: str
    text: str
    x: int
    y: int
    w: int
    h: int
    conf: float
    can_cutout: bool = True
    cutout_quality: str = "high"  # "high" | "medium" | "safe_crop"
    related_ocr_blocks: List[int] = field(default_factory=list)
    parent_id: Optional[str] = None
    child_ids: List[str] = field(default_factory=list)
    shape_geometry: Optional[Dict[str, Any]] = None  # For graphic_shape type: {shape, aspect, fill_color_hex, area_px}

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "label": self.label,
            "text": self.text,
            "x": int(self.x),
            "y": int(self.y),
            "w": int(self.w),
            "h": int(self.h),
            "conf": float(round(self.conf, 1)),
            "can_cutout": bool(self.can_cutout),
            "cutout_quality": self.cutout_quality,
            "related_ocr_blocks": self.related_ocr_blocks,
            "parent_id": self.parent_id,
            "child_ids": self.child_ids,
        }
        if self.shape_geometry is not None:
            d["shape_geometry"] = self.shape_geometry
            d["is_convertible_shape"] = bool(self.shape_geometry.get("is_convertible", False))
        return d


class FlyerDecomposer:
    """
    Decomposes an event poster into hierarchical, reusable visual objects.
    """

    def __init__(self, config=None):
        self.config = config

    def decompose(
        self,
        img: Image.Image,
        ocr_blocks: List[Dict[str, Any]],
        detected_faces: List[Any] = None
    ) -> List[VisualRegion]:
        w, h = img.size
        arr = np.array(img.convert("RGB"))
        gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(arr, cv2.COLOR_BGR2HSV)

        regions: List[VisualRegion] = []
        region_counter = 0

        def next_id(prefix: str) -> str:
            nonlocal region_counter
            region_counter += 1
            return f"reg_{prefix}_{region_counter}"

        # ──────────────────────────────────────────────────────────────────
        # 1. CLEAN & FILTER RAW OCR BLOCKS
        # ──────────────────────────────────────────────────────────────────
        clean_blocks = []
        for idx, b in enumerate(ocr_blocks):
            txt = str(b.get("text", "")).strip()
            conf = float(b.get("conf", 0))
            bw = int(b.get("w", 0))
            bh = int(b.get("h", 0))
            bx = int(b.get("x", 0))
            by = int(b.get("y", 0))

            # Filter meaningless OCR artifacts (e.g. single symbols with low confidence)
            is_valid_word = len(txt) > 1 or txt in ["A", "I", "a", "i", "&"]
            min_conf = 14 if len(txt) >= 4 else 35
            if is_valid_word and bw > 6 and bh > 6 and conf >= min_conf:
                clean_blocks.append({
                    "orig_idx": idx,
                    "text": txt,
                    "x": bx,
                    "y": by,
                    "w": bw,
                    "h": bh,
                    "conf": conf,
                    "cx": bx + bw / 2.0,
                    "cy": by + bh / 2.0,
                })

        # ──────────────────────────────────────────────────────────────────
        # 2. LOGO DETECTION (Emblems, Badges, Header Organisation Branding)
        # ──────────────────────────────────────────────────────────────────
        logo_region = self._detect_logo(arr, gray, clean_blocks, w, h)
        logo_blocks = set()
        if logo_region:
            logo_region.id = next_id("logo")
            regions.append(logo_region)
            logo_blocks = set(logo_region.related_ocr_blocks)

        # ──────────────────────────────────────────────────────────────────
        # 3. TEXT CLUSTERING (Words → Lines → Meaningful Paragraph / Title Groups)
        # ──────────────────────────────────────────────────────────────────
        # Exclude blocks that belong to the logo from general body text clustering
        non_logo_blocks = [b for b in clean_blocks if b["orig_idx"] not in logo_blocks]
        lines = self._cluster_words_into_lines(non_logo_blocks)
        text_groups = self._cluster_lines_into_groups(lines, w, h)

        for tg in text_groups:
            # Smart boundary expansion: expand around text to keep serifs, glows, shadows
            pad_x = max(8, int(tg["w"] * 0.05))
            pad_y = max(6, int(tg["h"] * 0.08))
            gx = max(0, tg["x"] - pad_x)
            gy = max(0, tg["y"] - pad_y)
            gw = min(w - gx, tg["w"] + pad_x * 2)
            gh = min(h - gy, tg["h"] + pad_y * 2)

            is_major = tg.get("is_major_title", False)
            reg_type = "visual_group" if is_major else "text_group"
            label = tg["text"] if len(tg["text"]) <= 36 else (tg["text"][:34] + "...")

            regions.append(VisualRegion(
                id=next_id("txt"),
                type=reg_type,
                label=label,
                text=tg["text"],
                x=gx,
                y=gy,
                w=gw,
                h=gh,
                conf=tg["avg_conf"],
                can_cutout=True,
                cutout_quality="high" if is_major else "medium",
                related_ocr_blocks=tg["block_indices"],
            ))

        # ──────────────────────────────────────────────────────────────────
        # 4. ICON DETECTION (Bible, Clock, Location Pin, Small Glyphs)
        # ──────────────────────────────────────────────────────────────────
        icon_regions = self._detect_icons(arr, gray, clean_blocks, w, h)
        for ic in icon_regions:
            ic.id = next_id("icon")
            regions.append(ic)

        # ──────────────────────────────────────────────────────────────────
        # 5. SUBJECT / SILHOUETTE DETECTION (People, Silhouettes, Figures)
        # ──────────────────────────────────────────────────────────────────
        subject_regions = self._detect_subjects(arr, gray, hsv, detected_faces, w, h)
        for s in subject_regions:
            s.id = next_id("subj")
            regions.append(s)

        # ──────────────────────────────────────────────────────────────────
        # 6. SPECIAL COMPOSITIONS (Large Artistic Title Posters, e.g. Brush Lettering Artwork)
        # ──────────────────────────────────────────────────────────────────
        art_regions = self._detect_artistic_titles(arr, gray, hsv, regions, clean_blocks, w, h)
        for ar in art_regions:
            ar.id = next_id("art")
            regions.append(ar)

        # ──────────────────────────────────────────────────────────────────
        # 7. SECTION CARDS / BADGES
        # ──────────────────────────────────────────────────────────────────
        section_regions = self._detect_sections(arr, gray, regions, clean_blocks, w, h)
        for sec in section_regions:
            sec.id = next_id("sec")
            regions.append(sec)

        # ──────────────────────────────────────────────────────────────────
        # 8. GRAPHIC SHAPE DETECTION (Decorative rectangles, circles, bands,
        #    dividers, and complex raster artwork not captured above)
        # ──────────────────────────────────────────────────────────────────
        shape_regions = self._detect_graphic_shapes(arr, gray, hsv, regions, w, h)
        for sh in shape_regions:
            sh.id = next_id("shape")
            regions.append(sh)

        # Deduplicate, rank, and establish hierarchy
        final_regions = self._deduplicate_and_rank(regions, w, h)
        return final_regions

    # ──────────────────────────────────────────────────────────────────────
    #  Internal Helpers
    # ──────────────────────────────────────────────────────────────────────

    def _cluster_words_into_lines(self, blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Group horizontally adjacent OCR words with similar baselines."""
        if not blocks:
            return []

        sorted_blocks = sorted(blocks, key=lambda b: (b["y"], b["x"]))
        lines: List[List[Dict[str, Any]]] = []

        for b in sorted_blocks:
            placed = False
            for line in lines:
                ref = line[-1]
                # Check baseline overlap
                vert_overlap = abs(b["cy"] - ref["cy"]) <= max(14, min(b["h"], ref["h"]) * 0.45)
                h_gap = b["x"] - (ref["x"] + ref["w"])
                max_h_gap = max(24, int(ref["h"] * 1.2))

                if vert_overlap and -15 <= h_gap <= max_h_gap:
                    line.append(b)
                    placed = True
                    break

            if not placed:
                lines.append([b])

        result_lines = []
        for line in lines:
            line_sorted = sorted(line, key=lambda b: b["x"])
            min_x = min(b["x"] for b in line_sorted)
            min_y = min(b["y"] for b in line_sorted)
            max_r = max(b["x"] + b["w"] for b in line_sorted)
            max_b = max(b["y"] + b["h"] for b in line_sorted)
            text = " ".join(b["text"] for b in line_sorted).strip()
            avg_conf = sum(b["conf"] for b in line_sorted) / len(line_sorted)
            indices = [b["orig_idx"] for b in line_sorted]

            if len(text) > 0:
                result_lines.append({
                    "text": text,
                    "x": min_x,
                    "y": min_y,
                    "w": max_r - min_x,
                    "h": max_b - min_y,
                    "avg_conf": avg_conf,
                    "block_indices": indices,
                    "words_count": len(line_sorted),
                })

        return result_lines

    def _cluster_lines_into_groups(
        self, lines: List[Dict[str, Any]], img_w: int, img_h: int
    ) -> List[Dict[str, Any]]:
        """Group vertically stacked lines that belong to a single paragraph or heading."""
        if not lines:
            return []

        sorted_lines = sorted(lines, key=lambda l: (l["y"], l["x"]))
        groups: List[List[Dict[str, Any]]] = []

        for line in sorted_lines:
            placed = False
            for group in groups:
                ref = group[-1]
                v_gap = line["y"] - (ref["y"] + ref["h"])

                # Check horizontal overlap or alignment
                left_align = abs(line["x"] - ref["x"]) <= max(35, ref["w"] * 0.15)
                h_overlap = (min(line["x"] + line["w"], ref["x"] + ref["w"]) - max(line["x"], ref["x"])) > 0
                size_ratio = min(line["h"], ref["h"]) / max(line["h"], ref["h"], 1)

                # Standalone badges/labels (short lines with colon/parens or distinct geometry)
                ref_txt = ref["text"].strip()
                cur_txt = line["text"].strip()
                is_standalone_ref = (
                    ref_txt.endswith(":") or
                    (ref_txt.startswith("(") and ref_txt.endswith(")")) or
                    (len(ref_txt) <= 12 and v_gap > max(16, ref["h"] * 0.75))
                )
                is_standalone_cur = (
                    cur_txt.endswith(":") or
                    (cur_txt.startswith("(") and cur_txt.endswith(")")) or
                    (len(cur_txt) <= 12 and v_gap > max(16, line["h"] * 0.75))
                )

                if not is_standalone_ref and not is_standalone_cur:
                    if (h_overlap or left_align) and 0 <= v_gap <= max(24, ref["h"] * 1.1) and size_ratio > 0.50:
                        group.append(line)
                        placed = True
                        break

            if not placed:
                groups.append([line])

        result_groups = []
        for grp in groups:
            min_x = min(l["x"] for l in grp)
            min_y = min(l["y"] for l in grp)
            max_r = max(l["x"] + l["w"] for l in grp)
            max_b = max(l["y"] + l["h"] for l in grp)
            text = " ".join(l["text"] for l in grp).strip()
            all_indices = []
            for l in grp:
                all_indices.extend(l["block_indices"])
            avg_conf = sum(l["avg_conf"] for l in grp) / len(grp)

            is_major = (max_b - min_y) >= img_h * 0.04 or (avg_conf >= 70 and (max_b - min_y) >= img_h * 0.03)

            result_groups.append({
                "text": text,
                "x": min_x,
                "y": min_y,
                "w": max_r - min_x,
                "h": max_b - min_y,
                "avg_conf": avg_conf,
                "block_indices": list(set(all_indices)),
                "is_major_title": is_major,
            })

        return result_groups

    def _detect_logo(
        self, arr: np.ndarray, gray: np.ndarray, blocks: List[Dict[str, Any]], w: int, h: int
    ) -> Optional[VisualRegion]:
        """
        Detects church / organization logos in the upper portion of the flyer.
        Unifies emblem contour, badge, and text subtitle.
        """
        top_h = int(h * 0.35)
        top_gray = gray[:top_h, :]

        # Look for logo-related keywords in top blocks
        logo_keywords = ["CHURCH", "ASSEMBLY", "MISSION", "MINISTRIES", "MINISTRY", "INT'L", "INTERNATIONAL", "FELLOWSHIP", "CHAPEL", "PARISH", "DIOCESE", "COMMUNITY", "CENTER", "CENTRE"]
        matched_blocks = [
            b for b in blocks if b["y"] < top_h and any(k in b["text"].upper() for k in logo_keywords)
        ]

        # Find prominent closed contours in top region
        _, binary = cv2.threshold(top_gray, 100, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        best_box = None
        best_score = 0

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 8000 < area < (w * top_h * 0.55):
                bx, by, bw, bh = cv2.boundingRect(cnt)
                aspect = bw / max(bh, 1)
                # Logo emblems + badges typically have aspect 0.6..2.5 and are in top 30%
                if 0.6 <= aspect <= 2.5 and by < top_h * 0.7:
                    score = area
                    if bx < w * 0.45 or (bx > w * 0.25 and bx + bw < w * 0.75):
                        score *= 1.5  # Header left or header center bonus
                    if score > best_score:
                        best_score = score
                        best_box = (bx, by, bw, bh)

        if best_box:
            bx, by, bw, bh = best_box
            # Include lower ribbon/subtitle if present
            pad = 8
            lx = max(0, bx - pad)
            ly = max(0, by - pad)
            lw = min(w - lx, bw + pad * 2)
            lh = min(h - ly, int(bh * 1.15) + pad * 2)

            rel_indices = []
            for b in blocks:
                if (lx <= b["cx"] <= lx + lw) and (ly <= b["cy"] <= ly + lh):
                    rel_indices.append(b["orig_idx"])

            text_label = "Organization Logo"
            rel_text = " ".join(b["text"] for b in blocks if (lx <= b.get("x", 0) + b.get("w", 0) * 0.5 <= lx + lw) and (ly <= b.get("y", 0) + b.get("h", 0) * 0.5 <= ly + lh)).strip()
            return VisualRegion(
                id="logo_main",
                type="logo",
                label=text_label,
                text=rel_text or "Organization Emblem",
                x=lx,
                y=ly,
                w=lw,
                h=lh,
                conf=95.0,
                can_cutout=True,
                cutout_quality="high",
                related_ocr_blocks=rel_indices,
            )

        return None

    def _detect_icons(
        self, arr: np.ndarray, gray: np.ndarray, blocks: List[Dict[str, Any]], w: int, h: int
    ) -> List[VisualRegion]:
        """
        Detects small graphical icons (Bible, Clock, Location Pin, etc.)
        often located to the left of specific text labels.
        """
        icons: List[VisualRegion] = []

        # Find contours that match icon dimensions (16..120px, aspect 0.6..1.6)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 4)
        contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        candidates = []
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            area = cv2.contourArea(cnt)
            aspect = bw / max(bh, 1)

            # Icon scale filter: 16px to 150px, aspect close to 1:1
            if 16 <= bw <= 150 and 16 <= bh <= 150 and 0.5 <= aspect <= 1.9:
                if 120 <= area <= 25000:
                    candidates.append((bx, by, bw, bh, area))

        # Check proximity to known keywords (Time, Venue, Bible, Study, etc.)
        for b in blocks:
            b_cy = b.get("cy", b["y"] + b["h"] / 2.0)
            txt_u = b["text"].upper()
            icon_type = None

            if any(k in txt_u for k in ["TIME", "AM", "PM"]):
                icon_type = "Clock Icon"
            elif any(k in txt_u for k in ["VENUE", "CHURCH", "AUDITORIUM"]):
                icon_type = "Location Pin Icon"
            elif any(k in txt_u for k in ["BIBLE", "SCRIPTURE", "BOOK", "TOPIC"]):
                icon_type = "Document Icon"

            if icon_type:
                # Look for a candidate strictly to the left of or above this block
                best_cand = None
                min_dist = float("inf")

                for (cx, cy, cw, ch, area) in candidates:
                    is_left = (b["x"] - (cx + cw)) >= -10 and (b["x"] - cx) < 180
                    vert_align = abs((cy + ch / 2) - b_cy) < max(40, b["h"] * 2.0)

                    if is_left and vert_align:
                        dist = b["x"] - cx
                        if dist < min_dist:
                            min_dist = dist
                            best_cand = (cx, cy, cw, ch)

                # Check if preceding block was OCR'd as a single icon symbol (e.g. "9", "@", "O©&")
                if not best_cand:
                    for prev_b in blocks:
                        if prev_b["x"] < b["x"] and (b["x"] - (prev_b["x"] + prev_b["w"])) < 70:
                            if abs((prev_b["y"] + prev_b["h"] / 2.0) - b_cy) < max(35, b["h"] * 1.5):
                                if len(prev_b["text"].strip()) <= 4:
                                    best_cand = (prev_b["x"], prev_b["y"], prev_b["w"], prev_b["h"])
                                    break

                if best_cand:
                    cx, cy, cw, ch = best_cand
                    if not any(abs(ic.x - cx) < 25 and abs(ic.y - cy) < 25 for ic in icons):
                        pad = 4
                        ix = max(0, cx - pad)
                        iy = max(0, cy - pad)
                        iw = min(w - ix, cw + pad * 2)
                        ih = min(h - iy, ch + pad * 2)

                        icons.append(VisualRegion(
                            id=f"icon_{len(icons)}",
                            type="icon",
                            label=icon_type,
                            text=icon_type,
                            x=ix,
                            y=iy,
                            w=iw,
                            h=ih,
                            conf=92.0,
                            can_cutout=True,
                            cutout_quality="high",
                        ))

        return icons

    def _detect_subjects(
        self,
        arr: np.ndarray,
        gray: np.ndarray,
        hsv: np.ndarray,
        detected_faces: List[Any],
        w: int,
        h: int
    ) -> List[VisualRegion]:
        """
        Detects prominent people figures, silhouettes, and speaker portraits.
        """
        subjects: List[VisualRegion] = []

        # 1. Detected Faces from Haar / Face detector
        if detected_faces:
            for i, f in enumerate(detected_faces):
                fx = getattr(f, "x", 0)
                fy = getattr(f, "y", 0)
                fw = getattr(f, "w", 0)
                fh = getattr(f, "h", 0)
                if fw > 0 and fh > 0:
                    pad_x = int(fw * 0.4)
                    pad_y = int(fh * 0.5)
                    sx = max(0, fx - pad_x)
                    sy = max(0, fy - pad_y)
                    sw = min(w - sx, fw + pad_x * 2)
                    sh = min(h - sy, fh + int(pad_y * 2.2))
                    subjects.append(VisualRegion(
                        id=f"subj_face_{i}",
                        type="subject",
                        label=f"Speaker Portrait {i + 1}",
                        text="Speaker",
                        x=sx,
                        y=sy,
                        w=sw,
                        h=sh,
                        conf=95.0,
                        can_cutout=True,
                        cutout_quality="high",
                    ))

        # 2. Prominent Silhouette / Group Detection (e.g. people cheering on hill)
        val = hsv[:, :, 2]
        mid_top = int(h * 0.15)
        mid_bot = int(h * 0.48)
        roi_val = val[mid_top:mid_bot, int(w * 0.4):]

        dark_mask = (roi_val < 90).astype(np.uint8) * 255
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        cleaned = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        silhouette_boxes = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 3000:
                bx, by, bw, bh = cv2.boundingRect(cnt)
                if bh > 60 and bw > 30:
                    real_x = int(w * 0.4) + bx
                    real_y = mid_top + by
                    silhouette_boxes.append((real_x, real_y, bw, bh, area))

        if silhouette_boxes:
            min_x = min(sb[0] for sb in silhouette_boxes)
            min_y = min(sb[1] for sb in silhouette_boxes)
            max_r = max(sb[0] + sb[2] for sb in silhouette_boxes)
            max_b = max(sb[1] + sb[3] for sb in silhouette_boxes)

            sw = max_r - min_x
            sh = max_b - min_y

            if sw >= w * 0.15 and sh >= h * 0.10:
                pad_x = 10
                pad_y = 10
                fx = max(0, min_x - pad_x)
                fy = max(0, min_y - pad_y)
                fw = min(w - fx, sw + pad_x * 2)
                fh = min(h - fy, sh + pad_y * 2)

                subjects.append(VisualRegion(
                    id="subj_silhouettes",
                    type="subject",
                    label="Silhouette / Subject Group",
                    text="Silhouette Group",
                    x=fx,
                    y=fy,
                    w=fw,
                    h=fh,
                    conf=92.0,
                    can_cutout=True,
                    cutout_quality="high",
                ))

        return subjects

    def _detect_artistic_titles(
        self,
        arr: np.ndarray,
        gray: np.ndarray,
        hsv: np.ndarray,
        existing_regions: List[VisualRegion],
        blocks: List[Dict[str, Any]],
        w: int,
        h: int
    ) -> List[VisualRegion]:
        """
        Detects large artistic visual title artwork (e.g. brush lettering, stylized headings)
        that spans across painterly words and visual graphics.
        """
        art_regions: List[VisualRegion] = []

        sat = hsv[:, :, 1]
        sat_roi = sat[int(h * 0.15):int(h * 0.48), :int(w * 0.8)]
        vibrant_mask = (sat_roi > 110).astype(np.uint8) * 255

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 20))
        connected = cv2.morphologyEx(vibrant_mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 35000:
                bx, by, bw, bh = cv2.boundingRect(cnt)
                real_y = int(h * 0.15) + by

                pad = 12
                ex_x = max(0, bx - pad)
                ex_y = max(0, real_y - pad)
                ex_w = min(w - ex_x, bw + pad * 2)
                ex_h = min(h - ex_y, bh + pad * 2)

                is_dup = any(
                    abs(r.x - ex_x) < 40 and abs(r.y - ex_y) < 40 and abs(r.w - ex_w) < 50
                    for r in existing_regions
                )
                if not is_dup:
                    # Find any overlapping text tokens inside this visual group
                    inside_blocks = [
                        b for b in blocks
                        if (ex_x <= b.get("x", 0) + b.get("w", 0) * 0.5 <= ex_x + ex_w) and
                           (ex_y <= b.get("y", 0) + b.get("h", 0) * 0.5 <= ex_y + ex_h) and
                           re.search(r'[A-Za-z0-9]', b.get("text", ""))
                    ]
                    # Sort by Y-coordinate, then X-coordinate (standard visual reading order)
                    inside_blocks.sort(key=lambda b: (b.get("y", 0) // 35, b.get("x", 0)))
                    meaningful = [
                        b["text"].strip() for b in inside_blocks
                        if (len(b["text"].strip()) >= 3 or b["text"].strip().isdigit())
                        and b.get("conf", 100) >= 25
                    ]
                    # Deduplicate while preserving order and filter sub-fragments
                    unique_words = list(dict.fromkeys(meaningful))
                    filtered_words = [
                        w for w in unique_words
                        if not any(len(other) > len(w) and w.upper() in other.upper() for other in unique_words)
                        and not re.search(r'[a-z][A-Z]', w)
                    ]
                    if filtered_words:
                        title_summary = " ".join(filtered_words[:4])
                        label = f"{title_summary} Title Artwork"
                        text_val = title_summary
                    else:
                        label = "Artistic Title Composition"
                        text_val = "Title Artwork"

                    art_regions.append(VisualRegion(
                        id=f"art_title_{len(art_regions)}",
                        type="visual_group",
                        label=label,
                        text=text_val,
                        x=ex_x,
                        y=ex_y,
                        w=ex_w,
                        h=ex_h,
                        conf=96.0,
                        can_cutout=True,
                        cutout_quality="high",
                    ))

        return art_regions

    def _detect_sections(
        self,
        arr: np.ndarray,
        gray: np.ndarray,
        existing_regions: List[VisualRegion],
        blocks: List[Dict[str, Any]],
        w: int,
        h: int
    ) -> List[VisualRegion]:
        """
        Detects prominent container cards/badges (e.g. Schedule/Venue card, Information container).
        """
        sections: List[VisualRegion] = []

        lower_gray = gray[int(h * 0.5):, :]
        edges = cv2.Canny(lower_gray, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 5))
        dilated = cv2.dilate(edges, kernel, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 18000:
                bx, by, bw, bh = cv2.boundingRect(cnt)
                real_y = int(h * 0.5) + by
                aspect = bw / max(bh, 1)

                if bw >= w * 0.55 and aspect >= 2.5:
                    inside_words = [
                        b["text"].strip() for b in blocks
                        if (bx <= b.get("x", 0) + b.get("w", 0) * 0.5 <= bx + bw) and
                           (real_y <= b.get("y", 0) + b.get("h", 0) * 0.5 <= real_y + bh) and
                           re.search(r'[A-Za-z0-9]', b.get("text", ""))
                    ]
                    if inside_words:
                        summary = " ".join(inside_words[:3]).strip()
                        label = f"{summary} Container"
                    else:
                        label = "Schedule & Information Card" if real_y > h * 0.75 else "Information Section Container"

                    sections.append(VisualRegion(
                        id=f"sec_card_{len(sections)}",
                        type="section",
                        label=label,
                        text=label,
                        x=bx,
                        y=real_y,
                        w=bw,
                        h=bh,
                        conf=90.0,
                        can_cutout=True,
                        cutout_quality="safe_crop",
                    ))

        return sections

    def _detect_graphic_shapes(
        self,
        arr: np.ndarray,
        gray: np.ndarray,
        hsv: np.ndarray,
        existing_regions: List["VisualRegion"],
        w: int,
        h: int,
    ) -> List["VisualRegion"]:
        """
        Detects meaningful graphic shapes and decorative regions:
          - Simple geometry (convertible to vector Design Lab shapes):
              * Lines and dividers (horizontal underline, vertical dividers, footer lines)
              * Pills and capsules (rounded banner containers, theme badges)
              * Rectangles and rounded cards (outlines, schedule panels)
              * Circles and ellipses (icon containers, badge emblems)
          - Complex raster artwork (extractable as PNG / image layer):
              * Brush strokes, splash artworks, and decorative color clusters
        """
        shapes: List[VisualRegion] = []
        MIN_SHAPE_AREA = int(w * h * 0.0003)  # at least 0.03% of canvas (to capture thin lines)
        MAX_SHAPE_AREA = int(w * h * 0.70)    # reject full-canvas vignettes
        MAX_SHAPES = 18

        # ── helpers ──────────────────────────────────────────────────────────
        def _dominant_color_hex(region_arr: np.ndarray) -> str:
            """Return the median/dominant color as #rrggbb."""
            try:
                if region_arr.size == 0:
                    return "#888888"
                small = cv2.resize(region_arr, (16, 16), interpolation=cv2.INTER_AREA)
                pixels = small.reshape(-1, 3)
                med = np.median(pixels, axis=0).astype(int)
                return "#{:02x}{:02x}{:02x}".format(int(med[2]), int(med[1]), int(med[0]))
            except Exception:
                return "#888888"

        def _iou(b1, b2) -> float:
            x1, y1, w1, h1 = b1
            x2, y2, w2, h2 = b2
            ix1 = max(x1, x2)
            iy1 = max(y1, y2)
            ix2 = min(x1 + w1, x2 + w2)
            iy2 = min(y1 + h1, y2 + h2)
            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
            union = w1 * h1 + w2 * h2 - inter
            return inter / max(1, union)

        candidates: List[Dict[str, Any]] = []

        # ── 1. Color-Based Segmentations (Vibrant Banners, Pills, Dividers, Artworks) ─
        # Target vibrant palettes: Yellow/Gold, Blue/Cyan, Red/Orange, Green
        color_masks = [
            ("yellow", cv2.inRange(hsv, np.array([16, 100, 120]), np.array([38, 255, 255]))),
            ("blue", cv2.inRange(hsv, np.array([95, 100, 65]), np.array([135, 255, 255]))),
            ("red", cv2.bitwise_or(
                cv2.inRange(hsv, np.array([0, 100, 80]), np.array([12, 255, 255])),
                cv2.inRange(hsv, np.array([168, 100, 80]), np.array([180, 255, 255]))
            )),
        ]

        for color_name, mask in color_masks:
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                area = cv2.contourArea(c)
                if area < 60:
                    continue
                bx, by, bw, bh = cv2.boundingRect(c)
                aspect = bw / max(bh, 1)
                peri = cv2.arcLength(c, True)
                circularity = 4 * math.pi * area / max(peri ** 2, 1)

                # A. Thin Horizontal Accent / Underline Lines
                if aspect >= 6.0 and bh <= 35 and bw >= 40:
                    label = "Church Name Underline Divider" if (by < h * 0.3) else "Footer Accent Divider Line"
                    candidates.append({
                        "box": (bx, by, bw, bh),
                        "shape": "line",
                        "label": label,
                        "is_convertible": True,
                        "area": area,
                        "stroke_width": max(1, min(bh, 6)),
                        "border_radius": 0,
                    })

                # B. Thin Vertical Divider Lines
                elif aspect <= 0.15 and bh >= 40 and bw <= 15:
                    candidates.append({
                        "box": (bx, by, bw, bh),
                        "shape": "line",
                        "label": "Vertical Divider",
                        "is_convertible": True,
                        "area": area,
                        "stroke_width": max(1, min(bw, 6)),
                        "border_radius": 0,
                    })

                # C. Rounded Banner Panels / Capsules
                elif (2.0 <= aspect <= 9.0) and bw >= 140 and (22 <= bh <= 180):
                    label = f"{color_name.title()} Rounded Panel" if color_name else "Rounded Panel"
                    candidates.append({
                        "box": (bx, by, bw, bh),
                        "shape": "pill",
                        "label": label,
                        "is_convertible": True,
                        "area": area,
                        "stroke_width": 0,
                        "border_radius": 12,
                    })

                # D. Circular Badges / Icon Containers
                elif circularity >= 0.68 and (0.75 <= aspect <= 1.35) and (25 <= bw <= 160):
                    candidates.append({
                        "box": (bx, by, bw, bh),
                        "shape": "circle",
                        "label": "Circular Badge",
                        "is_convertible": True,
                        "area": area,
                        "stroke_width": 2,
                        "border_radius": 12,
                    })

                # E. Complex Decorative Artworks / Splashes (Large, Textured)
                elif area >= 6000 and (color_name in ("blue", "red")):
                    label = f"Decorative Artwork ({color_name.title()})" if color_name else "Decorative Artwork"
                    candidates.append({
                        "box": (bx, by, bw, bh),
                        "shape": "brush_stroke",
                        "label": label,
                        "is_convertible": False,  # Raster artwork -> Extract as PNG!
                        "area": area,
                        "stroke_width": 0,
                        "border_radius": 12,
                    })

        # ── 2. Edge-Based Closed Contours (Cards, Panels, Outlined Containers) ──
        small_w, small_h = min(w, 800), min(h, 800)
        scale = small_w / w
        small_arr = cv2.resize(arr, (small_w, small_h), interpolation=cv2.INTER_AREA)
        small_gray = cv2.cvtColor(small_arr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.bilateralFilter(small_gray, 7, 50, 50)
        edges = cv2.Canny(blurred, 30, 110)
        k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (6, 6))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k_close, iterations=2)
        edge_cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in edge_cnts:
            area_s = cv2.contourArea(cnt)
            area_orig = area_s / (scale * scale)
            if area_orig < MIN_SHAPE_AREA or area_orig > MAX_SHAPE_AREA:
                continue

            bx_s, by_s, bw_s, bh_s = cv2.boundingRect(cnt)
            bx, by, bw, bh = int(bx_s / scale), int(by_s / scale), int(bw_s / scale), int(bh_s / scale)
            if bw < 10 or bh < 10:
                continue

            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            n_pts = len(approx)
            aspect = bw / max(bh, 1)

            # Check if this contour outlines a card or panel
            if (3.0 <= aspect <= 7.0) and bw >= w * 0.45 and (40 <= bh <= h * 0.18):
                candidates.append({
                    "box": (bx, by, bw, bh),
                    "shape": "rounded_rect",
                    "label": "Rounded Panel",
                    "is_convertible": True,
                    "area": area_orig,
                    "stroke_width": 2,
                    "border_radius": 12,
                })
            elif n_pts == 4 and area_orig > w * h * 0.02:
                candidates.append({
                    "box": (bx, by, bw, bh),
                    "shape": "rectangle",
                    "label": "Decorative Card Panel",
                    "is_convertible": True,
                    "area": area_orig,
                    "stroke_width": 1,
                    "border_radius": 12,
                })

        # ── 3. Tight Circular Badge Candidate Detection ───────────────────────
        # Filter for compact badges (r between 15 and 90 px in scaled space)
        circ_gray = cv2.GaussianBlur(small_gray, (7, 7), 1.5)
        detected_circles = cv2.HoughCircles(
            circ_gray,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=int(small_h * 0.06),
            param1=70,
            param2=32,
            minRadius=int(small_h * 0.02),
            maxRadius=int(small_h * 0.10),
        )
        if detected_circles is not None:
            for cx_s, cy_s, r_s in detected_circles[0]:
                cbx = int((cx_s - r_s) / scale)
                cby = int((cy_s - r_s) / scale)
                cbw = int(2 * r_s / scale)
                cbh = int(2 * r_s / scale)
                if cbw < 20 or cbw > 220:
                    continue
                cbx = max(0, min(w - cbw, cbx))
                cby = max(0, min(h - cbh, cby))
                candidates.append({
                    "box": (cbx, cby, cbw, cbh),
                    "shape": "circle",
                    "label": "Circular Badge",
                    "is_convertible": True,
                    "area": math.pi * (cbw / 2) ** 2,
                    "stroke_width": 2,
                    "border_radius": 12,
                })

        # ── 4. Saliency Ranking and Deduplication ─────────────────────────────
        # Rank by saliency: lines, pills, and high-contrast badges have priority over raw rectangles
        shape_type_weights = {
            "pill": 10,
            "line": 9,
            "circle": 8,
            "brush_stroke": 8,
            "rounded_rect": 7,
            "rectangle": 5,
        }
        candidates.sort(key=lambda c: (
            shape_type_weights.get(c["shape"], 5),
            min(c["area"], 40000)
        ), reverse=True)

        kept: List[Dict[str, Any]] = []
        for cand in candidates:
            # Check overlap against already kept candidates
            is_dup = False
            for k in kept:
                if _iou(cand["box"], k["box"]) > 0.40:
                    is_dup = True
                    break
            if not is_dup:
                kept.append(cand)
            if len(kept) >= MAX_SHAPES:
                break

        # ── 5. Build VisualRegion objects ─────────────────────────────────────
        for i, cinfo in enumerate(kept):
            bx, by, bw, bh = cinfo["box"]
            bx = max(0, min(w - 1, bx))
            by = max(0, min(h - 1, by))
            bw = max(2, min(w - bx, bw))
            bh = max(2, min(h - by, bh))

            region_arr = arr[by:by + bh, bx:bx + bw]
            fill_hex = _dominant_color_hex(region_arr)

            aspect = round(bw / max(bh, 1), 2)
            is_conv = bool(cinfo.get("is_convertible", True))

            shapes.append(VisualRegion(
                id=f"shape_{i}",
                type="graphic_shape",
                label=cinfo["label"],
                text="",
                x=bx,
                y=by,
                w=bw,
                h=bh,
                conf=88.0,
                can_cutout=True,
                cutout_quality="high" if not is_conv else "safe_crop",
                shape_geometry={
                    "shape": cinfo["shape"],
                    "is_convertible": is_conv,
                    "aspect": aspect,
                    "fill_color": fill_hex,
                    "stroke_color": fill_hex if cinfo.get("stroke_width", 0) > 0 else "transparent",
                    "stroke_width": cinfo.get("stroke_width", 0),
                    "border_radius": 12,
                    "opacity": 1.0,
                    "area_px": int(cinfo["area"]),
                },
            ))

        return shapes

    def _deduplicate_and_rank(
        self, regions: List[VisualRegion], img_w: int, img_h: int
    ) -> List[VisualRegion]:
        """
        Filters noise, removes redundant overlaps, and sorts semantically.
        """
        priority_map = {
            "logo": 10,
            "visual_group": 9,
            "subject": 8,
            "icon": 7,
            "section": 6,
            "graphic_shape": 5,
            "text_group": 4,
        }

        filtered = []
        for r in regions:
            if r.w >= img_w * 0.96 and r.h >= img_h * 0.96:
                continue
            if r.w < 14 or r.h < 14:
                continue
            filtered.append(r)

        unique: List[VisualRegion] = []
        for r in filtered:
            overlap = False
            for u in unique:
                ix1 = max(r.x, u.x)
                iy1 = max(r.y, u.y)
                ix2 = min(r.x + r.w, u.x + u.w)
                iy2 = min(r.y + r.h, u.y + u.h)
                inter_w = max(0, ix2 - ix1)
                inter_h = max(0, iy2 - iy1)
                inter_area = inter_w * inter_h
                union_area = (r.w * r.h) + (u.w * u.h) - inter_area
                iou = inter_area / max(1, union_area)

                if iou > 0.80:
                    overlap = True
                    break

            if not overlap:
                unique.append(r)

        # Sort by priority then top-to-bottom
        unique.sort(key=lambda r: (-priority_map.get(r.type, 0), r.y, r.x))
        return unique
