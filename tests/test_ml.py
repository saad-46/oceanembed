"""ML correctness tests (docs/17 critical tier). Small synthetic fixtures only."""
import inspect

import numpy as np
import pandas as pd
import pytest

from ml.config import TEST_YEARS, TRAIN_YEARS, VAL_YEARS
from ml.pipeline.feature_engineering import climatology_for, fit_climatology, harmonic_design, split_of_year


def test_year_splits_are_disjoint_and_ordered():
    assert not set(TRAIN_YEARS) & set(VAL_YEARS) and not set(TRAIN_YEARS) & set(TEST_YEARS) and not set(VAL_YEARS) & set(TEST_YEARS)
    assert max(TRAIN_YEARS) < min(VAL_YEARS) < min(TEST_YEARS)
    assert [split_of_year(y) for y in (2019, 2022, 2023, 2018)] == ["train", "val", "test", "other"]


def test_harmonic_climatology_recovers_known_cycle():
    times = pd.date_range("2019-01-01", "2021-12-31", freq="3D")
    X = harmonic_design(times)
    true = np.array([25.0, 2.0, -1.0, 0.5, 0.3])
    field = (X @ true)[:, None, None, None] * np.ones((1, 2, 3, 4))
    mask = np.ones((2, 3, 4), bool)
    coef = fit_climatology(field.astype(np.float32), times, mask)
    assert np.allclose(coef[:, 0, 0, 0], true, atol=1e-3)
    pred = climatology_for(pd.DatetimeIndex(["2023-07-01"]), coef)
    assert pred.shape == (1, 2, 3, 4)


def test_normalisation_and_climatology_use_training_years_only():
    """Leakage guard: assemble() must compute stats/climatology from the train split only."""
    from ml.pipeline import feature_engineering as fe

    src = inspect.getsource(fe.assemble)
    assert "inputs.sel(time=tr_days.values)" in src          # input stats from train days
    assert "temp[train, k]" in src                            # target stats from train days
    assert "fit_climatology(temp[train], tr_days" in src      # climatology from train days


def test_unet_shapes_embedding_and_loss_decreases():
    torch = pytest.importorskip("torch")
    from ml.models.cnn_unet import UNet, masked_loss

    torch.manual_seed(0)
    m = UNet(in_ch=11, n_depth=15, base=8)
    x = torch.randn(2, 11, 100, 240)
    c = torch.zeros(2, 15, 100, 240)
    y = 0.5 * x[:, :1].repeat(1, 15, 1, 1)  # learnable synthetic target
    mask = torch.ones_like(y, dtype=torch.bool)
    mask[:, :, :, :10] = False
    mu, logvar = m(x, c)
    assert mu.shape == (2, 15, 100, 240) and logvar.shape == mu.shape
    assert m.embed(x).shape == (2, 64, 13, 30)
    opt = torch.optim.Adam(m.parameters(), lr=3e-3)
    losses = []
    for _ in range(25):
        mu, logvar = m(x, c)
        loss, mse = masked_loss(mu, logvar, y, mask)
        opt.zero_grad(); loss.backward(); opt.step()
        losses.append(float(mse))
    assert losses[-1] < 0.5 * losses[0]


def test_masked_loss_ignores_masked_cells():
    torch = pytest.importorskip("torch")
    from ml.models.cnn_unet import masked_loss

    y = torch.zeros(1, 1, 2, 2)
    mu = torch.tensor([[[[0.0, 0.0], [0.0, 100.0]]]])
    mask = torch.tensor([[[[True, True], [True, False]]]])
    _, mse = masked_loss(mu, torch.zeros_like(mu), y, mask)
    assert float(mse) == 0.0


def test_lightgbm_beats_mean_predictor():
    pytest.importorskip("lightgbm")
    from ml.models.baseline_lightgbm import LightGBMBaseline

    rng = np.random.default_rng(0)
    t, h, w, f = 40, 6, 8, 11
    X = rng.normal(size=(t, h, w, f)).astype(np.float32)
    base = 20 + 3 * X[..., 0] - 2 * X[..., 1]
    Y = np.stack([base - k * 0.5 for k in range(15)], axis=1) + rng.normal(0, 0.1, size=(t, 15, h, w))
    mask = np.ones((15, h, w), bool)
    model = LightGBMBaseline().fit(X[:30], Y[:30], mask, X[30:], Y[30:], mask, n_train=5000, n_val=2000)
    pred = model.predict(X[30:], mask)
    rmse = np.sqrt(np.mean((pred - Y[30:]) ** 2))
    rmse_mean = np.sqrt(np.mean((Y[:30].mean(axis=(0, 2, 3))[None, :, None, None] - Y[30:]) ** 2))
    assert rmse < 0.5 * rmse_mean
