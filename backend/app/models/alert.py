"""
app/models/alert.py

SQLAlchemy ORM model for AnomalyAlert.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"
    __table_args__ = (
        Index("ix_alert_plant_timestamp", "plant_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "shortfall"
    severity: Mapped[str] = mapped_column(String(32), nullable=False)  # INFO | WARNING | CRITICAL
    message: Mapped[str] = mapped_column(String(1024), nullable=False)

    expected_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", back_populates="alerts")  # type: ignore[name-defined]
