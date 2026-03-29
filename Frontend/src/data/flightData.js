/**
 * SOLARIS — Simulated Flight Data
 * Realistic high-latitude flight routes for storm impact analysis
 */

const AIRCRAFT_TYPES = [
  { type: 'B777', name: 'Boeing 777-300ER', icon: '✈' },
  { type: 'A350', name: 'Airbus A350-900', icon: '✈' },
  { type: 'B787', name: 'Boeing 787-9', icon: '✈' },
  { type: 'A380', name: 'Airbus A380-800', icon: '✈' },
  { type: 'B747', name: 'Boeing 747-8', icon: '✈' },
  { type: 'A330', name: 'Airbus A330-900', icon: '✈' },
];

const AIRLINES = ['UAL', 'BAW', 'DLH', 'ANA', 'KAL', 'SAS', 'FIN', 'ICE', 'AAL', 'DAL', 'AFR', 'JAL', 'CPA', 'SIA', 'QFA'];

const ROUTES = [
  // North Atlantic
  { from: 'JFK', to: 'LHR', fromPos: [40.64, -73.78], toPos: [51.47, -0.46], maxLat: 58 },
  { from: 'ORD', to: 'FRA', fromPos: [41.98, -87.90], toPos: [50.03, 8.57], maxLat: 60 },
  { from: 'IAD', to: 'CDG', fromPos: [38.94, -77.46], toPos: [49.01, 2.55], maxLat: 56 },
  { from: 'BOS', to: 'DUB', fromPos: [42.37, -71.02], toPos: [53.42, -6.27], maxLat: 57 },
  { from: 'YYZ', to: 'AMS', fromPos: [43.68, -79.63], toPos: [52.31, 4.76], maxLat: 61 },

  // North Pacific (Polar routes)
  { from: 'SFO', to: 'NRT', fromPos: [37.62, -122.38], toPos: [35.76, 140.39], maxLat: 55 },
  { from: 'LAX', to: 'ICN', fromPos: [33.94, -118.41], toPos: [37.46, 126.44], maxLat: 58 },
  { from: 'SEA', to: 'PEK', fromPos: [47.45, -122.31], toPos: [40.08, 116.58], maxLat: 64 },
  { from: 'YVR', to: 'HND', fromPos: [49.19, -123.18], toPos: [35.55, 139.78], maxLat: 60 },

  // European polar
  { from: 'LHR', to: 'NRT', fromPos: [51.47, -0.46], toPos: [35.76, 140.39], maxLat: 70 },
  { from: 'HEL', to: 'NRT', fromPos: [60.32, 24.95], toPos: [35.76, 140.39], maxLat: 72 },
  { from: 'KEF', to: 'JFK', fromPos: [63.99, -22.62], toPos: [40.64, -73.78], maxLat: 64 },

  // Transpolar
  { from: 'DXB', to: 'SFO', fromPos: [25.25, 55.36], toPos: [37.62, -122.38], maxLat: 68 },
  { from: 'SIN', to: 'EWR', fromPos: [1.35, 103.99], toPos: [40.69, -74.17], maxLat: 66 },

  // Southern high lat
  { from: 'SCL', to: 'SYD', fromPos: [-33.39, -70.79], toPos: [-33.95, 151.17], maxLat: -60 },
  { from: 'EZE', to: 'AKL', fromPos: [-34.82, -58.54], toPos: [-37.01, 174.78], maxLat: -58 },
];

function generateFlights() {
  const flights = [];
  const numFlights = 16;

  for (let i = 0; i < numFlights; i++) {
    const route = ROUTES[i % ROUTES.length];
    const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
    const flightNum = Math.floor(Math.random() * 900) + 100;
    const aircraft = AIRCRAFT_TYPES[Math.floor(Math.random() * AIRCRAFT_TYPES.length)];
    const progress = Math.random(); // 0-1 journey progress
    const altitude = 33000 + Math.floor(Math.random() * 8000);
    const speed = 440 + Math.floor(Math.random() * 80);

    // Interpolate position with great circle approximation
    const lat = route.fromPos[0] + (route.toPos[0] - route.fromPos[0]) * progress;
    const lon = route.fromPos[1] + (route.toPos[1] - route.fromPos[1]) * progress;
    // Add latitude bulge for great circle
    const bulge = Math.sin(progress * Math.PI) * (Math.abs(route.maxLat) - Math.max(Math.abs(route.fromPos[0]), Math.abs(route.toPos[0])));
    const actualLat = lat + (route.maxLat > 0 ? bulge : -bulge);

    flights.push({
      id: `${airline}${flightNum}`,
      callsign: `${airline}${flightNum}`,
      aircraft,
      route: `${route.from} → ${route.to}`,
      from: route.from,
      to: route.to,
      lat: actualLat,
      lon: lon,
      altitude,
      speed,
      heading: Math.atan2(route.toPos[1] - route.fromPos[1], route.toPos[0] - route.fromPos[0]) * 180 / Math.PI,
      progress,
      maxRouteLat: route.maxLat,
      exposure: 'safe', // Will be updated by storm processor
    });
  }

  return flights;
}

let flights = generateFlights();
let lastUpdate = Date.now();

export function getFlights() {
  return flights;
}

export function updateFlights(kpValue) {
  const now = Date.now();
  const dt = (now - lastUpdate) / 1000;
  lastUpdate = now;

  const affectedLat = 90 - (kpValue * 7.5);

  flights = flights.map(f => {
    // Move flight along route
    let newProgress = f.progress + (dt * 0.002); // slow progression
    if (newProgress > 1) newProgress = 0; // loop

    const route = ROUTES.find(r => r.from === f.from && r.to === f.to) || ROUTES[0];
    const lat = route.fromPos[0] + (route.toPos[0] - route.fromPos[0]) * newProgress;
    const lon = route.fromPos[1] + (route.toPos[1] - route.fromPos[1]) * newProgress;
    const bulge = Math.sin(newProgress * Math.PI) * (Math.abs(route.maxLat) - Math.max(Math.abs(route.fromPos[0]), Math.abs(route.toPos[0])));
    const actualLat = lat + (route.maxLat > 0 ? bulge : -bulge);

    // Determine exposure
    let exposure = 'safe';
    if (Math.abs(actualLat) > affectedLat) {
      exposure = 'danger';
    } else if (Math.abs(actualLat) > affectedLat - 10) {
      exposure = 'elevated';
    }

    return {
      ...f,
      progress: newProgress,
      lat: actualLat,
      lon: lon,
      exposure,
    };
  });

  return flights;
}
