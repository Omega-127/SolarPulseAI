"""
app/api/websockets/scada_ws.py

WebSocket endpoint: /ws/scada/{plant_id}

Streams SCADA data to connected clients.
- Validates plant existence before accepting connection.
- Sends latest SCADA reading from DB every 5 seconds.
- Handles disconnects gracefully without crashing the server.
- In development mode (no live stream), sends DB data with a DEV marker.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.plant import Plant
from app.models.scada import ScadaReading

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 5


async def _plant_exists(plant_id: int) -> bool:
    """Check if a plant exists in the database. Falls back gracefully if DB is offline."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Plant.id).where(Plant.id == plant_id))
            return result.scalar_one_or_none() is not None
    except Exception as exc:
        logger.warning(f"Database unavailable for plant check: {exc}. Allowing connection.")
        return True


async def _get_latest_scada(plant_id: int) -> dict | None:
    """Fetch the most recent SCADA reading for the plant. Handles DB offline gracefully."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ScadaReading)
                .where(ScadaReading.plant_id == plant_id)
                .order_by(ScadaReading.timestamp.desc())
                .limit(1)
            )
            reading: ScadaReading | None = result.scalar_one_or_none()
            if reading is None:
                return None
            return {
                "plant_id": reading.plant_id,
                "timestamp": reading.timestamp.isoformat() if reading.timestamp else None,
                "power_kw": reading.power_kw,
                "irradiance_w_m2": reading.irradiance_w_m2,
                "temperature_c": reading.temperature_c,
                "wind_speed_m_s": reading.wind_speed_m_s,
                "module_temperature_c": reading.module_temperature_c,
                "inverter_power_kw": reading.inverter_power_kw,
                "expected_power_kw": reading.expected_power_kw,
                "_source": "database_poll_dev",  # indicates development mode polling
            }
    except Exception as exc:
        logger.warning(f"Database query failed in SCADA WebSocket for plant {plant_id}: {exc}")
        return None


async def scada_ws_handler(websocket: WebSocket, plant_id: int) -> None:
    """
    Handle a SCADA WebSocket connection for the given plant.

    Accepts the connection, sends an initial frame, then polls the database
    every POLL_INTERVAL_SECONDS and sends the latest SCADA data as JSON.
    """
    # Validate plant exists before accepting the connection
    if not await _plant_exists(plant_id):
        await websocket.close(code=4004, reason=f"Plant {plant_id} not found")
        return

    await websocket.accept()
    logger.info(f"WebSocket connected: plant_id={plant_id} client={websocket.client}")

    # Send initial status frame immediately
    initial_data = {
        "plant_id": plant_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "status": "connected",
        "power_kw": 0.0,
        "_source": "stream_init",
    }
    await websocket.send_text(json.dumps(initial_data))

    try:
        while True:
            # Non-blocking wait — use asyncio.sleep, NOT time.sleep
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

            data = await _get_latest_scada(plant_id)
            if data is None:
                data = {
                    "plant_id": plant_id,
                    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                    "message": "No SCADA data available yet",
                    "_source": "no_data",
                }

            try:
                await websocket.send_text(json.dumps(data))
            except WebSocketDisconnect:
                break
            except Exception as send_exc:
                logger.warning(f"WebSocket send failed: plant_id={plant_id} error={send_exc}")
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: plant_id={plant_id}")
    except Exception as exc:
        logger.error(f"WebSocket error: plant_id={plant_id} error={exc}")
    finally:
        logger.info(f"WebSocket connection closed: plant_id={plant_id}")
