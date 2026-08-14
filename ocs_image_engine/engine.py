"""
engine.py
=========
Main entry point for the OCS Image Engine.
Rebuilt based on TECHNICAL_DOCS.md specifications.
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from utils.config import Config
from vision.analyzer import PosterAnalyzer
from gan.sampler import ImageSampler
from gan.trainer import GANTrainer
from vision.trainer import ClassifierTrainer
from utils.dataset import GANDataset, ClassifierDataset

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger("ocs.engine")

class OCSImageEngine:
    def __init__(self, config_overrides: dict = None):
        self.config = Config()
        if config_overrides:
            for k, v in config_overrides.items():
                if hasattr(self.config, k):
                    setattr(self.config, k, v)
        
        # Ensure directories exist
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        self.config.models_dir.mkdir(parents=True, exist_ok=True)
        
        self.analyzer = PosterAnalyzer(self.config)
        self.sampler = ImageSampler(self.config)

    def generate(self, poster_path: str | Path) -> dict:
        """Full inference pipeline: Analyze -> Generate."""
        t_start = time.perf_counter()
        poster_path = Path(poster_path)
        
        if not poster_path.exists():
            raise FileNotFoundError(f"Poster not found: {poster_path}")

        logger.info("Starting Vision Pipeline...")
        analysis = self.analyzer.analyze(poster_path)
        
        logger.info("Starting GAN Pipeline...")
        results = self.sampler.generate_suggestions(analysis)
        
        # Save detected faces (speakers)
        face_paths = []
        for i, face in enumerate(analysis.faces):
            face_name = f"speaker_{i+1}.png"
            face_path = self.config.output_dir / face_name
            face.image.save(face_path)
            face_paths.append(str(face_path))

        summary = {
            **analysis.summary(),
            "generated_files": {
                "backgrounds": [str(p) for p in results["backgrounds"]],
                "lower_thirds": [str(p) for p in results["lower_thirds"]],
                "speakers": face_paths
            }
        }
        summary["processing_time_sec"] = round(time.perf_counter() - t_start, 3)
        
        output_json = self.config.output_dir / "suggestions.json"
        with open(output_json, "w") as f:
            json.dump(summary, f, indent=4)
            
        logger.info("Inference complete in %.2fs", summary["processing_time_sec"])
        return summary

    def train_classifier(self, epochs: int):
        """Train the theme classifier CNN."""
        logger.info("Preparing data for Theme Classifier training...")
        dataset = ClassifierDataset(
            data_dir=self.config.data_dir,
            theme_labels=self.config.theme_labels,
            input_size=self.config.classifier_input_size
        )
        if len(dataset) == 0:
            logger.error("No training data found in %s", self.config.data_dir)
            return

        dataloader = DataLoader(dataset, batch_size=16, shuffle=True)
        trainer = ClassifierTrainer(self.config)
        trainer.train(dataloader, epochs)

    def train_gan(self, target: str, epochs: int):
        """Train the specified GAN (background or lower_third)."""
        logger.info("Preparing data for %s GAN training...", target)
        dataset = GANDataset(
            data_dir=self.config.data_dir,
            analyzer=self.analyzer,
            target_type=target
        )
        if len(dataset) == 0:
            logger.error("No training data found in %s", self.config.data_dir)
            return

        dataloader = DataLoader(dataset, batch_size=8, shuffle=True)
        self.config.gan_epochs = epochs # Override config
        
        trainer = GANTrainer(self.config)
        trainer.train(dataloader)

def main():
    parser = argparse.ArgumentParser(description="OCS Image Engine - Local Neural Design Lab")
    
    # Inference
    parser.add_argument("--generate", help="Path to the event poster image for generation")
    
    # Training
    parser.add_argument("--train-classifier", action="store_true", help="Train the theme classifier")
    parser.add_argument("--train-gan", choices=["background", "lower_third"], help="Train a GAN model")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    
    # Global overrides
    parser.add_argument("--out", help="Output directory override")
    
    args = parser.parse_args()
    config_overrides = {}
    if args.out:
        config_overrides["output_dir"] = Path(args.out)

    try:
        engine = OCSImageEngine(config_overrides)
        
        if args.generate:
            result = engine.generate(args.generate)
            print(json.dumps(result, indent=2))
            
        elif args.train_classifier:
            engine.train_classifier(args.epochs)
            
        elif args.train_gan:
            engine.train_gan(args.train_gan, args.epochs)
            
        else:
            parser.print_help()
            
    except Exception as e:
        logger.error("Engine failed: %s", e)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
