"""
vision/classifier.py
====================
Theme classification using a CNN (ResNet18 backbone).
Detects event types: religious, corporate, concert, etc.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

from utils.config import Config

logger = logging.getLogger("ocs.classifier")

class ThemeClassifierModel(nn.Module):
    """MobileNet-inspired depthwise separable CNN as per TECHNICAL_DOCS.md."""
    def __init__(self, num_classes: int):
        super().__init__()
        def ds_block(in_ch, out_ch, stride=1):
            return nn.Sequential(
                nn.Conv2d(in_ch, in_ch, 3, stride, 1, groups=in_ch, bias=False),
                nn.BatchNorm2d(in_ch),
                nn.ReLU(inplace=True),
                nn.Conv2d(in_ch, out_ch, 1, 1, 0, bias=False),
                nn.BatchNorm2d(out_ch),
                nn.ReLU(inplace=True)
            )

        self.model = nn.Sequential(
            nn.Conv2d(3, 32, 3, 2, 1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            ds_block(32, 64),
            ds_block(64, 128, 2),
            ds_block(128, 128),
            ds_block(128, 256, 2),
            ds_block(256, 256),
            ds_block(256, 512, 2),
            ds_block(512, 512),
            ds_block(512, 1024, 2),
            ds_block(1024, 1024),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(0.2),
            nn.Linear(1024, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, num_classes)
        )

    def forward(self, x):
        return self.model(x)

class ThemeClassifier:
    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() or config.device == "mps" else "cpu")
        
        # Initialise custom architecture from docs
        self.model = ThemeClassifierModel(len(config.theme_labels))
        
        # Load weights if available
        weights_path = Path(config.classifier_weights)
        if weights_path.exists():
            logger.info("Loading classifier weights from %s", weights_path)
            self.model.load_state_dict(torch.load(weights_path, map_location=self.device))
        else:
            logger.warning("No classifier weights found at %s — using untrained model", weights_path)
            
        self.model.to(self.device)
        self.model.eval()
        
        self.transform = transforms.Compose([
            transforms.Resize((config.classifier_input_size, config.classifier_input_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

    @torch.no_grad()
    def predict(self, img: Image.Image, top_k: int = 3) -> list[dict]:
        """Predict theme of the poster."""
        input_tensor = self.transform(img).unsqueeze(0).to(self.device)
        outputs = self.model(input_tensor)
        probs = torch.nn.functional.softmax(outputs, dim=1)[0]
        
        top_probs, top_idxs = torch.topk(probs, min(top_k, len(self.config.theme_labels)))
        
        results = []
        for prob, idx in zip(top_probs, top_idxs):
            results.append({
                "theme": self.config.theme_labels[idx.item()],
                "confidence": float(prob.item())
            })
            
        return results
