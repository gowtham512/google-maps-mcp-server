from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings

DATABASE_URL = settings.database_url if hasattr(settings, "database_url") else "sqlite+aiosqlite:///./travel_agent.db"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)


async def init_db(drop_all: bool = False):
    async with engine.begin() as conn:
        if drop_all:
            await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all, checkfirst=True)


async def migrate_db():
    """Add columns that are missing in an existing SQLite database."""
    from sqlalchemy import inspect as sa_inspect

    async with engine.begin() as conn:
        def _check_columns(sync_conn):
            inspector = sa_inspect(sync_conn)
            columns = {c["name"] for c in inspector.get_columns("message")}
            return columns

        columns = await conn.run_sync(_check_columns)
        if "artifact_type" not in columns:
            await conn.execute("ALTER TABLE message ADD COLUMN artifact_type VARCHAR")
        if "artifact_data" not in columns:
            await conn.execute("ALTER TABLE message ADD COLUMN artifact_data TEXT")


@asynccontextmanager
async def get_session():
    async with AsyncSession(engine) as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def close_db():
    await engine.dispose()