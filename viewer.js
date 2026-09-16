/* Offline SVG viewer. No network, framework, or external font dependency. */
'use strict';

const NS = 'http://www.w3.org/2000/svg';
const $ = (selector) => document.querySelector(selector);
const drawings = window.DRAWINGS;
const stage = $('#stage');
const state = {
  drawing: null, svg: null, tool: 'pan', unit: 'mm', view: null, fitted: null,
  start: null, hover: null, measures: [], drag: null, room: null,
  layers: { dimensions: true, walls: true, openings: true, fixtures: true, labels: true, rooms: true },
  pointers: new Map(), pinch: null,
};
let toastTimer;

function formatLength(value, exact = false) {
  const mm = exact ? value : Math.round(value);
  let text;
  if (state.unit === 'm') text = `${(mm / 1000).toFixed(3)} m`;
  else if (state.unit === 'ft') {
    const eighths = Math.round(mm / 25.4 * 8);
    const feet = Math.floor(eighths / 96);
    const inches = (eighths % 96) / 8;
    text = `${feet}′ ${Number(inches.toFixed(3))}″`;
  } else text = `${mm.toLocaleString('en-GB', { maximumFractionDigits: 0 })} mm`;
  return `${exact ? '' : '≈ '}${text}`;
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function svgElement(tag, attributes = {}, text = '') {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function buildNavigation() {
  const groups = [['plan', 'Floor plans'], ['elevation', 'Elevations'], ['section', 'Section']];
  for (const [kind, label] of groups) {
    const heading = document.createElement('div');
    heading.className = 'nav-group-label';
    heading.textContent = label;
    $('#drawing-nav').append(heading);
    for (const drawing of drawings.filter((item) => item.kind === kind)) {
      const number = String(drawings.indexOf(drawing) + 1).padStart(2, '0');
      const button = document.createElement('button');
      button.className = 'nav-item';
      button.dataset.drawing = drawing.id;
      const name = drawing.title.replace('Elevation ', '').replace(' · ', ' / ');
      button.innerHTML = `<span class="nav-code">${number}</span><span>${name}</span>`;
      button.addEventListener('click', () => { location.hash = drawing.id; });
      $('#drawing-nav').append(button);
    }
  }
}

function openDrawing(id) {
  const drawing = drawings.find((item) => item.id === id) || drawings[0];
  if (state.drawing?.id === drawing.id) return;
  state.drawing = drawing;
  state.measures = [];
  state.start = null;
  state.hover = null;
  state.room = null;
  state.drag = null;
  state.pointers.clear();
  state.pinch = null;
  stage.innerHTML = drawing.svg;
  state.svg = stage.querySelector('svg');
  state.svg.removeAttribute('width');
  state.svg.removeAttribute('height');
  state.svg.setAttribute('role', 'group');
  state.svg.append(svgElement('g', { id: 'ruler-layer', 'pointer-events': 'none' }));
  if (drawing.sourceImage) {
    const overlay = svgElement('image', { id: 'source-overlay', ...drawing.sourceImage, opacity: 0, 'pointer-events': 'none', preserveAspectRatio: 'none' });
    overlay.setAttribute('href', window.SOURCE_IMAGES?.[drawing.page] || `assets/source-${drawing.page}.jpg`);
    state.svg.insertBefore(overlay, state.svg.querySelector('#ruler-layer'));
  }
  $('#overlay-toggle').checked = false;
  $('#overlay-controls').hidden = true;
  for (const button of document.querySelectorAll('.nav-item')) {
    const active = button.dataset.drawing === drawing.id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('#view-title').textContent = drawing.title;
  $('#view-summary').textContent = drawing.summary;
  const category = { plan: 'FLOOR PLANS', elevation: 'ELEVATIONS', section: 'SECTION' }[drawing.kind];
  $('#view-category').textContent = `${category} / ${String(drawings.indexOf(drawing) + 1).padStart(2, '0')}`;
  $('#sheet-chip').textContent = `SHEET ${String(drawing.page).padStart(2, '0')}`;
  $('#drawing-facts').replaceChildren();
  for (const [label, value] of drawing.facts) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    row.append(term, definition);
    $('#drawing-facts').append(row);
  }
  $('#selection-details').hidden = true;
  $('#inspector').scrollTop = 0;
  $('.main').classList.remove('details-open');
  $('#inspector').hidden = true;
  $('#details-button').setAttribute('aria-expanded', 'false');
  $('#source-page').value = drawing.page;
  renderAudit();
  updateSource();
  applyLayers();
  fitDrawing();
  renderMeasures();
  updateHint();
  document.title = `9 Glenn · ${drawing.title}`;
}

function fitDrawing() {
  if (!state.svg) return;
  const [x, y, width, height] = state.drawing.bounds;
  const viewport = stage.getBoundingClientRect();
  if (!viewport.width || !viewport.height) return;
  const aspect = viewport.width / viewport.height;
  const fitWidth = Math.max(width * 1.05, height * 1.13 * aspect);
  const fitHeight = fitWidth / aspect;
  state.fitted = [x + width / 2 - fitWidth / 2, y + height / 2 - fitHeight / 2, fitWidth, fitHeight];
  state.view = [...state.fitted];
  applyView();
}

function applyView() {
  state.svg.setAttribute('viewBox', state.view.join(' '));
  syncReferenceView();
  $('#zoom-level').textContent = `${Math.round(state.fitted[2] / state.view[2] * 100)}%`;
  renderRulers();
}

function toDrawingPoint(clientX, clientY) {
  const point = new DOMPoint(clientX, clientY);
  const matrix = state.svg.getScreenCTM();
  if (!matrix) return [0, 0];
  const converted = point.matrixTransform(matrix.inverse());
  return [converted.x, converted.y];
}

function unitsPerPixel() {
  return state.view[2] / Math.max(1, stage.getBoundingClientRect().width);
}

function dimensionPairs(dimension) {
  const result = [[dimension.a, dimension.b]];
  if (dimension.lineA && dimension.lineB) result.push([dimension.lineA, dimension.lineB]);
  return result;
}

function candidatePoint(event) {
  let point = toDrawingPoint(event.clientX, event.clientY);
  let snapped = false;
  const lockAxis = event.shiftKey && state.start;
  if (lockAxis) {
    const [x, y] = state.start;
    if (Math.abs(point[0] - x) > Math.abs(point[1] - y)) point[1] = y;
    else point[0] = x;
  }
  if ($('#snap').checked) {
    let minimum = 12 * unitsPerPixel();
    const unsnapped = [...point];
    const points = [...state.drawing.snaps];
    for (const check of state.drawing.checks || []) points.push(check.a, check.b);
    for (const dimension of state.drawing.dimensions) {
      for (const pair of dimensionPairs(dimension)) points.push(...pair);
    }
    for (const candidate of points) {
      if (lockAxis && candidate[0] !== point[0] && candidate[1] !== point[1]) continue;
      const distance = Math.hypot(candidate[0] - unsnapped[0], candidate[1] - unsnapped[1]);
      if (distance < minimum) {
        minimum = distance;
        point = [...candidate];
        snapped = true;
      }
    }
  }
  return { point, snapped };
}

function zoom(factor, clientX, clientY) {
  const viewport = stage.getBoundingClientRect();
  const anchor = toDrawingPoint(clientX ?? viewport.left + viewport.width / 2, clientY ?? viewport.top + viewport.height / 2);
  const currentZoom = state.fitted[2] / state.view[2];
  const nextZoom = Math.min(15, Math.max(0.35, currentZoom * factor));
  factor = nextZoom / currentZoom;
  const [x, y, width, height] = state.view;
  state.view = [anchor[0] - (anchor[0] - x) / factor, anchor[1] - (anchor[1] - y) / factor, width / factor, height / factor];
  applyView();
}

function setTool(tool) {
  state.tool = tool;
  if (tool === 'measure') {
    $('#inspector').hidden = false;
    $('.main').classList.add('details-open');
    $('#details-button').setAttribute('aria-expanded', 'true');
  }
  state.start = null;
  state.hover = null;
  stage.classList.toggle('measuring', tool === 'measure');
  for (const name of ['pan', 'measure']) {
    $(`#${name}-button`).classList.toggle('active', name === tool);
    $(`#${name}-button`).setAttribute('aria-pressed', String(name === tool));
  }
  updateHint();
  renderRulers();
}

function updateHint() {
  let hint = 'Click a room or dimension · drag to pan · scroll to zoom';
  if (state.tool === 'measure') hint = state.start ? 'Choose end point · Shift constrains axis · Esc cancels' : 'Choose start point · drag to pan · scroll to zoom';
  $('#tool-hint').textContent = hint;
  $('#clear-active').hidden = !state.start;
}

function applyLayers() {
  for (const [layer, visible] of Object.entries(state.layers)) {
    const group = state.svg.querySelector(`[data-layer="${layer}"]`);
    if (group) group.style.display = visible ? '' : 'none';
    if (layer === 'dimensions') {
      const targets = state.svg.querySelector('[data-layer="printed-targets"]');
      if (targets) targets.style.display = visible ? '' : 'none';
    }
  }
}

function selectRoom(id) {
  const room = state.drawing.rooms.find((item) => item.id === id);
  if (!room) return;
  state.room = room;
  for (const element of state.svg.querySelectorAll('.room')) element.classList.toggle('selected', element.dataset.room === id);
  const panel = $('#selection-details');
  panel.replaceChildren();
  const category = document.createElement('div');
  category.className = 'eyebrow';
  category.textContent = 'SELECTED SPACE';
  const title = document.createElement('h2');
  title.textContent = room.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  panel.append(category, title);
  if (room.dimensions) {
    const value = document.createElement('div');
    value.className = 'dimension-value';
    const parts = room.dimensions.filter((part) => part !== null).map((part) => formatLength(part, true));
    value.textContent = parts.join(' × ');
    const caption = document.createElement('div');
    caption.className = 'dimension-caption';
    caption.textContent = `Model / source dimensions · sheet ${state.drawing.page}`;
    panel.append(value, caption);
  }
  const note = document.createElement('p');
  note.textContent = room.note;
  panel.append(note);
  panel.hidden = false;
  $('#inspector').hidden = false;
  $('#inspector').scrollTop = 0;
  $('.main').classList.add('details-open');
  $('#details-button').setAttribute('aria-expanded', 'true');
}

function printedMatch(a, b) {
  function same(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5; }
  const dimension = state.drawing.dimensions.find((dimension) => dimension.provenance === 'printed' &&
    dimensionPairs(dimension).some(([p, q]) => (same(a, p) && same(b, q)) || (same(a, q) && same(b, p))));
  if (dimension) return dimension;
  const check = (state.drawing.checks || []).find(check =>
    (same(a, check.a) && same(b, check.b)) || (same(a, check.b) && same(b, check.a)));
  return check && { value: check.actual, label: check.name };
}

function addMeasurement(point) {
  if (!state.start) state.start = point;
  else {
    const length = Math.hypot(point[0] - state.start[0], point[1] - state.start[1]);
    if (length < 1) return;
    const match = printedMatch(state.start, point);
    state.measures.push({ a: state.start, b: point, length, exact: Boolean(match), label: match?.label });
    state.start = null;
    renderMeasures();
  }
  updateHint();
  renderRulers();
}

function selectDimension(index) {
  const dimension = state.drawing.dimensions[Number(index)];
  if (!dimension) return;
  state.measures.push({ a: dimension.lineA, b: dimension.lineB, length: dimension.value, exact: dimension.provenance === 'printed', label: dimension.label });
  renderMeasures();
  renderRulers();
  $('#inspector').hidden = false;
  $('.main').classList.add('details-open');
  $('#details-button').setAttribute('aria-expanded', 'true');
  $('.measurements-panel').scrollIntoView({ block: 'nearest' });
}

function renderMeasures() {
  const list = $('#measurement-list');
  list.replaceChildren();
  $('#clear-measurements').hidden = !state.measures.length;
  if (!state.measures.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-measurements';
    empty.innerHTML = 'Select <strong>Measure</strong>, then choose two points on the drawing.';
    list.append(empty);
  }
  state.measures.forEach((measurement, index) => {
    const row = document.createElement('div');
    row.className = 'measurement-row';
    const header = document.createElement('div');
    header.className = 'measurement-row-header';
    const value = document.createElement('span');
    value.textContent = formatLength(measurement.length, measurement.exact);
    const remove = document.createElement('button');
    remove.className = 'tool';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove measurement ${index + 1}`);
    remove.addEventListener('click', () => { state.measures.splice(index, 1); renderMeasures(); renderRulers(); });
    header.append(value, remove);
    const note = document.createElement('small');
    note.textContent = measurement.exact ? `Dimensioned model span · sheet ${state.drawing.page}` : `M${index + 1} · model distance, rounded to 1 mm`;
    row.append(header, note);
    list.append(row);
  });
}

function renderRulers() {
  if (!state.svg) return;
  const group = state.svg.querySelector('#ruler-layer');
  group.replaceChildren();
  const pixel = unitsPerPixel();
  function draw(a, b, label, provisional = false) {
    group.append(svgElement('line', { class: 'ruler-line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-dasharray': provisional ? `${pixel * 4} ${pixel * 4}` : 'none' }));
    for (const p of [a, b]) group.append(svgElement('circle', { class: 'ruler-dot', cx: p[0], cy: p[1], r: 4 * pixel }));
    group.append(svgElement('text', { class: 'ruler-label', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 13 * pixel, 'font-size': 13 * pixel, 'stroke-width': 5 * pixel }, label));
  }
  state.measures.forEach((measurement, index) => draw(measurement.a, measurement.b, `M${index + 1} · ${formatLength(measurement.length, measurement.exact)}`));
  if (state.start) {
    if (state.hover) {
      const end = state.hover.point;
      const match = printedMatch(state.start, end);
      draw(state.start, end, formatLength(match ? match.value : Math.hypot(end[0] - state.start[0], end[1] - state.start[1]), Boolean(match)), true);
    } else group.append(svgElement('circle', { class: 'ruler-dot', cx: state.start[0], cy: state.start[1], r: 4 * pixel }));
  }
  if (state.hover?.snapped && state.tool === 'measure') group.append(svgElement('circle', { class: 'snap-dot', cx: state.hover.point[0], cy: state.hover.point[1], r: 6 * pixel }));
}

function updateSource() {
  const page = $('#source-page').value;
  $('#source-image').src = window.SOURCE_IMAGES?.[page] || `assets/source-${page}.jpg`;
  $('#source-image').alt = `Original scanned source sheet ${page}: ${$('#source-page').selectedOptions[0].textContent}`;
  $('#source-image').classList.remove('enlarged');
  $('#source-image').style.width = '';
  const linked = Number(page) === state.drawing.page;
  $('#source-image').hidden = linked;
  $('#source-viewport').toggleAttribute('hidden', !linked);
  $('.reference-caption').textContent = linked
    ? 'Linked zoom and pan · drag either pane · double-click PDF to fit both'
    : 'Source sheet without a matching vector view · click image to enlarge';
  if (linked) {
    const image = $('#source-calibrated');
    for (const [key, value] of Object.entries(state.drawing.sourceImage)) image.setAttribute(key, value);
    image.setAttribute('href', $('#source-image').src);
    syncReferenceView();
  }
}

function syncReferenceView() {
  if (!state.view || $('#reference-pane').hidden || $('#source-viewport').hasAttribute('hidden')) return;
  const box = $('#source-viewport').getBoundingClientRect();
  if (!box.width || !box.height) return;
  const pixel = unitsPerPixel();
  const [x,y,w,h] = state.view;
  $('#source-viewport').setAttribute('viewBox', [x+w/2-box.width*pixel/2,y+h/2-box.height*pixel/2,box.width*pixel,box.height*pixel].join(' '));
}

function renderAudit() {
  const drawing = state.drawing;
  const checks = drawing.checks || [];
  $('#audit-summary').textContent = `${checks.length} checked spans · ${drawing.title}`;
  $('#audit-issues').replaceChildren();
  for (const issue of drawing.issues || []) {
    const item = document.createElement('li');
    item.textContent = issue;
    $('#audit-issues').append(item);
  }
  $('#audit-checks').replaceChildren();
  for (const check of checks) {
    const row = document.createElement('tr');
    for (const value of [check.name, `${check.expected.toLocaleString()} mm`, `${check.actual.toLocaleString()} mm`, `${Number((check.actual-check.expected).toFixed(3))} mm`]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    $('#audit-checks').append(row);
  }
}

function toggleReference(force) {
  const open = force ?? $('#reference-pane').hidden;
  $('#reference-pane').hidden = !open;
  $('.workspace').classList.toggle('reference-open', open);
  $('#reference-button').setAttribute('aria-pressed', String(open));
  requestAnimationFrame(fitDrawing);
}

function downloadSVG() {
  const clone = state.svg.cloneNode(true);
  const [x, y, width, height] = state.drawing.bounds;
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  clone.setAttribute('width', `${width / 100}mm`);
  clone.setAttribute('height', `${height / 100}mm`);
  clone.setAttribute('role', 'img');
  for (const room of clone.querySelectorAll('.room')) {
    room.classList.remove('selected');
    room.removeAttribute('tabindex');
    room.removeAttribute('role');
  }
  for (const dimension of clone.querySelectorAll('[data-dimension]')) {
    dimension.removeAttribute('tabindex');
    dimension.removeAttribute('role');
  }
  clone.querySelector('#ruler-layer').remove();
  clone.querySelector('#source-overlay')?.remove();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `9-glenn-${state.drawing.id}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('SVG downloaded · full drawing with current layers');
}

function wirePointerEvents() {
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .0025), event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    stage.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (state.pointers.size === 2) {
      const [a, b] = [...state.pointers.values()];
      state.pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), middle: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      state.drag = null;
      return;
    }
    state.drag = { x: event.clientX, y: event.clientY, view: [...state.view], moved: false, target: event.target.closest('.room')?.dataset.room, dimension: event.target.closest('[data-dimension]')?.dataset.dimension, button: event.button };
  });
  stage.addEventListener('pointermove', (event) => {
    const point = toDrawingPoint(event.clientX, event.clientY);
    $('#coordinate-readout').textContent = `X ${Math.round(point[0]).toLocaleString()} · Y ${Math.round(point[1]).toLocaleString()} mm`;
    if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (state.pointers.size >= 2 && state.pinch) {
      const [a, b] = [...state.pointers.values()];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (state.pinch.distance > 0) zoom(distance / state.pinch.distance, middle[0], middle[1]);
      const pixel = unitsPerPixel();
      state.view[0] -= (middle[0] - state.pinch.middle[0]) * pixel;
      state.view[1] -= (middle[1] - state.pinch.middle[1]) * pixel;
      state.pinch = { distance, middle };
      applyView();
      return;
    }
    if (state.drag) {
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      if (Math.hypot(dx, dy) > 5) state.drag.moved = true;
      if (state.drag.moved) {
        stage.classList.add('dragging');
        const pixel = state.drag.view[2] / stage.getBoundingClientRect().width;
        state.view = [state.drag.view[0] - dx * pixel, state.drag.view[1] - dy * pixel, state.drag.view[2], state.drag.view[3]];
        applyView();
        return;
      }
    }
    if (state.tool === 'measure') {
      state.hover = candidatePoint(event);
      renderRulers();
    }
  });
  stage.addEventListener('pointerup', (event) => {
    state.pointers.delete(event.pointerId);
    if (state.pinch) {
      if (state.pointers.size === 0) state.pinch = null;
      state.drag = null;
      return;
    }
    const drag = state.drag;
    state.drag = null;
    stage.classList.remove('dragging');
    if (!drag || drag.moved || drag.button === 1) return;
    if (state.tool === 'measure') addMeasurement(candidatePoint(event).point);
    else if (drag.target) selectRoom(drag.target);
    else if (drag.dimension !== undefined) selectDimension(drag.dimension);
  });
  stage.addEventListener('pointercancel', () => {
    state.pointers.clear(); state.pinch = null; state.drag = null;
    stage.classList.remove('dragging');
  });
  stage.addEventListener('pointerleave', () => {
    state.hover = null;
    $('#coordinate-readout').textContent = 'Coordinates in mm';
    renderRulers();
  });
  stage.addEventListener('keydown', (event) => {
    const room = event.target.closest('.room');
    if (room && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      selectRoom(room.dataset.room);
    }
    const dimension = event.target.closest('[data-dimension]');
    if (dimension && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      selectDimension(dimension.dataset.dimension);
    }
  });
}

function wireControls() {
  $('#overlay-toggle').addEventListener('change', () => {
    $('#overlay-controls').hidden = !$('#overlay-toggle').checked;
    updateOverlay();
  });
  $('#overlay-opacity').addEventListener('input', updateOverlay);
  $('#pan-button').addEventListener('click', () => setTool('pan'));
  $('#measure-button').addEventListener('click', () => setTool('measure'));
  $('#zoom-in').addEventListener('click', () => zoom(1.25));
  $('#zoom-out').addEventListener('click', () => zoom(.8));
  $('#fit-button').addEventListener('click', fitDrawing);
  $('#units').addEventListener('change', (event) => {
    state.unit = event.target.value;
    renderMeasures(); renderRulers();
    if (state.room) selectRoom(state.room.id);
  });
  $('#clear-measurements').addEventListener('click', () => { state.measures = []; state.start = null; renderMeasures(); renderRulers(); updateHint(); });
  $('#clear-active').addEventListener('click', () => { state.start = null; renderRulers(); updateHint(); });
  $('#reference-button').addEventListener('click', () => toggleReference());
  $('#close-reference').addEventListener('click', () => toggleReference(false));
  $('#source-page').addEventListener('change', () => {
    const page = Number($('#source-page').value);
    const match = drawings.find(drawing => drawing.page === page);
    if (match && state.drawing.page !== page) openDrawing(match.id);
    else updateSource();
  });
  LinkedPanZoom.bind($('#source-viewport'), {
    getView: () => $('#source-viewport').getAttribute('viewBox').split(/\s+/).map(Number),
    getFitWidth: () => state.fitted[2] * $('#source-viewport').getBoundingClientRect().width / stage.getBoundingClientRect().width,
    setView: ([x,y,w,h]) => {
      const pixel = w / $('#source-viewport').getBoundingClientRect().width;
      const box = stage.getBoundingClientRect();
      state.view = [x+w/2-box.width*pixel/2,y+h/2-box.height*pixel/2,box.width*pixel,box.height*pixel];
      applyView();
    },
    reset: fitDrawing,
  });
  new ResizeObserver(syncReferenceView).observe($('.reference-image-wrap'));
  function toggleSourceSize() {
    const image = $('#source-image');
    const enlarged = image.classList.toggle('enlarged');
    image.style.width = enlarged ? `${image.naturalWidth}px` : '';
  }
  $('#source-image').addEventListener('click', toggleSourceSize);
  $('#source-image').addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); toggleSourceSize(); }
  });
  $('#download-button').addEventListener('click', downloadSVG);
  $('#accuracy-button').addEventListener('click', () => $('#accuracy-dialog').showModal());
  $('#close-dialog').addEventListener('click', () => $('#accuracy-dialog').close());
  $('#accuracy-dialog').addEventListener('click', (event) => { if (event.target === $('#accuracy-dialog')) $('#accuracy-dialog').close(); });
  $('#details-button').addEventListener('click', () => {
    const visible = $('#inspector').hidden;
    $('#inspector').hidden = !visible;
    $('.main').classList.toggle('details-open', visible);
    $('#details-button').setAttribute('aria-expanded', String(visible));
    requestAnimationFrame(fitDrawing);
  });
  for (const toggle of document.querySelectorAll('[data-toggle]')) {
    toggle.addEventListener('change', () => { state.layers[toggle.dataset.toggle] = toggle.checked; applyLayers(); });
  }
  document.addEventListener('keydown', (event) => {
    if (['#3d', '#tour'].includes(location.hash) || $('#accuracy-dialog').open || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    switch (event.key.toLowerCase()) {
      case 'm': setTool('measure'); break;
      case 'v': setTool('pan'); break;
      case 'f': fitDrawing(); break;
      case '+': case '=': zoom(1.25); break;
      case '-': zoom(.8); break;
      case 'escape': state.start = null; state.hover = null; updateHint(); renderRulers(); break;
    }
  });
  window.addEventListener('hashchange', () => { if (!['#3d', '#tour'].includes(location.hash) && !location.hash.startsWith('#compare/')) openDrawing(location.hash.slice(1)); });
  new ResizeObserver(() => fitDrawing()).observe(stage);
}

function updateOverlay() {
  const opacity = $('#overlay-toggle').checked ? Number($('#overlay-opacity').value) / 100 : 0;
  state.svg.querySelector('#source-overlay')?.setAttribute('opacity', opacity);
  $('#overlay-value').textContent = `${Math.round(opacity * 100)}% PDF`;
}

buildNavigation();
wirePointerEvents();
wireControls();
openDrawing(location.hash.startsWith('#compare/') ? location.hash.slice(9).replace(/^roof-/, '') : location.hash.slice(1));
