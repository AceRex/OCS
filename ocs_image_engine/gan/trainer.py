"""
gan/trainer.py
==============
Training loop for the OCS Image Engine GAN.
Pairs posters with ideal backgrounds for Pix2Pix style training.
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm

from utils.config import Config
from gan.generator import UNetGenerator
from gan.discriminator import Discriminator

class GANTrainer:
    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() or config.device == "mps" else "cpu")
        
        self.gen = UNetGenerator(
            latent_dim=config.gan_latent_dim,
            condition_dim=UNetGenerator.CONDITION_DIM,
            base_features=config.gen_base_features
        ).to(self.device)
        
        self.disc = Discriminator(
            in_channels=3,
            condition_channels=UNetGenerator.CONDITION_DIM,
            features=[64, 128, 256, 512]
        ).to(self.device)
        
        self.opt_gen = optim.Adam(self.gen.parameters(), lr=config.gan_lr_generator, betas=(config.gan_beta1, config.gan_beta2))
        self.opt_disc = optim.Adam(self.disc.parameters(), lr=config.gan_lr_discriminator, betas=(config.gan_beta1, config.gan_beta2))
        
        self.BCE = nn.BCEWithLogitsLoss()
        self.L1 = nn.L1Loss()

    def train_step(self, z, condition, target):
        """
        z: latent vector (B, latent_dim, 1, 1)
        condition: conditioning vector (B, 25)
        target: ideal background image (B, 3, 256, 256)
        """
        B, _, H, W = target.shape
        
        # Expand condition vector to spatial map for discriminator
        # condition: (B, 25) -> (B, 25, 1, 1) -> (B, 25, H, W)
        condition_map = condition.view(B, -1, 1, 1).expand(-1, -1, H, W)
        
        # --- Train Discriminator ---
        self.opt_disc.zero_grad()
        
        fake_y = self.gen(z, condition)
        
        # Disc on Real
        disc_real = self.disc(target, condition_map)
        loss_disc_real = self.BCE(disc_real, torch.ones_like(disc_real))
        
        # Disc on Fake
        disc_fake = self.disc(fake_y.detach(), condition_map)
        loss_disc_fake = self.BCE(disc_fake, torch.zeros_like(disc_fake))
        
        loss_disc = (loss_disc_real + loss_disc_fake) / 2
        loss_disc.backward()
        self.opt_disc.step()
        
        # --- Train Generator ---
        self.opt_gen.zero_grad()
        
        disc_fake_for_gen = self.disc(fake_y, condition_map)
        loss_gen_adv = self.BCE(disc_fake_for_gen, torch.ones_like(disc_fake_for_gen))
        loss_gen_l1 = self.L1(fake_y, target) * self.config.gan_lambda_l1
        
        loss_gen = loss_gen_adv + loss_gen_l1
        loss_gen.backward()
        self.opt_gen.step()
        
        return loss_gen.item(), loss_disc.item()

    def train(self, dataloader: DataLoader):
        """Main training loop."""
        self.gen.train()
        self.disc.train()
        
        for epoch in range(self.config.gan_epochs):
            loop = tqdm(dataloader, leave=True)
            for i, (condition, target) in enumerate(loop):
                condition = condition.to(self.device)
                target = target.to(self.device)
                
                # Sample random noise
                z = torch.randn(condition.size(0), self.config.gan_latent_dim, 1, 1).to(self.device)
                
                l_g, l_d = self.train_step(z, condition, target)
                
                loop.set_description(f"Epoch [{epoch}/{self.config.gan_epochs}]")
                loop.set_postfix(loss_gen=f"{l_g:.4f}", loss_disc=f"{l_d:.4f}")
                
            if (epoch + 1) % self.config.gan_save_every == 0:
                self._save_checkpoints(epoch + 1)

    def _save_checkpoints(self, epoch):
        save_path = self.config.models_dir / "background"
        save_path.mkdir(parents=True, exist_ok=True)
        
        torch.save(self.gen.state_dict(), save_path / f"gen_epoch_{epoch}.pth")
        torch.save(self.disc.state_dict(), save_path / f"disc_epoch_{epoch}.pth")
        torch.save(self.gen.state_dict(), save_path / "gan_final.pth") # Keep 'final' updated
        print(f"\nSaved checkpoints for epoch {epoch}")
