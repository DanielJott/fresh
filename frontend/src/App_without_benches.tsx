import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const months = [
  { id: '01', month: '01', name: 'January' },
  { id: '02', month: '02', name: 'February' },
  { id: '03', month: '03', name: 'March' },
  { id: '04', month: '04', name: 'April' },
  { id: '05', month: '05', name: 'May' },
  { id: '06', month: '06', name: 'June' },
  { id: '07', month: '07', name: 'July' },
  { id: '08', month: '08', name: 'August' },
  { id: '09', month: '09', name: 'September' },
  { id: '10', month: '10', name: 'October' },
  { id: '11', month: '11', name: 'November' },
  { id: '12', month: '12', name: 'December' }
];

const times = [
  { display: '08', fileSuffix: '0800' },
  { display: '09', fileSuffix: '0900' },
  { display: '10', fileSuffix: '1000' },
  { display: '11', fileSuffix: '1100' },
  { display: '12', fileSuffix: '1200' },
  { display: '13', fileSuffix: '1300' },
  { display: '14', fileSuffix: '1400' },
  { display: '15', fileSuffix: '1500' },
  { display: '16', fileSuffix: '1600' },
  { display: '17', fileSuffix: '1700' },
  { display: '18', fileSuffix: '1800' },
  { display: '19', fileSuffix: '1900' },
  { display: '20', fileSuffix: '2000' },
  { display: '21', fileSuffix: '2100' },
  { display: '22', fileSuffix: '2200' },
  { display: '00', fileSuffix: '0000' } // night
]

function App() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Existing states
  const [showBuildings, setShowBuildings] = useState(true);
  const [showCanopy, setShowCanopy] = useState(true);
  const [showTemperature, setShowTemperature] = useState(true);
  
  // New states for time/month selection
  const [currentMonth, setCurrentMonth] = useState(months[0]);
  const [currentTime, setCurrentTime] = useState(times[0]);

  // Auto-detect current month and time on initial load
  useEffect(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMonthIndex = now.getMonth(); // 0-11
    
    // Set current month
    setCurrentMonth(months[currentMonthIndex]);
    
    // Set current time - if between 8-21 use corresponding time, else night
    if (currentHour >= 8 && currentHour <= 21) {
      const timeIndex = currentHour - 8;
      setCurrentTime(times[timeIndex]);
    } else {
      // Night time
      setCurrentTime(times[15]); // '00' - night
    }
  }, []);

useEffect(() => {
  if (!containerRef.current) return;

  const map = new maplibregl.Map({
    container: containerRef.current,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [8.381570816040039, 51.90882110595703],
    zoom: 16,
    pitch: 45,
    bearing: 0
  });

  mapRef.current = map;

  map.on('load', () => {
    // Temperature raster with dynamic source
    map.addSource('temperature-data', {
      type: 'raster',
      tiles: [`http://localhost:3000/tmrt_2014${currentMonth.month}15_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`],
      tileSize: 256
    });

    map.addLayer({
      id: 'temperature-layer',
      type: 'raster',
      source: 'temperature-data',
      paint: { 'raster-opacity': showTemperature ? 0.5 : 0 }
    });


      // Fixed 3D buildings with proper elevations
      map.addSource('fixed-buildings', {
        type: 'vector',
        tiles: ['http://localhost:3000/building_footprints/{z}/{x}/{y}'],
        minzoom: 12,
        maxzoom: 16
      });

      map.addLayer({
        id: '3d-buildings-fixed',
        type: 'fill-extrusion',
        source: 'fixed-buildings',
        'source-layer': 'buildings',
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['get', 'height'],
            0, '#e0e0e0',
            10, '#c8c8c8',
            20, '#b0b0b0', 
            30, '#989898',
            50, '#808080'
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 1
        }
      });

      // 3D Canopy visualization
      map.addSource('canopy', {
        type: 'vector',
        tiles: ['http://localhost:3000/canopy_merged/{z}/{x}/{y}'],
        minzoom: 10,
        maxzoom: 18
      });

      // 3D Canopy extrusion layer - main visualization
      map.addLayer({
        id: '3d-canopy',
        type: 'fill-extrusion',
        source: 'canopy',
        'source-layer': 'canopy',
        minzoom: 10,
        maxzoom: 22,
        paint: {
          'fill-extrusion-color': [
            'match',
            ['get', 'type'],
            'canopy_tall', '#1a3a17',    // Dark green for tall trees
            'canopy_medium', '#2d5a27',  // Medium green for medium trees
            'canopy_low', '#3a7a32',     // Lighter green for low vegetation
            'canopy_grid', '#4a9a42',    // Light green for grid-based
            '#3a7a32'                    // Default green
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['get', 'height'],
            1, 1,
            5, 5,
            10, 10,
            20, 20,
            30, 30
          ],
          'fill-extrusion-base': ['get', 'base_height'],
          'fill-extrusion-opacity': 0.4
        }
      });

      // Add zoom controls for better navigation
      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      // Add scale control
      map.addControl(new maplibregl.ScaleControl({
        maxWidth: 100,
        unit: 'metric'
      }), 'bottom-right');

    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [currentMonth, currentTime]);

  // Toggle building layer visibility
  const toggleBuildings = () => {
    if (mapRef.current) {
      const map = mapRef.current;
      const visibility = map.getLayoutProperty('3d-buildings-fixed', 'visibility');
      
      if (visibility === 'visible') {
        map.setLayoutProperty('3d-buildings-fixed', 'visibility', 'none');
        setShowBuildings(false);
      } else {
        map.setLayoutProperty('3d-buildings-fixed', 'visibility', 'visible');
        setShowBuildings(true);
      }
    }
  };

  // Toggle canopy layer visibility
  const toggleCanopy = () => {
    if (mapRef.current) {
      const map = mapRef.current;
      const visibility = map.getLayoutProperty('3d-canopy', 'visibility');
      
      if (visibility === 'visible') {
        map.setLayoutProperty('3d-canopy', 'visibility', 'none');
        setShowCanopy(false);
      } else {
        map.setLayoutProperty('3d-canopy', 'visibility', 'visible');
        setShowCanopy(true);
      }
    }
  };

  // Toggle temperature layer visibility
  const toggleTemperature = () => {
    if (mapRef.current) {
      const map = mapRef.current;
      const currentOpacity = map.getPaintProperty('temperature-layer', 'raster-opacity');
      
      if (currentOpacity === 0) {
        map.setPaintProperty('temperature-layer', 'raster-opacity', 0.5);
        setShowTemperature(true);
      } else {
        map.setPaintProperty('temperature-layer', 'raster-opacity', 0);
        setShowTemperature(false);
      }
    }
  };

  // Reset all layers to visible
  const resetLayers = () => {
    if (mapRef.current) {
      const map = mapRef.current;
      
      map.setLayoutProperty('3d-buildings-fixed', 'visibility', 'visible');
      map.setLayoutProperty('3d-canopy', 'visibility', 'visible');
      map.setPaintProperty('temperature-layer', 'raster-opacity', 0.5);
      
      setShowBuildings(true);
      setShowCanopy(true);
      setShowTemperature(true);
    }
  };

  // Update temperature tiles when month or time changes
useEffect(() => {
  if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

  const map = mapRef.current;
  const source = map.getSource('temperature-data') as maplibregl.RasterTileSource;

  if (source) {
    // Update the tile URLs
    source.setTiles([
      `http://localhost:3000/tmrt_2014${currentMonth.month}15_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`
    ]);
    
    // Refresh the layer
    map.triggerRepaint();
  }
}, [currentMonth, currentTime]);

// Time selection buttons component
const TimeSelector = () => (
  <div style={{
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'grey',
    padding: '10px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    display: 'flex',
    gap: '5px',
    flexWrap: 'wrap',
    maxWidth: '90vw',
    justifyContent: 'center'
  }}>
    {times.map(time => (
      <button
        key={time.display}
        onClick={() => setCurrentTime(time)}
        style={{
          backgroundColor: currentTime.display === time.display ? '#2196F3' : '#f0f0f0',
          color: currentTime.display === time.display ? 'white' : 'black',
          border: '1px solid #ccc',
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer',
          minWidth: '40px'
        }}
      >
        {time.display}
      </button>
    ))}
  </div>
);

// Month selection dropdown component
const MonthSelector = () => (
  <div style={{
    position: 'absolute',
    bottom: '20px',
    left: '10%',
    border: 'grey',
    backgroundColor: 'grey',
    padding: '8px',
    borderRadius: '8px',
    zIndex: 1000
  }}>
    <select 
      value={currentMonth.id}
      onChange={(e) => {
        const month = months.find(m => m.id === e.target.value);
        if (month) setCurrentMonth(month);
      }}
      style={{
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: '#f0f0f0',
        color: 'black',
        border: 'grey',
        fontSize: '12px'
      }}
    >
      {months.map(month => (
        <option key={month.id} value={month.id}>
          {month.name}
        </option>
      ))}
    </select>
  </div>
);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Layer Control Buttons */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        backgroundColor: 'grey',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        zIndex: 1000,
        minWidth: '125px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Layer Controls</h3>
        
        {/* Buildings Toggle */}
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px' }}>Buildings</span>
          <button 
            onClick={toggleBuildings}
            style={{
              backgroundColor: showBuildings ? '#4CAF50' : '#f44336',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            {showBuildings ? 'ON' : 'OFF'}
          </button>
        </div>
        
        {/* Canopy Toggle */}
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px' }}>Canopy</span>
          <button 
            onClick={toggleCanopy}
            style={{
              backgroundColor: showCanopy ? '#4CAF50' : '#f44336',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            {showCanopy ? 'ON' : 'OFF'}
          </button>
        </div>
        
        {/* Temperature Toggle */}
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px' }}>Temperature</span>
          <button 
            onClick={toggleTemperature}
            style={{
              backgroundColor: showTemperature ? '#4CAF50' : '#f44336',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            {showTemperature ? 'ON' : 'OFF'}
          </button>
        </div>
        
        {/* Reset Button */}
        <button 
          onClick={resetLayers}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '10px',
            cursor: 'pointer',
            width: '100%',
            marginTop: '5px'
          }}
        >
          Reset All
        </button>
      </div>

      {/* New selectors */}
      <MonthSelector />
      <TimeSelector />
    </div>
  );

}

export default App;
