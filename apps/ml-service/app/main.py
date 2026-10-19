import os
from fastapi import FastAPI, Header, HTTPException, status
from .schemas import PredictRequest, PredictResponse
from .model import predict, evaluate, MODEL_VERSION, get_model

API_KEY = os.getenv("ML_SERVICE_API_KEY", "ml_internal_key_change_me")

app = FastAPI(
    title="MaintainPredict ML Service",
    version=MODEL_VERSION,
    description="Microservicio de Machine Learning para predicción de fallas industriales."
)

def _auth(x_api_key: str | None):
    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key provided to ML service"
        )

@app.on_event("startup")
def _warmup():
    try:
        get_model()  # Entrena o carga el modelo durante el arranque
    except Exception as e:
        print(f"Startup model load warning: {e}")

@app.get("/ml/health")
def health():
    return {
        "status": "ok",
        "service": "ml-service",
        "model_version": MODEL_VERSION
    }

@app.get("/ml/metrics")
def metrics():
    return evaluate()

@app.post("/ml/predict-failure", response_model=PredictResponse)
def predict_failure(req: PredictRequest, x_api_key: str | None = Header(default=None)):
    _auth(x_api_key)
    result = predict(req.equipment_id, [s.model_dump() for s in req.signals])
    return result
