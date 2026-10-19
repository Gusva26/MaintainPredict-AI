"""
Modelo de predicción de fallas para MaintainPredict AI.
- Feature engineering a partir de señales de sensores.
- RandomForest entrenado con datos sintéticos industriales.
- Persistencia del modelo en formato joblib.
"""
from __future__ import annotations
import os
import math
import random
from pathlib import Path
from typing import List, Dict
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

MODEL_DIR = Path(os.getenv("ML_MODEL_DIR", "/app/models"))
MODEL_PATH = MODEL_DIR / "rf_v1.joblib"
MODEL_VERSION = "rf-v1.0.0"

SENSOR_TYPES = ["vibration", "temperature", "pressure", "current", "rpm"]

def _feature_vector(signals: List[dict]) -> List[float]:
    """Vector fijo de 15 features (3 por sensor: value, ratio, dev_high)."""
    by_type = {s["type"]: s for s in signals}
    feats: List[float] = []
    for st in SENSOR_TYPES:
        s = by_type.get(st)
        if not s:
            feats.extend([0.0, 0.0, 0.0])
            continue
        v = float(s["value"])
        mn = float(s.get("min") or 0.0)
        mx = float(s.get("max") or 100.0)
        span = max(mx - mn, 1e-6)
        ratio = (v - mn) / span
        dev_high = max(0.0, ratio - 0.7) / 0.3   # 0 si <70%, 1 si en max
        feats.extend([v, ratio, dev_high])
    return feats

def _synthetic_training_set(n: int = 8000, seed: int = 42):
    rng = random.Random(seed)
    X, y = [], []
    for _ in range(n):
        signals = []
        for st in SENSOR_TYPES:
            mn, mx = 0.0, {"vibration": 11.0, "temperature": 95.0, "pressure": 12.0, "current": 60.0, "rpm": 3000.0}[st]
            # 40% muestras sanas, 60% con sesgo hacia alto (falla incipiente)
            high_bias = rng.random() < 0.6
            ratio = rng.uniform(0.75, 1.05) if high_bias else rng.uniform(0.2, 0.75)
            value = mn + ratio * (mx - mn)
            signals.append({"type": st, "value": value, "min": mn, "max": mx})

        feats = _feature_vector(signals)
        # Etiqueta: falla si > 1 sensor supera el 85% del span o vibración muy alta
        ratio_max = max((f[1] for f in [feats[i*3:i*3+3] for i in range(5)]), default=0)
        vib_dev = feats[2]  # dev_high vibración
        label = 1 if (vib_dev > 0.4 or ratio_max > 0.9) else 0

        # Ruido para evitar separabilidad artificial
        if rng.random() < 0.08:
            label = 1 - label
        X.append(feats)
        y.append(label)
    return np.array(X, dtype=float), np.array(y, dtype=int)

def train_or_load() -> RandomForestClassifier:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)
    X, y = _synthetic_training_set()
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X, y)
    try:
        joblib.dump(clf, MODEL_PATH)
    except Exception as e:
        print(f"Warning: Could not save model to {MODEL_PATH}: {e}")
    return clf

_MODEL: RandomForestClassifier | None = None

def get_model() -> RandomForestClassifier:
    global _MODEL
    if _MODEL is None:
        _MODEL = train_or_load()
    return _MODEL

def _component_from_signals(signals: List[dict]) -> str:
    """Componente culpable = tipo de sensor con mayor desviación."""
    best, best_dev = "unknown", 0.0
    for s in signals:
        mn = float(s.get("min") or 0.0)
        mx = float(s.get("max") or 100.0)
        span = max(mx - mn, 1e-6)
        ratio = (float(s["value"]) - mn) / span
        dev = max(0.0, ratio - 0.7) / 0.3
        if dev > best_dev:
            best_dev = dev
            best = s["type"]
    return {
        "vibration": "bearing",
        "temperature": "motor",
        "pressure": "pump",
        "current": "motor",
        "rpm": "belt",
    }.get(best, "unknown")

def _top_features(signals: List[dict], k: int = 3) -> List[dict]:
    feats = []
    for s in signals:
        mn = float(s.get("min") or 0.0)
        mx = float(s.get("max") or 100.0)
        span = max(mx - mn, 1e-6)
        ratio = (float(s["value"]) - mn) / span
        feats.append({"feature": f"{s['type']}.ratio", "value": round(ratio, 3)})
    feats.sort(key=lambda x: x["value"], reverse=True)
    return feats[:k]

def predict(equipment_id: int, signals: List[dict]) -> Dict:
    model = get_model()
    feats = _feature_vector(signals)
    proba = model.predict_proba([feats])[0]
    # clase 1 = falla
    p_fail = float(proba[1]) if len(proba) > 1 else float(proba[0])
    component = _component_from_signals(signals)
    return {
        "equipment_id": equipment_id,
        "component": component,
        "failure_probability": round(p_fail, 3),
        "window": "7d",
        "model_version": MODEL_VERSION,
        "top_features": _top_features(signals),
    }

def evaluate(n: int = 2000, seed: int = 7) -> Dict:
    """Calcula métricas de calidad en un holdout sintético para /ml/metrics."""
    from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
    X, y = _synthetic_training_set(n=n, seed=seed)
    model = get_model()
    y_pred = model.predict(X)
    y_prob = model.predict_proba(X)[:, 1]
    return {
        "model_version": MODEL_VERSION,
        "n": n,
        "precision": round(float(precision_score(y, y_pred, zero_division=0)), 4),
        "recall":    round(float(recall_score(y, y_pred, zero_division=0)), 4),
        "f1":        round(float(f1_score(y, y_pred, zero_division=0)), 4),
        "auc":       round(float(roc_auc_score(y, y_prob)), 4),
    }
