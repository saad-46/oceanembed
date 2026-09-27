"""CNN / U-Net encoder-decoder - the primary reconstruction model (docs/10 section 1).

* Input: (B, 11, 100, 240) normalised surface state (docs/09 feature engineering).
* Encoder bottleneck (B, 8*base, 13, 30) **is the satellite embedding** the PS asks for:
  a compact latent representation of the whole basin's surface state. Pooled per
  region it gives the per-day embedding vectors visualised on the AI Insights screen.
* Decoder output: per-depth residual w.r.t. the training-period seasonal climatology
  (normalised units) and a per-depth log-variance (heteroscedastic uncertainty head,
  docs/07 #10). Final prediction = climatology + residual.
"""
from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F

PAD_H = (2, 2)  # 100 -> 104 so three 2x poolings divide evenly


def _block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1), nn.GroupNorm(8, cout), nn.GELU(),
        nn.Conv2d(cout, cout, 3, padding=1), nn.GroupNorm(8, cout), nn.GELU(),
    )


class UNet(nn.Module):
    def __init__(self, in_ch: int = 11, n_depth: int = 15, base: int = 24, dropout: float = 0.1):
        super().__init__()
        b = base
        self.enc1, self.enc2, self.enc3 = _block(in_ch, b), _block(b, 2 * b), _block(2 * b, 4 * b)
        self.bottleneck = _block(4 * b, 8 * b)
        self.drop = nn.Dropout2d(dropout)
        self.up3, self.dec3 = nn.ConvTranspose2d(8 * b, 4 * b, 2, stride=2), _block(8 * b, 4 * b)
        self.up2, self.dec2 = nn.ConvTranspose2d(4 * b, 2 * b, 2, stride=2), _block(4 * b, 2 * b)
        self.up1, self.dec1 = nn.ConvTranspose2d(2 * b, b, 2, stride=2), _block(2 * b, b)
        self.head_mu = nn.Conv2d(b, n_depth, 1)
        self.head_logvar = nn.Conv2d(b, n_depth, 1)
        self.embedding_dim = 8 * b

    def encode(self, x: torch.Tensor):
        x = F.pad(x, (0, 0) + PAD_H)
        e1 = self.enc1(x)
        e2 = self.enc2(F.max_pool2d(e1, 2))
        e3 = self.enc3(F.max_pool2d(e2, 2))
        z = self.bottleneck(F.max_pool2d(e3, 2))
        return z, (e1, e2, e3)

    def forward(self, x: torch.Tensor, clim_norm: torch.Tensor):
        z, (e1, e2, e3) = self.encode(x)
        d = self.dec3(torch.cat([self.up3(self.drop(z)), e3], 1))
        d = self.dec2(torch.cat([self.up2(d), e2], 1))
        d = self.dec1(torch.cat([self.up1(d), e1], 1))
        h0, h1 = PAD_H
        d = d[:, :, h0:d.shape[2] - h1]
        mu = clim_norm + self.head_mu(d)
        logvar = self.head_logvar(d).clamp(-10, 6)
        return mu, logvar

    @torch.no_grad()
    def embed(self, x: torch.Tensor) -> torch.Tensor:
        """Bottleneck feature map (B, C, 13, 30)."""
        return self.encode(x)[0]


def masked_loss(mu, logvar, y, mask):
    """MSE on the mean + Gaussian NLL for the variance head on the *detached* residual.

    Decoupling keeps the mean fit identical to plain MSE training while the variance
    head learns the expected squared error (stable, avoids variance collapse).
    """
    m = mask.float()
    n = m.sum().clamp_min(1.0)
    y0 = torch.nan_to_num(y)
    sq = (mu - y0) ** 2
    mse = (sq * m).sum() / n
    nll = (0.5 * (logvar + sq.detach() / logvar.exp()) * m).sum() / n
    return mse + 0.1 * nll, mse
