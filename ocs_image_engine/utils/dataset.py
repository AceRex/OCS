"""
utils/dataset.py
================
Dataset classes for training the OCS Image Engine.
"""

import os
from pathlib import Path
from PIL import Image
import torch
from torch.utils.data import Dataset
from torchvision import transforms

from gan.generator import build_condition_vector
from utils.image_utils import pil_to_tensor

class GANDataset(Dataset):
    """
    Dataset for training GANs.
    Expects a directory with 'posters' and 'targets' (backgrounds or lower-thirds).
    Or can derive conditioning from posters on the fly if analysis is provided.
    """
    def __init__(self, data_dir: Path, analyzer, target_type="background"):
        self.data_dir = data_dir
        self.analyzer = analyzer
        self.target_type = target_type
        
        # In a real scenario, you'd have pairs. 
        # For this local engine, we'll assume the data_dir contains subdirectories by theme,
        # and we use the same image as both source (for analysis) and target (for training).
        # This is a 'self-supervised' style for texture learning.
        self.image_paths = []
        # Check subdirectories (themes)
        for theme_dir in data_dir.iterdir():
            if theme_dir.is_dir():
                self.image_paths.extend(list(theme_dir.glob("*.jpg")) + list(theme_dir.glob("*.png")))
        
        # Also check the base directory for convenience
        self.image_paths.extend(list(data_dir.glob("*.jpg")) + list(data_dir.glob("*.png")))
        
        self.transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
        ])

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        path = self.image_paths[idx]
        img = Image.open(path).convert("RGB")
        
        # 1. Analyze to get conditioning
        # In a real training loop, you might pre-analyze and cache this.
        analysis = self.analyzer.analyze(img)
        
        condition = build_condition_vector(
            primary_color=analysis.primary_color,
            secondary_color=analysis.secondary_color,
            background_color=analysis.background_suggestion,
            theme=analysis.theme,
            mood=analysis.mood
        ).squeeze(0) # (25,)
        
        # 2. Prepare target
        # If training background GAN, we use the image (or a stylized version).
        # For this engine, we'll just use the resized image as the 'ideal' target.
        target = self.transform(img)
        
        return condition, target

class ClassifierDataset(Dataset):
    """Dataset for training the theme classifier."""
    def __init__(self, data_dir: Path, theme_labels: list[str], input_size=224):
        self.data_dir = data_dir
        self.theme_labels = theme_labels
        self.samples = []
        
        for i, theme in enumerate(theme_labels):
            theme_path = data_dir / theme
            if theme_path.exists():
                for img_p in theme_path.glob("*"):
                    if img_p.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                        self.samples.append((img_p, i))
        
        self.transform = transforms.Compose([
            transforms.Resize((input_size, input_size)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        return self.transform(img), label
