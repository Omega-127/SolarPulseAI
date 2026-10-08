"""
app/api/v1/routes/alerts.py

Alert management endpoints:
  GET   /api/v1/alerts
  GET   /api/v1/alerts/{alert_id}
  PATCH /api/v1/alerts/{alert_id}/resolve
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.alert import AlertResponse
from app.services import anomaly_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get(
    "",
    response_model=List[AlertResponse],
    summary="List alerts with optional filters",
)
async def list_alerts(
    plant_id: Optional[int] = Query(default=None),
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


@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
    summary="Get a specific alert by ID",
)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> AlertResponse:
    alert = await anomaly_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )
    return alert  # type: ignore[return-value]


@router.patch(
    "/{alert_id}/resolve",
    response_model=AlertResponse,
    summary="Mark an alert as resolved",
)
async def resolve_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> AlertResponse:
    alert = await anomaly_service.resolve_alert(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )
    return alert  # type: ignore[return-value]
