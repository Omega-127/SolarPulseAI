"""
app/models/forecast.py

SQLAlchemy ORM model for ForecastRecord.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ForecastRecord(Base):
    __tablename__ = "forecast_records"
    __table_args__ = (
        Index("ix_forecast_plant_time", "plant_id", "forecast_time"),
        Index("ix_forecast_time", "forecast_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    forecast_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(tz=timezone.utc),
        nullable=False,
    )

    predicted_power_kw: Mapped[float] = mapped_column(Float, nullable=False)
    actual_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), default="1.0", nullable=False)

    physics_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ml_power_kw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", back_populates="forecasts")  # type: ignore[name-defined]
