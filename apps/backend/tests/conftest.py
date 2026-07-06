import os

import pytest


@pytest.fixture
async def db_session():
    # Default to in-memory SQLite for tests unless the caller provides DATABASE_URL.
    original = os.environ.get("DATABASE_URL")
    if not original:
        os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

    from db import close_db, init_db, reset_engine
    from models import Message, Thread  # noqa: F401

    reset_engine()
    await init_db()
    yield
    await close_db()

    if original is None:
        if "DATABASE_URL" in os.environ:
            del os.environ["DATABASE_URL"]
    else:
        os.environ["DATABASE_URL"] = original
