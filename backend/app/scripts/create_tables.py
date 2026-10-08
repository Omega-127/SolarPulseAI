"""
app/scripts/create_tables.py

Standalone script to create all database tables defined in SQLAlchemy models.
Usage:
    python -m app.scripts.create_tables
"""

import asyncio
from app.core.database import init_db
from app.core.logging import get_logger

logger = get_logger(__name__)


async def main() -> None:
    logger.info("Initializing database tables...")
    try:
        await init_db()
        logger.info("Successfully created all database tables.")
    except Exception as exc:
        logger.error(f"Error creating database tables: {exc}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
