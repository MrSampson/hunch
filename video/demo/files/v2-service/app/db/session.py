"""Thin database session wrapper (demo stand-in for SQLAlchemy)."""


class Session:
    def execute(self, query: str, params: dict | None = None):
        ...


def get_session() -> Session:
    return Session()
