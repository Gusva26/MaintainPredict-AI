from typing import List, Optional
from pydantic import BaseModel, Field

class SensorSignal(BaseModel):
    type: str = Field(..., description="vibration|temperature|pressure|current|rpm")
    value: float
    min: Optional[float] = 0.0
    max: Optional[float] = 100.0

class PredictRequest(BaseModel):
    equipment_id: int
    equipment_type: Optional[str] = None
    criticality: Optional[str] = "medium"
    signals: List[SensorSignal]

class PredictResponse(BaseModel):
    equipment_id: int
    component: str
    failure_probability: float = Field(..., ge=0, le=1)
    window: str = "7d"
    model_version: str
    top_features: List[dict]
