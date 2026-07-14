import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const months = [
  { id: '01', day: '15', name: 'January' },
  { id: '02', day: '46', name: 'February' },
  { id: '03', day: '74', name: 'March' },
  { id: '04', day: '105', name: 'April' },
  { id: '05', day: '135', name: 'May' },
  { id: '06', day: '166', name: 'June' },
  { id: '07', day: '196', name: 'July' },
  { id: '08', day: '227', name: 'August' },
  { id: '09', day: '258', name: 'September' },
  { id: '10', day: '288', name: 'October' },
  { id: '11', day: '319', name: 'November' },
  { id: '12', day: '349', name: 'December' }
];

const times = [
  { display: '08', fileSuffix: '0800N' },
  { display: '09', fileSuffix: '0900N' },
  { display: '10', fileSuffix: '1000N' },
  { display: '11', fileSuffix: '1100D' },
  { display: '12', fileSuffix: '1200D' },
  { display: '13', fileSuffix: '1300D' },
  { display: '14', fileSuffix: '1400D' },
  { display: '15', fileSuffix: '1500D' },
  { display: '16', fileSuffix: '1600D' },
  { display: '17', fileSuffix: '1700D' },
  { display: '18', fileSuffix: '1800D' },
  { display: '19', fileSuffix: '1900D' },
  { display: '20', fileSuffix: '2000D' },
  { display: '21', fileSuffix: '2100D' },
  { display: '22', fileSuffix: '2200N' },
  { display: '00', fileSuffix: '0000N' } // night
]

function App() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Existing states
  const [showBuildings, setShowBuildings] = useState(true);
  const [showCanopy, setShowCanopy] = useState(true);
  const [showTemperature, setShowTemperature] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(months[0]);
  const [currentTime, setCurrentTime] = useState(times[0]);

  // New control hub states
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'time' | 'month'>('layers');

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
      tiles: [`http://localhost:3000/Tmrt_2014_${currentMonth.day}_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`],
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
      `http://localhost:3000/Tmrt_2014_${currentMonth.day}_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`
    ]);
    
    // Refresh the layer
    map.triggerRepaint();
  }
}, [currentMonth, currentTime]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Unified Control Hub */}
      <ControlHub
        isOpen={isControlsOpen}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={() => setIsControlsOpen(false)}
        // Layer props
        showBuildings={showBuildings}
        showCanopy={showCanopy}
        showTemperature={showTemperature}
        onToggleBuildings={toggleBuildings}
        onToggleCanopy={toggleCanopy}
        onToggleTemperature={toggleTemperature}
        onResetLayers={resetLayers}
        // Time/Month props
        currentMonth={currentMonth}
        currentTime={currentTime}
        onMonthChange={setCurrentMonth}
        onTimeChange={setCurrentTime}
      />
      
      {/* Floating Action Button */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => setIsControlsOpen(!isControlsOpen)}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: '2px solid white',
            backgroundColor: '#ccc',
            color: 'white',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

// Unified Control Hub Component
const ControlHub = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  // Layer props
  showBuildings,
  showCanopy,
  showTemperature,
  onToggleBuildings,
  onToggleCanopy,
  onToggleTemperature,
  onResetLayers,
  // Time/Month props
  currentMonth,
  currentTime,
  onMonthChange,
  onTimeChange
}: {
  isOpen: boolean;
  activeTab: 'layers' | 'time' | 'month';
  onTabChange: (tab: 'layers' | 'time' | 'month') => void;
  onClose: () => void;
  showBuildings: boolean;
  showCanopy: boolean;
  showTemperature: boolean;
  onToggleBuildings: () => void;
  onToggleCanopy: () => void;
  onToggleTemperature: () => void;
  onResetLayers: () => void;
  currentMonth: any;
  currentTime: any;
  onMonthChange: (month: any) => void;
  onTimeChange: (time: any) => void;
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999
        }}
      />
      
      {/* Control Panel */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90vw',
        maxWidth: '400px',
        maxHeight: '80vh',
        backgroundColor: '#2D3033',
        color: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'white' }}>
            Map Controls
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              color: 'white'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          backgroundColor: '#2d2d2d'
        }}>
          {(['layers', 'time', 'month'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                backgroundColor: activeTab === tab ? '2D3033' : 'transparent',
                color: 'white',
                fontWeight: activeTab === tab ? '600' : '400',
                fontSize: '14px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                borderBottom: activeTab === tab ? '2px solid #2196F3' : 'none'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: '20px',
          overflow: 'auto',
          backgroundColor: '#2D3033'
        }}>

          {/* Layers Tab */}
          {activeTab === 'layers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <ToggleSwitch
                label="Buildings"
                isOn={showBuildings}
                onToggle={onToggleBuildings}
                darkTheme={true}
              />
              <ToggleSwitch
                label="Canopy"
                isOn={showCanopy}
                onToggle={onToggleCanopy}
                darkTheme={true}
              />
              <ToggleSwitch
                label="Temperature"
                isOn={showTemperature}
                onToggle={onToggleTemperature}
                darkTheme={true}
              />
              
              <button
                onClick={onResetLayers}
                style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Reset All Layers
              </button>
            </div>
          )}

          {/* Time Tab */}
          {activeTab === 'time' && (
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'white' }}>
                Select Time
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px'
              }}>
                {times.map(time => (
                  <button
                    key={time.display}
                    onClick={() => onTimeChange(time)}
                    style={{
                      padding: '12px 8px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: currentTime.display === time.display ? '#2196F3' : '#4D5157',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      minHeight: '44px'
                    }}
                  >
                    {time.display}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Month Tab */}
          {activeTab === 'month' && (
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'white' }}>
                Select Month
              </h4>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {months.map(month => (
                  <button
                    key={month.id}
                    onClick={() => onMonthChange(month)}
                    style={{
                      padding: '12px 16px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: currentMonth.id === month.id ? '#2196F3' : '#4D5157',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textAlign: 'left',
                      minHeight: '44px'
                    }}
                  >
                    {month.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Toggle Switch Component
// Updated ToggleSwitch with dark theme support
const ToggleSwitch = ({ 
  label, 
  isOn, 
  onToggle,
  darkTheme = false
}: { 
  label: string; 
  isOn: boolean; 
  onToggle: () => void;
  darkTheme?: boolean;
}) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0'
  }}>
    <span style={{ 
      fontSize: '16px', 
      fontWeight: '500',
      color: darkTheme ? 'white' : 'black' 
    }}>
      {label}
    </span>
    <button
      onClick={onToggle}
      style={{
        width: '52px',
        height: '28px',
        borderRadius: '14px',
        border: 'none',
        backgroundColor: isOn ? '#4CAF50' : darkTheme ? '#555' : '#ccc',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease'
      }}
    >
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: 'white',
        position: 'absolute',
        top: '2px',
        left: isOn ? '26px' : '2px',
        transition: 'left 0.3s ease',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }} />
    </button>
  </div>
);

export default App;