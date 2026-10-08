"""
app/services/anomaly_service.py

Shortfall detection and alert persistence.

Compares actual power against expected/forecast power and
creates AnomalyAlert records when deviation exceeds configured thresholds.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.alert import AnomalyAlert
from app.schemas.alert import AlertThresholdRequest

logger = get_logger(__name__)

# In-memory threshold store per plant (replaced by DB config in production)
_thresholds: dict[int, dict] = {}

DEFAULT_WARNING_THRESHOLD = 10.0   # percent
DEFAULT_CRITICAL_THRESHOLD = 25.0  # percent


def _get_thresholds(plant_id: int) -> dict:
    return _thresholds.get(
        plant_id,
        {
            "warning": DEFAULT_WARNING_THRESHOLD,
            "critical": DEFAULT_CRITICAL_THRESHOLD,
        },
    )


def set_threshold(request: AlertThresholdRequest) -> None:
    """Update in-memory thresholds for a plant."""
    _thresholds[request.plant_id] = {
        "warning": request.warning_threshold_percent,
        "critical": request.critical_threshold_percent,
    }
    logger.info(
        f"Updated thresholds for plant {request.plant_id}: "
        f"warning={request.warning_threshold_percent}% "
        f"critical={request.critical_threshold_percent}%"
    )


def calculate_deviation(
    expected_power_kw: float, actual_power_kw: float
) -> Optional[float]:
    """
    Calculate deviation as a percentage.

    Returns None if expected is effectively zero (avoid division by zero).
    """
    if expected_power_kw is None or actual_power_kw is None:
        return None
    if abs(expected_power_kw) < 0.001:
        return None
    return ((expected_power_kw - actual_power_kw) / expected_power_kw) * 100.0


def _classify_severity(deviation_percent: float, thresholds: dict) -> Optional[str]:
    """Return severity string or None if within normal range."""
    if deviation_percent >= thresholds["critical"]:
        return "CRITICAL"
    if deviation_percent >= thresholds["warning"]:
        return "WARNING"
    return None


async def detect_and_persist_anomaly(
    db: AsyncSession,
    plant_id: int,
    timestamp: datetime,
    expected_power_kw: float,
    actual_power_kw: float,
    alert_type: str = "shortfall",
) -> Optional[AnomalyAlert]:
    """
    Check if actual power deviates from expected.
    Persist an AnomalyAlert if it exceeds the configured threshold.

    Returns the created alert or None if no anomaly detected.
    """
    deviation = calculate_deviation(expected_power_kw, actual_power_kw)
    if deviation is None:
        return None

    thresholds = _get_thresholds(plant_id)
    severity = _classify_severity(deviation, thresholds)

    if severity is None:
        return None  # within normal range

    message = (
        f"Power shortfall detected: expected={expected_power_kw:.2f} kW, "
        f"actual={actual_power_kw:.2f} kW, deviation={deviation:.1f}%"
    )

    alert = AnomalyAlert(
        plant_id=plant_id,
        timestamp=timestamp,
        alert_type=alert_type,
        severity=severity,
        message=message,
        expected_power_kw=expected_power_kw,
        actual_power_kw=actual_power_kw,
        deviation_percent=round(deviation, 2),
        is_resolved=False,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    logger.warning(f"Anomaly alert created: plant={plant_id} severity={severity} deviation={deviation:.1f}%")
    return alert


async def get_alerts(
    db: AsyncSession,
    plant_id: Optional[int] = None,
    severity: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 200,
) -> List[AnomalyAlert]:
    """Query alerts with optional filters."""
    query = select(AnomalyAlert)

    if plant_id is not None:
        query = query.where(AnomalyAlert.plant_id == plant_id)
    if severity is not None:
        query = query.where(AnomalyAlert.severity == severity.upper())
    if is_resolved is not None:
        query = query.where(AnomalyAlert.is_resolved == is_resolved)
    if start is not None:
        query = query.where(AnomalyAlert.timestamp >= start)
    if end is not None:
        query = query.where(AnomalyAlert.timestamp <= end)

    query = query.order_by(AnomalyAlert.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_alert_by_id(db: AsyncSession, alert_id: int) -> Optional[AnomalyAlert]:
    result = await db.execute(
        select(AnomalyAlert).where(AnomalyAlert.id == alert_id)
    )
    return result.scalar_one_or_none()


async def resolve_alert(db: AsyncSession, alert_id: int) -> Optional[AnomalyAlert]:
    """Mark an alert as resolved."""
    alert = await get_alert_by_id(db, alert_id)
    if alert is None:
        return None
    alert.is_resolved = True
    alert.resolved_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert
