import os
from contextlib import asynccontextmanager
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings

_engine = None


def _current_database_url():
    # Allow DATABASE_URL env var to override the loaded settings at runtime.
    # This lets tests switch to in-memory SQLite without reloading settings.
    return os.environ.get("DATABASE_URL") or settings.database_url


def _build_engine(url: str):
    kwargs = {"echo": False, "future": True}
    connect_args: dict = {}

    if url.startswith("postgresql+asyncpg://"):
        # Neon Postgres (and any remote Postgres) benefits from pre-ping and
        # connection recycling so stale pooled connections are discarded.
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = 300

        # asyncpg accepts an `ssl` kwarg, not `sslmode` or `channel_binding`.
        # Parse them out of the query string and translate them here.
        parsed = urlparse(url)
        query = parse_qs(parsed.query, keep_blank_values=True)
        if "sslmode" in query:
            sslmode = query.pop("sslmode")[0].lower()
            connect_args["ssl"] = sslmode != "disable"
        # channel_binding is not supported by asyncpg either.
        query.pop("channel_binding", None)
        if not query:
            url = urlunparse(parsed._replace(query=""))
        else:
            url = urlunparse(parsed._replace(query=urlencode(query, doseq=True)))

    if connect_args:
        kwargs["connect_args"] = connect_args
    return create_async_engine(url, **kwargs)


def get_engine():
    global _engine
    if _engine is None:
        _engine = _build_engine(_current_database_url())
    return _engine


def reset_engine():
    """Dispose and recreate the engine. Useful for tests that change DATABASE_URL."""
    global _engine
    if _engine is not None:
        _engine.sync_engine.dispose()
        _engine = None


async def init_db(drop_all: bool = False):
    engine = get_engine()
    async with engine.begin() as conn:
        if drop_all:
            await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all, checkfirst=True)


async def migrate_db():
    """Add columns that are missing in the message/thread tables.

    Works for both SQLite (legacy/dev) and Postgres (Neon/production).
    The User table is created by SQLModel.metadata.create_all in init_db,
    so here we only need to backfill new columns on existing tables.
    """
    engine = get_engine()
    async with engine.begin() as conn:

        def _check_columns(sync_conn):
            inspector = sa_inspect(sync_conn)
            tables = inspector.get_table_names()
            result = {}
            for table in tables:
                result[table] = {c["name"] for c in inspector.get_columns(table)}
            return result

        table_columns = await conn.run_sync(_check_columns)

        # --- message table ---
        message_cols = table_columns.get("message", set())
        if "artifact_type" not in message_cols:
            await conn.execute(text("ALTER TABLE message ADD COLUMN artifact_type VARCHAR"))
        if "artifact_data" not in message_cols:
            await conn.execute(text("ALTER TABLE message ADD COLUMN artifact_data TEXT"))
        if "tool_call_id" not in message_cols:
            await conn.execute(text("ALTER TABLE message ADD COLUMN tool_call_id VARCHAR"))
        if "tool_input" not in message_cols:
            await conn.execute(text("ALTER TABLE message ADD COLUMN tool_input TEXT"))

        # --- thread table ---
        thread_cols = table_columns.get("thread", set())
        if "user_id" not in thread_cols:
            # Allow NULL so existing threads survive the migration
            await conn.execute(text("ALTER TABLE thread ADD COLUMN user_id INTEGER"))


@asynccontextmanager
async def get_session():
    async with AsyncSession(get_engine()) as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def close_db():
    if _engine is not None:
        await _engine.dispose()
