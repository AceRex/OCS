"""
gan/generator.py
================
U-Net Generator for the OCS Image Engine.
Accepts noise (z) and conditioning (25-dim vector) to generate high-quality textures.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class ConvBlock(nn.Module):
    """Simple Conv -> BN -> LeakyReLU block for the encoder."""
    def __init__(self, in_ch, out_ch, stride=2, normalize=True):
        super().__init__()
        layers = [
            nn.Conv2d(in_ch, out_ch, 4, stride, 1, bias=False, padding_mode="reflect")
        ]
        if normalize:
            layers.append(nn.BatchNorm2d(out_ch))
        layers.append(nn.LeakyReLU(0.2, inplace=True))
        self.block = nn.Sequential(*layers)

    def forward(self, x):
        return self.block(x)

class UpBlock(nn.Module):
    """TransposedConv -> BN -> ReLU (+ optional dropout) for the decoder."""
    def __init__(self, in_ch, out_ch, stride=2, dropout=0.0):
        super().__init__()
        layers = [
            nn.ConvTranspose2d(in_ch, out_ch, 4, stride, 1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True)
        ]
        if dropout > 0:
            layers.append(nn.Dropout(dropout))
        self.block = nn.Sequential(*layers)

    def forward(self, x):
        return self.block(x)

class SelfAttention(nn.Module):
    """Self-attention for spatial coherence at the bottleneck."""
    def __init__(self, channels):
        super().__init__()
        self.query = nn.Conv2d(channels, channels // 8, 1)
        self.key = nn.Conv2d(channels, channels // 8, 1)
        self.value = nn.Conv2d(channels, channels, 1)
        self.gamma = nn.Parameter(torch.zeros(1))

    def forward(self, x):
        B, C, H, W = x.shape
        q = self.query(x).view(B, -1, H * W).permute(0, 2, 1)
        k = self.key(x).view(B, -1, H * W)
        attn = F.softmax(torch.bmm(q, k), dim=-1)
        v = self.value(x).view(B, -1, H * W)
        out = torch.bmm(v, attn.permute(0, 2, 1)).view(B, C, H, W)
        return self.gamma * out + x

class UNetGenerator(nn.Module):
    """
    Conditional U-Net Generator.
    Architecture:
    1. Project (z + condition) to 4x4 feature map.
    2. Encoder: 4x4 -> 2x2 -> 1x1
    3. Bottleneck: Self-Attention
    4. Decoder: 1x1 -> 2x2 -> 4x4 (with skips) -> 8x8 -> ... -> 256x256
    """
    CONDITION_DIM = 25

    def __init__(self, latent_dim=128, condition_dim=25, base_features=64, out_channels=3):
        super().__init__()
        f = base_features # 64
        
        # 1. Input Projection
        self.proj = nn.Sequential(
            nn.Linear(latent_dim + condition_dim, f * 8 * 4 * 4),
            nn.ReLU(inplace=True)
        )
        
        # 2. Encoder (Downsampling from 4x4)
        self.e1 = ConvBlock(f * 8, f * 8) # 4 -> 2
        self.e2 = ConvBlock(f * 8, f * 8) # 2 -> 1
        
        # 3. Bottleneck
        self.bottleneck = nn.Sequential(
            nn.Conv2d(f * 8, f * 8, 3, 1, 1),
            SelfAttention(f * 8),
            nn.ReLU(inplace=True)
        )
        
        # 4. Decoder (Upsampling with Skips)
        self.d1 = UpBlock(f * 8, f * 8, dropout=0.5)     # 1 -> 2
        self.d2 = UpBlock(f * 8 * 2, f * 8, dropout=0.5) # 2 -> 4 (skip from e1)
        self.d3 = UpBlock(f * 8 * 2, f * 8, dropout=0.5) # 4 -> 8 (skip from proj)
        self.d4 = UpBlock(f * 8, f * 4)                  # 8 -> 16
        self.d5 = UpBlock(f * 4, f * 2)                  # 16 -> 32
        self.d6 = UpBlock(f * 2, f)                      # 32 -> 64
        self.d7 = UpBlock(f, f // 2)                     # 64 -> 128
        self.d8 = UpBlock(f // 2, f // 4)                # 128 -> 256
        
        # 5. Output
        self.output = nn.Sequential(
            nn.Conv2d(f // 4, out_channels, 7, 1, 3),
            nn.Tanh()
        )

    def forward(self, z, condition):
        # z: (B, latent_dim, 1, 1) or (B, latent_dim)
        # condition: (B, 25)
        if z.dim() == 4:
            z = z.view(z.size(0), -1)
        
        x_latent = torch.cat([z, condition], dim=1)
        
        # Initial 4x4 map
        x_proj = self.proj(x_latent).view(-1, 512, 4, 4)
        
        # Encoder
        x1 = self.e1(x_proj) # 2x2
        x2 = self.e2(x1)     # 1x1
        
        # Bottleneck
        bn = self.bottleneck(x2)
        
        # Decoder
        y = self.d1(bn)                      # 2x2
        y = self.d2(torch.cat([y, x1], dim=1)) # 4x4
        y = self.d3(torch.cat([y, x_proj], dim=1)) # 8x8
        y = self.d4(y)                       # 16x16
        y = self.d5(y)                       # 32x32
        y = self.d6(y)                       # 64x64
        y = self.d7(y)                       # 128x128
        y = self.d8(y)                       # 256x256
        
        return self.output(y)

# Conditioning vector builder
THEMES = [
    "religious", "corporate", "concert", "sports", "wedding",
    "conference", "festival", "charity", "political", "general",
]
MOODS = ["warm", "cool", "neutral", "dark", "vibrant", "muted"]

def build_condition_vector(
    primary_color: tuple,
    secondary_color: tuple,
    background_color: tuple,
    theme: str,
    mood: str,
) -> torch.Tensor:
    """Build a (1, 25) conditioning tensor from poster analysis metadata."""
    def norm(rgb):
        return [c / 255.0 for c in rgb]

    # One-hot theme
    theme_vec = [0.0] * len(THEMES)
    if theme in THEMES:
        theme_vec[THEMES.index(theme)] = 1.0
    else:
        theme_vec[THEMES.index("general")] = 1.0

    # One-hot mood
    mood_vec = [0.0] * len(MOODS)
    if mood in MOODS:
        mood_vec[MOODS.index(mood)] = 1.0
    else:
        mood_vec[MOODS.index("neutral")] = 1.0

    vec = (
        norm(primary_color)
        + norm(secondary_color)
        + norm(background_color)
        + theme_vec
        + mood_vec
    )

    return torch.tensor(vec, dtype=torch.float32).unsqueeze(0)
