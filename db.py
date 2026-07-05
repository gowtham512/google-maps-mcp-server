from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings

DATABASE_URL = settings.database_url if hasattr(settings, "database_url") else "sqlite+aiosqlite:///./travel_agent.db"

engine = create_async_engine(DATABASE_URL, echo=False, future=True)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


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