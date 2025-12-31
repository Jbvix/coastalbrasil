import json
import re

def parse_height(height_str):
    if not height_str:
        return 0
    try:
        # Extract number from string like "40m", "40 m", "40", etc.
        match = re.search(r'(\d+(\.\d+)?)', str(height_str))
        if match:
            return float(match.group(1))
    except:
        pass
    return 0

def get_app_lighthouses(html_path):
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the lighthouses array content
    match = re.search(r'const lighthouses = \[(.*?)\];', content, re.DOTALL)
    if not match:
        print("Could not find lighthouses array in app.html")
        return []
    
    array_content = match.group(1)
    
    # Parse the JS objects to Python dicts
    # This is a bit hacky but works for the known format
    lighthouses = []
    # Split by hash comments or newlines to process line by line or object by object
    # The format is { name: "...", ... },
    
    # Regex to find each object
    object_pattern = r'\{\s*name:\s*"(.*?)",\s*lat:\s*([\-\d\.]+),\s*lng:\s*([\-\d\.]+),\s*height:\s*(\d+),\s*range:\s*.*?\}'
    
    for match in re.finditer(object_pattern, array_content):
        lh = {
            'name': match.group(1),
            'lat': float(match.group(2)),
            'lng': float(match.group(3)),
            'height': float(match.group(4))
        }
        lighthouses.append(lh)
    
    return lighthouses

def get_osm_lighthouses(json_path):
    # Try different encodings
    encodings = ['utf-8', 'utf-16', 'utf-16-le', 'utf-8-sig']
    data = None
    
    for enc in encodings:
        try:
            with open(json_path, 'r', encoding=enc) as f:
                data = json.load(f)
            break
        except Exception:
            continue
            
    if data is None:
        print("Failed to read JSON with multiple encodings")
        return []

    try:
        lighthouses = []
        for element in data.get('elements', []):
            tags = element.get('tags', {})
            height_val = tags.get('height')
            name = tags.get('name', 'Unknown')
            
            # Check for alternative height tags if needed, but height is standard
            h = parse_height(height_val)
            
            if h > 15:
                lighthouses.append({
                    'id': element['id'],
                    'name': name,
                    'lat': element['lat'],
                    'lng': element['lon'],
                    'height': h
                })
        return lighthouses
    except Exception as e:
        print(f"Error reading OSM JSON: {e}")
        return []

def compare_lighthouses(app_lhs, osm_lhs):
    print(f"App Lighthouses: {len(app_lhs)}")
    print(f"OSM Lighthouses (>15m): {len(osm_lhs)}")
    print("-" * 50)
    
    app_coords = [(round(lh['lat'], 3), round(lh['lng'], 3)) for lh in app_lhs]
    
    missing_in_app = []
    
    for osm_lh in osm_lhs:
        osm_coord = (round(osm_lh['lat'], 3), round(osm_lh['lng'], 3))
        
        # Check if approx coordinate exists in app
        # Using a crude proximity check (0.01 degrees ~ 1km)
        found = False
        for app_lh in app_lhs:
            if abs(app_lh['lat'] - osm_lh['lat']) < 0.05 and abs(app_lh['lng'] - osm_lh['lng']) < 0.05:
                found = True
                break
        
        if not found:
            missing_in_app.append(osm_lh)
            
    print(f"Found {len(missing_in_app)} lighthouses in OSM (>15m) that seem missing in App (or far away):")
    for lh in missing_in_app:
        print(f" - {lh['name']} (H: {lh['height']}m) at {lh['lat']}, {lh['lng']}")

if __name__ == "__main__":
    app_lhs = get_app_lighthouses("app.html")
    osm_lhs = get_osm_lighthouses("osm_lighthouses_v2.json")
    compare_lighthouses(app_lhs, osm_lhs)
