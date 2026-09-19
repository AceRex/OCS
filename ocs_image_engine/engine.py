"""
engine.py
=========
Main entry point for the OCS Image Engine.
Provides:
1. --analyze: Extracts event metadata, bounding boxes, colors, fonts, face crops, and text mask.
2. --generate-assets: Reconstructs clean backgrounds (original, 16:9 screen, Bible-friendly)
   and builds editable Design Studio layer trees (portrait reconstruction + 16:9 landscape).
3. --generate: Full pipeline (analyze + generate) for backward compatibility.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from utils.config import Config
from utils.image_utils import load_image, save_image
from vision.analyzer import PosterAnalyzer
from vision.inpaint import (
    build_text_mask,
    inpaint_text_regions,
    create_screen_sized_background,
    create_bible_friendly_background,
)
from vision.layout_generator import (
    generate_editable_portrait_layout,
    generate_screen_sized_landscape_design,
)
from gan.sampler import ImageSampler

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

    def analyze_poster(self, poster_path: str | Path) -> dict:
        """Run OCR, color extraction, face detection, and text mask generation."""
        t_start = time.perf_counter()
        poster_path = Path(poster_path)
        if not poster_path.exists():
            raise FileNotFoundError(f"Poster not found: {poster_path}")

        logger.info("Starting Vision Analysis Pipeline on %s", poster_path)
        analysis = self.analyzer.analyze(poster_path)
        summary = analysis.summary()

        # Save detected speaker faces
        face_paths = []
        for i, face in enumerate(analysis.faces):
            face_name = f"speaker_{i+1}.png"
            face_path = self.config.output_dir / face_name
            face.image.save(face_path)
            face_paths.append(str(face_path))
        summary["speaker_paths"] = face_paths

        # Generate and save initial text mask
        img = load_image(poster_path)
        mask = build_text_mask(img, summary.get("ocr_blocks", []))
        mask_path = self.config.output_dir / "text_mask.png"
        from PIL import Image as PILImage
        PILImage.fromarray(mask).save(mask_path)
        summary["text_mask_path"] = str(mask_path)
        summary["source_path"] = str(poster_path)
        summary["processing_time_sec"] = round(time.perf_counter() - t_start, 3)

        # Save summary JSON
        with open(self.config.output_dir / "analysis.json", "w") as f:
            json.dump(summary, f, indent=2)

        return summary

    def generate_assets(self, poster_path: str | Path, reviewed_data: dict) -> dict:
        """
        Generate clean backgrounds and editable Design Studio layer layouts
        using the reviewed and operator-corrected event metadata.
        """
        t_start = time.perf_counter()
        poster_path = Path(poster_path)
        if not poster_path.exists():
            raise FileNotFoundError(f"Poster not found: {poster_path}")

        img = load_image(poster_path)
        ocr_blocks = reviewed_data.get("ocr_blocks", [])
        protected = reviewed_data.get("protected_regions", [])

        # 1. Build text mask & inpaint text regions
        logger.info("Building text mask and inpainting clean background...")
        mask = build_text_mask(img, ocr_blocks, protected_regions=protected)

        mask_path = self.config.output_dir / "text_mask.png"
        from PIL import Image as PILImage
        PILImage.fromarray(mask).save(mask_path)

        clean_original = inpaint_text_regions(img, mask)
        clean_orig_path = self.config.output_dir / "clean_bg_original.png"
        clean_original.save(clean_orig_path)

        # 2. Generate 16:9 Screen-sized clean background
        primary_col = tuple(reviewed_data.get("primary_color") or (15, 13, 27))
        clean_screen = create_screen_sized_background(
            clean_original,
            target_width=1920,
            target_height=1080,
            primary_color=primary_col
        )
        clean_screen_path = self.config.output_dir / "clean_bg_screen.png"
        clean_screen.save(clean_screen_path)

        # 3. Generate Bible-friendly background with quiet reading area
        contrast = float(reviewed_data.get("contrast_level", 0.5))
        clean_bible = create_bible_friendly_background(
            clean_screen,
            contrast_level=contrast,
            dominant_color=primary_col
        )
        clean_bible_path = self.config.output_dir / "clean_bg_bible.png"
        clean_bible.save(clean_bible_path)

        # 4. Generate editable Design Studio layouts
        speaker_paths = reviewed_data.get("speaker_paths") or []
        layout_portrait = generate_editable_portrait_layout(
            reviewed_data,
            str(clean_orig_path),
            speaker_paths=speaker_paths
        )
        layout_landscape = generate_screen_sized_landscape_design(
            reviewed_data,
            str(clean_screen_path),
            speaker_paths=speaker_paths
        )

        with open(self.config.output_dir / "layout_portrait.json", "w") as f:
            json.dump(layout_portrait, f, indent=2)

        with open(self.config.output_dir / "layout_landscape.json", "w") as f:
            json.dump(layout_landscape, f, indent=2)

        result = {
            "success": True,
            "poster_path": str(poster_path),
            "clean_background": str(clean_orig_path),
            "clean_bg_original": str(clean_orig_path),
            "clean_background_url": f"file://{clean_orig_path}",
            "screen_sized_background": str(clean_screen_path),
            "clean_bg_screen": str(clean_screen_path),
            "screen_sized_background_url": f"file://{clean_screen_path}",
            "bible_friendly_background": str(clean_bible_path),
            "clean_bg_bible": str(clean_bible_path),
            "bible_friendly_background_url": f"file://{clean_bible_path}",
            "text_mask": str(mask_path),
            "text_mask_url": f"file://{mask_path}",
            "speakers": speaker_paths,
            "portrait_layout": layout_portrait,
            "layout_portrait": layout_portrait,
            "landscape_layout": layout_landscape,
            "layout_landscape": layout_landscape,
            "generated_files": {
                "backgrounds": [str(clean_orig_path), str(clean_screen_path), str(clean_bible_path)],
                "lower_thirds": [],
                "speakers": speaker_paths,
            },
            "processing_time_sec": round(time.perf_counter() - t_start, 3),
        }

        with open(self.config.output_dir / "suggestions.json", "w") as f:
            json.dump(result, f, indent=2)

        return result

    def generate(self, poster_path: str | Path) -> dict:
        """Full automated pipeline: Analyze -> Generate assets."""
        analysis_summary = self.analyze_poster(poster_path)
        assets = self.generate_assets(poster_path, analysis_summary)
        return {**analysis_summary, **assets}


def main():
    parser = argparse.ArgumentParser(description="wave.io AI Design Lab Engine")

    # Modes
    parser.add_argument("--analyze", help="Analyze event poster and return structured metadata")
    parser.add_argument("--generate-assets", help="Generate clean backgrounds and editable layouts for poster")
    parser.add_argument("--review", help="Path to reviewed metadata JSON or JSON string")
    parser.add_argument("--generate", help="Full pipeline (Analyze + Generate)")

    # Global overrides
    parser.add_argument("--out", help="Output directory override")

    args = parser.parse_args()
    config_overrides = {}
    if args.out:
        config_overrides["output_dir"] = Path(args.out)

    try:
        engine = OCSImageEngine(config_overrides)

        if args.analyze:
            result = engine.analyze_poster(args.analyze)
            print(json.dumps(result, indent=2))

        elif args.generate_assets:
            reviewed = {}
            if args.review:
                rev_path = Path(args.review)
                if rev_path.exists():
                    with open(rev_path, "r") as f:
                        reviewed = json.load(f)
                else:
                    try:
                        reviewed = json.loads(args.review)
                    except Exception:
                        reviewed = {}
            if not reviewed:
                # If review not passed, run fast analysis first to populate defaults
                reviewed = engine.analyze_poster(args.generate_assets)

            result = engine.generate_assets(args.generate_assets, reviewed)
            print(json.dumps(result, indent=2))

        elif args.generate:
            result = engine.generate(args.generate)
            print(json.dumps(result, indent=2))

        else:
            parser.print_help()

    except Exception as e:
        logger.error("Engine failed: %s", e, exc_info=True)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
