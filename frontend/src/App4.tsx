import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Access environment variable
const appTitle = import.meta.env.VITE_APP_TITLE || 'Stay Fresh';
const API_BASE = window.location.origin;

const months = [
  { id: '01', month: '01', name: 'January', short: 'Jan' },
  { id: '02', month: '02', name: 'February', short: 'Feb' },
  { id: '03', month: '03', name: 'March', short: 'Mar' },
  { id: '04', month: '04', name: 'April', short: 'Apr' },
  { id: '05', month: '05', name: 'May', short: 'May' },
  { id: '06', month: '06', name: 'June', short: 'Jun' },
  { id: '07', month: '07', name: 'July', short: 'Jul' },
  { id: '08', month: '08', name: 'August', short: 'Aug' },
  { id: '09', month: '09', name: 'September', short: 'Sep' },
  { id: '10', month: '10', name: 'October', short: 'Oct' },
  { id: '11', month: '11', name: 'November', short: 'Nov' },
  { id: '12', month: '12', name: 'December', short: 'Dec' }
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
  
  // States
  const [showBuildings, setShowBuildings] = useState(true);
  const [showCanopy, setShowCanopy] = useState(true);
  const [showTemperature, setShowTemperature] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(months[0]);
  const [currentTime, setCurrentTime] = useState(times[0]);
  const [showBenches, setShowBenches] = useState(true);
  const [showDrinkingWater, setShowDrinkingWater] = useState(true);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'time' | 'month' | 'info'>('layers');

  // Update layer visibility when states change
  useEffect(() => {
    document.title = appTitle;
  
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;

    const map = mapRef.current;
    
    // Set initial layer states based on React state
    if (map.getLayer('buildings')) {
      map.setLayoutProperty('buildings', 'visibility', showBuildings ? 'visible' : 'none');
    }
    if (map.getLayer('canopy')) {
      map.setLayoutProperty('canopy', 'visibility', showCanopy ? 'visible' : 'none');
    }
    if (map.getLayer('temperature-layer')) {
      map.setPaintProperty('temperature-layer', 'raster-opacity', showTemperature ? 0.5 : 0);
    }
    if (map.getLayer('benches')) {
      map.setLayoutProperty('benches', 'visibility', showBenches ? 'visible' : 'none');
    }
    if (map.getLayer('drinking-water')) {
      map.setLayoutProperty('drinking-water', 'visibility', showDrinkingWater ? 'visible' : 'none');
    }
  
  }, [showBuildings, showCanopy, showTemperature, showBenches, showDrinkingWater]);

  // Auto-detect current month and time on initial load
  useEffect(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMonthIndex = now.getMonth();
    
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

    // Create absolute sprite URL
    const spriteUrl = import.meta.env.VITE_MAP_SPRITE_PATH 
      ? import.meta.env.VITE_MAP_SPRITE_PATH.startsWith('http') 
        ? import.meta.env.VITE_MAP_SPRITE_PATH 
        : `${window.location.origin}${import.meta.env.VITE_MAP_SPRITE_PATH}`
      : `${window.location.origin}/sprites/sprite`;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // Use CartoDB basemap as background
        sources: {
          // CartoDB basemap
          'carto': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
              'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© CartoDB'
          },
          // Temperature raster with dynamic source
          'temperature-data': {
            type: 'raster',
            tiles: [`${API_BASE}/tiles/tmrt_2014${currentMonth.month}15_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`],
            tileSize: 256
          },
          // Fixed 3D buildings
          'fixed-buildings': {
            type: 'vector',
            tiles: [`${API_BASE}/tiles/building_footprints/{z}/{x}/{y}`],
            minzoom: 12,
            maxzoom: 16
          },
          // 3D Canopy
          'canopy-source': {
            type: 'vector',
            tiles: [`${API_BASE}/tiles/canopy_merged/{z}/{x}/{y}`],
            minzoom: 10,
            maxzoom: 18
          },
          // NEW: Benches source
          'benches-source': {
            type: 'vector',
            tiles: [`${API_BASE}/tiles/benches/{z}/{x}/{y}`],
            minzoom: 10,
            maxzoom: 18
          },
          // NEW: Drinking water source
          'drinking-water-source': {
            type: 'vector',
            tiles: [`${API_BASE}/tiles/water/{z}/{x}/{y}`],
            minzoom: 10,
            maxzoom: 18
          }
        },
        layers: [
          // Basemap layer (CartoDB)
          {
            id: 'carto-basemap',
            type: 'raster',
            source: 'carto',
            minzoom: 0,
            maxzoom: 22
          },
          // Temperature layer
          {
            id: 'temperature-layer',
            type: 'raster',
            source: 'temperature-data',
            paint: { 'raster-opacity': showTemperature ? 0.5 : 0 }
          },
          // Buildings layer
          {
            id: 'buildings',
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
              'fill-extrusion-opacity': 0.8 // Slightly transparent to see basemap
            }
          },
          // Canopy layer
          {
            id: 'canopy',
            type: 'fill-extrusion',
            source: 'canopy-source',
            'source-layer': 'canopy',
            minzoom: 10,
            maxzoom: 22,
            paint: {
              'fill-extrusion-color': [
                'match',
                ['get', 'type'],
                'canopy_tall', '#1a3a17',
                'canopy_medium', '#2d5a27',
                'canopy_low', '#3a7a32',
                'canopy_grid', '#4a9a42',
                '#3a7a32'
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['get', 'max_height'],
                1, 1,
                5, 5,
                10, 10,
                20, 20,
                30, 30
              ],
              'fill-extrusion-base': ['get', 'height'],
              'fill-extrusion-opacity': 0.3
            }
          },
          // NEW: Benches layer with sprite icons
          {
            id: 'benches',
            type: 'symbol',
            source: 'benches-source',
            'source-layer': 'benches',
            minzoom: 14,
            layout: {
              'icon-image': 'bench',
              'icon-size': 0.8,
              'icon-allow-overlap': false,
              'icon-ignore-placement': false,
              'icon-anchor': 'bottom'
            },
            paint: {
              'icon-opacity': 1
            }
          },
          // NEW: Drinking water layer with sprite icons
          {
            id: 'drinking-water',
            type: 'symbol',
            source: 'drinking-water-source',
            'source-layer': 'drinking_water',
            minzoom: 14,
            layout: {
              'icon-image': 'water',
              'icon-size': 0.8,
              'icon-allow-overlap': false,
              'icon-ignore-placement': false,
              'icon-anchor': 'bottom'
            },
            paint: {
              'icon-opacity': 1,
              'icon-color': '#3366CC'
            }
          }
        ],
        // Sprite path (absolute URL)
        sprite: spriteUrl,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
      },
      center: [8.381570816040039, 51.90882110595703],
      zoom: 16,
      pitch: 45,
      bearing: 0,

    });

    mapRef.current = map;

    map.on('load', () => {
      console.log('Map loaded with sprite:', map.getStyle().sprite);
      
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []); // Empty dependency array - map only created once

  // Toggle building layer visibility
  const toggleBuildings = () => {
    setShowBuildings(!showBuildings);
  };

  const toggleCanopy = () => {
    setShowCanopy(!showCanopy);
  };

  const toggleTemperature = () => {
    setShowTemperature(!showTemperature);
  };

  // NEW: Toggle functions for amenities
  const toggleBenches = () => {
    setShowBenches(!showBenches);
  };

  const toggleDrinkingWater = () => {
    setShowDrinkingWater(!showDrinkingWater);
  };

  // Reset all layers to visible
  const resetLayers = () => {
    setShowBuildings(true);
    setShowCanopy(true);
    setShowTemperature(true);
    setShowBenches(true);
    setShowDrinkingWater(true);
  };

  // Update temperature tiles when month or time changes
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    
    // Wait for map to be loaded
    if (!map.isStyleLoaded()) {
      map.once('load', () => updateTemperatureSource());
    } else {
      updateTemperatureSource();
    }

    function updateTemperatureSource() {
      const source = map.getSource('temperature-data') as maplibregl.RasterTileSource;
      
      if (source) {
        // Update the tile URLs
        source.setTiles([
          `${API_BASE}/tiles/tmrt_2014${currentMonth.month}15_${currentTime.fileSuffix}_turbo/{z}/{x}/{y}`
        ]);
        
        // Refresh the layer to show new tiles
        map.triggerRepaint();
      }
    }
  }, [currentMonth, currentTime]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Vertical Button Bar */}
      <VerticalButtonBar
        mapRef={mapRef}
        currentMonth={currentMonth}
        currentTime={currentTime}
        onLayerClick={() => {
          setIsControlsOpen(true);
          setActiveTab('layers');
        }}
        onTimeClick={() => {
          setIsControlsOpen(true);
          setActiveTab('time');
        }}
        onMonthClick={() => {
          setIsControlsOpen(true);
          setActiveTab('month');
        }}
        onInfoClick={() => {
          setIsControlsOpen(true);
          setActiveTab('info');
        }}
      />

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
        showBenches={showBenches}
        showDrinkingWater={showDrinkingWater}
        onToggleBuildings={toggleBuildings}
        onToggleCanopy={toggleCanopy}
        onToggleTemperature={toggleTemperature}
        onToggleBenches={toggleBenches}
        onToggleDrinkingWater={toggleDrinkingWater}
        onResetLayers={resetLayers}
        // Time/Month props
        currentMonth={currentMonth}
        currentTime={currentTime}
        onMonthChange={setCurrentMonth}
        onTimeChange={setCurrentTime}
      />
    </div>
  );
}

// Keep all your existing helper components (reorderedTimes, ControlHub, TimeButton, 
// VerticalButtonBar, LayerButton, MonthButton) exactly as they were - they don't need changes

const reorderedTimes = [
  times[4],  // 12:00 at top (noon)
  times[5],  // 13:00 at 1 o'clock
  times[6],  // 14:00 at 2 o'clock
  times[7],  // 15:00 at 3 o'clock
  times[8],  // 16:00 at 4 o'clock
  times[9],  // 17:00 at 5 o'clock
  times[10], // 18:00 at 6 o'clock
  times[11], // 19:00 at 7 o'clock
  times[12], // 20:00 at 8 o'clock
  times[13], // 21:00 at 9 o'clock
  times[14],
  times[15],
  times[1],
  times[2],
  times[3]
];

// Unified Control Hub Component (unchanged from your original)
const ControlHub = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  // Layer props
  showBuildings,
  showCanopy,
  showTemperature,
  showBenches,
  showDrinkingWater,
  onToggleBuildings,
  onToggleCanopy,
  onToggleTemperature,
  onToggleBenches,
  onToggleDrinkingWater,
  onResetLayers,
  // Time/Month props
  currentMonth,
  currentTime,
  onMonthChange,
  onTimeChange
}: {
  isOpen: boolean;
  activeTab: 'layers' | 'time' | 'month' | 'info';
  onTabChange: (tab: 'layers' | 'time' | 'month' | 'info') => void;
  onClose: () => void;
  showBuildings: boolean;
  showCanopy: boolean;
  showTemperature: boolean;
  showBenches: boolean;
  showDrinkingWater: boolean;
  onToggleBuildings: () => void;
  onToggleCanopy: () => void;
  onToggleTemperature: () => void;
  onToggleBenches: () => void;
  onToggleDrinkingWater: () => void;
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
        backgroundColor: 'rgba(45, 48, 51, 0.7)',
        backdropFilter: 'blur(10px)',
        color: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '4px 20px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#2196F3' }}>
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
          {(['layers', 'time', 'month', 'info'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                backgroundColor: activeTab === tab ? '#2D3033' : 'transparent',
                color: 'white',
                fontWeight: activeTab === tab ? '600' : '400',
                fontSize: '14px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                borderBottom: activeTab === tab ? '2px solid #2196F3' : 'none'
              }}
            >
              {tab === 'info' ? 'Info' : tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: '20px',
          overflow: 'auto',
          backgroundColor: 'transparent'
        }}>

          {/* Layers Tab - Icon Buttons */}
          {activeTab === 'layers' && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '20px',
                flexWrap: 'wrap',
              }}>
                {/* Buildings Button */}
                <LayerButton
                  icon="🏠"
                  label="Gebäude"
                  isActive={showBuildings}
                  onClick={onToggleBuildings}
                />
                
                {/* Canopy Button */}
                <LayerButton
                  icon="🌿"
                  label="Bewuchs"
                  isActive={showCanopy}
                  onClick={onToggleCanopy}
                />
                
                {/* Temperature Button */}
                <LayerButton
                  icon="🌡️"
                  label="Temperatur"
                  isActive={showTemperature}
                  onClick={onToggleTemperature}
                />
              </div>
              
              {/* NEW: Amenities row */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '20px',
                flexWrap: 'wrap',
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}>
                {/* Benches Button */}
                <LayerButton
                  icon="🪑"
                  label="Bänke"
                  isActive={showBenches}
                  onClick={onToggleBenches}
                />
                
                {/* Drinking Water Button */}
                <LayerButton
                  icon="💧"
                  label="Trinkwasser"
                  isActive={showDrinkingWater}
                  onClick={onToggleDrinkingWater}
                />
              </div>
              
              {/* Reset Button */}
              <button
                onClick={onResetLayers}
                style={{
                  marginTop: '24px',
                  padding: '12px 16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Alle Ebenen zurücksetzen
              </button>
            </div>
          )}

          {/* Time Tab - Circular Clock Layout */}
          {activeTab === 'time' && (
            <div style={{ textAlign: 'center' }}>
              
              {/* Circular Clock Container */}
              <div style={{
                position: 'relative',
                width: '180px',
                height: '280px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Current time in center - bigger circle */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 2
                }}>
                  <div style={{
                    width: '140px',
                    height: '140px',
                    borderRadius: '50%',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '50px',
                    fontWeight: '600',
                    boxShadow: '0 0 20px rgba(33, 150, 243, 0.8)'
                  }}>
                    <div>{currentTime.display}</div>
                    <div style={{ fontSize: '18px', opacity: 0.9 }}>Uhr</div>
                  </div>
                </div>

                {/* All 16 times in circular positions - corrected orientation */}
                {reorderedTimes.map((time, index) => (
                  <TimeButton
                    key={time.display}
                    time={time}
                    isActive={currentTime.display === time.display}
                    onClick={() => onTimeChange(time)}
                    position={index}
                    totalPositions={reorderedTimes.length}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Month Tab */}
          {activeTab === 'month' && (
            <div>
              {/* Circular month buttons in grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                justifyItems: 'center'
              }}>
                {months.map(month => (
                  <MonthButton
                    key={month.id}
                    month={month}
                    isActive={currentMonth.id === month.id}
                    onClick={() => onMonthChange(month)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div style={{ lineHeight: '1.6', fontSize: '14px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'white' }}>
                Über diese Karte
              </h4>
              
              <p style={{ marginBottom: '16px' }}>
                Diese Karte zeigt die räumliche Verteilung der Strahlungstemperatur (Tmrt) 
                für verschiedene Tageszeiten und Monate basierend auf Medianwerten der letzten 10 Jahre.
              </p>
              
              <h5 style={{ margin: '20px 0 8px 0', fontSize: '14px', color: '#ccc' }}>
                Datenquellen
              </h5>
              <ul style={{ paddingLeft: '20px', margin: '0 0 20px 0' }}>
                <li>Gebäudedaten: OpenStreetMap und OpenGeoDaten.NRW</li>
                <li>Bewuchs: Erstellt mit dem Digitalen Oberflächen Modell von OpenGeoDaten.NRW</li>
                <li>Temperaturdaten: Berechnete Medianwerte 2014-2024</li>
                <li>Bänke & Trinkwasser: OpenStreetMap</li>
              </ul>
              
              <h5 style={{ margin: '20px 0 8px 0', fontSize: '14px', color: '#ccc' }}>
                Bedienung
              </h5>
              <ul style={{ paddingLeft: '20px', margin: 0 }}>
                <li><strong>Ebenen</strong>: Gebäude, Bewuchs, Temperatur, Bänke und Trinkwasser ein-/ausblenden</li>
                <li><strong>Uhrzeit</strong>: Temperaturdaten für verschiedene Tageszeiten</li>
                <li><strong>Monat</strong>: Medianwerte für verschiedene Monate</li>
              </ul>

              {/* Optional: Add contact or project info */}
              <div style={{ 
                marginTop: '24px', 
                padding: '12px', 
                backgroundColor: '#2d2d2d', 
                borderRadius: '8px',
                fontSize: '12px',
                color: '#ccc'
              }}>
                <strong>Projekt:</strong> Thermal Comfort Visualization<br />
                <strong>Ersteller:</strong> Daniel Janstedt
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const TimeButton = ({ 
  time, 
  isActive, 
  onClick, 
  position,
  totalPositions = 16
}: { 
  time: any; 
  isActive: boolean; 
  onClick: () => void;
  position: number;
  totalPositions?: number;
}) => {
  // Calculate position on circle - corrected for proper clock orientation
  // Start from top (12 o'clock) and go clockwise
  const angle = (position / totalPositions) * 2 * Math.PI - Math.PI / 2;
  const radius = 130; // Distance from center
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  // Use moon symbol for night time (position 15)
  const displaySymbol = position === 11 ? '🌙' : time.display;

  return (
    <div style={{
      position: 'absolute',
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      transform: 'translate(-50%, -50%)',
      zIndex: 1
    }}>
      <button
        onClick={onClick}
        style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: isActive ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255, 255, 255, 0.1)',
          color: 'white',
          fontSize: position === 15 ? '20px' : '20px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isActive 
            ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : `
                0 4px 8px rgba(0, 0, 0, 0.4),
                0 2px 4px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `,
          border: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.05)',
          borderTop: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.1)',
          transform: isActive ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s ease',
          outline: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = 'translateY(-0.5px) scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
            e.currentTarget.style.boxShadow = isActive 
              ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 4px 8px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
          }
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(2px) scale(0.95)';
          e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'translateY(-0.5px) scale(1.05)';
          e.currentTarget.style.boxShadow = isActive 
            ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
        }}
        title={position === 15 ? 'Nacht' : `${time.display} Uhr`}
      >
        {displaySymbol}
      </button>
    </div>
  );
};

const VerticalButtonBar = ({
  mapRef,
  currentMonth,
  currentTime,
  onLayerClick,
  onTimeClick,
  onMonthClick,
  onInfoClick
}: {
  mapRef: React.RefObject<maplibregl.Map | null>;
  currentMonth: any;
  currentTime: any;
  onLayerClick: () => void;
  onTimeClick: () => void;
  onMonthClick: () => void;
  onInfoClick: () => void;
}) => {
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleCompass = () => {
    if (mapRef.current) {
      mapRef.current.resetNorthPitch();
    }
  };

  // Updated consistent button style
  const consistentButtonStyle: React.CSSProperties = {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    backgroundColor: 'rgba(77, 81, 87, 0.8)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: `
      0 4px 8px rgba(0, 0, 0, 0.4),
      0 2px 4px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1)
    `,
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  };

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      left: 'auto',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px'
    }}>
      {/* Main Control Oval */}
      <div style={{
        backgroundColor: 'rgba(45, 48, 51, 0.7)',
        borderRadius: '35px',
        padding: '8px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* Layers Button */}
        <button
          onClick={onLayerClick}
          style={consistentButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          title="Kartenebenen"
        >
          ☰
        </button>
        
        {/* Time Button */}
        <button
          onClick={onTimeClick}
          style={consistentButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          title="Uhrzeit"
        >
          {currentTime.display} Uhr
        </button>
        
        {/* Month Button */}
        <button
          onClick={onMonthClick}
          style={consistentButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          title="Monat"
        >
          {currentMonth.short}
        </button>
        
        {/* Info Button */}
        <button
          onClick={onInfoClick}
          style={consistentButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          title="Informationen"
        >
          ⓘ
        </button>
      </div>

      {/* Navigation Controls Oval */}
      <div style={{
        backgroundColor: 'rgba(45, 48, 51, 0.7)',
        borderRadius: '35px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* Combined Zoom Control */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(77, 81, 87, 0.8)',
          borderRadius: '35px',
          overflow: 'hidden',
          boxShadow: `
            0 4px 8px rgba(0, 0, 0, 0.4),
            0 2px 4px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            style={{
              width: '44px',
              height: '32px',
              backgroundColor: 'transparent',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              boxShadow: `
                0 4px 8px rgba(0, 0, 0, 0.4),
                0 2px 4px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `,
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-0.5px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
              e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(2px)';
              e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
            }}
            title="Vergrößern"
          >
            +
          </button>
          
          {/* Divider Line */}
          <div style={{
            height: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            margin: '0 8px'
          }} />
          
          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            style={{
              width: '44px',
              height: '32px',
              backgroundColor: 'transparent',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              boxShadow: `
                0 4px 8px rgba(0, 0, 0, 0.4),
                0 2px 4px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `,
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-0.5px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
              e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(2px)';
              e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
            }}
            title="Verkleinern"
          >
            −
          </button>
        </div>

        {/* Compass Button */}
        <button
          onClick={handleCompass}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#4D5157',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            marginTop: '6px',
            boxShadow: `
              0 4px 8px rgba(0, 0, 0, 0.4),
              0 2px 4px rgba(0, 0, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-0.5px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 0 rgba(0, 0, 0, 0.3), 0 6px 8px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.backgroundColor = 'rgba(77, 81, 87, 0.8)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
          }}
          title="Nordrichtung zurücksetzen"
        >
          N
        </button>
      </div>
    </div>
  );
};

const LayerButton = ({ 
  icon, 
  label, 
  isActive, 
  onClick 
}: { 
  icon: string; 
  label: string; 
  isActive: boolean; 
  onClick: () => void; 
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <button
        onClick={onClick}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: isActive ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255, 255, 255, 0.1)',
          color: isActive ? '#4FC3F7' : 'rgba(255, 255, 255, 0.5)',
          fontSize: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isActive 
            ? '0 0 12px rgba(79, 195, 247, 0.4), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : `
                0 4px 8px rgba(0, 0, 0, 0.4),
                0 2px 4px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `,
          border: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.05)',
          borderTop: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.1)',
          transform: isActive ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s ease',
          outline: 'none',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = 'translateY(-0.5px) scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
            e.currentTarget.style.boxShadow = isActive 
              ? '0 0 12px rgba(79, 195, 247, 0.4), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              : '0 4px 8px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          }
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(2px) scale(0.95)';
          e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'translateY(-0.5px) scale(1.05)';
          e.currentTarget.style.boxShadow = isActive 
            ? '0 0 12px rgba(79, 195, 247, 0.4), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
        }}
        title={isActive ? `${label} ausblenden` : `${label} einblenden`}
      >
        {icon}
      </button>
      <span style={{
        fontSize: '12px',
        color: isActive ? 'white' : 'rgba(255, 255, 255, 0.6)',
        fontWeight: isActive ? '600' : '400',
        textAlign: 'center'
      }}>
        {label}
      </span>
    </div>
  );
};

const MonthButton = ({ 
  month, 
  isActive, 
  onClick
}: { 
  month: any; 
  isActive: boolean; 
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: isActive ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        fontSize: '20px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isActive 
          ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
          : `
              0 4px 8px rgba(0, 0, 0, 0.4),
              0 2px 4px rgba(0, 0, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.1)
            `,
        border: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.05)',
        borderTop: isActive ? '2px solid #4FC3F7' : '1px solid rgba(255, 255, 255, 0.1)',
        transform: isActive ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.2s ease',
        outline: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = 'translateY(-0.5px) scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
          e.currentTarget.style.boxShadow = isActive 
            ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            : '0 4px 8px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
        }
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(2px) scale(0.95)';
        e.currentTarget.style.boxShadow = '0 2px 0 rgba(0, 0, 0, 0.3), 0 3px 4px rgba(0, 0, 0, 0.2)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = isActive ? 'scale(1.1)' : 'translateY(-0.5px) scale(1.05)';
        e.currentTarget.style.boxShadow = isActive 
          ? '0 0 12px rgba(33, 150, 243, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
          : '0 6px 12px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3)';
      }}
      title={month.name}
    >
      {month.short}
    </button>
  );
};

export default App;
