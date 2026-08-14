"""
vision/face_detector.py
=======================
Detects faces (speakers/ministers) in posters and crops them for separate use.
Uses OpenCV Haar Cascades for local, offline detection.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("ocs.face")

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
        # Load the pre-trained Haar Cascade for face detection
        # We try to find it in common opencv locations
        self.face_cascade = self._load_cascade()

    def _load_cascade(self):
        # Try to find the xml file in the library paths
        import os
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
        
        logger.warning("Haar cascade file not found. Face detection will be disabled.")
        return None

    def detect_and_crop(self, pil_img: Image.Image) -> List[FaceRegion]:
        """Detect faces and return cropped regions."""
        if self.face_cascade is None or self.face_cascade.empty():
            return []

        # Convert to grayscale for Haar
        cv_img = np.array(pil_img.convert("RGB"))
        gray = cv2.cvtColor(cv_img, cv2.COLOR_RGB2GRAY)
        
        # Detect faces
        # scaleFactor: how much image size is reduced at each scale
        # minNeighbors: how many neighbors each candidate rectangle should have to retain it
        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(100, 100))
        
        results = []
        for (x, y, w, h) in faces:
            # Add a bit of padding for the 'speaker' crop
            pad_w = int(w * 0.2)
            pad_h = int(h * 0.4) # More padding at bottom for shoulders
            
            x1 = max(0, x - pad_w)
            y1 = max(0, y - pad_h)
            x2 = min(pil_img.width, x + w + pad_w)
            y2 = min(pil_img.height, y + h + pad_h)
            
            crop = pil_img.crop((x1, y1, x2, y2))
            results.append(FaceRegion(
                x=x1, y=y1, w=x2-x1, h=y2-y1,
                confidence=1.0, # Haar doesn't give easy confidence
                image=crop
            ))
            
        logger.info("Detected %d faces in poster", len(results))
        return results
