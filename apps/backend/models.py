from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, DateTime
from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    threads: list["Thread"] = Relationship(back_populates="user")


class Thread(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = "New Chat"
    user_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    messages: list["Message"] = Relationship(back_populates="thread")
    user: User | None = Relationship(back_populates="threads")


class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    thread_id: str = Field(index=True, foreign_key="thread.id")
    role: str  # user, assistant
    content: str | None = None
    # Enriched tool call data — only set on assistant messages that made tool calls.
    # Schema: [{"id": str, "name": str, "input": str (JSON), "result": str, "status": "done"}]
    tool_calls: str | None = None  # JSON serialized
    openui_code: str | None = None  # OpenUI Lang code for the final assistant response
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    thread: Thread | None = Relationship(back_populates="messages")

    def to_dict(self) -> dict[str, Any]:
        import json
        data: dict[str, Any] = {
            "role": self.role,
            "content": self.content or "",
        }
        if self.tool_calls:
            data["tool_calls"] = json.loads(self.tool_calls)
        return data
