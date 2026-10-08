"""
app/schemas/forecast.py

Pydantic v2 schemas for forecast data.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ForecastRequest(BaseModel):
    plant_id: int
    horizon_minutes: int = Field(default=60, ge=5, le=1440)
    start: Optional[datetime] = None
    end: Optional[datetime] = None


class ForecastResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: int
    forecast_time: datetime
    generated_at: datetime
    predicted_power_kw: float
    actual_power_kw: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None
    model_name: str
    model_version: str
    physics_power_kw: Optional[float] = None
    ml_power_kw: Optional[float] = None


class ForecastSummary(BaseModel):
    plant_id: int
    period_start: datetime
    period_end: datetime
    total_predicted_kwh: float
    total_actual_kwh: Optional[float] = None
    mean_absolute_error_kw: Optional[float] = None
    record_count: int
    model_name: str
