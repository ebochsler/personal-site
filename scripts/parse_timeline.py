#!/usr/bin/env python3
"""
Parse Google Timeline JSON exports to extract brewery/bar/winery/distillery visits.

Modes:
  --resolve   : Resolve placeIds to names via Google Places API (caches results)
  --discover  : List ALL unique places with visit counts (for manual curation)
  (default)   : Filter for drinking venues and output data/brewery-data.json

Usage:
  python scripts/parse_timeline.py --resolve --input-dir raw-data/timeline/
  python scripts/parse_timeline.py --discover --input-dir raw-data/timeline/
  python scripts/parse_timeline.py --input-dir raw-data/timeline/
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone


# ── Venue identification ─────────────────────────────────────────────

# Keywords that are long/specific enough to safely use as substrings
DRINK_KEYWORDS_SUBSTR = [
    "brewery", "brewing", "brewhouse", "brew pub", "brewpub",
    "taproom", "tap room", "tap house", "taphouse", "alehouse", "ale house",
    "tavern", "saloon", "cocktail",
    "winery", "vineyard", "wine bar", "wine cellar",
    "distillery", "moonshine",
    "cidery", "cider house", "ciderhouse",
    "beer garden", "biergarten", "beer hall",
]

# Short/ambiguous keywords that need word-boundary matching (regex)
DRINK_KEYWORDS_REGEX = [
    r"\bbar\b", r"\bbars\b", r"\bpub\b", r"\bpubs\b",
    r"\blounge\b", r"\bspirits\b",
]

# Compiled regex for word-boundary keywords
_DRINK_REGEX = re.compile("|".join(DRINK_KEYWORDS_REGEX), re.IGNORECASE)

# False-positive name patterns to exclude
EXCLUDE_PATTERNS = re.compile(
    r"barber|bartell|barnes|barn\b|botanical|embassy|village(?! .*(bar|pub|brew))",
    re.IGNORECASE,
)

# Google Places API types that indicate drinking venues
GOOGLE_DRINK_TYPES = {
    "bar", "night_club", "brewery", "wine_bar", "winery", "distillery",
}

DRINK_SEMANTIC_TYPES = {
    "TYPE_BAR", "TYPE_BREWERY", "TYPE_WINE_BAR", "TYPE_NIGHT_CLUB",
    "TYPE_PUB", "TYPE_WINERY", "TYPE_DISTILLERY",
}

# Semantic types to skip entirely (homes, workplaces)
SKIP_SEMANTIC_TYPES = {
    "HOME", "INFERRED_HOME", "WORK", "INFERRED_WORK",
}

CATEGORY_PATTERNS = [
    (r"brew|taproom|tap room|tap house|taphouse|alehouse|ale house|beer garden|biergarten|beer hall", "brewery"),
    (r"winery|vineyard|wine bar|wine cellar", "winery"),
    (r"distillery|spirits|moonshine", "distillery"),
    (r"cidery|cider house|ciderhouse", "cidery"),
    (r"bar|pub|tavern|saloon|lounge|cocktail|night.?club", "bar"),
]


def classify_category(name, google_types=None, semantic_type=None):
    """Determine venue category from name, Google types, and/or semantic type."""
    name_lower = (name or "").lower()

    for pattern, category in CATEGORY_PATTERNS:
        if re.search(pattern, name_lower):
            return category

    # Check Google Places types
    if google_types:
        for gt in google_types:
            if "brew" in gt:
                return "brewery"
            if "wine" in gt or "winery" in gt:
                return "winery"
            if "distill" in gt:
                return "distillery"
            if gt in ("bar", "night_club"):
                return "bar"

    if semantic_type:
        st = semantic_type.upper()
        if "BREW" in st:
            return "brewery"
        if "WINE" in st or "WINERY" in st:
            return "winery"
        if "DISTILL" in st:
            return "distillery"
        if "BAR" in st or "PUB" in st or "NIGHT" in st:
            return "bar"

    return "other"


def is_drinking_venue(name, google_types=None, semantic_type=None):
    """Check if a place is a drinking venue."""
    name_lower = (name or "").lower()

    # Exclude known false-positive patterns first
    if EXCLUDE_PATTERNS.search(name_lower):
        return False

    # Substring keywords (long/specific enough to be safe)
    for keyword in DRINK_KEYWORDS_SUBSTR:
        if keyword in name_lower:
            return True

    # Word-boundary keywords (short/ambiguous)
    if _DRINK_REGEX.search(name_lower):
        return True

    if google_types:
        if GOOGLE_DRINK_TYPES & set(google_types):
            return True
    if semantic_type and semantic_type.upper() in DRINK_SEMANTIC_TYPES:
        return True
    return False


# ── Coordinate parsing ───────────────────────────────────────────────

def parse_latlng_string(latlng_str):
    """Parse various latLng string formats to (lat, lng) tuple.

    Handles:
      - "47.6553351°, -122.3035199°"  (new on-device format with degree symbols)
      - "geo:47.65,-122.30"           (geo URI format)
      - "47.65, -122.30"              (plain comma-separated)
    """
    if not latlng_str:
        return None

    s = latlng_str.strip()

    # geo: URI format
    if s.startswith("geo:"):
        s = s[4:]

    # Remove degree symbols (U+00B0, and any other degree-like chars)
    s = s.replace("\u00b0", "").replace("°", "")

    try:
        parts = [p.strip() for p in s.split(",")]
        if len(parts) >= 2:
            return (float(parts[0]), float(parts[1]))
    except (ValueError, IndexError):
        pass

    return None


def parse_timestamp(ts_str):
    """Parse ISO timestamp string to datetime."""
    if not ts_str:
        return None
    try:
        ts_str = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_str)
    except ValueError:
        return None


# ── Timeline parsing ─────────────────────────────────────────────────

def load_timeline_files(input_dir):
    """Load all Timeline JSON files from the input directory."""
    segments = []
    if not os.path.isdir(input_dir):
        print(f"Error: Directory not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    for filename in sorted(os.listdir(input_dir)):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(input_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"Warning: Skipping {filename}: {e}", file=sys.stderr)
            continue

        if isinstance(data, list):
            segments.extend(data)
        elif isinstance(data, dict):
            segments.extend(data.get("semanticSegments", []))
            segments.extend(data.get("timelineObjects", []))

    return segments


def extract_visits(segments):
    """Extract place visits from semantic segments."""
    visits = []

    for segment in segments:
        visit = segment.get("visit") or segment.get("placeVisit")
        if not visit:
            continue

        place = visit.get("topCandidate") or visit.get("location") or {}

        place_id = place.get("placeId") or place.get("placeID", "")
        name = place.get("name", "") or place.get("address", "")
        semantic_type = place.get("semanticType", "") or place.get("type", "")

        # Parse coordinates from various formats
        coords = None
        place_location = place.get("placeLocation")
        if isinstance(place_location, dict):
            latlng = place_location.get("latLng", "")
            coords = parse_latlng_string(latlng)
        elif isinstance(place_location, str):
            coords = parse_latlng_string(place_location)

        if not coords:
            geo = place.get("geo", "")
            if isinstance(geo, str):
                coords = parse_latlng_string(geo)
            elif isinstance(geo, dict):
                lat = geo.get("latitudeE7") or geo.get("lat")
                lng = geo.get("longitudeE7") or geo.get("lng")
                if lat and lng:
                    if isinstance(lat, int) and abs(lat) > 1000:
                        coords = (lat / 1e7, lng / 1e7)
                    else:
                        coords = (float(lat), float(lng))

        start_time = parse_timestamp(
            segment.get("startTime") or visit.get("startTime") or
            (visit.get("duration", {}).get("startTimestamp"))
        )
        end_time = parse_timestamp(
            segment.get("endTime") or visit.get("endTime") or
            (visit.get("duration", {}).get("endTimestamp"))
        )

        duration_hours = 0
        if start_time and end_time:
            duration_hours = (end_time - start_time).total_seconds() / 3600

        visits.append({
            "place_id": place_id,
            "name": name,
            "semantic_type": semantic_type,
            "coords": coords,
            "start_time": start_time,
            "end_time": end_time,
            "duration_hours": duration_hours,
        })

    return visits


# ── Google Places API Resolution ─────────────────────────────────────

CACHE_PATH = "data/place-cache.json"


def load_cache():
    """Load the place resolution cache."""
    if os.path.isfile(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return {}


def save_cache(cache):
    """Save the place resolution cache."""
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def resolve_place_id(place_id, api_key):
    """Look up a single placeId via Google Places API (New)."""
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    try:
        req = urllib.request.Request(url)
        req.add_header("X-Goog-Api-Key", api_key)
        req.add_header("X-Goog-FieldMask", "displayName,types,formattedAddress")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        display_name = data.get("displayName", {})
        return {
            "name": display_name.get("text", "") if isinstance(display_name, dict) else "",
            "types": data.get("types", []),
            "address": data.get("formattedAddress", ""),
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"name": "", "types": [], "address": "", "not_found": True}
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"  API error {e.code} for {place_id}: {body}", file=sys.stderr)
        return None
    except (urllib.error.URLError, OSError) as e:
        print(f"  Network error for {place_id}: {e}", file=sys.stderr)
        return None


def resolve_all_places(visits, api_key):
    """Resolve all unique placeIds to names using Google Places API with caching."""
    cache = load_cache()

    # Get unique placeIds that need resolution (skip HOME/WORK types)
    place_ids = set()
    type_map = {}
    for v in visits:
        pid = v["place_id"]
        if pid and pid not in cache:
            st = v["semantic_type"]
            type_map[pid] = st
            if st not in SKIP_SEMANTIC_TYPES:
                place_ids.add(pid)

    already_cached = sum(1 for v in visits if v["place_id"] in cache)
    print(f"Cache has {len(cache)} entries, {already_cached} visits already resolved")
    print(f"Need to resolve {len(place_ids)} new placeIds (skipping HOME/WORK)")

    if not place_ids:
        print("All places already resolved!")
        return cache

    resolved = 0
    failed = 0
    not_found = 0
    total = len(place_ids)

    for i, pid in enumerate(place_ids):
        if (i + 1) % 50 == 0 or i == 0:
            print(f"  Resolving {i + 1}/{total}... ({resolved} ok, {not_found} not found, {failed} failed)",
                  flush=True)

        result = resolve_place_id(pid, api_key)

        if result is None:
            failed += 1
            time.sleep(0.5)  # Back off on errors
            continue

        cache[pid] = result

        if result.get("not_found"):
            not_found += 1
        else:
            resolved += 1

        # Save cache every 100 resolutions
        if (resolved + not_found) % 100 == 0:
            save_cache(cache)

        # Rate limit: ~10 requests/sec
        time.sleep(0.1)

    save_cache(cache)
    print(f"\nResolution complete: {resolved} resolved, {not_found} not found, {failed} failed")
    print(f"Total cache size: {len(cache)} entries")

    return cache


# ── City extraction ──────────────────────────────────────────────────

def extract_city(address):
    """Extract city name from a formatted address string."""
    if not address:
        return ""
    # Google formatted_address: "1158 Broadway, Seattle, WA 98122, USA"
    # Try to get the city part (usually second-to-last or third-to-last component)
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 3:
        # "City, ST ZIP, Country" — city is parts[-3] or parts[-2] may have state+zip
        # Try the part before the state/zip
        candidate = parts[-3] if len(parts) >= 3 else parts[-2]
        # Remove any numbers (ZIP codes sometimes attached)
        candidate = re.sub(r'\d+', '', candidate).strip()
        if candidate:
            return candidate
    if len(parts) >= 2:
        return parts[-2].strip()
    return ""


# ── Discovery mode ───────────────────────────────────────────────────

def discover_places(visits, cache):
    """Aggregate all places and print a summary table."""
    places = defaultdict(lambda: {
        "name": "", "semantic_type": "", "coords": None,
        "google_types": [], "address": "",
        "visit_count": 0, "total_hours": 0,
        "first_visit": None, "last_visit": None,
    })

    for v in visits:
        pid = v["place_id"] or f"unnamed_{v['coords']}"
        p = places[pid]
        if v["name"]:
            p["name"] = v["name"]
        if v["semantic_type"]:
            p["semantic_type"] = v["semantic_type"]
        if v["coords"]:
            p["coords"] = v["coords"]
        p["visit_count"] += 1
        p["total_hours"] += v["duration_hours"]
        if v["start_time"]:
            if p["first_visit"] is None or v["start_time"] < p["first_visit"]:
                p["first_visit"] = v["start_time"]
            if p["last_visit"] is None or v["start_time"] > p["last_visit"]:
                p["last_visit"] = v["start_time"]

        # Merge cached data
        if pid in cache and not cache[pid].get("not_found"):
            cached = cache[pid]
            if cached.get("name"):
                p["name"] = cached["name"]
            if cached.get("types"):
                p["google_types"] = cached["types"]
            if cached.get("address"):
                p["address"] = cached["address"]

    # Sort by visit count descending
    sorted_places = sorted(places.items(), key=lambda x: x[1]["visit_count"], reverse=True)

    print(f"\n{'Visits':>6}  {'Hours':>7}  {'Type':<20}  {'Name':<40}  PlaceID")
    print("-" * 120)

    for pid, p in sorted_places:
        hours_str = f"{p['total_hours']:.1f}"
        type_str = p["semantic_type"][:20] if p["semantic_type"] else ""
        name_str = (p["name"] or "(unnamed)")[:40]
        is_drink = is_drinking_venue(p["name"], p["google_types"], p["semantic_type"])
        marker = " *" if is_drink else ""
        print(f"{p['visit_count']:>6}  {hours_str:>7}  {type_str:<20}  {name_str:<40}  {pid}{marker}")

    drink_count = sum(1 for _, p in sorted_places
                      if is_drinking_venue(p["name"], p["google_types"], p["semantic_type"]))
    print(f"\nTotal unique places: {len(sorted_places)}")
    print(f"Total visits: {sum(p['visit_count'] for _, p in sorted_places)}")
    print(f"Auto-detected drinking venues: {drink_count}")
    print("\n* = auto-detected as drinking venue")


# ── Generate mode ────────────────────────────────────────────────────

def load_overrides(overrides_path):
    """Load venue overrides JSON file."""
    if not overrides_path or not os.path.isfile(overrides_path):
        return {}
    try:
        with open(overrides_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError):
        print(f"Warning: Could not parse {overrides_path}", file=sys.stderr)
        return {}


def generate_brewery_data(visits, overrides, cache):
    """Filter for drinking venues, aggregate, and build output JSON."""
    venues = defaultdict(lambda: {
        "name": "", "semantic_type": "", "coords": None,
        "google_types": [], "address": "",
        "visit_count": 0, "total_hours": 0,
        "first_visit": None, "last_visit": None,
        "visit_months": defaultdict(int),
    })

    for v in visits:
        pid = v["place_id"]
        if not pid:
            continue

        p = venues[pid]
        if v["name"]:
            p["name"] = v["name"]
        if v["semantic_type"]:
            p["semantic_type"] = v["semantic_type"]
        if v["coords"]:
            p["coords"] = v["coords"]
        p["visit_count"] += 1
        p["total_hours"] += v["duration_hours"]
        if v["start_time"]:
            month_key = v["start_time"].strftime("%Y-%m")
            p["visit_months"][month_key] += 1
            if p["first_visit"] is None or v["start_time"] < p["first_visit"]:
                p["first_visit"] = v["start_time"]
            if p["last_visit"] is None or v["start_time"] > p["last_visit"]:
                p["last_visit"] = v["start_time"]

        # Merge cached Google Places data
        if pid in cache and not cache[pid].get("not_found"):
            cached = cache[pid]
            if cached.get("name"):
                p["name"] = cached["name"]
            if cached.get("types"):
                p["google_types"] = cached["types"]
            if cached.get("address"):
                p["address"] = cached["address"]

    # Filter venues
    filtered = {}
    for pid, p in venues.items():
        override = overrides.get(pid, {})

        if "include" in override:
            if not override["include"]:
                continue
            if override.get("name"):
                p["name"] = override["name"]
            category = override.get("category") or classify_category(
                p["name"], p["google_types"], p["semantic_type"])
            p["category"] = category
            filtered[pid] = p
        elif is_drinking_venue(p["name"], p["google_types"], p["semantic_type"]):
            # Skip if semantic type is HOME/WORK
            if p["semantic_type"] in SKIP_SEMANTIC_TYPES:
                continue
            p["category"] = classify_category(p["name"], p["google_types"], p["semantic_type"])
            filtered[pid] = p

    # Build output
    all_venues = []
    all_months = defaultdict(int)

    for pid, p in filtered.items():
        city = extract_city(p["address"])
        venue = {
            "name": p["name"] or "(unnamed)",
            "category": p.get("category", "other"),
            "visit_count": p["visit_count"],
            "total_hours": round(p["total_hours"], 1),
            "lat": p["coords"][0] if p["coords"] else 0,
            "lng": p["coords"][1] if p["coords"] else 0,
            "first_visit": p["first_visit"].strftime("%Y-%m-%d") if p["first_visit"] else "",
            "last_visit": p["last_visit"].strftime("%Y-%m-%d") if p["last_visit"] else "",
            "city": city,
        }
        all_venues.append(venue)

        for month, count in p["visit_months"].items():
            all_months[month] += count

    all_venues.sort(key=lambda v: v["visit_count"], reverse=True)

    # Category breakdown
    cat_counts = defaultdict(int)
    for v in all_venues:
        cat_counts[v["category"]] += 1
    category_breakdown = sorted(
        [{"category": c, "count": n} for c, n in cat_counts.items()],
        key=lambda x: x["count"], reverse=True,
    )

    top_by_visits = all_venues[:10]
    top_by_hours = sorted(all_venues, key=lambda v: v["total_hours"], reverse=True)[:10]

    visits_by_month = sorted(
        [{"month": m, "count": c} for m, c in all_months.items()],
        key=lambda x: x["month"],
    )

    unique_cities = len(set(v["city"] for v in all_venues if v["city"]))

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_venues": len(all_venues),
            "total_visits": sum(v["visit_count"] for v in all_venues),
            "total_hours": round(sum(v["total_hours"] for v in all_venues), 1),
            "unique_cities": unique_cities,
            "category_breakdown": category_breakdown,
        },
        "top_by_visits": top_by_visits,
        "top_by_hours": top_by_hours,
        "all_venues": all_venues,
        "visits_by_month": visits_by_month,
    }

    return output


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parse Google Timeline exports for drinking venue visits.")
    parser.add_argument("--input-dir", default="raw-data/timeline/",
                        help="Directory containing Timeline JSON exports")
    parser.add_argument("--overrides", default="data/venue-overrides.json",
                        help="Path to venue overrides JSON")
    parser.add_argument("--output", default="data/brewery-data.json",
                        help="Output JSON path")
    parser.add_argument("--discover", action="store_true",
                        help="Discovery mode: list all places with visit counts")
    parser.add_argument("--resolve", action="store_true",
                        help="Resolve placeIds to names via Google Places API")
    parser.add_argument("--api-key", default=None,
                        help="Google Places API key (or set GOOGLE_PLACES_API_KEY env var)")
    args = parser.parse_args()

    print(f"Loading Timeline data from {args.input_dir}...")
    segments = load_timeline_files(args.input_dir)
    print(f"Found {len(segments)} segments")

    visits = extract_visits(segments)
    print(f"Extracted {len(visits)} place visits")

    cache = load_cache()

    if args.resolve:
        api_key = args.api_key or os.environ.get("GOOGLE_PLACES_API_KEY", "")
        if not api_key:
            # Try loading from .env file
            env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
            if os.path.isfile(env_path):
                with open(env_path) as f:
                    for line in f:
                        if line.startswith("GOOGLE_PLACES_API_KEY="):
                            api_key = line.strip().split("=", 1)[1]
            if not api_key:
                print("Error: No API key. Use --api-key or set GOOGLE_PLACES_API_KEY", file=sys.stderr)
                sys.exit(1)
        cache = resolve_all_places(visits, api_key)

    if args.discover:
        discover_places(visits, cache)
    elif not args.resolve:
        # Generate mode (default if not --resolve or --discover)
        overrides = load_overrides(args.overrides)
        print(f"Loaded {len(overrides)} overrides")
        print(f"Using {len(cache)} cached place resolutions")

        output = generate_brewery_data(visits, overrides, cache)
        print(f"Found {output['summary']['total_venues']} drinking venues "
              f"with {output['summary']['total_visits']} total visits")

        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"Written to {args.output}")


if __name__ == "__main__":
    main()
