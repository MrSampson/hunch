from fastapi import FastAPI

from app.api.orders import router

app = FastAPI(title="orders-demo")
app.include_router(router)
