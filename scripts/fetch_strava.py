"""
Fetch running data from Strava API.
- Calendar heatmap: all activity types (runs, weights, cardio, etc.) for prev + current month
- Stats: full year-to-date (runs only)
- Weekly mileage: prev + current month (runs only)
- Route maps: 3 most recent runs

Writes data/running-data.json consumed by running.html.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/fetch_strava.py

Requires .env with:
    STRAVA_CLIENT_ID=...
    STRAVA_CLIENT_SECRET=...
    STRAVA_REFRESH_TOKEN=...
"""

import json
import os
from datetime import datetime, timezone
from calendar import monthrange
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "running-data.json"


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


def fetch_all_activities(token, after_ts, before_ts):
    """Fetch ALL activities (any type) in the given time range."""
    activities = []
    page = 1
    while True:
        resp = requests.get(f"{STRAVA_API_BASE}/athlete/activities", params={
            "after": int(after_ts),
            "before": int(before_ts),
            "per_page": 100,
            "page": page,
        }, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        activities.extend(batch)
        page += 1
    return activities


def meters_to_miles(m):
    return round(m / 1609.344, 2)


def meters_to_feet(m):
    return round(m * 3.28084)


def seconds_to_pace(distance_m, elapsed_s):
    """Return pace as minutes per mile."""
    if distance_m == 0:
        return 0
    miles = distance_m / 1609.344
    return round(elapsed_s / 60 / miles, 2)


def friendly_type(strava_type):
    """Convert Strava activity type to a friendly display name."""
    mapping = {
        "Run": "Run",
        "WeightTraining": "Weights",
        "Workout": "Workout",
        "StairStepper": "Stairs",
        "Elliptical": "Cardio",
        "Walk": "Walk",
        "Hike": "Hike",
        "Ride": "Ride",
        "Swim": "Swim",
        "Yoga": "Yoga",
        "CrossFit": "CrossFit",
    }
    return mapping.get(strava_type, strava_type)


def classify_workout(activity):
    """Classify a run into a workout type based on Strava workout_type field."""
    wt = activity.get("workout_type", 0)
    mapping = {0: "Easy Run", 1: "Race", 2: "Long Run", 3: "Interval"}
    if wt in mapping:
        return mapping[wt]
    speed_mph = (activity.get("average_speed", 0) / 1609.344) * 3600
    if speed_mph > 7.5:
        return "Tempo Run"
    return "Easy Run"


def build_calendar(all_activities, year, month):
    """Build calendar data for a single month using ALL activity types.
    Uses active minutes as the heatmap metric so non-distance activities show up."""
    days_in_month = monthrange(year, month)[1]
    month_label = datetime(year, month, 1).strftime("%B %Y")

    # Track per-day: total active minutes, distance, and activity types
    daily_minutes = {d: 0.0 for d in range(1, days_in_month + 1)}
    daily_distance = {d: 0.0 for d in range(1, days_in_month + 1)}
    daily_types = {d: [] for d in range(1, days_in_month + 1)}

    for a in all_activities:
        act_date = datetime.fromisoformat(a["start_date_local"].replace("Z", "+00:00"))
        if act_date.year == year and act_date.month == month:
            d = act_date.day
            daily_minutes[d] += a.get("moving_time", 0) / 60
            daily_distance[d] += meters_to_miles(a.get("distance", 0))
            daily_types[d].append(friendly_type(a["type"]))

    days = []
    for d in range(1, days_in_month + 1):
        days.append({
            "date": f"{year}-{month:02d}-{d:02d}",
            "active_minutes": round(daily_minutes[d]),
            "distance_mi": round(daily_distance[d], 1),
            "activities": daily_types[d],
        })

    return {"month": month_label, "days": days}


def build_weekly_mileage(all_activities, prev_year, prev_month, cur_year, cur_month):
    """Build weekly run mileage covering both displayed months."""
    runs = [a for a in all_activities if a["type"] == "Run"]

    months = [(prev_year, prev_month), (cur_year, cur_month)]
    weeks = []

    for year, month in months:
        days_in_month = monthrange(year, month)[1]
        short = datetime(year, month, 1).strftime("%b")

        daily_run = {d: 0.0 for d in range(1, days_in_month + 1)}
        for a in runs:
            act_date = datetime.fromisoformat(a["start_date_local"].replace("Z", "+00:00"))
            if act_date.year == year and act_date.month == month:
                daily_run[act_date.day] += meters_to_miles(a["distance"])

        week_start = 1
        while week_start <= days_in_month:
            week_end = min(week_start + 6, days_in_month)
            label = f"{short} {week_start}\u2013{week_end}"
            miles = round(sum(daily_run[d] for d in range(week_start, week_end + 1)), 1)
            weeks.append({"week": label, "miles": miles})
            week_start = week_end + 1

    return weeks


def build_data(all_activities, ytd_activities, prev_year, prev_month, cur_year, cur_month, token):
    """Build the JSON data structure."""
    # --- Year-to-date stats (runs only) ---
    ytd_runs = [a for a in ytd_activities if a["type"] == "Run"]

    total_dist = 0
    total_time = 0
    total_elev = 0

    for a in ytd_runs:
        total_dist += a["distance"]
        total_time += a["moving_time"]
        total_elev += a.get("total_elevation_gain", 0)

    # --- Workout type breakdown (all activity types, YTD) ---
    type_counts = {}
    for a in ytd_activities:
        if a["type"] == "Run":
            dist_mi = meters_to_miles(a["distance"])
            wtype = "Long Run" if dist_mi >= 8 else "Run"
        else:
            wtype = friendly_type(a["type"])
        type_counts[wtype] = type_counts.get(wtype, 0) + 1

    workout_types = [
        {"type": t, "count": c}
        for t, c in sorted(type_counts.items(), key=lambda x: -x[1])
    ]

    # --- Calendars (ALL activity types, both months) ---
    calendars = [
        build_calendar(all_activities, prev_year, prev_month),
        build_calendar(all_activities, cur_year, cur_month),
    ]

    # --- Weekly mileage (both months, runs only) ---
    weekly_mileage = build_weekly_mileage(all_activities, prev_year, prev_month, cur_year, cur_month)

    # --- Recent outdoor runs with routes (3 most recent with GPS data) ---
    all_runs = [a for a in all_activities if a["type"] == "Run"]
    sorted_runs = sorted(all_runs, key=lambda a: a["start_date"], reverse=True)
    recent_runs = []
    for a in sorted_runs:
        if len(recent_runs) >= 3:
            break
        # Skip runs with no summary polyline (treadmill / indoor)
        summary_poly = (a.get("map") or {}).get("summary_polyline", "")
        if not summary_poly:
            continue
        detail = requests.get(
            f"{STRAVA_API_BASE}/activities/{a['id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        detail.raise_for_status()
        detail_data = detail.json()
        polyline = (detail_data.get("map") or {}).get("polyline", "")
        coords = decode_polyline(polyline) if polyline else []
        if not coords:
            continue
        recent_runs.append({
            "name": a["name"],
            "date": datetime.fromisoformat(
                a["start_date_local"].replace("Z", "+00:00")
            ).strftime("%Y-%m-%d"),
            "distance_mi": meters_to_miles(a["distance"]),
            "pace_min": seconds_to_pace(a["distance"], a["moving_time"]),
            "elapsed_time_min": round(a["moving_time"] / 60, 1),
            "elevation_ft": meters_to_feet(a.get("total_elevation_gain", 0)),
            "coordinates": coords,
        })

    return {
        "year": cur_year,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_distance_mi": round(meters_to_miles(total_dist), 1),
            "total_runs": len(ytd_runs),
            "avg_pace_min": seconds_to_pace(total_dist, total_time) if total_dist else 0,
            "total_time_hours": round(total_time / 3600, 1),
            "total_elevation_ft": meters_to_feet(total_elev),
        },
        "calendars": calendars,
        "weekly_mileage": weekly_mileage,
        "workout_types": workout_types,
        "recent_runs": recent_runs,
    }


def main():
    token = get_access_token()

    now = datetime.now(timezone.utc)
    cur_year, cur_month = now.year, now.month

    if now.month == 1:
        prev_year, prev_month = now.year - 1, 12
    else:
        prev_year, prev_month = now.year, now.month - 1

    # Fetch from Jan 1 of current year to end of current month (for YTD stats)
    ytd_start = datetime(cur_year, 1, 1, tzinfo=timezone.utc)
    days_in_cur = monthrange(cur_year, cur_month)[1]
    end = datetime(cur_year, cur_month, days_in_cur, 23, 59, 59, tzinfo=timezone.utc)

    print(f"Fetching all Strava activities for {cur_year} YTD...")
    ytd_activities = fetch_all_activities(token, ytd_start.timestamp(), end.timestamp())

    # If previous month is in a different year, fetch that separately
    if prev_year < cur_year:
        prev_start = datetime(prev_year, prev_month, 1, tzinfo=timezone.utc)
        prev_end = datetime(prev_year, prev_month, monthrange(prev_year, prev_month)[1],
                            23, 59, 59, tzinfo=timezone.utc)
        print(f"Fetching activities for {prev_start.strftime('%B %Y')}...")
        prev_activities = fetch_all_activities(token, prev_start.timestamp(), prev_end.timestamp())
        # all_activities = prev month + YTD (for calendar rendering)
        all_activities = prev_activities + ytd_activities
    else:
        all_activities = ytd_activities

    runs = [a for a in all_activities if a["type"] == "Run"]
    print(f"Found {len(all_activities)} total activities ({len(runs)} runs).")

    data = build_data(all_activities, ytd_activities, prev_year, prev_month, cur_year, cur_month, token)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
