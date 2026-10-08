"""
app/schemas/plant.py

Pydantic v2 schemas for Plant and PlantConfig.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlantCreate(BaseModel):
    name: str
    location: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    timezone: str = "UTC"
    capacity_kw: float = Field(..., gt=0)
    inverter_capacity_kw: float = Field(..., gt=0)
    module_count: Optional[int] = Field(default=None, gt=0)


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    timezone: Optional[str] = None
    capacity_kw: Optional[float] = Field(default=None, gt=0)
    inverter_capacity_kw: Optional[float] = Field(default=None, gt=0)
    module_count: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None


class PlantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: Optional[str] = None
    latitude: float
    longitude: float
    timezone: str
    capacity_kw: float
    inverter_capacity_kw: float
    module_count: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PlantConfigCreate(BaseModel):
    tilt: float = Field(default=20.0, ge=0.0, le=90.0)
    azimuth: float = Field(default=180.0, ge=0.0, le=360.0)
    efficiency: float = Field(default=0.18, gt=0.0, le=1.0)
    soiling_threshold: float = Field(default=5.0, ge=0.0, le=100.0)
    clipping_threshold: float = Field(default=95.0, ge=0.0, le=100.0)
    forecast_horizon_minutes: int = Field(default=60, ge=5, le=1440)


class PlantConfigUpdate(BaseModel):
    tilt: Optional[float] = Field(default=None, ge=0.0, le=90.0)
    azimuth: Optional[float] = Field(default=None, ge=0.0, le=360.0)
    efficiency: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    soiling_threshold: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    clipping_threshold: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    forecast_horizon_minutes: Optional[int] = Field(default=None, ge=5, le=1440)


class PlantConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: int
    tilt: float
    azimuth: float
    efficiency: float
    soiling_threshold: float
    clipping_threshold: float
    forecast_horizon_minutes: int
    created_at: datetime
    updated_at: datetime
