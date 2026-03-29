from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import httpx
import asyncio
from datetime import datetime, timezone
import math
import time

app = FastAPI(title="Space Weather Intelligence API")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model Service URL
MODEL_SERVICE_URL = "http://localhost:8001"

# ─────────────────────────────
# SATELLITE TRACKING (N2YO)
# ─────────────────────────────
N2YO_API_KEY = "6JYDNF-3RSE8G-VJAXS2-5P4Q"
N2YO_BASE_URL = "https://api.n2yo.com/rest/v1/satellite"

# Observer position (central Turkey)
SAT_OBSERVER = {"lat": 38.7205, "lon": 35.4826, "alt": 1050}

# Turkish satellite catalog: name → NORAD ID
TURKISH_SATS = {
    "TÜRKSAT 6A":       60233,
    "TÜRKSAT 5B":       50212,
    "TÜRKSAT 5A":       47306,
    "İMECE":            56178,
    "GÖKTÜRK-1":        41875,
    "CONNECTA IOT-15":  67402,
    "FGN-100-D2":       66299,
    "LUNA-1":           66777,
    "SEMI-1P":          66298,
    "PAUSAT-1":         62653,
    "CONNECTA IOT-4":   60524,
    "CONNECTA IOT-2":   60522,
    "CONNECTA IOT-3":   60475,
    "CONNECTA IOT-1":   60472,
    "TURKSAT 4B":       40984,
    "TURKSAT 4A":       39522,
    "TURKSAT 3U":       39152,
    "ITUPSAT 1":        35935,
    "TURKSAT 3A":       33056,
    "BILSAT 1":         27943,
    "TURKSAT 2A":       26666,
    "TURKSAT 1C":       23949,
    "TURKSAT 1B":       23200,
}

# In-memory cache for satellite positions
_sat_cache = {"data": None, "timestamp": 0, "ttl": 30}  # 30-second TTL

# ─────────────────────────────
# CONFIG & LOCATIONS
# ─────────────────────────────
THRESHOLDS = {
    "kp":      {"warning": 5,    "critical": 7},
    "speed":   {"warning": 500,  "critical": 700},
    "density": {"warning": 10,   "critical": 30},
    "xray":    {"warning": 1e-5, "critical": 1e-4},
    "proton":  {"warning": 10,   "critical": 100},
    "aurora":  {"warning": 50,   "critical": 80},
}

EVENT_TYPES = {
    "kp":      "GEOMAGNETIC_STORM",
    "speed":   "PLASMA_SHOCKWAVE",
    "density": "PLASMA_SHOCKWAVE",
    "xray":    "RADIO_BLACKOUT",
    "proton":  "RADIATION_STORM",
    "aurora":  "AURORAL_ACTIVITY",
}

DESCRIPTIONS = {
    "kp": {
        "NOMINAL":  "Earth's magnetic field is quiet.",
        "WARNING":  "G1-G2: Weak power grid fluctuations.",
        "CRITICAL": "G3-G5: Voltage control problems. High risk for GIC in transformers.",
    },
    "speed": {
        "NOMINAL":  "Normal background solar wind.",
        "WARNING":  "High-speed stream, pre-shock state.",
        "CRITICAL": "Major CME shockwave detected.",
    },
    "density": {
        "NOMINAL":  "Thin plasma.",
        "WARNING":  "Dense plasma cloud.",
        "CRITICAL": "Extremely compressed plasma, heavy impact potential.",
    },
    "xray": {
        "NOMINAL":  "Normal background (A, B, C-class flares).",
        "WARNING":  "R1-R2: Minor to moderate HF radio blackouts on the sunlit side.",
        "CRITICAL": "R3-R5 (X-Class): Severe wide-area HF blackout. Complete signal loss.",
    },
    "proton": {
        "NOMINAL":  "Normal background radiation.",
        "WARNING":  "S1: Minor impacts on HF radio in polar regions.",
        "CRITICAL": "S2-S5: High SEU risk for satellite hardware, high radiation for polar flights.",
    },
    "aurora": {
        "NOMINAL":  "Standard polar auroral oval.",
        "WARNING":  "Aurora expanding equatorward. Minor GPS errors.",
        "CRITICAL": "High LEO atmospheric heating. Severe satellite drag.",
    },
}

ENDPOINTS = {
    "kp":     "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    "wind":   "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json",
    "xray":   "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
    "proton": "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json",
    "aurora": "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
}

CITIES: dict[str, tuple[float, float]] = {
    "kayseri":       (38.72,  35.48),
    "istanbul":      (41.01,  28.97),
    "ankara":        (39.93,  32.85),
    "kahramanmaras": (37.57,  36.92),
    "amsterdam":     (52.36,   4.90),
    "rotterdam":     (51.92,   4.47),
    "berlin":        (52.52,  13.40),
    "london":        (51.50,  -0.12),
    "reykjavik":     (64.14, -21.89),
    "oslo":          (59.91,  10.75),
    "tromso":        (69.64,  18.95),
    "yellowknife":   (62.45, -114.37),
    "new_york":      (40.71,  -74.00),
    "tokyo":         (35.67,  139.65),
    "sydney":        (-33.86, 151.20),
}

# ─────────────────────────────
# SIMPLE TTL CACHE
# ─────────────────────────────
_CACHE_TTL = 60  # seconds — NOAA updates every ~1 min

class _TTLCache:
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._store: dict = {}

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and (time.monotonic() - entry["ts"]) < self._ttl:
            return entry["value"]
        return None

    def set(self, key: str, value) -> None:
        self._store[key] = {"value": value, "ts": time.monotonic()}

_cache = _TTLCache(_CACHE_TTL)

# ─────────────────────────────
# PYDANTIC RESPONSE MODELS
# ─────────────────────────────
class GeographyInfo(BaseModel):
    impact_zone: str
    rule: str
    is_location_vulnerable: Optional[bool] = None

class ParameterAnalysis(BaseModel):
    level: str = Field(description="NOMINAL | WARNING | CRITICAL | UNKNOWN")
    value: Optional[float] = Field(default=None, description="Raw sensor value")
    event_type: Optional[str] = None
    description: Optional[str] = None
    geography: Optional[GeographyInfo] = None

class LocationInfo(BaseModel):
    lat: float
    lon: float
    is_daytime: bool

class SpaceWeatherResponse(BaseModel):
    timestamp: str
    location: LocationInfo
    overall_status: str = Field(description="NOMINAL | WARNING | CRITICAL | UNKNOWN")
    synergy_alerts: list[str]
    telemetry: dict[str, ParameterAnalysis]

class HealthResponse(BaseModel):
    status: str
    timestamp: str

# ─────────────────────────────
# MATH UTILITIES
# ─────────────────────────────
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2.0) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def is_sunlit(lon: float) -> bool:
    """
    Approximates day/night using UTC hour and longitude.
    Note: ignores Earth's axial tilt (~23.4°), so accuracy
    degrades near solstices. Sufficient for a space-weather heuristic.
    """
    now = datetime.now(timezone.utc)
    current_utc_hour = now.hour + (now.minute / 60.0)
    solar_noon_lon = (12.0 - current_utc_hour) * 15.0
    diff = abs((lon - solar_noon_lon + 180) % 360 - 180)
    return diff < 90

# ─────────────────────────────
# ASYNC FETCHERS
# ─────────────────────────────
async def fetch_json(client: httpx.AsyncClient, url: str):
    cached = _cache.get(url)
    if cached is not None:
        return cached
    try:
        response = await client.get(url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        _cache.set(url, data)
        return data
    except httpx.HTTPStatusError as e:
        print(f"NOAA HTTP error ({url}): {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        print(f"NOAA request error ({url}): {e}")
        return None
    except Exception as e:
        print(f"Unexpected fetch error ({url}): {e}")
        return None

async def get_kp(client: httpx.AsyncClient) -> Optional[float]:
    data = await fetch_json(client, ENDPOINTS["kp"])
    if not data:
        return None
    try:
        return float(data[-1][1])
    except (TypeError, IndexError, ValueError):
        return None

async def get_solar_wind(client: httpx.AsyncClient) -> dict:
    data = await fetch_json(client, ENDPOINTS["wind"])
    if not data:
        return {"speed": None, "density": None}
    for row in reversed(data):
        try:
            return {"density": float(row[1]), "speed": float(row[2])}
        except (TypeError, IndexError, ValueError):
            continue
    return {"speed": None, "density": None}

async def get_xray(client: httpx.AsyncClient) -> Optional[float]:
    data = await fetch_json(client, ENDPOINTS["xray"])
    if not data:
        return None
    try:
        return float(data[-1]["flux"])
    except (TypeError, IndexError, KeyError, ValueError):
        return None

async def get_proton(client: httpx.AsyncClient) -> Optional[float]:
    data = await fetch_json(client, ENDPOINTS["proton"])
    if not data:
        return None
    try:
        return float(data[-1]["flux"])
    except (TypeError, IndexError, KeyError, ValueError):
        return None

async def get_aurora(client: httpx.AsyncClient, lat: float, lon: float) -> Optional[float]:
    data = await fetch_json(client, ENDPOINTS["aurora"])
    if not data or "coordinates" not in data:
        return None

    points = data["coordinates"]
    best_prob: Optional[float] = None
    min_dist = float("inf")

    # Pre-filter: only consider points within ~5 degrees (~555 km) to
    # avoid O(n) full scan on the full ~100k-point ovation dataset.
    lat_tol = 5.0
    lon_tol = 5.0 / max(math.cos(math.radians(lat)), 0.01)

    for p in points:
        try:
            plon, plat, prob = float(p[0]), float(p[1]), float(p[2])
        except (TypeError, IndexError, ValueError):
            continue

        # Cheap bounding-box reject before expensive haversine
        if abs(plat - lat) > lat_tol or abs(plon - lon) > lon_tol:
            continue

        dist = haversine_distance(lat, lon, plat, plon)
        if dist < min_dist:
            min_dist = dist
            best_prob = prob

    # Fallback: if pre-filter was too aggressive (e.g. polar gap), do full scan
    if best_prob is None:
        for p in points:
            try:
                plon, plat, prob = float(p[0]), float(p[1]), float(p[2])
                dist = haversine_distance(lat, lon, plat, plon)
                if dist < min_dist:
                    min_dist = dist
                    best_prob = prob
            except (TypeError, IndexError, ValueError):
                continue

    return best_prob

# ─────────────────────────────
# EVALUATION & HEURISTICS
# ─────────────────────────────
def get_geography(param: str, level: str, lat: float, lon: float) -> dict:
    if level == "NOMINAL":
        return {"impact_zone": "NONE", "rule": "No active threat."}

    if param == "kp":
        if level == "WARNING":
            return {"impact_zone": "HIGH_LATITUDE",  "rule": "Latitudes > 50° (e.g., Amsterdam, London)"}
        if level == "CRITICAL":
            return {"impact_zone": "MID_LATITUDE",   "rule": "Latitudes > 40° (e.g., New York, Istanbul)"}

    if param in ("speed", "density"):
        return {"impact_zone": "GLOBAL_ORBIT", "rule": "Planetary-scale shield impact."}

    if param == "xray":
        return {
            "impact_zone": "SUNLIT_HEMISPHERE",
            "rule": "Only affects day-side of Earth.",
            "is_location_vulnerable": is_sunlit(lon),
        }

    if param == "proton":
        return {"impact_zone": "POLAR_ONLY", "rule": "Latitudes > 60° (e.g., Tromso, Reykjavik)"}

    if param == "aurora":
        return {"impact_zone": "LOCAL_COORDINATE", "rule": "Radius expanding from magnetic poles."}

    return {"impact_zone": "UNKNOWN", "rule": ""}

def evaluate(param: str, value: Optional[float], lat: float, lon: float) -> dict:
    if value is None:
        return {"level": "UNKNOWN", "value": None}

    t = THRESHOLDS.get(param)
    if not t:
        return {"level": "UNKNOWN", "value": value}

    if value >= t["critical"]:
        level = "CRITICAL"
    elif value >= t["warning"]:
        level = "WARNING"
    else:
        level = "NOMINAL"

    return {
        "level":       level,
        "value":       value,
        "event_type":  EVENT_TYPES.get(param, "UNKNOWN"),
        "description": DESCRIPTIONS.get(param, {}).get(level, ""),
        "geography":   get_geography(param, level, lat, lon),
    }

def overall_level(results: dict) -> str:
    order = {"UNKNOWN": 0, "NOMINAL": 1, "WARNING": 2, "CRITICAL": 3}
    levels = [r["level"] for r in results.values()]
    if not levels:
        return "UNKNOWN"
    return max(levels, key=lambda x: order.get(x, 0))

def check_synergies(analysis: dict) -> list[str]:
    alerts = []

    if (analysis.get("kp",      {}).get("level") == "CRITICAL" and
        analysis.get("speed",   {}).get("level") == "CRITICAL" and
        analysis.get("density", {}).get("level") == "CRITICAL"):
        alerts.append(
            "CME DIRECT HIT: Extreme density and speed combination. "
            "Geomagnetic shield is severely compromised (Kp 7+). "
            "Initiate emergency protocols."
        )

    if analysis.get("xray", {}).get("level") == "CRITICAL":
        alerts.append(
            "AVIATION BLACKOUT CONFIRMED: X-Class flare in progress. "
            "Total loss of HF radio contact on sunlit hemisphere."
        )

    if (analysis.get("proton", {}).get("level") == "CRITICAL" and
        analysis.get("aurora", {}).get("level") == "CRITICAL"):
        alerts.append(
            "SATELLITE HAZARD DETECTED: Dual threat in Low Earth Orbit. "
            "High radiation combined with extreme atmospheric drag."
        )

    return alerts

# ─────────────────────────────
# ENGINE
# ─────────────────────────────
async def generate_report(lat: float, lon: float) -> dict:
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            get_kp(client),
            get_solar_wind(client),
            get_xray(client),
            get_proton(client),
            get_aurora(client, lat, lon),
            return_exceptions=True,
        )

    kp, wind, xray, proton, aurora = [
        None if isinstance(r, Exception) else r for r in results
    ]
    if wind is None:
        wind = {"speed": None, "density": None}

    raw = {
        "kp":      kp,
        "speed":   wind.get("speed"),
        "density": wind.get("density"),
        "xray":    xray,
        "proton":  proton,
        "aurora":  aurora,
    }

    analysis = {k: evaluate(k, v, lat, lon) for k, v in raw.items()}

    return {
        "timestamp":      datetime.now(timezone.utc).isoformat(),
        "location":       {"lat": lat, "lon": lon, "is_daytime": is_sunlit(lon)},
        "overall_status": overall_level(analysis),
        "synergy_alerts": check_synergies(analysis),
        "telemetry":      analysis,
    }

def resolve_location(
    city: Optional[str],
    lat:  Optional[float],
    lon:  Optional[float],
) -> tuple[float, float]:
    if city:
        key = (city.lower()
               .replace("ş", "s").replace("ı", "i").replace("ğ", "g")
               .replace("ü", "u").replace("ö", "o").replace("ç", "c"))
        if key in CITIES:
            return CITIES[key]
        raise HTTPException(
            status_code=404,
            detail=f"City '{city}' not found. Use lat/lon or check the city name.",
        )
    if lat is not None and lon is not None:
        return lat, lon
    raise HTTPException(
        status_code=400,
        detail="Provide either ?city= or both ?lat= and ?lon=.",
    )

# ─────────────────────────────
# ROUTES
# ─────────────────────────────
@app.get("/space-weather", response_model=SpaceWeatherResponse)
async def space_weather(
    city: Optional[str]   = Query(None, description="e.g. kayseri, amsterdam, tromso"),
    lat:  Optional[float] = Query(None, ge=-90.0,  le=90.0,  description="Latitude  (-90 to 90)"),
    lon:  Optional[float] = Query(None, ge=-180.0, le=180.0, description="Longitude (-180 to 180)"),
):
    final_lat, final_lon = resolve_location(city, lat, lon)
    return await generate_report(final_lat, final_lon)

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

# ─────────────────────────────
# REAL-TIME FLIGHT TRACKING (OpenSky Network)
# ─────────────────────────────
TURKISH_AIRLINES = {
    "THY": "Türk Hava Yolları",
    "PGT": "Pegasus",
    "SXS": "SunExpress",
    "FHY": "Freebird",
    "CAI": "Corendon",
}

OPENSKY_URL = "https://opensky-network.org/api/states/all"
# Bounding box: Turkey airspace
TURKEY_BBOX = {"lamin": 35.8, "lomin": 25.6, "lamax": 42.1, "lomax": 44.8}

_flight_cache = {"data": None, "timestamp": 0, "ttl": 15}  # 15-second TTL


@app.get("/flights")
async def get_flights():
    """
    Fetch real-time flight positions of Turkish airlines over Turkey.
    Uses OpenSky Network free API. Cached for 15 seconds.
    """
    now = time.time()

    if _flight_cache["data"] is not None and (now - _flight_cache["timestamp"]) < _flight_cache["ttl"]:
        return _flight_cache["data"]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                OPENSKY_URL,
                #params=TURKEY_BBOX,
                timeout=10.0,
            )
            if resp.status_code != 200:
                print(f"[FLIGHT] OpenSky returned {resp.status_code}")
                return _flight_cache["data"] or {"flights": [], "count": 0}

            raw = resp.json()
            states = raw.get("states", []) or []
    except Exception as e:
        print(f"[FLIGHT] OpenSky fetch failed: {e}")
        return _flight_cache["data"] or {"flights": [], "count": 0}

    # Filter for Turkish airlines
    flights = []
    for s in states:
        callsign = (s[1] or "").strip()
        if not callsign or len(callsign) < 3:
            continue
        prefix = callsign[:3]
        if prefix not in TURKISH_AIRLINES:
            continue

        lat = s[6]
        lon = s[5]
        if lat is None or lon is None:
            continue

        flights.append({
            "callsign": callsign,
            "airline": TURKISH_AIRLINES[prefix],
            "airline_code": prefix,
            "lat": lat,
            "lon": lon,
            "altitude_m": s[7] or 0,        # geometric altitude (meters)
            "velocity_ms": s[9] or 0,        # ground speed m/s
            "heading": s[10] or 0,           # true track (degrees)
            "vertical_rate": s[11] or 0,     # m/s
            "on_ground": s[8] or False,
            "origin_country": s[2] or "",
        })

    response = {
        "flights": flights,
        "count": len(flights),
        "total_over_turkey": len(states),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _flight_cache["data"] = response
    _flight_cache["timestamp"] = now
    print(f"[FLIGHT] {len(flights)} Turkish airline flights found ({len(states)} total over Turkey)")

    return response
# ─────────────────────────────
# SATELLITE TRACKING
# ─────────────────────────────
async def fetch_one_satellite(client: httpx.AsyncClient, name: str, norad_id: int) -> Optional[dict]:
    """Fetch position for a single satellite from N2YO."""
    url = (
        f"{N2YO_BASE_URL}/positions/{norad_id}"
        f"/{SAT_OBSERVER['lat']}/{SAT_OBSERVER['lon']}/{SAT_OBSERVER['alt']}"
        f"/1?apiKey={N2YO_API_KEY}"
    )
    try:
        resp = await client.get(url, timeout=10.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        positions = data.get("positions", [])
        if not positions:
            return None
        pos = positions[0]
        return {
            "name": name,
            "norad_id": norad_id,
            "lat": pos.get("satlatitude", 0),
            "lon": pos.get("satlongitude", 0),
            "altitude_km": pos.get("sataltitude", 0),
            "azimuth": pos.get("azimuth", 0),
            "elevation": pos.get("elevation", 0),
            "timestamp": pos.get("timestamp", 0),
        }
    except Exception as e:
        print(f"[SAT] Failed to fetch {name}: {e}")
        return None


def compute_danger_levels(satellites: list, kp_value: float) -> list:
    """Add danger_level to each satellite based on Kp-driven auroral latitude."""
    # Auroral zone boundary: moves equatorward as Kp increases
    auroral_lat = 90 - kp_value * 7.5
    warning_lat = auroral_lat + 10  # pre-danger zone

    for sat in satellites:
        abs_lat = abs(sat["lat"])
        if abs_lat >= auroral_lat:
            sat["danger_level"] = "CRITICAL"
        elif abs_lat >= warning_lat:
            sat["danger_level"] = "WARNING"
        else:
            sat["danger_level"] = "NOMINAL"
    return satellites


@app.get("/satellites")
async def get_satellites():
    """
    Fetch real-time positions of all Turkish satellites.
    Results are cached for 30 seconds to respect N2YO rate limits.
    """
    now = time.time()

    # Return cached data if fresh enough
    if _sat_cache["data"] is not None and (now - _sat_cache["timestamp"]) < _sat_cache["ttl"]:
        return _sat_cache["data"]

    # Fetch latest Kp for danger assessment
    kp_value = 0
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(NOAA_URLS["kp"], timeout=5.0)
            if resp.status_code == 200:
                kp_data = resp.json()
                if kp_data and len(kp_data) > 1:
                    last = kp_data[-1]
                    try:
                        kp_value = float(last.get("kp_index", 0) or 0)
                    except (ValueError, TypeError):
                        kp_value = 0
    except Exception:
        pass

    # Fetch all satellite positions concurrently
    async with httpx.AsyncClient() as client:
        tasks = [
            fetch_one_satellite(client, name, norad_id)
            for name, norad_id in TURKISH_SATS.items()
        ]
        results = await asyncio.gather(*tasks)

    satellites = [r for r in results if r is not None]
    satellites = compute_danger_levels(satellites, kp_value)

    response = {
        "satellites": satellites,
        "count": len(satellites),
        "kp_value": kp_value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Cache the result
    _sat_cache["data"] = response
    _sat_cache["timestamp"] = now

    return response

# ─────────────────────────────
# LLM REPORT GENERATION
# ─────────────────────────────
class ReportRequest(BaseModel):
    city: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None

class ReportResponse(BaseModel):
    report: str
    telemetry_snapshot: dict
    tokens_generated: int
    elapsed_seconds: float
    tokens_per_sec: float

def build_llm_prompt(telemetry_data: dict) -> str:
    """Build a structured prompt focused strictly on analysis, plain text only."""
    t = telemetry_data.get("telemetry", {})
    overall = telemetry_data.get("overall_status", "UNKNOWN")
    location = telemetry_data.get("location", {})
    synergy_alerts = telemetry_data.get("synergy_alerts", [])

    # We only feed the severity levels to the LLM for context
    kp_level = t.get("kp", {}).get("level", "UNKNOWN")
    speed_level = t.get("speed", {}).get("level", "UNKNOWN")
    density_level = t.get("density", {}).get("level", "UNKNOWN")
    xray_level = t.get("xray", {}).get("level", "UNKNOWN")
    proton_level = t.get("proton", {}).get("level", "UNKNOWN")

    alerts_text = "\n".join(f"  - {a}" for a in synergy_alerts) if synergy_alerts else "  - None"
    
    # Extract location context
    lat = location.get("lat", "N/A")
    lon = location.get("lon", "N/A")
    is_daytime = "Yes (Sunlit Hemisphere)" if location.get("is_daytime", False) else "No (Nightside)"

    prompt = f"""You are an expert Space Weather Intelligence Analyst. 
The user is viewing a real-time dashboard that already displays all current metric values, timestamps, and coordinates. 

=== INVISIBLE SYSTEM CONTEXT (FOR YOUR REASONING ONLY) ===
- Location: Latitude {lat}, Longitude {lon} | Daytime: {is_daytime}
- Overall Threat: {overall}
- Threat Levels: Kp [{kp_level}], Wind Speed [{speed_level}], Wind Density [{density_level}], X-Ray [{xray_level}], Proton [{proton_level}]
- System Alerts: {alerts_text}

=== YOUR TASK ===
Generate a high-signal, purely analytical Situational Awareness Report. 

CRITICAL FORMATTING RULES: 
1. DO NOT regurgitate the raw metrics, numbers, or timestamps. The user already sees them.
2. ABSOLUTELY NO ASTERISKS (*). Do not use Markdown bolding, italics, or asterisk bullets. 
3. Use plain text dashes (-) for lists and ALL CAPS for section headers.

Focus strictly on extracting the "So What?" and format your response exactly like this:

- THREAT SYNTHESIS: [Your analysis of the combined meaning of the current threat levels]
- LOCALIZED IMPACT: [How conditions affect operations at the target location]
- ACTIONABLE DIRECTIVES: [Specific infrastructure risks or confirmation of stable conditions]

Keep the report concise, clinical, and directly to the point.
"""

    return prompt


@app.post("/generate-report")
async def generate_report_endpoint(req: ReportRequest):
    """Fetch telemetry, build prompt, stream LLM tokens as SSE in real-time."""
    from fastapi.responses import StreamingResponse
    import json

    # Resolve location
    final_lat, final_lon = resolve_location(req.city, req.lat, req.lon)

    # Fetch latest telemetry
    telemetry_data = await generate_report(final_lat, final_lon)

    # Build prompt
    prompt = build_llm_prompt(telemetry_data)
    print(f"[REPORT] Sending prompt to Model Service ({len(prompt)} chars)...")

    async def proxy_stream():
        """Proxy SSE events from Model Service to Frontend."""
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{MODEL_SERVICE_URL}/infer-stream",
                    json={"prompt": prompt, "max_new_tokens": 1024},
                    timeout=120.0,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            # Forward SSE event directly
                            yield f"{line}\n\n"
        except httpx.ConnectError:
            error = json.dumps({"error": "Model Service is not running. Start it with: cd Model && python inference.py"})
            yield f"data: {error}\n\n"
        except Exception as e:
            error = json.dumps({"error": f"Failed to generate report: {str(e)}"})
            yield f"data: {error}\n\n"

    return StreamingResponse(
        proxy_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


