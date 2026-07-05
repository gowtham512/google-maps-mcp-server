import os

import pytest


@pytest.fixture
async def db_session():
    # Use an in-memory SQLite DB for tests
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

    from db import close_db, init_db
    from models import Message, Thread  # noqa: F401

    await init_db()
    yield
    yield
    await close_db()
    if "DATABASE_URL" in os.environ:
        del os.environ["DATABASE_URL"]