from fastapi import APIRouter

from app.db.session import get_session

router = APIRouter()


@router.get("/orders")
def list_orders(user_id: str):
    db = get_session()
    return db.execute(
        "select * from orders where user_id = :uid", {"uid": user_id}
    )
