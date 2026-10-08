"""
app/workers/alert_worker.py

Alert worker:
- Checks recent forecasts against actual SCADA data
- Detects anomalies via anomaly_service
- Persists alerts
- Dispatches notifications via NotificationAdapter interface

No real SMS/email integration unless credentials are provided.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.forecast import ForecastRecord
from app.models.scada import ScadaReading
from app.services.anomaly_service import detect_and_persist_anomaly

logger = get_logger(__name__)


# ── Notification adapter interface ────────────────────────────────────────────


class NotificationAdapter:
    """
    Base interface for alert notifications.

    Subclass this to implement real SMS, email, Slack, etc.
    """

    async def send(self, message: str, severity: str, plant_id: int) -> None:
        raise NotImplementedError


class LogNotificationAdapter(NotificationAdapter):
    """
    Development adapter — logs notifications instead of sending them.
    """

    async def send(self, message: str, severity: str, plant_id: int) -> None:
        logger.info(
            f"[NOTIFICATION DEV] plant={plant_id} severity={severity} message={message}"
        )


def get_notification_adapter() -> NotificationAdapter:
    """
    Return the appropriate notification adapter.

    Replace LogNotificationAdapter with a real one when credentials are available.
    """
    return LogNotificationAdapter()


# ── Alert check logic ─────────────────────────────────────────────────────────


async def run_alert_check(
    db: AsyncSession,
    plant_id: int,
    lookback_minutes: int = 60,
) -> int:
    """
    Compare the most recent forecast against actual SCADA power.

    Persists an alert and sends a notification if anomaly detected.

    Returns the number of alerts created.
    """
    since = datetime.now(tz=timezone.utc) - timedelta(minutes=lookback_minutes)

    # Get the latest forecast record
    forecast_result = await db.execute(
        select(ForecastRecord)
        .where(
            ForecastRecord.plant_id == plant_id,
            ForecastRecord.forecast_time >= since,
        )
        .order_by(ForecastRecord.forecast_time.desc())
        .limit(1)
    )
    forecast: Optional[ForecastRecord] = forecast_result.scalar_one_or_none()

    if forecast is None:
        logger.debug(f"Alert check: no recent forecast for plant={plant_id}")
        return 0

    # Get the latest SCADA reading
    scada_result = await db.execute(
        select(ScadaReading)
        .where(
            ScadaReading.plant_id == plant_id,
            ScadaReading.timestamp >= since,
        )
        .order_by(ScadaReading.timestamp.desc())
        .limit(1)
    )
    scada: Optional[ScadaReading] = scada_result.scalar_one_or_none()

    if scada is None or scada.power_kw is None:
        logger.debug(f"Alert check: no recent SCADA data for plant={plant_id}")
        return 0

    alert = await detect_and_persist_anomaly(
        db=db,
        plant_id=plant_id,
        timestamp=scada.timestamp,
        expected_power_kw=forecast.predicted_power_kw,
        actual_power_kw=scada.power_kw,
        alert_type="shortfall",
    )

    if alert is not None:
        # Dispatch notification (non-blocking, log-only in development)
        adapter = get_notification_adapter()
        await adapter.send(
            message=alert.message,
            severity=alert.severity,
            plant_id=plant_id,
        )

        # Update actual_power_kw on the forecast record
        forecast.actual_power_kw = scada.power_kw
        await db.commit()

        return 1

    return 0
