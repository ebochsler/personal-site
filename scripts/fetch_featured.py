"""
Fetch featured runs from Strava API — aggregates all runs per target city.

Searches the user's full activity history, finds ALL runs within ~50 km of
each target city, aggregates total miles/runs, picks the longest run as the
featured highlight, fetches its detailed polyline, and saves results to
data/featured-routes.json.

Run once manually:
    pip install -r scripts/requirements.txt
    python scripts/fetch_featured.py

Requires .env with:
    STRAVA_CLIENT_ID=...
    STRAVA_CLIENT_SECRET=...
    STRAVA_REFRESH_TOKEN=...
"""

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "featured-routes.json"

# Target cities: (name, lat, lng, continent)
# continent: "na" = North America, "eu" = Europe
TARGET_CITIES = [
    ("Seattle", 47.61, -122.33, "na"),
    ("Zion", 37.30, -113.02, "na"),
    ("Bryce Canyon", 37.59, -112.19, "na"),
    ("Horseshoe Bend", 36.88, -111.51, "na"),
    ("Boston", 42.36, -71.06, "na"),
    ("New York", 40.71, -74.01, "na"),
    ("Ensenada", 31.87, -116.60, "na"),
    ("Portland, OR", 45.52, -122.68, "na"),
    ("Portland, ME", 43.66, -70.26, "na"),
    ("Holliston", 42.20, -71.42, "na"),
    ("Las Vegas", 36.17, -115.14, "na"),
    ("Mazatlan", 23.24, -106.41, "na"),
    ("Montreal", 45.50, -73.57, "na"),
    ("Belize", 17.09, -89.07, "na"),
    ("Paris", 48.86, 2.35, "eu"),
    ("Rome", 41.90, 12.50, "eu"),
    ("Barcelona", 41.39, 2.17, "eu"),
    ("Madrid", 40.42, -3.70, "eu"),
    ("Iceland", 64.13, -21.90, "eu"),
    ("Copenhagen", 55.68, 12.57, "eu"),
]

RADIUS_KM = 50


def get_access_token():
    """Exchange refresh token for a fresh access token."""
    resp = requests.post(STRAVA_TOKEN_URL, data={
        "client_id": os.environ["STRAVA_CLIENT_ID"],
        "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
        "refresh_token": os.environ["STRAVA_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    return resp.json()["access_token"]


def haversine_km(lat1, lon1, lat2, lon2):
    """Return distance in km between two lat/lng points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def decode_polyline(encoded):
    """Decode a Google-encoded polyline string into a list of [lat, lng] pairs."""
    coords = []
    idx = 0
    lat = 0
    lng = 0
    while idx < len(encoded):
        for is_lng in (False, True):
            shift = 0
            result = 0
            while True:
                b = ord(encoded[idx]) - 63
                idx += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            diff = (~(result >> 1)) if (result & 1) else (result >> 1)
            if is_lng:
                lng += diff
            else:
                lat += diff
        coords.append([lat / 1e5, lng / 1e5])
    return coords


def meters_to_miles(m):
    return round(m / 1609.344, 2)


def meters_to_feet(m):
    return round(m * 3.28084)


def seconds_to_pace(distance_m, elapsed_s):
    if distance_m == 0:
        return 0
    miles = distance_m / 1609.344
    return round(elapsed_s / 60 / miles, 2)


def fetch_all_activities(token):
    """Fetch ALL activities (any type) across the user's full history."""
    activities = []
    page = 1
    while True:
        resp = requests.get(f"{STRAVA_API_BASE}/athlete/activities", params={
            "per_page": 200,
            "page": page,
        }, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        activities.extend(batch)
        page += 1
        print(f"  Fetched page {page - 1} ({len(batch)} activities)")
    return activities


def find_all_runs_near(activities, city_lat, city_lng):
    """Find ALL runs within RADIUS_KM of a target city."""
    matches = []
    for a in activities:
        if a["type"] != "Run":
            continue
        start = a.get("start_latlng")
        if not start or len(start) < 2:
            continue
        dist = haversine_km(start[0], start[1], city_lat, city_lng)
        if dist < RADIUS_KM:
            matches.append(a)
    return matches


def main():
    token = get_access_token()

    print("Fetching full Strava activity history...")
    activities = fetch_all_activities(token)
    runs = [a for a in activities if a["type"] == "Run"]
    print(f"Found {len(activities)} total activities ({len(runs)} runs).")

    featured = []

    for city_name, city_lat, city_lng, continent in TARGET_CITIES:
        print(f"\nSearching for runs near {city_name} ({city_lat}, {city_lng})...")
        city_runs = find_all_runs_near(activities, city_lat, city_lng)

        if not city_runs:
            print(f"  No runs found within {RADIUS_KM} km of {city_name}")
            continue

        # Aggregate stats
        total_miles = sum(meters_to_miles(a["distance"]) for a in city_runs)
        total_runs = len(city_runs)
        print(f"  Found {total_runs} runs totaling {total_miles:.1f} mi")

        # Pick the longest run as the featured highlight
        longest = max(city_runs, key=lambda a: a["distance"])

        # Fetch detailed polyline for the longest run
        detail = requests.get(
            f"{STRAVA_API_BASE}/activities/{longest['id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        detail.raise_for_status()
        detail_data = detail.json()
        polyline = (detail_data.get("map") or {}).get("polyline", "")
        coords = decode_polyline(polyline) if polyline else []

        if not coords:
            print(f"  Longest run has no GPS data for {city_name}")
            continue

        run_date = datetime.fromisoformat(
            longest["start_date_local"].replace("Z", "+00:00")
        ).strftime("%Y-%m-%d")

        featured.append({
            "city": city_name,
            "continent": continent,
            "total_miles": round(total_miles, 1),
            "total_runs": total_runs,
            "start_latlng": longest["start_latlng"],
            "featured_run": {
                "name": longest["name"],
                "date": run_date,
                "distance_mi": meters_to_miles(longest["distance"]),
                "pace_min": seconds_to_pace(longest["distance"], longest["moving_time"]),
                "elapsed_time_min": round(longest["moving_time"] / 60, 1),
                "elevation_ft": meters_to_feet(longest.get("total_elevation_gain", 0)),
                "coordinates": coords,
            },
        })

        print(f"  Featured: {longest['name']} ({run_date}) — {meters_to_miles(longest['distance'])} mi")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(featured, f, indent=2)

    print(f"\nWrote {len(featured)} featured routes to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
