# Import Libraries
import zipfile
import math
import shutil
from pathlib import Path
import rasterio
from rasterio.plot import show
from rasterio.features import rasterize, shapes
from rasterio.merge import merge
from rasterio.warp import transform
from rasterio.mask import mask

import pandas as pd
import numpy as np
import osmnx as ox
import matplotlib.pyplot as plt
import geopandas as gpd
import requests
from bs4 import BeautifulSoup
import pyproj
from pyproj import Transformer

import solweig

from matplotlib.colors import LinearSegmentedColormap

import json
import subprocess

from shapely.geometry import shape, Polygon, mapping, Point
from shapely.ops import transform as shapely_transform, unary_union
from scipy import ndimage
import random


# Creating generalized Pathways

## input folder
input_folder = "./data"
input_path = Path(input_folder).absolute()
input_path.mkdir(parents=True, exist_ok=True)
input_path_str = str(input_path)
## output folder
output_folder = "./output"
output_path = Path(output_folder).absolute()
output_path.mkdir(parents=True, exist_ok=True)
output_path_str = str(output_path)
## input data
dom_path = input_path / "DOM.tif"
dgm_path = input_path / "DGM.tif"
ndsm_path = output_path / "nDSM.tif"

rbz_path = "./data/dvg2_EPSG25832_Shape/dvg2rbz_nw.shp"
gem_path = "./data/dvg2_EPSG25832_Shape/dvg2gem_nw.shp"

###########################################################################################################################################################

# Terminal input for municipality OR bbox

def get_aoi():
    """
    Ask user for area of interest: either a municipality name (validated against shapefile)
    or a custom bounding box (lat/lon). Returns:
        - aoi_name: a clean string used for filenames
        - aoi_geometry: shapely geometry (Polygon) in WGS84
        - mode: 'municipality' or 'bbox'
    """
    gdf = gpd.read_file(gem_path)
    valid_names = sorted(gdf['GN'].dropna().unique().tolist())

    print("\n" + "="*50)
    print("AUSWAHL DES GEBIETS")
    print("="*50)
    print(f"VERFÜGBARE KOMMUNEN: {len(valid_names)}")
    print("Schreibe 'list' um alle verfügbaren Kommunen aufzulisten")
    print("Schreibe 'bbox' um ein eigenes Rechteck (Bounding Box) einzugeben")
    print("Oder gib direkt einen Gemeindenamen ein")
    print("="*50)

    while True:
        user_input = input("\nEingabe: ").strip()

        # List available municipalities
        if user_input.lower() == 'list':
            print("\nAll available municipalities:")
            for i, name in enumerate(valid_names, 1):
                print(f"  {i:3d}. {name}")
            continue

        # Bbox input
        if user_input.lower() == 'bbox':
            print("\n--- Bounding Box Eingabe ---")
            print("Koordinaten in WGS84 (Lat/Lon) eingeben:")
            try:
                min_lon = float(input("  min Longitude (west): ").strip())
                min_lat = float(input("  min Latitude (south): ").strip())
                max_lon = float(input("  max Longitude (east): ").strip())
                max_lat = float(input("  max Latitude (north): ").strip())
            except ValueError:
                print("Ungültige Koordinaten. Bitte Zahlen eingeben.")
                continue

            # Validate order
            if min_lon >= max_lon or min_lat >= max_lat:
                print("min muss kleiner als max sein. Bitte erneut versuchen.")
                continue

            bbox_poly = Polygon([
                (min_lon, min_lat),
                (max_lon, min_lat),
                (max_lon, max_lat),
                (min_lon, max_lat),
                (min_lon, min_lat)
            ])
            name_input = input("Name für dieses Gebiet (z.B. 'downtown', Enter für 'custom_bbox'): ").strip()
            aoi_name = name_input if name_input else "custom_bbox"
            clean = aoi_name.lower().replace(' ', '_')
            print(f"✓ Bounding Box ausgewählt: {aoi_name}")
            return clean, bbox_poly, 'bbox'

        # Municipality name
        if user_input in valid_names:
            print(f"✓ Ausgewählt: {user_input}")
            return user_input, None, 'municipality'

        # Fuzzy suggestions
        suggestions = [name for name in valid_names if user_input.lower() in name.lower()]
        if suggestions:
            print(f"\nKein exakter Treffer für '{user_input}'. Meinten Sie:")
            for i, name in enumerate(suggestions[:5], 1):
                print(f"  {i}. {name}")
            if len(suggestions) > 5:
                print(f"  ... und {len(suggestions) - 5} weitere")
            print("Bitte geben Sie den vollständigen Namen aus der Liste ein.")
        else:
            print(f"\nKeine Treffer für '{user_input}'")
            print("'list' zeigt alle verfügbaren Namen an.")


# Usage at the start of your script
aoi_name, aoi_geom, aoi_mode = get_aoi()
clean_name = aoi_name.lower().replace(' ', '_') if aoi_mode == 'municipality' else aoi_name  # already cleaned
print(f"\nStarting analysis for: {aoi_name} (mode: {aoi_mode})")


############################################################################################################################################################

# Terminal input for climate file

def get_climate_file():
    print("\n" + "="*60)
    print("KLIMADATEN AUSWAHL")
    print("="*60)
    print("Bitte geben Sie die URL zum Herunterladen Ihrer .epw-Klimadatei ein:")
    print("\nKlimadateien herunterladen von:")
    print("- https://shinyweatherdata.com/ (Google-Konto erforderlich)")
    print("- WICHTIG! Zeitraum: 2014-01-01 bis 2023-12-31")
    print("- WICHTIG! Gehen Sie zu EXPORT und wählen Sie epw (Energyplus) als Ausgabeformat")
    print("- WICHTIG! Wenn Sie sich zuerst bei Google anmelden müssen, wird die Datei einmal heruntergeladen und dann muss die URL kopiert werden")
    print("- WICHTIG! Wenn Sie bereits angemeldet sind, kann die URL durch einen Rechtsklick auf DATEI HERUNTERLADEN kopiert werden")
    print("- WICHTIG! Stellen Sie sicher, dass die URL dem Beispiel entspricht: https://storage.cloud.google.com/asdf/file123.epw")
    print("- WICHTIG! Das Skript erstellt monatliche Medianwerte aus der angegebenen Datei")
    print("\nGeben Sie die direkte Download-URL für die .epw-Datei ein")
    print("="*60)
    
    url = input("\nEPW file URL: ").strip()
    
    if not url:
        print("No URL provided.")
        return None
    
    # set filename
    filename = 'epw_10_years.epw'
    if not filename.endswith('.epw'):
        filename = 'epw_10_years.epw'
    
    # Ensure data directory exists
    data_dir = Path("./data")
    data_dir.mkdir(exist_ok=True)
    
    # Destination path for downloaded file
    destination_path = data_dir / filename
    
    # Download the file
    try:
        print(f"\nDownloading from: {url}")
        print(f"Saving to: {destination_path}")
        
        # Send GET request with stream=True to handle large files
        response = requests.get(url, stream=True)
        response.raise_for_status()  # Check for HTTP errors
        
        # Check content type if possible
        content_type = response.headers.get('content-type', '')
        if 'text/html' in content_type and not url.endswith('.epw'):
            print("Warning: The URL appears to be returning HTML, not an EPW file.")
            print("Make sure you're using a direct download link to the .epw file.")
            continue_anyway = input("Continue anyway? (y/n): ").lower().strip()
            if continue_anyway != 'y':
                return None
        
        # Download and save the file
        with open(destination_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Verify file extension
        if destination_path.suffix.lower() != '.epw':
            print(f"Warning: Downloaded file is not an .epw file: {destination_path}")
            continue_anyway = input("Continue anyway? (y/n): ").lower().strip()
            if continue_anyway != 'y':
                # Clean up the downloaded file
                destination_path.unlink()
                return None
        
        print(f"✓ Climate file downloaded successfully to: {destination_path}")
        return destination_path
        
    except requests.exceptions.RequestException as e:
        print(f"✗ Error downloading file: {e}")
        return None
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        # Clean up if file was partially downloaded
        if destination_path.exists():
            destination_path.unlink()
        return None

# Import requests at the top of your script
climate_file_path = get_climate_file()

############################################################################################################################################################
# Terminal input for timeframe

def get_timeframe():
    """
    Get timeframe input from user for SOLWEIG simulation.
    Returns tuple of (start_date, end_date) in YYYY-MM-DD format.
    """
    print("\n=== Auswahl des Zeitraums ===")
    print("Das Jahr 2014 und der 15. Tag dienen als Platzhalter für die monatlichen Medianwerte der Jahre 2014 bis 2023")
    print("1. Gesamtjahr (Januar bis Dezember)")
    print("2. Benutzerdefinierter fortlaufender Zeitraum")
    print("3. Einzelner Monat")
    
    while True:
        choice = input("\nWählen Sie eine Option (1, 2 oder 3): ").strip()
        
        if choice == "1":
            # Full year: 01-15 to 12-15
            start_date = "2014-01-15"
            end_date = "2014-12-15"
            print(f"Ausgewählt: Gesamtjahr ({start_date} to {end_date})")
            print("Das Jahr 2014 und der 15. Tag dienen als Platzhalter für die monatlichen Medianwerte der Jahre 2014 bis 2023")
            return start_date, end_date
            
        elif choice == "2":
            # Custom timeframe
            print("\nWählen Sie einen Zeitraum (Januar = 1, [...], Dezember = 12)")
            while True:
                try:
                    start_month = int(input("Startmonat (1-12): ").strip())
                    if start_month < 1 or start_month > 12:
                        print("Please enter a valid month (1-12)")
                        continue
                    break
                except ValueError:
                    print("Please enter a valid number")
            
            while True:
                try:
                    end_month = int(input("Endmonat (1-12): ").strip())
                    if end_month < 1 or end_month > 12:
                        print("Please enter a valid month (1-12)")
                        continue
                    if end_month < start_month:
                        print(f"End month must be >= start month ({start_month})")
                        continue
                    break
                except ValueError:
                    print("Please enter a valid number")
            
            start_date = f"2014-{start_month:02d}-15"
            end_date = f"2014-{end_month:02d}-15"
            print(f"Selected: {start_date} to {end_date}")
            print("Das Jahr 2014 und der 15. Tag dienen als Platzhalter für die monatlichen Medianwerte der Jahre 2014 bis 2023")
            return start_date, end_date
            
        elif choice == "3":
            # Single month
            while True:
                try:
                    month = int(input("Wählen Sie einen einzelnen Monat (1-12)(January = 1, [...], December = 12): ").strip())
                    if month < 1 or month > 12:
                        print("Please enter a valid month (1-12)")
                        continue
                    break
                except ValueError:
                    print("Please enter a valid number")
            
            start_date = f"2014-{month:02d}-15"
            end_date = f"2014-{month:02d}-15"
            print(f"Ausgewählt: Einzelner Monat ({start_date})")
            print("Das Jahr 2014 und der 15. Tag dienen als Platzhalter für die monatlichen Medianwerte der Jahre 2014 bis 2023")
            return start_date, end_date
            
        else:
            print("Invalid choice. Please select 1, 2, or 3.")
            
start_date, end_date = get_timeframe()

############################################################################################################################################################

# Data Preprocessing

# --- Determine polygon and bounds based on selected mode ---
if aoi_mode == 'municipality':
    place_gdf = ox.geocode_to_gdf(f"{aoi_name}, Germany")
    aoi_polygon = place_gdf.geometry.iloc[0]
    bounds = aoi_polygon.bounds
    print(f"AOI: {aoi_name}")
    print(f"Bounds (WGS84): {bounds}")
else:  # bbox mode
    aoi_polygon = aoi_geom
    bounds = aoi_geom.bounds
    print(f"AOI: {aoi_name} (custom bbox)")
    print(f"Bounds (WGS84): {bounds}")

# The rest of the tile download functions remain unchanged
def get_tile_coords(bounds, crs_epsg=25832):
    
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)
    minx, miny = transformer.transform(bounds[0], bounds[1])
    maxx, maxy = transformer.transform(bounds[2], bounds[3])
    
    print(f"Bounds in UTM32: minx={minx:.0f}, miny={miny:.0f}, maxx={maxx:.0f}, maxy={maxy:.0f}")
    
    start_easting_km = math.floor(minx / 1000)
    end_easting_km = math.ceil(maxx / 1000)
    start_northing_km = math.floor(miny / 1000)
    end_northing_km = math.ceil(maxy / 1000)
    
    print(f"Tile ranges in km: easting {start_easting_km} to {end_easting_km}, northing {start_northing_km} to {end_northing_km}")
    
    tiles = []
    for easting_km in range(start_easting_km, end_easting_km):
        for northing_km in range(start_northing_km, end_northing_km):
            tiles.append((easting_km, northing_km))
    
    print(f"Generated {len(tiles)} tile coordinates")
    if tiles:
        print(f"Sample coordinates: {tiles[:3]}")
        print(f"Sample pattern: dgm1_32_{tiles[0][0]}_{tiles[0][1]}_1_nw_")
    return tiles

def find_latest_tile(easting_km, northing_km, data_type="dgm", base_url="https://www.opengeodata.nrw.de/produkte/geobasis/hm/"):
    
    try:
        if data_type == "dgm":
            url_base = base_url + "dgm1_tiff/dgm1_tiff/"
            filename_base = f"dgm1_32_{easting_km}_{northing_km}_1_nw_"
        elif data_type == "dom":
            url_base = base_url + "dom1_tiff/dom1_tiff/"
            filename_base = f"dom1_32_{easting_km}_{northing_km}_1_nw_"
        else:
            raise ValueError("data_type must be 'dgm' or 'dom'")

        print(f"Trying to find tile: {filename_base}*")
        years_to_try = [str(year) for year in range(2024, 2017, -1)]
        
        for year in years_to_try:
            filename = filename_base + year + ".tif"
            url = url_base + filename
            print(f"Testing: {filename}")
            try:
                response = requests.head(url, timeout=10)
                if response.status_code == 200:
                    print(f"✓ Found: {filename}")
                    return filename, url_base
                elif response.status_code == 404:
                    continue
                else:
                    print(f"  Status {response.status_code} for {filename}")
            except requests.exceptions.RequestException as e:
                print(f"  Error checking {filename}: {e}")
                continue

        print(f"✗ No tile found for {easting_km}_{northing_km} with years {years_to_try[0]}-{years_to_try[-1]}")
        return None, None
    except Exception as e:
        print(f"Error finding {data_type} tile for {easting_km}_{northing_km}: {e}")
        return None, None

def download_tile(easting_km, northing_km, data_type="dgm", output_dir="./data/"):
    
    result = find_latest_tile(easting_km, northing_km, data_type)
    if not result or not result[0]:
        print(f"No {data_type} tile found for coordinates {easting_km}_{northing_km}")
        return None
    filename, base_url = result
    url = base_url + filename
    output_path = Path(output_dir) / filename
    try:
        if output_path.exists():
            print(f"Tile already exists: {filename}")
            return output_path
        print(f"Downloading: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"Downloaded: {filename}")
        return output_path
    except requests.exceptions.RequestException as e:
        print(f"Failed to download {filename}: {e}")
        return None

def merge_tiles(tile_paths, output_path, method='first', resampling=None):
    
    if not tile_paths:
        print("No tiles to merge")
        return None
    print(f"Merging {len(tile_paths)} tiles...")
    src_files_to_mosaic = []
    try:
        for i, tile_path in enumerate(tile_paths):
            try:
                src = rasterio.open(tile_path)
                src_files_to_mosaic.append(src)
                print(f"  [{i+1}/{len(tile_paths)}] Loaded: {tile_path.name}")
            except Exception as e:
                print(f"  [{i+1}/{len(tile_paths)}] Failed to load {tile_path.name}: {e}")
        if not src_files_to_mosaic:
            print("No tiles could be loaded")
            return None
        merge_kwargs = {'method': method}
        if resampling:
            merge_kwargs['resampling'] = resampling
        mosaic, out_trans = merge(src_files_to_mosaic, **merge_kwargs)
        out_meta = src_files_to_mosaic[0].meta.copy()
        out_meta.update({
            "driver": "GTiff",
            "height": mosaic.shape[1],
            "width": mosaic.shape[2],
            "transform": out_trans,
            "compress": "lzw"
        })
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(output_path, "w", **out_meta) as dest:
            dest.write(mosaic)
        print(f"✓ Merge completed: {output_path}")
        return output_path
    except Exception as e:
        print(f"✗ Merge failed: {e}")
        return None
    finally:
        for src in src_files_to_mosaic:
            try:
                src.close()
            except:
                pass

def download_and_merge_tiles(aoi, bounds, data_type, input_path, clean_name):
    
    print(f"Downloading {data_type.upper()} tiles for {aoi}...")
    tile_coords = get_tile_coords(bounds)
    print(f"Need {len(tile_coords)} {data_type.upper()} tiles")
    tile_paths = []
    for i, (easting, northing) in enumerate(tile_coords):
        print(f"Processing tile {i+1}/{len(tile_coords)}: {easting}_{northing}")
        tile_path = download_tile(easting, northing, data_type, output_dir=input_path)
        if tile_path:
            tile_paths.append(tile_path)
    if not tile_paths:
        print(f"No {data_type.upper()} tiles were downloaded successfully!")
        return None
    merged_path = input_path / f"{data_type.upper()}.tif"
    print(f"Merging {len(tile_paths)} tiles into {merged_path}")
    merge_tiles(tile_paths, merged_path)
    return merged_path

# Download DGM and DOM
print("Downloading elevation data...")
dgm_path = download_and_merge_tiles(aoi_name, bounds, "dgm", input_path, clean_name)
dom_path = download_and_merge_tiles(aoi_name, bounds, "dom", input_path, clean_name)
print(f"DGM ready: {dgm_path}")
print(f"DOM ready: {dom_path}")

def create_ndsm(dom_path, dgm_path, output_dir="./data"):
    
    try:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        ndsm_path = output_dir / "nDSM.tif"
        print(f"Creating nDSM from:\n  DOM: {dom_path}\n  DGM: {dgm_path}")
        print(f"Output: {ndsm_path}")
        with rasterio.open(dom_path) as dom_src, rasterio.open(dgm_path) as dgm_src:
            dom_data = dom_src.read(1)
            dgm_data = dgm_src.read(1)
            if dom_data.shape != dgm_data.shape:
                raise ValueError(f"DOM and DGM rasters have different dimensions: {dom_data.shape} vs {dgm_data.shape}")
            if dom_src.crs != dgm_src.crs:
                print("Warning: DOM and DGM have different CRS")
            if dom_src.transform != dgm_src.transform:
                print("Warning: DOM and DGM have different geotransforms")
            result_data = dom_data - dgm_data
            if dom_src.nodata is not None:
                dom_nodata_mask = dom_data == dom_src.nodata
                result_data[dom_nodata_mask] = dom_src.nodata
            if dgm_src.nodata is not None:
                dgm_nodata_mask = dgm_data == dgm_src.nodata
                result_data[dgm_nodata_mask] = dgm_src.nodata
            profile = dom_src.profile
            profile.update(
                dtype=rasterio.float32,
                count=1,
                nodata=dom_src.nodata if dom_src.nodata is not None else -9999
            )
            with rasterio.open(ndsm_path, 'w', **profile) as dst:
                dst.write(result_data.astype(rasterio.float32), 1)
        print(f"✓ Successfully created nDSM: {ndsm_path}")
        return ndsm_path
    except FileNotFoundError as e:
        print(f"✗ Error: File not found - {e}")
        return None
    except Exception as e:
        print(f"✗ Error processing rasters: {e}")
        import traceback
        traceback.print_exc()
        return None

print("Creating nDSM...")
ndsm_path = create_ndsm(dom_path, dgm_path, input_path)
if ndsm_path:
    print(f"nDSM ready: {ndsm_path}")
else:
    print("Failed to create nDSM")


# --- Boundary creation (municipality vs bbox) ---
if aoi_mode == 'municipality':
    # Use the already geocoded polygon
    place_gdf = gpd.GeoDataFrame(geometry=[aoi_polygon], crs="EPSG:4326")
    
    # Get administrative boundary with specific tags
    tags = {
        "admin_level": "8",
        "boundary": "administrative"
    }
    gdf = ox.features_from_polygon(aoi_polygon, tags=tags)
    gdf = gdf[gdf['name'] == aoi_name]
    
    # Save boundary shapefile (original CRS)
    boundary_filename = f"{clean_name}_boundary.shp"
    gdf.to_file(output_path / boundary_filename)
    print(f"Boundary saved to: {output_path / boundary_filename}")
    
    # Reproject to EPSG:25832
    boundary_gdf_reprojected = gdf.to_crs('EPSG:25832')
    boundary_filename_25832 = f"{clean_name}_boundary_25832.shp"
    boundary_gdf_reprojected.to_file(output_path / boundary_filename_25832)
    print(f"Reprojected boundary saved to: {output_path / boundary_filename_25832}")
    
else:  # bbox mode
    # Create boundary from the bbox polygon
    gdf = gpd.GeoDataFrame(geometry=[aoi_polygon], crs="EPSG:4326")
    boundary_filename = f"{clean_name}_boundary.shp"
    gdf.to_file(output_path / boundary_filename)
    print(f"Boundary saved to: {output_path / boundary_filename}")
    
    boundary_gdf_reprojected = gdf.to_crs('EPSG:25832')
    boundary_filename_25832 = f"{clean_name}_boundary_25832.shp"
    boundary_gdf_reprojected.to_file(output_path / boundary_filename_25832)
    print(f"Reprojected boundary saved to: {output_path / boundary_filename_25832}")


def get_buildings_as_polygons(boundary_path, result_path):
    
    boundary_gdf = gpd.read_file(boundary_path)
    print(f"Boundary CRS: {boundary_gdf.crs}")
    try:
        print("Downloading OSM buildings using boundary polygon...")
        all_features = ox.features_from_polygon(
            boundary_gdf.geometry.iloc[0],
            tags={'building': True}
        )
    except Exception as e:
        print(f"Error retrieving OSM data: {e}")
        return None
    print(f"Total features retrieved: {len(all_features)}")
    if len(all_features) == 0:
        print("No features found in OSM")
        return None
    polygon_features = all_features[
        all_features.geometry.type.isin(['Polygon', 'MultiPolygon'])
    ].copy()
    print(f"Polygon features (building footprints): {len(polygon_features)}")
    if 'building' in polygon_features.columns:
        polygon_features['building'] = polygon_features['building'].fillna('unknown')
        polygon_features['building'] = polygon_features['building'].astype(str)
        polygon_features['building'] = polygon_features['building'].replace('nan', 'unknown')
    else:
        polygon_features['building'] = 'unknown'
    unwanted_building_values = [
        'shelter', 'roof', 'garage', 'carport', 'toilets', 'kiosk',
        'greenhouse', 'conservatory', 'booth', 'hut', 'shed', 'canopy',
        'ruins', 'roof', 'construction', 'container', 'tent', 'bunker',
        'bridge', 'train_station', 'bus_station', 'parking', 'transportation',
        'service', 'technical', 'transformer_tower', 'storage_tank'
    ]
    filtered_buildings = polygon_features[
        ~polygon_features['building'].isin(unwanted_building_values)
    ]
    print(f"Buildings after filtering: {len(filtered_buildings)}")
    print(f"Removed {len(polygon_features) - len(filtered_buildings)} unwanted structures")
    filtered_buildings = filtered_buildings.to_crs('EPSG:25832')
    print("Reprojected buildings to EPSG:25832")
    filtered_buildings.to_file(result_path)
    print(f"Filtered building polygons saved to: {result_path}")
    return filtered_buildings

### Usage with dynamic naming
boundary_path = output_path / f"{clean_name}_boundary.shp"  # Original CRS
result_path = output_path / f"{clean_name}_building_footprints.shp"
building_footprints = get_buildings_as_polygons(boundary_path, result_path)

def get_amenities_as_points(boundary_path, result_path_benches, result_path_water):
    # ... (unchanged from original) ...
    boundary_gdf = gpd.read_file(boundary_path)
    print("Downloading OSM benches...")
    benches = ox.features_from_polygon(
        boundary_gdf.geometry.iloc[0],
        tags={'amenity': 'bench'}
    )
    print("Downloading OSM drinking water...")
    water = ox.features_from_polygon(
        boundary_gdf.geometry.iloc[0],
        tags={'amenity': 'drinking_water'}
    )
    benches_points = benches[benches.geometry.type == 'Point'].copy() if not benches.empty else gpd.GeoDataFrame()
    water_points = water[water.geometry.type == 'Point'].copy() if not water.empty else gpd.GeoDataFrame()
    if not benches.empty:
        benches_poly = benches[benches.geometry.type.isin(['Polygon', 'MultiPolygon'])].copy()
        if not benches_poly.empty:
            original_crs = benches_poly.crs
            benches_poly = benches_poly.to_crs('EPSG:3857')
            benches_poly.geometry = benches_poly.geometry.centroid
            benches_poly = benches_poly.to_crs(original_crs)
            benches_points = pd.concat([benches_points, benches_poly], ignore_index=True)
    if not water.empty:
        water_poly = water[water.geometry.type.isin(['Polygon', 'MultiPolygon'])].copy()
        if not water_poly.empty:
            original_crs = water_poly.crs
            water_poly = water_poly.to_crs('EPSG:3857')
            water_poly.geometry = water_poly.geometry.centroid
            water_poly = water_poly.to_crs(original_crs)
            water_points = pd.concat([water_points, water_poly], ignore_index=True)
    if not benches_points.empty:
        benches_points['icon'] = 'bench'
    if not water_points.empty:
        water_points['icon'] = 'water'
    if not benches_points.empty:
        benches_points = benches_points.to_crs('EPSG:4326')
    if not water_points.empty:
        water_points = water_points.to_crs('EPSG:4326')
    if not benches_points.empty:
        benches_points.to_file(result_path_benches, driver='GeoJSON')
        print(f"Benches saved: {len(benches_points)} to {result_path_benches}")
    else:
        print("No benches found")
    if not water_points.empty:
        water_points.to_file(result_path_water, driver='GeoJSON')
        print(f"Drinking water saved: {len(water_points)} to {result_path_water}")
    else:
        print("No drinking water found")
    return benches_points, water_points

result_path_benches = output_path / f"{clean_name}_benches.geojson"
result_path_water = output_path / f"{clean_name}_water.geojson"
benches_gdf, water_gdf = get_amenities_as_points(boundary_path, result_path_benches, result_path_water)
print(f"Returned benches: {len(benches_gdf) if not benches_gdf.empty else 0}")
print(f"Returned water points: {len(water_gdf) if not water_gdf.empty else 0}")


def get_higher_admin_boundary(lower_boundary_path, admin_districts_path):
    
    lower_boundary = gpd.read_file(lower_boundary_path)
    admin_districts = gpd.read_file(admin_districts_path)
    if lower_boundary.crs != admin_districts.crs:
        admin_districts = admin_districts.to_crs(lower_boundary.crs)
    containing_districts = admin_districts[
        admin_districts.geometry.contains(lower_boundary.geometry.iloc[0])
    ]
    if len(containing_districts) == 0:
        containing_districts = admin_districts[
            admin_districts.geometry.intersects(lower_boundary.geometry.iloc[0])
        ]
    if len(containing_districts) > 0:
        higher_admin_name = containing_districts.iloc[0]['GN']
        print(f"Higher administrative boundary found: {higher_admin_name}")
        return higher_admin_name
    else:
        print("No higher administrative boundary found")
        return None

higher_admin_name = get_higher_admin_boundary(
    lower_boundary_path= boundary_path,
    admin_districts_path= rbz_path)

if higher_admin_name:
    print(f"AOI {aoi_name} is in: {higher_admin_name}")
else:
    print("Warning: higher admin district not found; land use data download may fail.")


def download_landuse_data(higher_admin_name, output_dir="./landcover"):
    # ... (unchanged) ...
    admin_to_code = {
        'Arnsberg': '05900000',
        'Detmold': '05700000',
        'Düsseldorf': '05100000',
        'Köln': '05300000',
        'Münster': '05500000'
    }
    if higher_admin_name not in admin_to_code:
        print(f"Unknown administrative region: {higher_admin_name}")
        print(f"Available regions: {list(admin_to_code.keys())}")
        return None
    region_code = admin_to_code[higher_admin_name]
    filename = f"lb_nrw_{region_code}_{higher_admin_name}_EPSG25832_GeoPackage.zip"
    url = f"https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/lb_nrw/{filename}"
    output_path = Path(output_dir) / filename
    try:
        if output_path.exists():
            print(f"Land use file already exists: {filename}")
            return output_path
        print(f"Downloading land use data for {higher_admin_name}...")
        print(f"URL: {url}")
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"✓ Successfully downloaded: {filename}")
        return output_path
    except requests.exceptions.RequestException as e:
        print(f"✗ Failed to download land use data: {e}")
        return None
    except Exception as e:
        print(f"✗ Error downloading land use data: {e}")
        return None

def extract_landuse_data(zip_path, output_dir="./landcover"):
    
    try:
        zip_path = Path(zip_path)
        extract_dir = Path(output_dir) / "landuse"
        extract_dir.mkdir(parents=True, exist_ok=True)
        print(f"Extracting {zip_path.name} to {extract_dir}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        gpkg_files = list(extract_dir.glob("*.gpkg"))
        if gpkg_files:
            gpkg_path = gpkg_files[0]
            print(f"✓ Extracted land use data: {gpkg_path}")
            return gpkg_path
        else:
            print("✗ No GeoPackage file found in the zip archive")
            return None
    except Exception as e:
        print(f"✗ Error extracting land use data: {e}")
        return None

landuse_zip_path = download_landuse_data(higher_admin_name, input_path)
if landuse_zip_path:
    landuse_gpkg_path = extract_landuse_data(landuse_zip_path, input_path)
    if landuse_gpkg_path:
        print(f"Land use data ready: {landuse_gpkg_path}")
    else:
        print("Failed to extract land use data")
else:
    print("Failed to download land use data")


# Create building footprint layer from OSM and NRW data
boundary_filename_25832 = gpd.read_file(f"./output/{clean_name}_boundary_25832.shp")
nrw_buildings = gpd.read_file(f"./data/landuse/{higher_admin_name}.gpkg", layer='lb_hochbau')
osm_buildings = gpd.read_file(output_path / f"{clean_name}_building_footprints.shp")

clipped_nrw_buildings = gpd.clip(nrw_buildings, boundary_filename_25832)
clipped_osm_buildings = gpd.clip(osm_buildings, boundary_filename_25832)

merged_buildings = gpd.pd.concat([clipped_nrw_buildings, clipped_osm_buildings])
buildings_dissolved = merged_buildings.dissolve()
buildings_dissolved['geometry'] = buildings_dissolved.buffer(2)
buildings_dissolved['burn'] = 0
buildings_dissolved.to_file('./output/buildings_buffered.shp')


# Clip all raster files to boundary
def clip_raster_to_boundary(raster_path, boundary_path, output_path):
    
    try:
        boundary_gdf = gpd.read_file(boundary_path)
        with rasterio.open(raster_path) as src:
            out_image, out_transform = mask(
                src,
                boundary_gdf.geometry,
                crop=True,
                all_touched=True
            )
            out_meta = src.meta.copy()
            out_meta.update({
                "driver": "GTiff",
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform
            })
            with rasterio.open(output_path, "w", **out_meta) as dest:
                dest.write(out_image)
        print(f"✓ Clipped: {raster_path.name} -> {output_path.name}")
        return output_path
    except Exception as e:
        print(f"✗ Error clipping {raster_path.name}: {e}")
        return None

print("Clipping raster files to boundary...")
boundary_path = output_path / f"{clean_name}_boundary_25832.shp"

raster_files_to_clip = [
    ("data/nDSM.tif", "data/nDSM.tif"),
    ("data/DGM.tif", "data/DGM.tif"),
    ("data/DOM.tif", "data/DOM.tif")
]

for input_raster, output_raster in raster_files_to_clip:
    raster_input_path = Path(input_raster)
    raster_output_path = Path(output_raster)
    
    if raster_input_path.exists():
        clip_raster_to_boundary(raster_input_path, boundary_path, raster_output_path)
    else:
        print(f"✗ Raster file not found: {raster_input_path}")


# Burn column into nDSM (rest unchanged)
buildings = gpd.read_file('./output/buildings_buffered.shp')
with rasterio.open('./data/nDSM.tif') as src:
    original_data = src.read(1)
    profile = src.profile.copy()
    transform = src.transform
    raster_shape = src.shape

building_mask = rasterize(
    shapes=[(geom, 1) for geom in buildings.geometry],
    out_shape=raster_shape,
    transform=transform,
    fill=0,
    dtype=np.uint8
)
output_data = np.where(building_mask == 1, 0, original_data)
with rasterio.open('./output/burned_buildings_raster.tif', 'w', **profile) as dst:
    dst.write(output_data, 1)
print("Done! Buildings burned with 0 values, rest preserved.")

# Create CDSM
with rasterio.open('./output/burned_buildings_raster.tif') as src:
    data = src.read(1)
    profile = src.profile.copy()
data[data < 4] = 0
data[data > 50] = 0
with rasterio.open('./output/CDSM.tif', 'w', **profile) as dst:
    dst.write(data, 1)
print("All values below 4 set to 0.\nCDSM created!")

# Create inverted Buildings Raster
gdf = gpd.read_file('./output/buildings_buffered.shp')
with rasterio.open('./data/nDSM.tif') as src:
    original_data = src.read(1)
    profile = src.profile.copy()
    transform = src.transform
    raster_shape = src.shape
building_mask = rasterize(
    shapes=[(geom, 1) for geom in gdf.geometry],
    out_shape=raster_shape,
    transform=transform,
    fill=0,
    dtype=np.uint8
)
output_data = np.where(building_mask == 0, 0, original_data)
with rasterio.open('./output/burned_inverted_buildings_raster.tif', 'w', **profile) as dst:
    dst.write(output_data, 1)
print("Done! Area around buildings burned with 0 values, rest preserved.")

# DSM addition
with rasterio.open('./output/burned_inverted_buildings_raster.tif') as src1, rasterio.open('./data/DGM.tif') as src2:
    data1 = src1.read(1)
    data2 = src2.read(1)
    profile = src1.profile.copy()
    result = data1 + data2
with rasterio.open('./output/DSM.tif', 'w', **profile) as dst:
    dst.write(result, 1)
print("Raster addition completed!\nDSM created!")

# Landcover creation (unchanged)
layer_values = {
    'lb_tiefbau': 1,
    'lb_hochbau': 2,
    'lb_holzigevegetation': 5,
    'lb_krautigevegetation': 5,
    'lb_lockermaterial': 6,
    'lb_binnengewaesser': 7
}

with rasterio.open('./output/CDSM.tif') as src:
    profile = src.profile.copy()
    transform = src.transform
    raster_shape = src.shape
    crs = src.crs

combined_raster = np.full(raster_shape, profile.get('nodata', -9999), dtype=profile['dtype'])
for layer_name, value in layer_values.items():
    try:
        gdf = gpd.read_file(f"./data/landuse/{higher_admin_name}.gpkg", mask=boundary_filename_25832, layer=layer_name)
        if gdf.crs != crs:
            gdf = gdf.to_crs(crs)
        layer_raster = rasterize(
            shapes=[(geom, value) for geom in gdf.geometry],
            out_shape=raster_shape,
            transform=transform,
            fill=profile.get('nodata', -9999),
            dtype=profile['dtype']
        )
        combined_raster = np.where(layer_raster != profile.get('nodata', -9999),
                                   layer_raster, combined_raster)
        print(f"Processed layer: {layer_name} with value {value}")
    except Exception as e:
        print(f"Error processing layer {layer_name}: {e}")

with rasterio.open('./output/landcover.tif', 'w', **profile) as dst:
    dst.write(combined_raster, 1)
print("Landcover raster created!")

#####################################################################################################################################

# Climate data processing (unchanged)
data_dir = Path("./data")
epw_files = list(data_dir.glob("*.epw"))
if epw_files:
    epw_path = epw_files[0]
    print(f"Reading EPW header from: {epw_path.name}")
    with open(epw_path, 'r') as f:
        header_lines = [f.readline().strip() for _ in range(8)]
else:
    print("No EPW file found in ./data/ directory")
    header_lines = []

for i, line in enumerate(header_lines):
    if line.startswith('DATA PERIODS'):
        header_lines[i] = 'DATA PERIODS,1,1,Data,2014,1,2014,12,31'
        print(f"Updated DATA PERIODS line: {header_lines[i]}")
epw_header = "\n".join(header_lines) + "\n"
print("EPW header extracted and updated successfully")

print("Reading EPW data...")
df = pd.read_csv('data/epw_10_years.epw', skiprows=8, header=None, delimiter=',')
epw_columns = [
    'Year', 'Month', 'Day', 'Hour', 'Minute', 'Data Source and Uncertainty Flags',
    'Dry Bulb Temperature', 'Dew Point Temperature', 'Relative Humidity',
    'Atmospheric Station Pressure', 'Extraterrestrial Horizontal Radiation',
    'Extraterrestrial Direct Normal Radiation', 'Horizontal Infrared Radiation Intensity',
    'Global Horizontal Radiation', 'Direct Normal Radiation', 'Diffuse Horizontal Radiation',
    'Global Horizontal Illuminance', 'Direct Normal Illuminance', 'Diffuse Horizontal Illuminance',
    'Zenith Luminance', 'Wind Direction', 'Wind Speed', 'Total Sky Cover', 'Opaque Sky Cover',
    'Visibility', 'Ceiling Height', 'Present Weather Observation', 'Present Weather Codes',
    'Precipitable Water', 'Aerosol Optical Depth', 'Snow Depth', 'Days Since Last Snowfall',
    'Albedo', 'Liquid Precipitation Depth', 'Liquid Precipitation Quantity'
]
df.columns = epw_columns
print(f"Data range: {df['Year'].min()} to {df['Year'].max()}")
print(f"Total records: {len(df):,}")

df = df[df['Year'].between(2014, 2023)].copy()
time_columns = ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Data Source and Uncertainty Flags']
data_columns = [col for col in epw_columns if col not in time_columns]
missing_indicators = [9999, 999, 999.0, 999.00, 999999, 999999.0, 9999.0, 99999, 999.000]
for col in data_columns:
    df[col] = df[col].replace(missing_indicators, np.nan)

typical_days = {1:15,2:15,3:15,4:15,5:15,6:15,7:15,8:15,9:15,10:15,11:15,12:15}
output_dir = Path('./output/')
output_dir.mkdir(exist_ok=True)
print("\nProcessing median year...")
results = []
for month in range(1, 13):
    typical_day = typical_days[month]
    print(f"Processing month {month} (day {typical_day})...")
    for hour in range(1, 25):
        month_data = df[(df['Month'] == month) & (df['Day'] == typical_day) & (df['Hour'] == hour)].copy()
        if len(month_data) > 0:
            stats = month_data[data_columns].median(skipna=True)
            result_row = {
                'Year': 2014,
                'Month': month,
                'Day': typical_day,
                'Hour': hour,
                'Minute': 0,
                'Data Source and Uncertainty Flags': 9
            }
            result_row.update(stats)
            results.append(result_row)

results_df = pd.DataFrame(results)
results_df = results_df[epw_columns]
for col in data_columns:
    if results_df[col].dtype in ['float64', 'float32']:
        results_df[col] = results_df[col].fillna(999.0)
    else:
        results_df[col] = results_df[col].fillna(999)

output_file = output_dir / "clim_typical_year_median.epw"
print(f"\nSaving median year to: {output_file}")
with open(output_file, 'w') as f:
    f.write(epw_header)
    for _, row in results_df.iterrows():
        line = ",".join(str(int(value)) if col in ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Data Source and Uncertainty Flags']
                        else f"{float(value):.1f}"
                        for col, value in row.items())
        f.write(line + "\n")

print(f"Records created: {len(results_df):,}")
print(f"Year range in output: {results_df['Year'].min()} to {results_df['Year'].max()}")
print(f"Months in output: {sorted(results_df['Month'].unique())}")
print(f"\nSample of median year results:")
print(results_df.head(3).to_string(index=False))
print("...")
print(results_df.tail(3).to_string(index=False))
print(f"\nProcessing complete! Check {output_file} for results.")


# Final clip check
boundary_path = output_path / f"{clean_name}_boundary_25832.shp"
raster_files_to_clip = [
    ("data/nDSM.tif", "data/nDSM.tif"),
    ("data/DGM.tif", "data/DGM.tif"),
    ("data/DOM.tif", "data/DOM.tif"),
    ("output/DSM.tif", "output/DSM.tif"),
    ("output/CDSM.tif", "output/CDSM.tif"),
    ("output/landcover.tif", "output/landcover.tif")
]
for input_raster, output_raster in raster_files_to_clip:
    raster_input_path = Path(input_raster)
    raster_output_path = Path(output_raster)
    
    if raster_input_path.exists():
        clip_raster_to_boundary(raster_input_path, boundary_path, raster_output_path)
    else:
        print(f"✗ Raster file not found: {raster_input_path}")
###################################################################################################################################

# Check GPU status
print(solweig.is_gpu_available())     # True/False
print(solweig.get_compute_backend())  # "gpu" or "cpu"
print(solweig.get_gpu_limits())       # {"max_buffer_size": ..., "backend": "Metal"}

# 1. Load surface — prepare() computes and caches walls/SVF when missing
surface = solweig.SurfaceData.prepare(
    dsm="output/DSM.tif",
    cdsm="output/CDSM.tif", # Optional: vegetation canopy heights
    land_cover="output/landcover.tif",
    working_dir="cache/",        # Expensive preprocessing cached here
)

# 2. Load weather from an EPW file (standard format from climate databases)
weather_list = solweig.Weather.from_epw(
    "output/clim_typical_year_median.epw",
    start=start_date,
    end=end_date,
)
location = solweig.Location.from_epw("output/clim_typical_year_median.epw")

# 3. Run — outputs saved as GeoTIFFs, thermal state carried between timesteps
summary = solweig.calculate(
    surface=surface,
    weather=weather_list,
    location=location,
    output_dir="umep/output/",
    outputs=["tmrt"],
)

# 4. Inspect results
print(summary.report())
#summary.plot()

################################################################################################################################


###############################################################################
# PMTILES: convert benches and water GeoJSON to vector tiles
###############################################################################

# Define pmtiles output directory once – all PMTiles files will go here
pmtiles_dir = output_path / "pmtiles"
pmtiles_dir.mkdir(parents=True, exist_ok=True)

def convert_geojson_to_pmtiles(input_geojson, output_pmtiles, layer_name=None, extra_args=None):
    """
    Convert a GeoJSON file to a PMTiles archive using tippecanoe.
    Optional layer_name and extra_args allow reuse for all tile types.
    """
    cmd = [
        'tippecanoe',
        '-o', str(output_pmtiles),
        '-f',  # force overwrite
    ]
    if layer_name:
        cmd += ['-l', layer_name]
    if extra_args:
        cmd += extra_args
    cmd.append(str(input_geojson))

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"✓ Created PMTiles: {output_pmtiles}")
    except subprocess.CalledProcessError as e:
        print(f"✗ tippecanoe failed: {e.stderr}")

# Convert benches
convert_geojson_to_pmtiles(
    result_path_benches,
    pmtiles_dir / "benches.pmtiles",
    layer_name='benches',
    extra_args=['--drop-densest-as-needed', '--extend-zooms-if-still-dropping', '-Z', '10', '-z', '22']
)

# Convert drinking water
convert_geojson_to_pmtiles(
    result_path_water,
    pmtiles_dir / "water.pmtiles",
    layer_name='drinking_water',
    extra_args=['--drop-densest-as-needed', '--extend-zooms-if-still-dropping', '-Z', '10', '-z', '22']
)

# Tmrt

def create_matplotlib_colormap(input_tiff, output_tiff, cmap_name="turbo"):
    """
    Create a 3-band RGB GeoTIFF from a single-band raster using a matplotlib colormap.
    """
    try:
        import matplotlib.pyplot as plt
        cmap = plt.get_cmap(cmap_name)
    except ImportError:
        print("Matplotlib not available, cannot create colormap")
        return None
    
    with rasterio.open(input_tiff) as src:
        data = src.read(1)
        nodata = src.nodata
        
        # Create mask for valid data
        if nodata is not None:
            valid_mask = data != nodata
        else:
            valid_mask = np.ones_like(data, dtype=bool)
        
        # Create RGB arrays as uint8 directly
        red = np.zeros(data.shape, dtype='uint8')
        green = np.zeros(data.shape, dtype='uint8')
        blue = np.zeros(data.shape, dtype='uint8')
        alpha = np.zeros(data.shape, dtype='uint8')
        
        if np.any(valid_mask):
            valid_data = data[valid_mask]
            min_val = np.min(valid_data)
            max_val = np.max(valid_data)
            
            # Normalize to 0-1 range
            if max_val > min_val:
                normalized = (valid_data - min_val) / (max_val - min_val)
            else:
                normalized = np.zeros_like(valid_data)
            
            # Apply matplotlib colormap (returns RGBA values 0-1)
            colored = cmap(normalized)
            
            # Convert to 0-255 range and assign
            red[valid_mask] = (colored[:, 0] * 255).clip(0, 255).astype('uint8')
            green[valid_mask] = (colored[:, 1] * 255).clip(0, 255).astype('uint8')
            blue[valid_mask] = (colored[:, 2] * 255).clip(0, 255).astype('uint8')
            alpha[valid_mask] = 255  # Fully opaque for valid data
        
        # NoData areas remain 0,0,0,0 (transparent black)
        
        # Update profile for 4-band RGBA output
        profile = src.profile.copy()
        profile.update({
            'count': 4,
            'dtype': 'uint8',
            'nodata': 0,
            'compress': 'lzw'
        })
        
        with rasterio.open(output_tiff, 'w', **profile) as dst:
            dst.write(red, 1)
            dst.write(green, 2)
            dst.write(blue, 3)
            dst.write(alpha, 4)
        
        print(f"  Data range: {min_val:.1f} to {max_val:.1f}")
        print(f"  Valid pixels colored: {np.sum(valid_mask)}")
    
    return output_tiff

###############################################################################
# Tmrt PMTiles conversion
###############################################################################

def create_matplotlib_colormap(input_tiff, output_tiff, cmap_name="turbo"):
    """
    Create a 3-band RGB GeoTIFF from a single-band raster using a matplotlib colormap.
    """
    try:
        import matplotlib.pyplot as plt
        cmap = plt.get_cmap(cmap_name)
    except ImportError:
        print("Matplotlib not available, cannot create colormap")
        return None
    
    with rasterio.open(input_tiff) as src:
        data = src.read(1).astype('float64')
        nodata = src.nodata
        
        # Create valid mask: not nodata AND not NaN AND not inf
        valid_mask = np.ones_like(data, dtype=bool)
        if nodata is not None:
            valid_mask &= (data != nodata)
        valid_mask &= (~np.isnan(data))
        valid_mask &= (~np.isinf(data))
        
        # Create RGB arrays explicitly as uint8
        red = np.zeros(data.shape, dtype='uint8')
        green = np.zeros(data.shape, dtype='uint8')
        blue = np.zeros(data.shape, dtype='uint8')
        
        if np.any(valid_mask):
            valid_data = data[valid_mask]
            min_val = np.nanmin(valid_data)
            max_val = np.nanmax(valid_data)
            
            print(f"  Data range: {min_val:.2f} to {max_val:.2f}")
            
            if max_val > min_val:
                normalized = (valid_data - min_val) / (max_val - min_val)
            else:
                normalized = np.zeros_like(valid_data)
            
            colored = cmap(normalized)
            
            red[valid_mask] = (colored[:, 0] * 255).clip(0, 255).astype('uint8')
            green[valid_mask] = (colored[:, 1] * 255).clip(0, 255).astype('uint8')
            blue[valid_mask] = (colored[:, 2] * 255).clip(0, 255).astype('uint8')
        
        profile = src.profile.copy()
        profile.update({
            'count': 3,
            'dtype': 'uint8',
            'nodata': None
        })
        
        with rasterio.open(output_tiff, 'w', **profile) as dst:
            dst.write(red, 1)
            dst.write(green, 2)
            dst.write(blue, 3)
    
    return output_tiff


def create_matplotlib_pmtiles(input_tiff, output_pmtiles, cmap_name="turbo"):
    """Create a PMTiles raster tile set from a single-band GeoTIFF."""
    temp_colored = Path("temp_matplotlib.tif")
    create_matplotlib_colormap(input_tiff, temp_colored, cmap_name)
    
    cmd = [
        "rio", "pmtiles",
        str(temp_colored),
        str(output_pmtiles),
        "--format", "PNG"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # Clean up temp file
    if temp_colored.exists():
        temp_colored.unlink()
    
    if result.returncode == 0:
        print(f"✓ Created {output_pmtiles}")
        return True
    else:
        print(f"✗ Failed: {result.stderr}")
        return False


def create_pmtiles_for_all_tmrt_files(pmtiles_dir):
    """Find all merged Tmrt files and convert them to PMTiles."""
    output_dir = Path("umep/output/tmrt")
    tmrt_files = list(output_dir.glob("tmrt_*.tif"))
    
    if not tmrt_files:
        print("No Tmrt files found in umep/output/tmrt")
        return
    
    print(f"Found {len(tmrt_files)} Tmrt files to convert to PMTiles:")
    for f in tmrt_files:
        print(f"  - {f.name}")
    
    pmtiles_dir.mkdir(parents=True, exist_ok=True)
    
    for tmrt_file in tmrt_files:
        stem = tmrt_file.stem
        for cmap in ["turbo"]:
            output_pmtiles = pmtiles_dir / f"{stem}_{cmap}.pmtiles"
            print(f"\nProcessing: {tmrt_file.name} with {cmap} colormap...")
            try:
                create_matplotlib_pmtiles(str(tmrt_file), str(output_pmtiles), cmap_name=cmap)
            except Exception as e:
                print(f"✗ Error processing {tmrt_file.name} with {cmap}: {e}")


# Usage
create_pmtiles_for_all_tmrt_files(pmtiles_dir)


###############################################################################
# 3D Building integration (file footprints + DSM heights -> PMTiles)
###############################################################################

def extract_heights_from_dsm(shapefile_path, dsm_path, output_geojson):
    """Extract height statistics from DSM for each building footprint and save GeoJSON."""
    print("Integrating shapefile footprints with DSM height data...")
    buildings_gdf = gpd.read_file(shapefile_path)
    print(f"Found {len(buildings_gdf)} building footprints")

    with rasterio.open(dsm_path) as src:
        if buildings_gdf.crs != src.crs:
            buildings_gdf = buildings_gdf.to_crs(src.crs)

        building_heights = []
        for idx, building in buildings_gdf.iterrows():
            try:
                geom = [mapping(building.geometry)]
                out_image, _ = mask(src, geom, crop=True, filled=True)
                height_data = out_image[0]
                valid = height_data != src.nodata
                heights = height_data[valid]
                if len(heights) > 0:
                    relative_height = np.max(heights)  # assume ground is 0
                    building_heights.append({
                        'height': float(relative_height),
                        'min_height': 0.0,
                        'max_height': float(np.max(heights)),
                        'avg_height': float(np.mean(heights)),
                        'pixel_count': len(heights)
                    })
                else:
                    building_heights.append({'height': 10.0, 'min_height': 0, 'max_height': 10.0,
                                             'avg_height': 10.0, 'pixel_count': 0})
            except Exception as e:
                print(f"Error building {idx}: {e}")
                building_heights.append({'height': 10.0, 'min_height': 0, 'max_height': 10.0,
                                         'avg_height': 10.0, 'pixel_count': 0})

    heights_df = pd.DataFrame(building_heights)
    for col in heights_df.columns:
        buildings_gdf[col] = heights_df[col]

    # Keep only buildings taller than 2 m
    valid = buildings_gdf[buildings_gdf['height'] > 2.0]
    if valid.crs != 'EPSG:4326':
        valid = valid.to_crs('EPSG:4326')

    valid.to_file(output_geojson, driver='GeoJSON')
    print(f"Saved {len(valid)} buildings with heights to {output_geojson}")
    return output_geojson

def create_enhanced_buildings(geojson_path, output_path):
    """Add visualization properties (color, height category) to the GeoJSON."""
    with open(geojson_path, 'r') as f:
        data = json.load(f)

    for feat in data['features']:
        props = feat['properties']
        h = props.get('height', 10)
        if h < 5:
            props['color'] = '#e0e0e0'
            props['height_category'] = 'low'
        elif h < 10:
            props['color'] = '#c8c8c8'
            props['height_category'] = 'medium'
        elif h < 20:
            props['color'] = '#b0b0b0'
            props['height_category'] = 'high'
        elif h < 30:
            props['color'] = '#989898'
            props['height_category'] = 'very_high'
        else:
            props['color'] = '#808080'
            props['height_category'] = 'tall'
        props['min_height'] = props.get('min_height', 0)

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Enhanced buildings: {output_path}")
    return output_path

def building_to_pmtiles(geojson_path, output_pmtiles):
    """Convert building GeoJSON to PMTiles vector tiles."""
    cmd = [
        "tippecanoe",
        "-z", "16", "-Z", "12",
        "-o", str(output_pmtiles), "--force",
        "--coalesce",
        "--detect-shared-borders",
        "-l", "buildings",
        str(geojson_path)
    ]
    subprocess.run(cmd, check=True)
    print(f"✓ Created building PMTiles: {output_pmtiles}")

# Main integration
shapefile_path = output_path / f"{clean_name}_building_footprints.shp"
dsm_path = "data/nDSM.tif"  # (already clipped to boundary)

# Step 1: Extract heights
buildings_geojson = output_path / f"{clean_name}_buildings.geojson"
extract_heights_from_dsm(shapefile_path, dsm_path, buildings_geojson)

# Step 2: Enhance for visualization
enhanced_geojson = output_path / f"{clean_name}_buildings_enhanced.geojson"
create_enhanced_buildings(buildings_geojson, enhanced_geojson)

# Step 3: Convert to PMTiles
building_to_pmtiles(enhanced_geojson, pmtiles_dir / "building_footprints.pmtiles")

## 3D-Vegetation

def create_merged_canopy_clusters(vegetation_raster_path, output_geojson="canopy_merged_3d.geojson"):

    #Create merged canopy clusters where overlapping vegetation is combined into single polygons

    print("Creating merged 3D canopy clusters...")
    
    with rasterio.open(vegetation_raster_path) as src:
        # Read data and handle NoData properly
        vegetation_data = src.read(1)
        src_crs = src.crs
        src_nodata = src.nodata if src.nodata is not None else -9999.0
        
        print(f"Source CRS: {src_crs}")
        print(f"NoData value: {src_nodata}")
        print(f"Raw data range: {np.nanmin(vegetation_data):.1f} to {np.nanmax(vegetation_data):.1f}")
        
        # Create a proper mask for valid vegetation data
        valid_mask = vegetation_data != src_nodata
        vegetation_clean = np.where(valid_mask, vegetation_data, 0)
        
        print(f"Clean data range: {np.nanmin(vegetation_clean):.1f} to {np.nanmax(vegetation_clean):.1f}")
        print(f"Valid pixels: {np.sum(valid_mask)}")
        
        # Create unified vegetation mask (all vegetation above 1m)
        vegetation_mask = (vegetation_clean > 1) & valid_mask
        print(f"Total vegetation: {np.sum(vegetation_mask)} pixels")
        
        # Use morphological operations to create smoother shapes and connect nearby vegetation
        smoothed_mask = morphological_connect(vegetation_mask, radius=2)
        
        features = []
        vegetation_polygons = []
        
        print("Detecting vegetation polygons...")
        # Process all vegetation as one unified layer
        for geom, value in shapes(smoothed_mask.astype('uint8'), mask=smoothed_mask, transform=src.transform):
            if value == 1:
                poly = shape(geom)
                area_m2 = poly.area
                
                if area_m2 > 10:  # Minimum area threshold
                    # Simplify and smooth the polygon
                    smoothed_poly = smooth_polygon(poly, tolerance=1.0)
                    
                    if smoothed_poly.is_valid and smoothed_poly.area > 0:
                        vegetation_polygons.append(smoothed_poly)
                        # Store the original polygon for height sampling
        
        print(f"Found {len(vegetation_polygons)} vegetation polygons before merging")
        
        # Merge overlapping polygons
        print("Merging overlapping polygons...")
        if vegetation_polygons:
            merged_polygons = merge_overlapping_polygons(vegetation_polygons)
            print(f"After merging: {len(merged_polygons)} polygons")
        else:
            merged_polygons = []
        
        # Calculate height statistics for each merged polygon
        print("Calculating height statistics for merged polygons...")
        for i, merged_poly in enumerate(merged_polygons):
            # Convert to WGS84
            poly_wgs84 = convert_to_wgs84(merged_poly, src_crs)
            if poly_wgs84 is None:
                continue
            
            # Calculate comprehensive height statistics for the merged area
            height_stats = calculate_merged_height_stats(merged_poly, vegetation_clean, src)
            
            if height_stats['sample_count'] >= 5:
                # Determine vegetation type based on average height
                avg_height = height_stats['avg_height']
                if avg_height > 12:
                    canopy_type = "tall"
                    base_height = max(avg_height * 0.4, 4.0)
                elif avg_height > 5:
                    canopy_type = "medium"
                    base_height = max(avg_height * 0.5, 3.0)
                else:
                    canopy_type = "low" 
                    base_height = max(avg_height * 0.6, 2.0)
                
                depth = max(avg_height - base_height, 1.0)
                
                features.append({
                    'type': 'Feature',
                    'geometry': mapping(poly_wgs84),
                    'properties': {
                        'type': f'canopy_{canopy_type}',
                        'height': float(avg_height),
                        'base_height': float(base_height),
                        'depth': float(depth),
                        'area_m2': float(merged_poly.area),
                        'min_height': float(height_stats['min_height']),
                        'max_height': float(height_stats['max_height']),
                        'sample_count': height_stats['sample_count'],
                        'density': height_stats['density'],
                        'elevation_gap': float(base_height),
                        'is_merged': True,
                        'original_polygons': height_stats.get('component_count', 1)
                    }
                })
        
        print(f"Created {len(features)} merged canopy clusters")
        
        if len(features) == 0:
            print("⚠ Warning: No canopy features were created. Output file will be empty.")
        
        geojson_data = {
            'type': 'FeatureCollection', 
            'features': features
        }
        
        with open(output_geojson, 'w') as f:
            json.dump(geojson_data, f, indent=2)
        
        return output_geojson

def morphological_connect(mask, radius=2):

    #Connect nearby vegetation using morphological operations
   
    # Create circular structuring element
    y, x = np.ogrid[-radius:radius+1, -radius:radius+1]
    structure = (x*x + y*y) <= (radius*radius)
    
    # Use binary dilation to connect nearby areas
    connected = ndimage.binary_dilation(mask, structure=structure)
    
    # Then erosion to smooth
    connected = ndimage.binary_erosion(connected, structure=structure)
    
    return connected

def merge_overlapping_polygons(polygons, buffer_distance=1.0):

    #Merge overlapping and nearby polygons
    
    if not polygons:
        return []
    
    # Buffer polygons slightly to ensure they connect
    buffered_polygons = [poly.buffer(buffer_distance) for poly in polygons]
    
    # Merge all overlapping polygons
    merged_geometry = unary_union(buffered_polygons)
    
    # Handle case where result is a single polygon
    if merged_geometry.geom_type == 'Polygon':
        # Remove buffer to get back to original scale
        result_polygon = merged_geometry.buffer(-buffer_distance)
        if result_polygon.is_valid and result_polygon.area > 0:
            return [result_polygon]
        else:
            return polygons
    
    # Handle case where result is multiple polygons
    elif merged_geometry.geom_type == 'MultiPolygon':
        merged_polygons = []
        for poly in merged_geometry.geoms:
            # Remove buffer to get back to original scale
            final_poly = poly.buffer(-buffer_distance)
            if final_poly.is_valid and final_poly.area > 0:
                merged_polygons.append(final_poly)
        return merged_polygons
    
    else:
        return polygons

def calculate_merged_height_stats(merged_polygon, vegetation_data, src):
    
    #Calculate height statistics for merged polygon area

    bounds = merged_polygon.bounds
    minx, miny, maxx, maxy = bounds
    
    heights = []
    total_samples = 100  # Increased sampling for larger merged areas
    
    # Systematic sampling within the merged polygon
    sample_points = []
    x_step = (maxx - minx) / 20
    y_step = (maxy - miny) / 20
    
    # Create grid of sample points
    for i in range(21):
        for j in range(21):
            x = minx + i * x_step
            y = miny + j * y_step
            
            point = shape({'type': 'Point', 'coordinates': [x, y]})
            if merged_polygon.contains(point):
                sample_points.append((x, y))
    
    # Add random points for better coverage
    for _ in range(total_samples):
        x = random.uniform(minx, maxx)
        y = random.uniform(miny, maxy)
        
        point = shape({'type': 'Point', 'coordinates': [x, y]})
        if merged_polygon.contains(point):
            sample_points.append((x, y))
    
    # Sample heights
    valid_samples = 0
    for x, y in sample_points:
        col, row = ~src.transform * (x, y)
        row, col = int(row), int(col)
        
        if (0 <= row < vegetation_data.shape[0] and 
            0 <= col < vegetation_data.shape[1] and
            vegetation_data[row, col] > 1):  # Only vegetation above 1m
            heights.append(vegetation_data[row, col])
            valid_samples += 1
    
    if heights:
        return {
            'avg_height': np.mean(heights),
            'min_height': np.min(heights),
            'max_height': np.max(heights),
            'sample_count': len(heights),
            'density': len(heights) / len(sample_points) if sample_points else 0,
            'component_count': valid_samples // 10  # Estimate of original components
        }
    else:
        return {
            'avg_height': 0,
            'min_height': 0,
            'max_height': 0,
            'sample_count': 0,
            'density': 0,
            'component_count': 1
        }

def smooth_polygon(polygon, tolerance=1.0):
    #Smooth polygon edges to create more natural, rounded shapes
    # Simplify first
    simplified = polygon.simplify(tolerance, preserve_topology=True)
    
    # Gentle smoothing
    smoothed = simplified.buffer(2.0).buffer(-1.0)
    
    # Ensure we still have a valid polygon
    if smoothed.is_valid and smoothed.area > 0:
        return smoothed
    else:
        return simplified

def convert_to_wgs84(polygon, source_crs):
    """
    Convert a polygon from source_crs to WGS84 (EPSG:4326).
    """
    if source_crs == 'EPSG:4326':
        return polygon
    
    try:
        from pyproj import Transformer
        transformer = Transformer.from_crs(source_crs, 'EPSG:4326', always_xy=True)
        
        def transform_coords(x, y, z=None):
            lon, lat = transformer.transform(x, y)
            return (lon, lat)
        
        return shapely_transform(transform_coords, polygon)
    except Exception as e:
        print(f"Coordinate transformation failed: {e}")
        return None

def create_pmtiles_for_canopy(geojson_path, output_pmtiles):
    """Convert canopy GeoJSON to PMTiles with zoom levels suitable for vegetation."""
    cmd = [
        "tippecanoe",
        "-z", "18", "-Z", "10",
        "--extend-zooms-if-still-dropping",
        "-o", str(output_pmtiles), "-f",
        "-l", "canopy",
        "--simplification", "8",
        "--coalesce",
        "--coalesce-densest-as-needed",
        "--detect-shared-borders",
        "--buffer", "3",
        str(geojson_path)
    ]
    subprocess.run(cmd, check=True)
    print(f"✓ Created canopy PMTiles: {output_pmtiles}")

# Main vegetation processing
vegetation_raster = "output/CDSM.tif"
canopy_geojson = output_path / f"{clean_name}_canopy_merged_3d.geojson"

create_merged_canopy_clusters(vegetation_raster, canopy_geojson)
create_pmtiles_for_canopy(canopy_geojson, pmtiles_dir / "canopy_merged.pmtiles")

