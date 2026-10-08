"""
app/scripts/seed_data.py

Seeds the database with initial roles, permissions, a default admin user,
and a demo solar plant if they do not already exist.

Usage:
    python -m app.scripts.seed_data
"""

import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, init_db
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.user import Role, Permission, User
from app.models.plant import Plant, PlantConfig

logger = get_logger(__name__)


async def seed() -> None:
    logger.info("Initializing tables before seeding...")
    await init_db()

    async with AsyncSessionLocal() as session:
        # 1. Seed Roles & Permissions
        role_admin = await session.scalar(select(Role).where(Role.name == "admin"))
        if not role_admin:
            role_admin = Role(name="admin")
            role_operator = Role(name="operator")
            role_viewer = Role(name="viewer")
            session.add_all([role_admin, role_operator, role_viewer])
            await session.flush()
            logger.info("Created roles: admin, operator, viewer")

        # 2. Seed Default Admin User
        admin_user = await session.scalar(select(User).where(User.email == "admin@solarpulse.ai"))
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@solarpulse.ai",
                hashed_password=hash_password("admin12345"),
                full_name="SolarPulse Administrator",
                role_id=role_admin.id,
                is_active=True,
            )
            session.add(admin_user)
            logger.info("Created default admin user: admin@solarpulse.ai / admin12345")

        # 3. Seed Demo Plant
        demo_plant = await session.scalar(select(Plant).where(Plant.name == "Bhadla Solar Park - Block A"))
        if not demo_plant:
            demo_plant = Plant(
                name="Bhadla Solar Park - Block A",
                location="Phalodi, Rajasthan, India",
                latitude=27.5385,
                longitude=71.9161,
                timezone="Asia/Kolkata",
                capacity_kw=50000.0,
                inverter_capacity_kw=45000.0,
                module_count=130000,
                is_active=True,
            )
            session.add(demo_plant)
            await session.flush()

            demo_config = PlantConfig(
                plant_id=demo_plant.id,
                tilt=26.0,
                azimuth=180.0,
                efficiency=0.195,
                soiling_threshold=5.0,
                clipping_threshold=95.0,
                forecast_horizon_minutes=60,
            )
            session.add(demo_config)
            logger.info(f"Created demo solar plant: {demo_plant.name} (ID: {demo_plant.id})")

        await session.commit()
        logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
