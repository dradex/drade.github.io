const STORAGE_KEY = 'savedBoxes';
const MAX_AREA_KM2 = 25;
const OVER_COLOR = '#dc2626';
const EARTH_RADIUS_KM = 6371.0088;

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 20],
  zoom: 2,
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

const drawBtn = document.getElementById('draw-btn');
const currentEl = document.getElementById('current');
const coordsEl = document.getElementById('coords');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const savedWrap = document.getElementById('saved-wrap');
const savedList = document.getElementById('saved');

let drawing = false;
let start = null;
let current = null; // [west, south, east, north]
let saved = load();

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch {}
}

function areaKm2([w, s, e, n]) {
  const rad = Math.PI / 180;
  return EARTH_RADIUS_KM ** 2 * (e - w) * rad * (Math.sin(n * rad) - Math.sin(s * rad));
}

const isOver = (bbox) => areaKm2(bbox) > MAX_AREA_KM2;

function toPolygon(bbox) {
  const [w, s, e, n] = bbox;
  return {
    type: 'Feature',
    properties: { over: isOver(bbox) },
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
  };
}

function bboxFrom(a, b) {
  return [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];
}

const fmt = (bbox) => bbox.map((v) => v.toFixed(5)).join(', ');
const fmtArea = (bbox) => {
  const a = areaKm2(bbox);
  return `${a.toLocaleString(undefined, { maximumFractionDigits: a < 100 ? 2 : 0 })} km²`;
};
const labelled = (bbox) => {
  const [w, s, e, n] = bbox;
  return `W ${w.toFixed(5)}  S ${s.toFixed(5)}\nE ${e.toFixed(5)}  N ${n.toFixed(5)}\nArea ${fmtArea(bbox)}`;
};

function addBoxLayers(id, color) {
  const paintColor = ['case', ['get', 'over'], OVER_COLOR, color];
  map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': paintColor, 'fill-opacity': 0.2 } });
  map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': paintColor, 'line-width': 2 } });
}

function render() {
  map.getSource('saved')?.setData({ type: 'FeatureCollection', features: saved.map(toPolygon) });
  map.getSource('current')?.setData({
    type: 'FeatureCollection',
    features: current ? [toPolygon(current)] : [],
  });

  // Visible while drawing too, so the live area shows as the box grows.
  currentEl.hidden = !current;
  saveBtn.disabled = drawing;
  deleteBtn.disabled = drawing;
  if (current) {
    coordsEl.textContent = labelled(current);
    coordsEl.classList.toggle('over', isOver(current));
  }

  savedWrap.hidden = saved.length === 0;
  savedList.replaceChildren(...saved.map((bbox, i) => {
    const li = document.createElement('li');
    const c = document.createElement('div');
    c.className = 'coords' + (isOver(bbox) ? ' over' : '');
    c.textContent = labelled(bbox);
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard?.writeText(`[${fmt(bbox)}]`);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Remove';
    del.onclick = () => { saved.splice(i, 1); persist(); render(); };
    li.append(c, copy, del);
    return li;
  }));
}

function setDrawing(on) {
  drawing = on;
  drawBtn.classList.toggle('active', on);
  drawBtn.textContent = on ? 'Drag on map… (click to cancel)' : 'Draw box';
  map.getCanvas().classList.toggle('drawing', on);
  if (on) { map.dragPan.disable(); current = null; }
  else map.dragPan.enable();
  render();
}

drawBtn.onclick = () => setDrawing(!drawing);

deleteBtn.onclick = () => { current = null; render(); };
saveBtn.onclick = () => {
  if (!current) return;
  saved.push(current);
  persist();
  navigator.clipboard?.writeText(`[${fmt(current)}]`);
  current = null;
  render();
};

function onDown(e) {
  if (!drawing) return;
  start = e.lngLat;
  current = bboxFrom(start, start);
  render();
}
function onMove(e) {
  if (!drawing || !start) return;
  current = bboxFrom(start, e.lngLat);
  render();
}
function onUp() {
  if (!drawing || !start) return;
  const [w, s, e, n] = current;
  start = null;
  current = (w === e || s === n) ? null : current;
  setDrawing(false);
}

map.on('load', () => {
  addBoxLayers('saved', '#16a34a');
  addBoxLayers('current', '#2563eb');
  render();
});
map.on('mousedown', onDown);
map.on('mousemove', onMove);
map.on('mouseup', onUp);
map.on('touchstart', onDown);
map.on('touchmove', onMove);
map.on('touchend', onUp);
