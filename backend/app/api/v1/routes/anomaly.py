"""
app/api/v1/routes/anomaly.py

Anomaly detection endpoints:
  GET  /api/v1/anomaly/{plant_id}    — list anomalies for a plant
  POST /api/v1/anomaly/threshold     — configure detection thresholds
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.alert import AlertResponse, AlertThresholdRequest
from app.services import anomaly_service

router = APIRouter(prefix="/anomaly", tags=["Anomaly"])


@router.get(
    "/{plant_id}",
    response_model=List[AlertResponse],
    summary="Get anomaly alerts for a plant",
)
async def get_plant_anomalies(
    plant_id: int,
    severity: Optional[str] = Query(default=None, description="INFO | WARNING | CRITICAL"),
    is_resolved: Optional[bool] = Query(default=None),
    start: Optional[datetime] = Query(default=None),
    end: Optional[datetime] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[AlertResponse]:
    alerts = await anomaly_service.get_alerts(
        db,
        plant_id=plant_id,
        severity=severity,
        is_resolved=is_resolved,
        start=start,
        end=end,
        limit=limit,
    )
    return alerts  # type: ignore[return-value]


@router.post(
    "/threshold",
    summary="Configure anomaly detection thresholds for a plant",
)
async def set_anomaly_threshold(
    request: AlertThresholdRequest,
    _: User = Depends(get_current_active_user),
) -> dict:
    anomaly_service.set_threshold(request)
    return {
        "detail": "Thresholds updated",
        "plant_id": request.plant_id,
        "warning_threshold_percent": request.warning_threshold_percent,
        "critical_threshold_percent": request.critical_threshold_percent,
    }
