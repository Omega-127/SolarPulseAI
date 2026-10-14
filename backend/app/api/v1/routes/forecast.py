"""
app/api/v1/routes/forecast.py

Forecast endpoints:
  GET  /api/v1/forecast/{plant_id}
  GET  /api/v1/forecast/{plant_id}/summary
  GET  /api/v1/forecast/{plant_id}/online-status
  POST /api/v1/forecast/{plant_id}/generate   (trigger on-demand forecast)
  GET  /api/v1/forecast/{plant_id}/probabilistic
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.forecast import (
    ForecastResponse,
    ForecastSummary,
    OnlineAdapterStatusResponse,
    ProbabilisticForecastResponse,
)
from app.services import forecast_service, plant_service

router = APIRouter(prefix="/forecast", tags=["Forecast"])

# ── Lazy registry accessor ──────────────────────────────────────────────────

_registry = None


def _get_registry():
    global _registry
    if _registry is None:
        try:
            from backend.ml.serving.model_registry import ModelRegistry
        except ImportError:
            from ml.serving.model_registry import ModelRegistry  # type: ignore
        _registry = ModelRegistry()
    return _registry


@router.get(
    "/{plant_id}",
    response_model=List[ForecastResponse],
    summary="Get forecast records for a plant",
)
async def get_forecasts(
    plant_id: int,
    start: Optional[datetime] = Query(default=None, description="Start datetime (ISO 8601)"),
    end: Optional[datetime] = Query(default=None, description="End datetime (ISO 8601)"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[ForecastResponse]:
    records = await forecast_service.get_forecasts(
        db, plant_id=plant_id, start=start, end=end, limit=limit
    )
    return records  # type: ignore[return-value]


@router.get(
    "/{plant_id}/summary",
    response_model=ForecastSummary,
    summary="Get forecast summary statistics for a plant",
)
async def get_forecast_summary(
    plant_id: int,
    start: Optional[datetime] = Query(default=None),
    end: Optional[datetime] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> ForecastSummary:
    return await forecast_service.get_forecast_summary(
        db, plant_id=plant_id, start=start, end=end
    )


@router.post(
    "/{plant_id}/generate",
    response_model=ForecastResponse,
    summary="Trigger an on-demand forecast for a plant",
)
async def generate_forecast(
    plant_id: int,
    horizon_minutes: int = Query(default=60, ge=5, le=1440),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> ForecastResponse:
    plant = await plant_service.get_plant(db, plant_id)
    config = await plant_service.get_plant_config(db, plant_id)
    record = await forecast_service.generate_forecast(
        db, plant=plant, config=config, horizon_minutes=horizon_minutes
    )
    return record  # type: ignore[return-value]


@router.get(
    "/{plant_id}/probabilistic",
    response_model=ProbabilisticForecastResponse,
    summary="Get probabilistic forecast with P10/P50/P90 bands and ramp/cloud-passage risk metrics",
)
async def get_probabilistic_forecast(
    plant_id: int,
    horizon_minutes: int = Query(default=240, ge=15, le=1440, description="Forecast horizon in minutes"),
    interval_minutes: int = Query(default=15, ge=5, le=60, description="Interval resolution in minutes"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> ProbabilisticForecastResponse:
    plant = await plant_service.get_plant(db, plant_id)
    config = await plant_service.get_plant_config(db, plant_id)
    return await forecast_service.generate_probabilistic_forecast(
        db, plant=plant, config=config, horizon_minutes=horizon_minutes, interval_minutes=interval_minutes
    )


@router.get(
    "/{plant_id}/online-status",
    response_model=OnlineAdapterStatusResponse,
    summary="Get real-time online adapter status for a plant (scaling factor, bias, RMSE)",
    tags=["Forecast", "Online Learning"],
)
async def get_online_adapter_status(
    plant_id: int,
    _: User = Depends(get_current_active_user),
) -> OnlineAdapterStatusResponse:
    """
    Returns the live state of the OnlineResidualAdapter for a plant:
    - **scaling_factor** (gamma): multiplicative correction applied to base forecasts.
    - **bias_kw**: additive offset tracked by the adapter.
    - **samples_observed_today**: number of SCADA readings processed.
    - **recent_rmse_kw**: running RMSE of prediction residuals.
    - **status**: `BASELINE_OPTIMAL` | `ADAPTING_SOILING_HAZE` | `ADAPTING_ABOVE_NWP`.
    """
    registry = _get_registry()
    adapter = registry.get_online_adapter(str(plant_id))
    status_dict = adapter.get_status()
    return OnlineAdapterStatusResponse(**status_dict)
