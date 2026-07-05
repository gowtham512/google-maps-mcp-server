from datetime import datetime, timezone
from typing import Any

from sqlmodel import Field, Relationship, SQLModel


class Thread(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = "New Chat"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    messages: list["Message"] = Relationship(back_populates="thread")


class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    thread_id: str = Field(index=True, foreign_key="thread.id")
    role: str  # system, user, assistant, tool
    content: str | None = None
    tool_name: str | None = None
    tool_calls: str | None = None  # JSON serialized
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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