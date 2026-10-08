"""
app/services/plant_service.py

Business logic for solar plant management.
All database operations use async SQLAlchemy.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.models.plant import Plant, PlantConfig
from app.schemas.plant import PlantConfigCreate, PlantConfigUpdate, PlantCreate, PlantUpdate

logger = get_logger(__name__)


async def create_plant(db: AsyncSession, data: PlantCreate) -> Plant:
    """Create a new plant and default config."""
    plant = Plant(**data.model_dump())
    db.add(plant)
    await db.flush()  # get the auto-generated id

    # Create a default PlantConfig for the new plant
    config = PlantConfig(plant_id=plant.id)
    db.add(config)

    await db.commit()
    await db.refresh(plant)
    logger.info(f"Created plant id={plant.id} name={plant.name}")
    return plant


async def get_plant(db: AsyncSession, plant_id: int) -> Plant:
    """Return a plant by id or raise 404."""
    result = await db.execute(
        select(Plant)
        .options(selectinload(Plant.config))
        .where(Plant.id == plant_id)
    )
    plant = result.scalar_one_or_none()
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
    return plant


async def list_plants(
    db: AsyncSession, skip: int = 0, limit: int = 100, active_only: bool = True
) -> List[Plant]:
    """Return all plants, optionally filtering inactive ones."""
    query = select(Plant).options(selectinload(Plant.config))
    if active_only:
        query = query.where(Plant.is_active == True)  # noqa: E712
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_plant(db: AsyncSession, plant_id: int, data: PlantUpdate) -> Plant:
    """Update mutable plant fields."""
    plant = await get_plant(db, plant_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(plant, field, value)
    await db.commit()
    await db.refresh(plant)
    return plant


async def delete_plant(db: AsyncSession, plant_id: int) -> dict:
    """Soft-delete a plant by setting is_active = False."""
    plant = await get_plant(db, plant_id)
    plant.is_active = False
    await db.commit()
    logger.info(f"Deactivated plant id={plant_id}")
    return {"detail": "Plant deactivated"}


async def get_plant_config(db: AsyncSession, plant_id: int) -> PlantConfig:
    """Return the config for a plant or raise 404."""
    await get_plant(db, plant_id)  # validates plant exists
    result = await db.execute(
        select(PlantConfig).where(PlantConfig.plant_id == plant_id)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Config for plant {plant_id} not found",
        )
    return config


async def update_plant_config(
    db: AsyncSession, plant_id: int, data: PlantConfigUpdate
) -> PlantConfig:
    """Update plant configuration fields."""
    config = await get_plant_config(db, plant_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return config


async def create_plant_config(
    db: AsyncSession, plant_id: int, data: PlantConfigCreate
) -> PlantConfig:
    """Create or replace the config for a plant."""
    await get_plant(db, plant_id)
    # Check if one already exists
    result = await db.execute(
        select(PlantConfig).where(PlantConfig.plant_id == plant_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        for field, value in data.model_dump().items():
            setattr(existing, field, value)
        await db.commit()
        await db.refresh(existing)
        return existing

    config = PlantConfig(plant_id=plant_id, **data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config
