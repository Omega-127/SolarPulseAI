"""
app/workers/ml_worker.py

LightGBM model loading and batch inference worker.

- Model is loaded lazily (not at import time)
- Falls back gracefully if model file is missing
- Batch inference ready
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Model abstraction ─────────────────────────────────────────────────────────

_model: Any = None  # cached LightGBM Booster or None
_model_loaded: bool = False  # set True once load attempt is made


def load_model() -> Optional[Any]:
    """
    Load the LightGBM model from the configured path.

    Called once lazily.  Returns None if the model is unavailable.
    Subsequent calls return the cached model.
    """
    global _model, _model_loaded

    if _model_loaded:
        return _model

    model_path = settings.ML_MODEL_PATH
    _model_loaded = True

    if not os.path.exists(model_path):
        logger.info(
            f"ML model file not found at '{model_path}'. "
            "Batch inference will use development fallback."
        )
        return None

    try:
        import lightgbm as lgb  # type: ignore

        _model = lgb.Booster(model_file=model_path)
        logger.info(f"LightGBM model loaded successfully from '{model_path}'")
        return _model
    except Exception as exc:
        logger.error(f"Failed to load LightGBM model: {exc}")
        return None


def prepare_features(raw_records: List[Dict]) -> pd.DataFrame:
    """
    Convert a list of raw feature dictionaries to a pandas DataFrame
    ready for LightGBM inference.

    Expected keys (all numeric):
        physics_power_kw, irradiance_w_m2, temperature_c,
        soiling_loss_percent, clipping_loss_kw,
        hour, day_of_year, capacity_kw, inverter_capacity_kw,
        tilt, azimuth
    """
    df = pd.DataFrame(raw_records)

    # Fill missing values with sensible defaults
    defaults = {
        "physics_power_kw": 0.0,
        "irradiance_w_m2": 0.0,
        "temperature_c": 25.0,
        "soiling_loss_percent": 0.0,
        "clipping_loss_kw": 0.0,
        "hour": 12,
        "day_of_year": 180,
        "capacity_kw": 100.0,
        "inverter_capacity_kw": 100.0,
        "tilt": 20.0,
        "azimuth": 180.0,
    }
    for col, default in defaults.items():
        if col not in df.columns:
            df[col] = default
        else:
            df[col] = df[col].fillna(default)

    return df


def _fallback_predictions(df: pd.DataFrame, capacity_kw_col: str = "capacity_kw") -> np.ndarray:
    """
    Development fallback — returns physics_power_kw with small noise.

    NOT a real ML prediction.
    """
    base = df.get("physics_power_kw", pd.Series([0.0] * len(df))).values.astype(float)
    noise = np.random.uniform(-0.02, 0.02, size=base.shape) * base
    predictions = np.clip(base + noise, 0.0, df[capacity_kw_col].values)
    return predictions


def run_batch_inference(
    raw_records: List[Dict],
) -> Dict[str, Any]:
    """
    Run batch inference on a list of feature records.

    Returns:
        {
            "predictions": [float, ...],
            "model_name": "lightgbm" | "development_fallback",
            "record_count": int,
        }
    """
    if not raw_records:
        return {"predictions": [], "model_name": "none", "record_count": 0}

    df = prepare_features(raw_records)
    model = load_model()

    if model is not None:
        try:
            preds = model.predict(df)
            # Clip to plant capacity
            preds = np.clip(preds, 0.0, df["capacity_kw"].values)
            return {
                "predictions": [round(float(p), 4) for p in preds],
                "model_name": "lightgbm",
                "record_count": len(preds),
            }
        except Exception as exc:
            logger.error(f"LightGBM batch inference error: {exc}. Using fallback.")

    # Development fallback
    preds = _fallback_predictions(df)
    return {
        "predictions": [round(float(p), 4) for p in preds],
        "model_name": "development_fallback",
        "record_count": len(preds),
    }
