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
    role: str  # system, user, assistant, tool
    content: str | None = None
    tool_name: str | None = None
    tool_calls: str | None = None  # JSON serialized
    tool_call_id: str | None = None  # Matches assistant tool_calls with tool results
    tool_input: str | None = None  # JSON-serialized arguments for a tool call row
    openui_code: str | None = None  # OpenUI Lang code for assistant/tool messages
    artifact_type: str | None = None  # "slides" or "report"
    artifact_data: str | None = None  # Structured artifact JSON for export
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    thread: Thread | None = Relationship(back_populates="messages")

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "role": self.role,
            "content": self.content or "",
        }
        if self.tool_name:
            data["tool_name"] = self.tool_name
        if self.tool_calls:
            import json
            data["tool_calls"] = json.loads(self.tool_calls)
        return data
