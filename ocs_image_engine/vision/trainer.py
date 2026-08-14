"""
vision/trainer.py
=================
Training loop for the Theme Classifier CNN.
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm
from pathlib import Path

from utils.config import Config
from vision.classifier import ThemeClassifierModel

class ClassifierTrainer:
    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() or config.device == "mps" else "cpu")
        
        self.model = ThemeClassifierModel(len(config.theme_labels)).to(self.device)
        self.optimizer = optim.Adam(self.model.parameters(), lr=1e-4)
        self.criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    def train(self, dataloader: DataLoader, epochs: int):
        self.model.train()
        for epoch in range(epochs):
            loop = tqdm(dataloader, leave=True)
            total_loss = 0
            correct = 0
            total = 0
            
            for images, labels in loop:
                images, labels = images.to(self.device), labels.to(self.device)
                
                self.optimizer.zero_grad()
                outputs = self.model(images)
                loss = self.criterion(outputs, labels)
                loss.backward()
                self.optimizer.step()
                
                total_loss += loss.item()
                _, predicted = outputs.max(1)
                total += labels.size(0)
                correct += predicted.eq(labels).sum().item()
                
                loop.set_description(f"Epoch [{epoch}/{epochs}]")
                loop.set_postfix(loss=f"{loss.item():.4f}", acc=f"{100.*correct/total:.2f}%")
                
            # Save checkpoint
            if (epoch + 1) % 10 == 0 or (epoch + 1) == epochs:
                save_path = Path(self.config.classifier_weights)
                save_path.parent.mkdir(parents=True, exist_ok=True)
                torch.save(self.model.state_dict(), save_path)
                print(f"\nSaved classifier weights to {save_path}")
