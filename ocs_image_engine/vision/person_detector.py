"""
vision/person_detector.py
=========================
Detects and separates individual PERSON INSTANCES in event flyers and posters.

Architecture:
- PASS 1 (Fast Anchor & Upper Body Geometry):
  Uses ultra-lightweight YuNet ONNX face anchor detection (3ms, 232KB) +
  anatomical upper-body, hair/headwear, clothing, and neighbor partitioning.
- PASS 2 (Instance Segmentation & Cutout):
  Uses LRASPP MobileNetV3 (12MB) or GrabCut contour refinement to produce
  independent transparent PNG cutouts preserving hair, clothing, and body contours
  without neighbor leakage.
"""

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("ocs.person")

# Model paths
MODELS_DIR = Path(__file__).resolve().parent.parent / "models" / "person"
YUNET_MODEL_PATH = MODELS_DIR / "face_detection_yunet.onnx"

@dataclass
class PersonInstance:
    id: str
    label: str
    x: int
    y: int
    w: int
    h: int
    norm_x: float
    norm_y: float
    norm_w: float
    norm_h: float
    confidence: float
    face_anchor: Optional[Dict[str, int]] = None
    group_id: Optional[str] = None
    group_label: Optional[str] = None
    related_text: List[str] = field(default_factory=list)
    related_ocr_blocks: List[int] = field(default_factory=list)

class PersonDetector:
    def __init__(self, yunet_path: Optional[str] = None):
        self.yunet_path = str(yunet_path or YUNET_MODEL_PATH)
        self.seg_model = None
        self._seg_model_loaded = False

    def detect_person_instances(
        self,
        image: Image.Image,
        ocr_blocks: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[List[PersonInstance], List[Dict[str, Any]]]:
        """
        Detects individual person instances and people groups.
        Returns:
            (person_instances, people_groups)
        """
        cv_img = np.array(image.convert("RGB"))
        h, w, _ = cv_img.shape

        # Step 1: Detect Face Anchors using YuNet
        faces = self._detect_faces_yunet(cv_img, w, h)
        if not faces:
            logger.info("YuNet detected 0 faces, attempting Haar fallback...")
            faces = self._detect_faces_haar(cv_img)

        if not faces:
            logger.info("No face anchors detected.")
            return [], []

        logger.info("Detected %d face anchors in flyer", len(faces))

        # Step 2: Group faces into horizontal rows / compositional groups
        rows = self._cluster_faces_into_rows(faces, h)

        person_instances: List[PersonInstance] = []
        people_groups: List[Dict[str, Any]] = []

        total_person_counter = 1

        for row_idx, r in enumerate(rows):
            faces_in_row = r["faces"]
            faces_in_row.sort(key=lambda f: f["cx"])

            # Infer group naming based on position/size
            avg_cy = r["avg_cy"]
            avg_fh = sum(f["h"] for f in faces_in_row) / len(faces_in_row)

            if row_idx == 0 and len(faces_in_row) <= 6 and avg_fh > 40:
                group_name = "Speakers"
                person_prefix = "Speaker"
            elif avg_cy > h * 0.45 or len(faces_in_row) >= 6:
                group_name = "Panelists"
                person_prefix = "Panelist"
            else:
                group_name = f"People Group {row_idx + 1}"
                person_prefix = f"Person"

            group_id = f"group_{group_name.lower().replace(' ', '_')}"

            # Calculate natural vertical span for this row of people
            # Top: hair and headwear extends approx 0.45 * fh above face
            min_top = max(0, int(min(f["y"] - f["h"] * 0.45 for f in faces_in_row)))
            
            # Bottom: Upper torso / body extends approx 2.8 - 3.8 * fh below eye level,
            # or bounded before the next text/card section
            if "Speakers" in group_name:
                row_bottom = min(h, int(avg_cy + avg_fh * 3.4))
            else:
                row_bottom = min(h, int(avg_cy + avg_fh * 3.6))

            row_person_ids = []

            for p_idx, f in enumerate(faces_in_row):
                cx, cy = f["cx"], f["cy"]
                fw, fh = f["w"], f["h"]

                top = max(0, int(f["y"] - fh * 0.45))
                bottom = row_bottom

                # Horizontal boundaries: partition cleanly between adjacent neighbors
                if len(faces_in_row) == 1:
                    pad = int(fw * 1.5)
                    left = max(0, cx - pad)
                    right = min(w, cx + pad)
                elif p_idx == 0:
                    # First person on left
                    next_cx = faces_in_row[1]["cx"]
                    span = next_cx - cx
                    left = max(0, int(cx - span * 0.5))
                    right = min(w, int(cx + span * 0.5))
                elif p_idx == len(faces_in_row) - 1:
                    # Last person on right
                    prev_cx = faces_in_row[p_idx - 1]["cx"]
                    span = cx - prev_cx
                    left = max(0, int(cx - span * 0.5))
                    right = min(w, int(cx + span * 0.5))
                else:
                    # Middle person
                    prev_cx = faces_in_row[p_idx - 1]["cx"]
                    next_cx = faces_in_row[p_idx + 1]["cx"]
                    left = max(0, int(cx - (cx - prev_cx) * 0.5))
                    right = min(w, int(cx + (next_cx - cx) * 0.5))

                box_w = max(10, right - left)
                box_h = max(10, bottom - top)

                person_id = f"person_{group_name.lower().replace(' ', '_')}_{p_idx + 1}"
                person_label = f"{person_prefix} Person {p_idx + 1}"
                row_person_ids.append(person_id)

                # Associate OCR text blocks immediately underneath person
                related_texts = []
                related_block_indices = []
                if ocr_blocks:
                    for b_idx, block in enumerate(ocr_blocks):
                        bx = block.get("x", 0)
                        by = block.get("y", 0)
                        bw = block.get("w", 0)
                        bh = block.get("h", 0)
                        bcx = bx + bw / 2
                        
                        # Check if text is directly underneath person within horizontal range
                        if (left - 25) <= bcx <= (right + 25):
                            # Text located near chest/card label level down to 120px below person bottom
                            if (cy + fh * 0.8) <= by <= (bottom + 120):
                                txt = block.get("text", "").strip()
                                if txt and len(txt) > 2:
                                    related_texts.append(txt)
                                    related_block_indices.append(b_idx)

                instance = PersonInstance(
                    id=person_id,
                    label=person_label,
                    x=left,
                    y=top,
                    w=box_w,
                    h=box_h,
                    norm_x=round((left / w) * 100, 2),
                    norm_y=round((top / h) * 100, 2),
                    norm_w=round((box_w / w) * 100, 2),
                    norm_h=round((box_h / h) * 100, 2),
                    confidence=round(f["score"] * 100, 1),
                    face_anchor={
                        "x": f["x"],
                        "y": f["y"],
                        "w": f["w"],
                        "h": f["h"],
                        "cx": cx,
                        "cy": cy
                    },
                    group_id=group_id,
                    group_label=f"{group_name} Group",
                    related_text=related_texts,
                    related_ocr_blocks=related_block_indices
                )
                person_instances.append(instance)
                total_person_counter += 1

            # Build Group Bounding Box
            if faces_in_row:
                grp_left = min(pi.x for pi in person_instances if pi.group_id == group_id)
                grp_top = min(pi.y for pi in person_instances if pi.group_id == group_id)
                grp_right = max(pi.x + pi.w for pi in person_instances if pi.group_id == group_id)
                grp_bottom = max(pi.y + pi.h for pi in person_instances if pi.group_id == group_id)
                grp_w = grp_right - grp_left
                grp_h = grp_bottom - grp_top

                people_groups.append({
                    "id": group_id,
                    "type": "visual_group",
                    "label": f"{group_name} Group ({len(faces_in_row)} People)",
                    "x": grp_left,
                    "y": grp_top,
                    "w": grp_w,
                    "h": grp_h,
                    "norm_x": round((grp_left / w) * 100, 2),
                    "norm_y": round((grp_top / h) * 100, 2),
                    "norm_w": round((grp_w / w) * 100, 2),
                    "norm_h": round((grp_h / h) * 100, 2),
                    "child_ids": row_person_ids,
                    "people_count": len(faces_in_row)
                })

        return person_instances, people_groups

    def extract_person_cutout(
        self,
        image: Image.Image,
        person: PersonInstance,
        use_neural_seg: bool = True
    ) -> Image.Image:
        """
        Extracts an individual person instance as a high-quality transparent RGBA PNG.
        Preserves hair, clothing, shoulders, and arms without neighbor leakage.
        """
        cv_img = np.array(image.convert("RGB"))
        img_h, img_w, _ = cv_img.shape

        px = person.get("x", 0) if isinstance(person, dict) else getattr(person, "x", 0)
        py = person.get("y", 0) if isinstance(person, dict) else getattr(person, "y", 0)
        pw = person.get("w", 0) if isinstance(person, dict) else getattr(person, "w", 0)
        ph = person.get("h", 0) if isinstance(person, dict) else getattr(person, "h", 0)

        crop_x = max(0, px)
        crop_y = max(0, py)
        crop_w = min(img_w - crop_x, pw)
        crop_h = min(img_h - crop_y, ph)

        crop = cv_img[crop_y : crop_y + crop_h, crop_x : crop_x + crop_w]
        if crop.size == 0:
            return Image.new("RGBA", (1, 1), (0, 0, 0, 0))

        mask = None

        # PASS 2: Neural Segmentation if enabled
        if use_neural_seg:
            try:
                mask = self._run_neural_segmentation(crop)
            except Exception as e:
                logger.warning("Neural segmentation failed, falling back to GrabCut: %s", e)

        # Fallback to GrabCut / Skin & Contour matting
        if mask is None:
            mask = self._run_grabcut_matting(crop, person, crop_w, crop_h)

        # Antialias alpha mask with 5x5 Gaussian feathering
        mask_blurred = cv2.GaussianBlur(mask, (5, 5), 1.2)

        # Merge RGB with Alpha
        r, g, b = cv2.split(crop)
        rgba = cv2.merge([r, g, b, mask_blurred])
        return Image.fromarray(rgba, mode="RGBA")

    def _run_neural_segmentation(self, crop: np.ndarray) -> np.ndarray:
        """Runs LRASPP MobileNetV3 Large on crop to generate person mask."""
        import torch
        import torchvision.models.segmentation as seg
        import torchvision.transforms.functional as TF

        if not self._seg_model_loaded:
            self.seg_model = seg.lraspp_mobilenet_v3_large(weights='DEFAULT')
            self.seg_model.eval()
            self._seg_model_loaded = True

        pil_crop = Image.fromarray(crop)
        tensor = TF.to_tensor(pil_crop).unsqueeze(0)
        tensor = TF.normalize(tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])

        with torch.no_grad():
            out = self.seg_model(tensor)['out']

        # COCO / VOC Class 15 is Person
        pred = out[0].argmax(0).byte().cpu().numpy()
        person_mask = (pred == 15).astype(np.uint8) * 255
        
        # If neural mask captured meaningful pixels (> 5% of crop), return it
        if np.sum(person_mask == 255) > (crop.shape[0] * crop.shape[1] * 0.05):
            return person_mask
        
        return None

    def _run_grabcut_matting(self, crop: np.ndarray, person: PersonInstance, cw: int, ch: int) -> np.ndarray:
        """Fast fallback matting using face foreground anchors and GrabCut."""
        mask = np.full((ch, cw), cv2.GC_PR_BGD, dtype=np.uint8)
        mask[:, 0:2] = cv2.GC_BGD
        mask[:, cw-2:cw] = cv2.GC_BGD

        px = person.get("x", 0) if isinstance(person, dict) else getattr(person, "x", 0)
        py = person.get("y", 0) if isinstance(person, dict) else getattr(person, "y", 0)
        fa = person.get("face_anchor", {}) if isinstance(person, dict) else getattr(person, "face_anchor", {})
        if fa:
            rel_fx = max(0, fa["x"] - px)
            rel_fy = max(0, fa["y"] - py)
            rel_fw = min(cw - rel_fx, fa["w"])
            rel_fh = min(ch - rel_fy, fa["h"])

            # Face center as definite foreground
            mask[rel_fy + 5 : rel_fy + rel_fh - 5, rel_fx + 5 : rel_fx + rel_fw - 5] = cv2.GC_FGD
            # Torso below face as probable foreground
            mask[rel_fy + rel_fh : ch - 5, max(0, rel_fx - int(rel_fw * 0.3)) : min(cw, rel_fx + int(rel_fw * 1.3))] = cv2.GC_PR_FGD

        bgdModel = np.zeros((1, 65), np.float64)
        fgdModel = np.zeros((1, 65), np.float64)

        try:
            cv2.grabCut(crop, mask, None, bgdModel, fgdModel, 2, cv2.GC_INIT_WITH_MASK)
            fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
            return fg
        except Exception:
            return np.full((ch, cw), 255, dtype=np.uint8)

    def _detect_faces_yunet(self, cv_img: np.ndarray, w: int, h: int) -> List[Dict[str, Any]]:
        """Runs YuNet ONNX face detector with 0.45 score threshold."""
        if not os.path.exists(self.yunet_path):
            return []

        try:
            detector = cv2.FaceDetectorYN.create(
                self.yunet_path,
                "",
                (w, h),
                score_threshold=0.45,
                nms_threshold=0.3
            )
            _, raw_faces = detector.detect(cv_img)
            if raw_faces is None:
                return []

            results = []
            for f in raw_faces:
                fx, fy, fw, fh = int(f[0]), int(f[1]), int(f[2]), int(f[3])
                score = float(f[-1])
                results.append({
                    "x": fx, "y": fy, "w": fw, "h": fh,
                    "cx": fx + fw // 2, "cy": fy + fh // 2,
                    "score": score
                })
            return results
        except Exception as e:
            logger.error("YuNet detection error: %s", e)
            return []

    def _detect_faces_haar(self, cv_img: np.ndarray) -> List[Dict[str, Any]]:
        """Haar cascade fallback."""
        gray = cv2.cvtColor(cv_img, cv2.COLOR_RGB2GRAY)
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        if not os.path.exists(cascade_path):
            return []
        
        cas = cv2.CascadeClassifier(cascade_path)
        raw = cas.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
        results = []
        for (x, y, w, h) in raw:
            results.append({
                "x": int(x), "y": int(y), "w": int(w), "h": int(h),
                "cx": int(x + w // 2), "cy": int(y + h // 2),
                "score": 0.85
            })
        return results

    def _cluster_faces_into_rows(self, faces: List[Dict[str, Any]], img_h: int) -> List[Dict[str, Any]]:
        """Clusters faces into horizontal bands (rows) with similar vertical alignment."""
        sorted_by_y = sorted(faces, key=lambda f: f["cy"])
        rows: List[Dict[str, Any]] = []

        for f in sorted_by_y:
            matched = False
            for r in rows:
                if abs(r["avg_cy"] - f["cy"]) < (img_h * 0.10): # Within 10% height
                    r["faces"].append(f)
                    r["avg_cy"] = sum(x["cy"] for x in r["faces"]) / len(r["faces"])
                    matched = True
                    break
            if not matched:
                rows.append({"avg_cy": f["cy"], "faces": [f]})

        # Sort rows top-to-bottom
        rows.sort(key=lambda r: r["avg_cy"])
        return rows
