from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    r = client.get("/ml/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_predict_requires_api_key():
    r = client.post("/ml/predict-failure", json={"equipment_id": 1, "signals": []})
    assert r.status_code == 401

def test_predict_high_vibration():
    payload = {
        "equipment_id": 1,
        "signals": [
            {"type": "vibration", "value": 10.5, "min": 0, "max": 11},
            {"type": "temperature", "value": 90.0, "min": 0, "max": 95},
        ],
    }
    r = client.post(
        "/ml/predict-failure",
        json=payload,
        headers={"x-api-key": "ml_internal_key_change_me"}
    )
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["failure_probability"] <= 1
    assert body["component"] in {"bearing", "motor", "pump", "belt", "unknown"}
