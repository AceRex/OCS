"""
gan/sampler.py
==============
Inference logic for the OCS Image Engine.
Generates backgrounds and lower thirds from PosterAnalysis metadata.
"""

from __future__ import annotations

import logging
import torch
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw

from utils.config import Config
from utils.image_utils import (
    tensor_to_pil, 
    pil_to_tensor, 
    upscale, 
    apply_blur, 
    apply_vignette, 
    color_grade, 
    sharpen,
    center_crop
)
from gan.generator import UNetGenerator, build_condition_vector
from vision.analyzer import PosterAnalysis

logger = logging.getLogger("ocs.sampler")

class ImageSampler:
    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() or config.device == "mps" else "cpu")
        
        self.gen = UNetGenerator(
            latent_dim=config.gan_latent_dim,
            condition_dim=UNetGenerator.CONDITION_DIM,
            base_features=config.gen_base_features
        ).to(self.device)
        
        self.gen.eval()
        
        # Load weights if available
        weights_path = config.models_dir / "background" / "gan_final.pth"
        if weights_path.exists():
            try:
                self.gen.load_state_dict(torch.load(weights_path, map_location=self.device))
                logger.info("Loaded GAN weights from %s", weights_path)
            except Exception as e:
                logger.warning("Failed to load GAN weights: %s", e)
        else:
            logger.warning("No GAN weights found at %s — using random initialization", weights_path)

    @torch.no_grad()
    def generate_suggestions(self, analysis: PosterAnalysis) -> dict[str, list[Path]]:
        """Generate multiple variants of backgrounds and lower thirds."""
        logger.info("Sampling suggestions from GAN")
        
        # 1. Build conditioning vector from analysis metadata
        condition = build_condition_vector(
            primary_color=analysis.primary_color or (100, 100, 100),
            secondary_color=analysis.secondary_color or (50, 50, 50),
            background_color=analysis.background_suggestion or (20, 20, 20),
            theme=analysis.theme,
            mood=analysis.mood
        ).to(self.device)
        
        backgrounds = []
        lower_thirds = []
        
        # 2. Generate variants
        for i in range(max(self.config.num_background_suggestions, self.config.num_lower_third_suggestions)):
            # Sample random noise z (vector of size 128)
            z = torch.randn(1, self.config.gan_latent_dim).to(self.device)
            
            # Generate image
            fake_out = self.gen(z, condition)
            raw_img = tensor_to_pil(fake_out[0])
            
            # Post-process to Background
            if i < self.config.num_background_suggestions:
                bg = self._post_process_background(raw_img, analysis)
                path = self.config.output_dir / f"background_{i+1}.png"
                bg.save(path)
                backgrounds.append(path)
                
            # Post-process to Lower Third
            if i < self.config.num_lower_third_suggestions:
                lt = self._post_process_lower_third(raw_img, analysis, variant_index=i)
                path = self.config.output_dir / f"lower_third_{i+1}.png"
                lt.save(path)
                lower_thirds.append(path)
                
        return {
            "backgrounds": backgrounds,
            "lower_thirds": lower_thirds
        }

    def _post_process_background(self, img: Image.Image, analysis: PosterAnalysis) -> Image.Image:
        """Apply high-quality procedural effects to make the result look 'perfect'."""
        # 1. Start with a beautiful procedural gradient based on palette
        w, h = self.config.background_width, self.config.background_height
        base = Image.new("RGB", (w, h), analysis.primary_color or (30, 30, 60))
        
        if analysis.secondary_color:
            grad = Image.new("L", (w, h), 0)
            X, Y = np.meshgrid(np.linspace(0, 255, w), np.linspace(0, 255, h))
            grad_arr = ((X + Y) / 2).astype(np.uint8)
            grad = Image.fromarray(grad_arr)
            
            sec_layer = Image.new("RGB", (w, h), analysis.secondary_color)
            base = Image.composite(sec_layer, base, grad)

        # 2. Blend in the GAN output for texture/structure
        gan_tex = upscale(img, w, h)
        gan_tex = apply_blur(gan_tex, 2.0)
        # Use 'Hard Light' or 'Overlay' style blending via Image.blend for now
        img = Image.blend(base, gan_tex, alpha=0.3)
        
        # 3. Apply mood-based post-processing
        if analysis.mood == "dark":
            img = apply_vignette(img, 0.7)
            img = apply_blur(img, 1.5)
        elif analysis.mood == "vibrant":
            img = sharpen(img, 1.5)
        else:
            img = apply_blur(img, 1.0)
            
        img = color_grade(img, analysis.palette.dominant if analysis.palette else [], 0.2)
        return img

    def _post_process_lower_third(self, img: Image.Image, analysis: PosterAnalysis, variant_index: int = 0) -> Image.Image:
        """Create a premium broadcast-style lower-third with multiple layout variants."""
        w, h = self.config.lower_third_width, self.config.lower_third_height
        
        # 1. Colors from analysis
        primary = analysis.primary_color or (220, 20, 60)
        secondary = analysis.secondary_color or (255, 255, 255)
        
        # 2. Create the main canvas (transparent)
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        
        # 3. Determine Style Based on variant_index
        style = variant_index % 3 # Cycle through 3 styles
        
        grad_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        grad_draw = ImageDraw.Draw(grad_img)
        
        main_points = []
        accent_points = []
        
        if style == 0:
            # STYLE 0: Classic Angled Parallelogram
            angle_offset = 60
            main_w = int(w * 0.7)
            main_points = [(0, 0), (main_w, 0), (main_w - angle_offset, h), (0, h)]
            
            accent_w = 15
            accent_points = [
                (main_w + 5, 0), 
                (main_w + 5 + accent_w, 0), 
                (main_w + 5 + accent_w - angle_offset, h), 
                (main_w + 5 - angle_offset, h)
            ]
            grad_draw.polygon(main_points, fill=primary + (240,))
            grad_draw.polygon(accent_points, fill=secondary + (255,))

        elif style == 1:
            # STYLE 1: Modern Rounded Pill
            margin = 20
            pill_h = h - (margin * 2)
            main_w = int(w * 0.65)
            # Draw a rounded rectangle manually if PIL version is old, but most support rounded_rectangle
            try:
                grad_draw.rounded_rectangle(
                    [margin, margin, main_w, h - margin], 
                    radius=pill_h // 2, 
                    fill=primary + (230,)
                )
                # Accent vertical bar
                accent_x = margin + 40
                grad_draw.rectangle(
                    [accent_x, margin + 15, accent_x + 8, h - margin - 15], 
                    fill=secondary + (255,)
                )
            except AttributeError:
                # Fallback for old PIL
                grad_draw.rectangle([margin, margin, main_w, h - margin], fill=primary + (230,))
            
            main_points = [(margin, margin), (main_w, margin), (main_w, h - margin), (margin, h - margin)]

        else:
            # STYLE 2: Geometric Split (Minimalist)
            box_h = h - 40
            main_w = int(w * 0.5)
            bot_w = int(w * 0.4)
            
            # Top box (Primary)
            grad_draw.rectangle([0, 20, main_w, 20 + box_h // 2], fill=primary + (250,))
            # Bottom box (Secondary but darker/translucent)
            grad_draw.rectangle([0, 20 + box_h // 2, bot_w, 20 + box_h], fill=secondary + (200,))
            
            main_points = [(0, 20), (main_w, 20), (main_w, 20 + box_h), (0, 20 + box_h)]

        # 5. Blend in the GAN texture subtly into the main shape
        gan_tex = upscale(img, w, h).convert("RGBA")
        
        # Create mask from whatever was drawn in grad_img (alpha channel)
        mask = grad_img.getchannel('A')
        
        # Blend GAN texture at 20% opacity for "character"
        # We blend the GAN texture with the grad_img and use the mask to keep it in shape
        blended = Image.blend(grad_img, gan_tex, 0.15)
        canvas = Image.composite(blended, canvas, mask)
        
        # Re-draw the accent bar or vertical lines for Style 0 specifically to ensure sharpness
        if style == 0:
            draw = ImageDraw.Draw(canvas)
            draw.polygon(accent_points, fill=secondary + (255,))
        
        # 6. Render Information (Auto-Typography)
        try:
            from PIL import ImageFont
            # Try to find a premium sans-serif font on Mac
            font_paths = [
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/System/Library/Fonts/Helvetica.ttc",
                "/Library/Fonts/Arial Unicode.ttf"
            ]
            font_main = None
            font_sub = None
            
            for fp in font_paths:
                if Path(fp).exists():
                    try:
                        font_main = ImageFont.truetype(fp, 60)
                        font_sub = ImageFont.truetype(fp, 32)
                        break
                    except: continue
            
            if not font_main:
                font_main = ImageFont.load_default()
                font_sub = ImageFont.load_default()

            draw = ImageDraw.Draw(canvas)
            
            # Text margins and spacing
            text_x = 40
            text_y = h // 2 - 20
            
            # Determine text color based on background luminance
            from utils.image_utils import is_dark
            text_color = (255, 255, 255, 255) if is_dark(primary) else (20, 20, 20, 255)
            sub_text_color = (255, 255, 255, 200) if is_dark(primary) else (60, 60, 60, 200)

            # Draw Event Name
            event_text = analysis.event_name or "UPCOMING EVENT"
            draw.text((text_x, text_y - 35), event_text.upper(), font=font_main, fill=text_color)
            
            # Draw Date & Location
            info_parts = []
            if analysis.event_date: info_parts.append(analysis.event_date)
            if analysis.event_location: info_parts.append(analysis.event_location)
            
            info_text = " • ".join(info_parts) if info_parts else "JOIN US LIVE"
            draw.text((text_x, text_y + 45), info_text, font=font_sub, fill=sub_text_color)
            
        except Exception as e:
            logger.warning("Could not render typography: %s", e)

        # 7. Final "Gloss" Layer
        draw.line([(0, 0), (main_w, 0)], fill=(255, 255, 255, 80), width=2)
        
        return canvas
