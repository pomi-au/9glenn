import * as THREE from "three/webgpu";
import { parseBuilding } from "./model-geometry.js";
import { buildModel } from "./build-model.js";
import { roofComparison, matchesRoof } from "./roof-comparison.js";
import { createWebGPURenderer } from "./webgpu-renderer.js";
import { awaitArchitecturalTextures } from "./generated-textures.js";
import { awaitDoorReliefMaterials } from "./door-relief-material.js";
import { awaitSiteSurfaceMaterials } from "./site-surface-material.js";
import { createPlanarOptics } from "./planar-optics.js";

function projection(data, drawing) {
  const ground = data.floors.find((f) => f.id === "ground");
  const first = data.floors.find((f) => f.id === "first");
  const datum = first.base + first.height;
  const floor = data.floors.find((f) => f.id === drawing.id);
  const point = (x, y, z) => new THREE.Vector3(x / 1000, y / 1000, z / 1000);
  if (floor)
    return {
      point: (u, v) =>
        point(u + floor.offset[0], floor.base, v + floor.offset[1]),
      normal: new THREE.Vector3(0, 1, 0),
      up: new THREE.Vector3(0, 0, -1),
      floor,
    };
  const rearWidth = ground.bounds.maxX;
  const rearOffset = first.offset[1];
  const front = first.bounds.maxZ + rearOffset;
  const sectionX = data.spec.roofAssembly.sectionX;
  const views = {
    "elevation-1": {
      point: (u, v) => point(u, datum - v, ground.bounds.maxZ),
      normal: new THREE.Vector3(0, 0, 1),
    },
    "elevation-2": {
      point: (u, v) => point(0, datum - v, u + rearOffset),
      normal: new THREE.Vector3(-1, 0, 0),
    },
    "elevation-3": {
      point: (u, v) => point(rearWidth - u, datum - v, 0),
      normal: new THREE.Vector3(0, 0, -1),
    },
    "elevation-4": {
      point: (u, v) => point(rearWidth, datum - v, front - u),
      normal: new THREE.Vector3(1, 0, 0),
    },
    section: {
      point: (u, v) => point(sectionX, datum - v, u + rearOffset),
      normal: new THREE.Vector3(-1, 0, 0),
      clip: new THREE.Plane(new THREE.Vector3(1, 0, 0), -sectionX / 1000),
    },
  };
  return { ...views[drawing.id], up: new THREE.Vector3(0, 1, 0) };
}

export function mountTripleView() {
  const section = document.createElement("section");
  section.id = "triple-view";
  section.innerHTML = `<div class="view-heading triple-heading"><div><div class="eyebrow">SHARED DRAWING MODEL</div><h1>Compare drawings</h1><p>3D model, vector drawing and original PDF</p></div><label>Drawing <select id="triple-drawing" aria-label="Comparison drawing"></select></label></div>
    <div class="toolbar triple-toolbar"><div><button class="tool icon-button" id="triple-out" aria-label="Zoom out">−</button><output id="triple-zoom">100%</output><button class="tool icon-button" id="triple-in" aria-label="Zoom in">+</button><button class="tool" id="triple-fit">Fit all</button></div><div><button class="tool" id="triple-aligned" aria-pressed="true">Aligned</button><button class="tool" id="triple-angled" aria-pressed="false">Angled 3D</button></div><label class="triple-outline-option"><input id="triple-outlines" type="checkbox" checked> Outlines</label></div>
    <div class="triple-panes"><figure><figcaption>3D model <span id="triple-projection">Aligned</span></figcaption><div class="triple-surface" id="triple-model"><svg id="triple-input" aria-label="3D comparison. Drag to pan, scroll or pinch to zoom."></svg></div></figure><figure><figcaption>SVG <span>Editable geometry</span></figcaption><div class="triple-surface" id="triple-vector"></div></figure><figure><figcaption>PDF drawing <span id="triple-sheet"></span></figcaption><div class="triple-surface" id="triple-source"></div></figure></div><footer class="statusbar"><span>Linked comparison</span><span id="triple-hint">Linked pan and zoom · drag or scroll in any pane</span></footer><p id="triple-error" role="alert" hidden></p>`;
  document.querySelector(".main").append(section);
  const roofTools = document.createElement("div");
  roofTools.id = "triple-roof-tools";
  roofTools.hidden = true;
  roofTools.innerHTML = `<label>Roof <select id="triple-roof-component"></select></label><label><input id="triple-roof-overlay" type="checkbox" checked> Model edges on PDF</label><span style="color:#00847c">SVG roof edges from the 3D model</span>`;
  const roofSelect = roofTools.querySelector("select");
  for (const [value, label] of [
    ["all", "All roofs"],
    ["upper", "First-floor roof · all upper"],
    ["lower", "Ground-floor roofs · all lower"],
  ])
    roofSelect.add(new Option(label, value));
  const roofNames = {
    "main-hip": "Main upper hip",
    "central-hip": "Projecting upper hip",
    "arch-gable": "Front gable",
    "garage-hip": "Garage",
    "portico-deck": "Portico",
    "bay-lean-to": "Rear bay",
  };
  for (const component of new Set(
    window.BUILDING_SPEC.roofAssembly.faces
      .filter((f) => f.kind === "surface")
      .map((f) => f.component),
  ))
    roofSelect.add(new Option(roofNames[component] || component, component));
  section.querySelector(".triple-toolbar").after(roofTools);
  const select = section.querySelector("select");
  for (const d of window.DRAWINGS) select.add(new Option(d.title, d.id));
  select.add(new Option("Roof comparison · ground floor", "roof-ground"));
  select.add(new Option("Roof comparison · first floor", "roof-first"));
  let instance, initialization;
  let activation = 0;
  const api = {
    async activate(enabled, id) {
      const request = ++activation;
      document.body.classList.toggle("mode-compare", enabled);
      document
        .querySelector("#mode-compare")
        .setAttribute("aria-pressed", String(enabled));
      if (instance) instance.active = enabled;
      if (!enabled) return;
      try {
        if (!initialization) {
          section.querySelector("#triple-projection").textContent =
            "Starting WebGPU…";
          initialization = create(section).then((created) => {
            instance = created;
            return created;
          });
        }
        await initialization;
        // Adapter initialization can outlive a drawing change or leaving Compare.
        if (request !== activation) return;
        instance.active = true;
        instance.open(id);
      } catch (error) {
        initialization = null;
        if (request !== activation) return;
        section.querySelector("#triple-error").hidden = false;
        section.querySelector("#triple-error").textContent =
          `Comparison could not start: ${error.message}`;
        console.error(error);
      }
    },
    get instance() {
      return instance;
    },
  };
  select.onchange = () => {
    location.hash = `compare/${select.value}`;
  };
  window.TripleView = api;
  return api;
}

async function create(section) {
  const $ = (selector) => section.querySelector(selector);
  const data = parseBuilding(window.DRAWINGS),
    model = buildModel(data);
  // Lower roof faces use world coordinates, as does the ground-floor group.
  // Hosting them on root allows roof isolation without showing ground walls.
  model.root.add(model.garageRoof);
  const roofVisibility = new Map(
    [...model.roof.children, ...model.garageRoof.children].map((o) => [
      o,
      o.visible,
    ]),
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f6);
  const clipping = new THREE.ClippingGroup();
  clipping.clipShadows = true;
  clipping.add(model.root);
  scene.add(clipping, new THREE.HemisphereLight(0xffffff, 0xb0bab1, 2.5));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(-8, 30, 24);
  sun.target.position.set(13, 0, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -35,
    right: 35,
    top: 35,
    bottom: -35,
    near: 0.1,
    far: 100,
  });
  scene.add(sun, sun.target);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x4d6570,
    transparent: true,
    opacity: 0.72,
    toneMapped: false,
  });
  const outlines = [];
  model.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let geometry = new THREE.EdgesGeometry(mesh.geometry, 30);
    if (mesh.userData.kind === "guard") {
      // Adjacent guard panels describe a continuous curve. Suppress their
      // shared end edges so the outline does not become a striped wireframe.
      const floor = data.floors.find((f) => f.id === mesh.userData.floor);
      const guard = floor.source.geometry.find(
        (g) => g.id === mesh.userData.guardId,
      );
      const index = mesh.userData.panel,
        panel = guard.panels[index];
      const ends = [];
      if (index > 0) ends.push([panel.points[0], panel.points[3]]);
      if (index < guard.panels.length - 1)
        ends.push([panel.points[1], panel.points[2]]);
      const positions = geometry.attributes.position,
        kept = [];
      const onEnd = (i, [a, b]) =>
        Math.abs(
          (b[0] - a[0]) * (positions.getZ(i) * 1000 - a[1]) -
            (b[1] - a[1]) * (positions.getX(i) * 1000 - a[0]),
        ) /
          Math.hypot(b[0] - a[0], b[1] - a[1]) <
        0.01;
      for (let i = 0; i < positions.count; i += 2) {
        if (ends.some((end) => onEnd(i, end) && onEnd(i + 1, end))) continue;
        for (const j of [i, i + 1])
          kept.push(positions.getX(j), positions.getY(j), positions.getZ(j));
      }
      geometry.dispose();
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(kept, 3),
      );
    }
    const edge = new THREE.LineSegments(geometry, edgeMaterial);
    edge.name = "comparison-outline";
    mesh.add(edge);
    outlines.push(edge);
  });
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 200);
  let renderer = null;
  let optics = null;
  try {
    await awaitArchitecturalTextures();
    await awaitDoorReliefMaterials();
    await awaitSiteSurfaceMaterials();
    renderer = await createWebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    optics = createPlanarOptics(renderer, scene, model.root);
    $("#triple-model").prepend(renderer.domElement);
    $("#triple-error").hidden = true;
  } catch (error) {
    // Linked drawings remain available when the GPU cannot render the model.
    optics?.dispose();
    optics = null;
    renderer?.dispose();
    renderer = null;
    $("#triple-error").hidden = false;
    $("#triple-error").textContent =
      `3D comparison is unavailable: ${error.message} SVG and PDF comparison remain available.`;
  }
  const input = $("#triple-input"),
    memory = new Map(),
    roofSelections = new Map();
  let drawing,
    basis,
    state,
    vector,
    source,
    selection,
    roofMode = false,
    roofBounds,
    roofOverlay,
    active = false,
    angled = false;
  function dimensions() {
    const box = $("#triple-model").getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      aspect: box.width / Math.max(1, box.height),
    };
  }
  function fitWidth() {
    const { aspect } = dimensions();
    const bounds = roofBounds || drawing.bounds;
    return Math.max(bounds[2], bounds[3] * aspect) * 1.07;
  }
  function view() {
    const { aspect } = dimensions();
    return [
      state.x - state.width / 2,
      state.y - state.width / aspect / 2,
      state.width,
      state.width / aspect,
    ];
  }
  function setView([x, y, w, h]) {
    state.x = x + w / 2;
    state.y = y + h / 2;
    state.width = w;
    render();
  }
  function reset() {
    const bounds = roofBounds || drawing.bounds;
    state.x = bounds[0] + bounds[2] / 2;
    state.y = bounds[1] + bounds[3] / 2;
    state.width = fitWidth();
    render();
  }
  function compression() {
    return angled && basis.floor ? Math.SQRT1_2 : 1;
  }
  function inputView() {
    const v = view();
    v[1] = state.y * compression() - v[3] / 2;
    return v;
  }
  const control = window.LinkedPanZoom.bind(input, {
    getView: inputView,
    setView: ([x, y, w, h]) =>
      setView([x, (y + h / 2) / compression() - h / 2, w, h]),
    getFitWidth: fitWidth,
    reset,
  });
  function bind(svg) {
    window.LinkedPanZoom.bind(svg, {
      getView: view,
      setView,
      getFitWidth: fitWidth,
      reset,
    });
  }
  let opticalFrame = null;
  function render() {
    if (opticalFrame !== null) cancelAnimationFrame(opticalFrame);
    opticalFrame = null;
    if (!drawing || !active) return;
    const size = dimensions();
    if (!size.width || !size.height) return;
    const v = view();
    for (const svg of [vector, source])
      svg.setAttribute("viewBox", v.join(" "));
    input.setAttribute("viewBox", inputView().join(" "));
    renderer?.setSize(size.width, size.height, false);
    const centre = basis.point(state.x, state.y);
    const normal =
      angled && basis.floor
        ? new THREE.Vector3(0, 1, 1).normalize()
        : basis.normal;
    camera.up.copy(basis.up);
    camera.position.copy(centre).addScaledVector(normal, 80);
    camera.lookAt(centre);
    camera.left = -v[2] / 2000;
    camera.right = v[2] / 2000;
    camera.top = v[3] / 2000;
    camera.bottom = -v[3] / 2000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    clipping.clippingPlanes = basis.clip ? [basis.clip] : [];
    optics?.update(camera);
    renderer?.render(scene, camera);
    if (optics?.needsUpdate) opticalFrame = requestAnimationFrame(render);
    $("#triple-zoom").textContent =
      `${Math.round((fitWidth() / state.width) * 100)}%`;
  }
  function open(id, force = false) {
    optics?.invalidate();
    active = true;
    const next =
      window.DRAWINGS.find((d) => d.id === id?.replace(/^roof-/, "")) ||
      window.DRAWINGS[0];
    id ||= next.id;
    if (selection === id && !force) {
      render();
      return;
    }
    drawing = next;
    const changedSelection = selection !== id;
    selection = id;
    roofMode = ["roof-ground", "roof-first"].includes(id);
    roofBounds = null;
    roofOverlay = null;
    basis = projection(data, drawing);
    $("#triple-drawing").value = id;
    $("#triple-roof-tools").hidden = !roofMode;
    vector = window.DrawingModel.documentFor(drawing);
    if (roofMode) {
      if (changedSelection)
        $("#triple-roof-component").value =
          roofSelections.get(id) ||
          (id === "roof-first" ? "upper" : "garage-hip");
      roofSelections.set(id, $("#triple-roof-component").value);
      const comparison = roofComparison(
        drawing,
        data.spec.roofAssembly,
        basis.floor.offset,
        $("#triple-roof-component").value,
      );
      vector = comparison.vector;
      roofOverlay = comparison.lines;
      roofBounds = comparison.bounds;
      const floorPoint = basis.point;
      basis = {
        ...basis,
        point: (u, v) => {
          const point = floorPoint(u, v);
          point.y = comparison.height / 1000;
          return point;
        },
      };
    }
    vector.removeAttribute("width");
    vector.removeAttribute("height");
    vector.setAttribute(
      "aria-label",
      `${drawing.title} SVG. Linked pan and zoom.`,
    );
    $("#triple-vector").replaceChildren(vector);
    source = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    source.setAttribute(
      "aria-label",
      `PDF sheet ${drawing.page}. Linked pan and zoom.`,
    );
    const image = document.createElementNS(source.namespaceURI, "image");
    for (const [key, value] of Object.entries(drawing.sourceImage))
      image.setAttribute(key, value);
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute(
      "href",
      window.SOURCE_IMAGES?.[drawing.page] ||
        `assets/source-${drawing.page}.jpg`,
    );
    source.append(image);
    if (roofOverlay) {
      source.append(roofOverlay);
      roofOverlay.style.display = $("#triple-roof-overlay").checked
        ? ""
        : "none";
    }
    $("#triple-source").replaceChildren(source);
    $("#triple-sheet").textContent = `Sheet ${drawing.page}`;
    for (const e of model.floorGroups.values()) {
      e.group.visible = roofMode
        ? false
        : basis.floor
          ? e.floor.id === drawing.id
          : true;
      e.plans.visible = false;
      e.caps.visible = false;
    }
    const g = model.floorGroups.get("ground"),
      f = model.floorGroups.get("first"),
      stairs = g.stairGroups.get("stair");
    const host = drawing.id === "first" ? f : g;
    host.group.add(stairs);
    stairs.position.set(
      (g.floor.offset[0] - host.floor.offset[0]) / 1000,
      (g.floor.base - host.floor.base) / 1000,
      (g.floor.offset[1] - host.floor.offset[1]) / 1000,
    );
    const component = $("#triple-roof-component").value;
    model.roof.visible = roofMode
      ? data.spec.roofAssembly.faces.some(
          (f) => f.level === "upper" && matchesRoof(f, component),
        )
      : !basis.floor;
    model.garageRoof.visible = roofMode
      ? data.spec.roofAssembly.faces.some(
          (f) => f.level === "lower" && matchesRoof(f, component),
        )
      : !basis.floor;
    for (const [object, visible] of roofVisibility)
      object.visible =
        visible && (!roofMode || matchesRoof(object.userData, component));
    angled = angled && Boolean(basis.floor);
    updateButtons();
    bind(vector);
    bind(source);
    const key = roofMode ? `${id}/${component}` : id;
    if (!memory.has(key)) memory.set(key, { x: 0, y: 0, width: 1 });
    state = memory.get(key);
    if (state.width === 1) reset();
    else render();
  }
  function updateButtons() {
    $("#triple-aligned").setAttribute("aria-pressed", String(!angled));
    $("#triple-angled").setAttribute("aria-pressed", String(angled));
    $("#triple-angled").disabled = !basis.floor;
    let projectionLabel = "Aligned";
    if (drawing.kind === "section") projectionLabel = "Section cut";
    if (angled) projectionLabel = "Angled";
    if (!renderer) projectionLabel = "WebGPU unavailable";
    $("#triple-projection").textContent = projectionLabel;
    $("#triple-hint").textContent = angled
      ? "Linked location and scale · angled model shows depth"
      : roofMode
        ? "Linked roof comparison · surface edges include hidden junctions · scan dimensions are approximate"
        : "Linked pan and zoom · drag or scroll in any pane";
  }
  $("#triple-aligned").onclick = () => {
    angled = false;
    updateButtons();
    render();
  };
  $("#triple-angled").onclick = () => {
    angled = true;
    updateButtons();
    render();
  };
  $("#triple-in").onclick = () => control.zoom(1.25);
  $("#triple-out").onclick = () => control.zoom(0.8);
  $("#triple-fit").onclick = reset;
  $("#triple-roof-component").onchange = () => open(selection, true);
  $("#triple-roof-overlay").onchange = (event) => {
    if (roofOverlay)
      roofOverlay.style.display = event.target.checked ? "" : "none";
  };
  $("#triple-outlines").onchange = (event) => {
    for (const edge of outlines) edge.visible = event.target.checked;
    optics?.invalidate();
    render();
  };
  new ResizeObserver(render).observe($("#triple-model"));
  return {
    open,
    render,
    data,
    model,
    camera,
    renderer,
    optics,
    scene,
    clipping,
    get roofMode() {
      return roofMode;
    },
    get view() {
      return view();
    },
    get basis() {
      return basis;
    },
    get drawing() {
      return drawing;
    },
    set active(value) {
      active = value;
      if (!value && opticalFrame !== null) {
        cancelAnimationFrame(opticalFrame);
        opticalFrame = null;
      }
    },
  };
}
