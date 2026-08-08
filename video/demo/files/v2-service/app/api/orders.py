from fastapi import APIRouter

from app.services.orders import fetch_orders

router = APIRouter()


@router.get("/orders")
def list_orders(user_id: str):
    return fetch_orders(user_id)
