"""
Análisis nocturno de AutoGas Ica (fase 5).

Lee los servicios de aceite de Firestore, calcula por vehículo la recencia,
la frecuencia y el monto (RFM), los agrupa con K-Means y guarda el resultado
en la colección `analitica`, documento `segmentos`.

Se ejecuta todos los días a las 2:00 a. m. (hora de Lima).
Requiere el plan Blaze de Firebase. Despliegue:  firebase deploy --only functions
"""

from datetime import date, datetime, timezone

import pandas as pd
from firebase_admin import firestore, initialize_app
from firebase_functions import scheduler_fn
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

initialize_app()

DIAS_POR_DEFECTO = 64  # mediana real entre cambios de aceite (mar–ago 2026)


def cargar_servicios(db) -> pd.DataFrame:
    filas = []
    for d in db.collection("serviciosAceite").stream():
        x = d.to_dict()
        if x.get("eliminado"):
            continue
        filas.append(
            {
                "placa": x.get("placa"),
                "fecha": x.get("fecha"),
                "monto": float(x.get("monto") or 0),
                "celular": x.get("celular") or "",
                "clienteId": x.get("clienteId") or "",
            }
        )
    df = pd.DataFrame(filas)
    if df.empty:
        return df
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    return df.dropna(subset=["placa", "fecha"])


def calcular_rfm(df: pd.DataFrame, hoy: pd.Timestamp) -> pd.DataFrame:
    g = df.sort_values("fecha").groupby("placa")
    rfm = pd.DataFrame(
        {
            "ultima": g["fecha"].max(),
            "primera": g["fecha"].min(),
            "visitas": g["fecha"].count(),
            "monto": g["monto"].sum(),
            "celular": g["celular"].agg(lambda s: next((c for c in reversed(list(s)) if c), "")),
            "clienteId": g["clienteId"].agg(lambda s: next((c for c in reversed(list(s)) if c), "")),
        }
    )
    rfm["recencia"] = (hoy - rfm["ultima"]).dt.days

    # Intervalo propio de cada vehículo (mediana de días entre visitas, ignorando < 8 días)
    def intervalo(fechas: pd.Series) -> float:
        d = fechas.sort_values().diff().dt.days.dropna()
        d = d[d > 7]
        return float(d.median()) if len(d) else float("nan")

    rfm["intervalo"] = g["fecha"].apply(intervalo).fillna(DIAS_POR_DEFECTO)
    rfm["proximo"] = rfm["ultima"] + pd.to_timedelta(rfm["intervalo"], unit="D")
    return rfm


def segmento_por_regla(r) -> str:
    """Misma regla que muestra la aplicación, para que ambos digan lo mismo."""
    if r.visitas >= 3:
        return "leal"
    if r.visitas == 2 and r.recencia <= 60:
        return "recurrente"
    if r.visitas == 1 and (r.recencia + (r.ultima - r.primera).days) <= 45:
        return "nuevo"
    if r.recencia > 120:
        return "perdido"
    return "riesgo"


def agrupar_kmeans(rfm: pd.DataFrame, k: int = 5) -> pd.Series:
    """K-Means sobre recencia, frecuencia y monto. Sirve para descubrir grupos que la regla no ve."""
    if len(rfm) < k * 10:
        return pd.Series(-1, index=rfm.index)
    x = StandardScaler().fit_transform(rfm[["recencia", "visitas", "monto"]])
    return pd.Series(KMeans(n_clusters=k, n_init=10, random_state=7).fit_predict(x), index=rfm.index)


@scheduler_fn.on_schedule(schedule="0 2 * * *", timezone=scheduler_fn.Timezone("America/Lima"))
def analisis_nocturno(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client()
    df = cargar_servicios(db)
    if df.empty:
        return
    hoy = pd.Timestamp(date.today())
    rfm = calcular_rfm(df, hoy)
    rfm["segmento"] = rfm.apply(segmento_por_regla, axis=1)
    rfm["grupo"] = agrupar_kmeans(rfm)

    resumen = (
        rfm.groupby("segmento")
        .agg(vehiculos=("visitas", "size"), ingresos=("monto", "sum"), conCelular=("celular", lambda s: float((s != "").mean())))
        .round(2)
        .reset_index()
        .to_dict(orient="records")
    )
    grupos = (
        rfm[rfm["grupo"] >= 0]
        .groupby("grupo")
        .agg(vehiculos=("visitas", "size"), recencia=("recencia", "mean"), visitas=("visitas", "mean"), monto=("monto", "mean"))
        .round(1)
        .reset_index()
        .to_dict(orient="records")
    )
    retorno = float((rfm["visitas"] >= 2).mean())

    db.collection("analitica").document("segmentos").set(
        {
            "calculadoEn": datetime.now(timezone.utc).isoformat(),
            "vehiculos": int(len(rfm)),
            "tasaRetorno": round(retorno, 4),
            "segmentos": resumen,
            "gruposKMeans": grupos,
        }
    )
