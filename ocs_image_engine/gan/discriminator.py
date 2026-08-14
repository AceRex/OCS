"""
gan/discriminator.py
====================
PatchGAN Discriminator for the OCS Image Engine.
Follows the architecture from TECHNICAL_DOCS.md:
Input: image (3 ch) + condition map (25 ch) -> 28 channels total.
"""

import torch
import torch.nn as nn

class DiscriminatorBlock(nn.Module):
    def __init__(self, in_ch, out_ch, stride):
        super().__init__()
        self.model = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 4, stride, 1, bias=False, padding_mode="reflect"),
            nn.BatchNorm2d(out_ch),
            nn.LeakyReLU(0.2, inplace=True)
        )

    def forward(self, x):
        return self.model(x)

class Discriminator(nn.Module):
    def __init__(self, in_channels=3, condition_channels=25, features=[64, 128, 256, 512]):
        super().__init__()
        # Input: image (3) + condition (25) = 28 channels
        self.initial = nn.Sequential(
            nn.Conv2d(in_channels + condition_channels, features[0], 4, 2, 1, padding_mode="reflect"),
            nn.LeakyReLU(0.2, inplace=True)
        )
        
        layers = []
        in_ch = features[0]
        for feature in features[1:]:
            layers.append(DiscriminatorBlock(in_ch, feature, stride=1 if feature == features[-1] else 2))
            in_ch = feature
            
        # Final patch score (70x70 receptive field logic)
        layers.append(nn.Conv2d(in_ch, 1, 4, 1, 1, padding_mode="reflect"))
        self.model = nn.Sequential(*layers)

    def forward(self, x, condition_map):
        # x: image (B, 3, H, W)
        # condition_map: (B, 25, H, W)
        x = torch.cat([x, condition_map], dim=1)
        x = self.initial(x)
        return self.model(x)
