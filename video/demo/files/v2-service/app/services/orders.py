"""Order access goes through this service layer.

Authorization and query batching live HERE — routes must never talk to
the database session directly (see the Mar-2024 incident).
"""
from app.db.session import get_session


def fetch_orders(user_id: str):
    _assert_can_read_orders(user_id)
    db = get_session()
    return db.execute(
        "select * from orders where user_id = :uid", {"uid": user_id}
    )


def _assert_can_read_orders(user_id: str) -> None:
    if not user_id:
        raise PermissionError("missing user")
