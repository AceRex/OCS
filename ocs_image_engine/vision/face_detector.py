"""
vision/face_detector.py
=======================
Detects faces (speakers/ministers) in posters and crops them for separate use.
Uses OpenCV YuNet ONNX detector for high-accuracy local offline detection,
with graceful fallback to Haar Cascades.
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("ocs.face")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models" / "person"
YUNET_PATH = MODELS_DIR / "face_detection_yunet.onnx"

@dataclass
class FaceRegion:
    x: int
    y: int
    w: int
    h: int
    confidence: float
    image: Image.Image # The cropped face image

class FaceDetector:
    def __init__(self):
        self.yunet_path = str(YUNET_PATH)
        self.face_cascade = self._load_cascade()

    def _load_cascade(self):
        cv2_base = os.path.dirname(cv2.__file__)
        paths = [
            os.path.join(cv2_base, 'data', 'haarcascade_frontalface_default.xml'),
            '/usr/local/share/opencv4/haarcascades/haarcascade_frontalface_default.xml',
            '/opt/homebrew/share/opencv4/haarcascades/haarcascade_frontalface_default.xml'
        ]
        
        for p in paths:
            if os.path.exists(p):
                logger.info("Loaded face cascade from %s", p)
                return cv2.CascadeClassifier(p)
        return None

    def detect_and_crop(self, pil_img: Image.Image) -> List[FaceRegion]:
        """Detect faces and return cropped regions."""
        cv_img = np.array(pil_img.convert("RGB"))
        h, w, _ = cv_img.shape

        # Try YuNet first (high accuracy, small 232KB ONNX, handles diverse skin tones & angles)
        if os.path.exists(self.yunet_path):
            try:
                detector = cv2.FaceDetectorYN.create(
                    self.yunet_path,
                    "",
                    (w, h),
                    score_threshold=0.45,
                    nms_threshold=0.3
                )
                _, raw_faces = detector.detect(cv_img)
                if raw_faces is not None and len(raw_faces) > 0:
                    results = []
                    for f in raw_faces:
                        fx, fy, fw, fh = int(f[0]), int(f[1]), int(f[2]), int(f[3])
                        conf = float(f[-1])
                        
                        pad_w = int(fw * 0.2)
                        pad_h = int(fh * 0.4)
                        x1 = max(0, fx - pad_w)
                        y1 = max(0, fy - pad_h)
                        x2 = min(w, fx + fw + pad_w)
                        y2 = min(h, fy + fh + pad_h)

                        crop = pil_img.crop((x1, y1, x2, y2))
                        results.append(FaceRegion(
                            x=x1, y=y1, w=x2 - x1, h=y2 - y1,
                            confidence=conf,
                            image=crop
                        ))
                    logger.info("YuNet detected %d faces in poster", len(results))
                    return results
            except Exception as e:
                logger.warning("YuNet face detection failed: %s, falling back to Haar", e)

        # Fallback to Haar Cascade
        if self.face_cascade is not None and not self.face_cascade.empty():
            gray = cv2.cvtColor(cv_img, cv2.COLOR_RGB2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
            results = []
            for (x, y, fw, fh) in faces:
                pad_w = int(fw * 0.2)
                pad_h = int(fh * 0.4)
                x1 = max(0, x - pad_w)
                y1 = max(0, y - pad_h)
                x2 = min(w, x + fw + pad_w)
                y2 = min(h, y + fh + pad_h)
                crop = pil_img.crop((x1, y1, x2, y2))
                results.append(FaceRegion(
                    x=x1, y=y1, w=x2 - x1, h=y2 - y1,
                    confidence=0.85,
                    image=crop
                ))
            logger.info("Haar detected %d faces in poster", len(results))
            return results

        return []
