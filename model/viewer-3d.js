import * as THREE from "three/webgpu";
import { createWebGPURenderer } from "./webgpu-renderer.js";
import { daylightEnvironment } from "./daylight.js";
import { createPhotoGround } from "./photo-ground.js";
import { renderQuality } from "./render-quality.js";
import { environmentInteraction } from "./environment-interaction.js";
import { awaitArchitecturalTextures } from "./generated-textures.js";
import { awaitDoorReliefMaterials } from "./door-relief-material.js";
import { awaitSiteSurfaceMaterials } from "./site-surface-material.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseBuilding, wallContains } from "./model-geometry.js";
import { buildModel } from "./build-model.js";
import { modelRotation } from "./model-rotation.js";
import { tourControls } from "./tour-controls.js";
import { selectionOutline } from "./selection-outline.js";
import { mountTripleView } from "./triple-view.js";

const $ = (selector) => document.querySelector(selector);
let instance;
let initialization;
let triple;
const settings = {
  floor: "all",
  explode: 0,
  roof: true,
  landscape: true,
  cut: false,
  labels: false,
  dimensions: false,
  plans: false,
};
async function init() {
  const host = $("#model-canvas");
  const renderer = await createWebGPURenderer();
  const data = parseBuilding(window.DRAWINGS),
    model = buildModel(data);
  await awaitArchitecturalTextures();
  await awaitDoorReliefMaterials();
  await awaitSiteSurfaceMaterials();
  const scene = new THREE.Scene();
  scene.environment = daylightEnvironment();
  scene.background = scene.environment;
  scene.environmentIntensity = 0.8;
  scene.backgroundIntensity = 0.9;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive 3D building. Drag to rotate model, scroll to zoom, right drag to pan.",
  );
  renderer.domElement.tabIndex = 0;
  host.prepend(renderer.domElement);
  const pivot = new THREE.Group();
  pivot.add(model.root);
  scene.add(pivot);
  const photoGround = createPhotoGround(model);
  model.root.add(photoGround);
  const sun = new THREE.DirectionalLight(0xfff2df, 2.5);
  sun.position.set(-8, 24, 30);
  sun.userData.photoSun = true;
  sun.target.position.set(13, 0, 8);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 28,
    bottom: -28,
    near: 1,
    far: 90,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 220);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.enableRotate = false;
  orbit.minZoom = 0.3;
  orbit.maxZoom = 12;
  orbit.maxPolarAngle = Math.PI * 0.495;
  const labels = $("#model-annotations");
  for (const anchor of model.labelAnchors) {
    const el = document.createElement("span");
    el.className = "room-label-3d";
    el.textContent = anchor.name;
    labels.append(el);
    anchor.element = el;
  }
  const dimGroup = new THREE.Group();
  model.root.add(dimGroup);
  function dim(a, b, text) {
    const points = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x53786d }),
    );
    dimGroup.add(line);
    for (const p of points) {
      const tick = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          p.clone().add(new THREE.Vector3(0, -0.18, 0)),
          p.clone().add(new THREE.Vector3(0, 0.18, 0)),
        ]),
        line.material,
      );
      dimGroup.add(tick);
    }
    const el = document.createElement("span");
    el.className = "dimension-label-3d";
    el.textContent = text;
    labels.append(el);
    return {
      point: points[0].clone().add(points[1]).multiplyScalar(0.5),
      element: el,
    };
  }
  const dims = [
    dim(
      [0, 0.08, data.depth / 1000 + 1.4],
      [data.width / 1000, 0.08, data.depth / 1000 + 1.4],
      `${data.width.toLocaleString()} mm`,
    ),
    dim(
      [data.width / 1000 + 1.4, 0.08, 0],
      [data.width / 1000 + 1.4, 0.08, data.depth / 1000],
      `${data.depth.toLocaleString()} mm`,
    ),
  ];
  let previousDoorsMoving = false;
  let transition = null;
  let overview = null;
  const tour = tourControls({
    model,
    element: renderer.domElement,
    onChange: invalidate,
    onTargetChange: (key) => selectDoor(key),
    onExit: () => {
      location.hash = "3d";
    },
  });
  // Camera-mounted tour lights must belong to the scene to illuminate it.
  scene.add(tour.camera);
  const selection = selectionOutline(renderer, scene, [camera, tour.camera]);
  function selectDoor(key) {
    const keys = model.doorKeys(key);
    selection.select(
      model.pickables.filter((m) => keys.includes(m.userData.doorKey)),
    );
  }
  const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
  let perspective = false;
  const renderedCamera = () => {
    if (tour.enabled || transition) return tour.camera;
    if (!perspective) return camera;
    const halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
    const distance =
      halfHeight /
      Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2));
    perspectiveCamera.position
      .copy(orbit.target)
      .addScaledVector(
        camera.position.clone().sub(orbit.target).normalize(),
        distance,
      );
    perspectiveCamera.quaternion.copy(camera.quaternion);
    perspectiveCamera.updateMatrixWorld();
    return perspectiveCamera;
  };
  let active = true,
    queued = false,
    animationFrame = null;
  const quality = renderQuality({
    renderer,
    scene,
    selection,
    invalidate,
    onModeChange(mode) {
      if (mode === "photo" && tour.enabled) tour.pause();
      updatePhotoGround(mode);
      interaction.pause();
    },
  });
  const interaction = environmentInteraction({
    model,
    element: renderer.domElement,
    getCamera: renderedCamera,
    getSignature() {
      const view = renderedCamera();
      return [
        view.uuid,
        ...view.matrixWorld.elements,
        ...view.projectionMatrix.elements,
        ...pivot.matrixWorld.elements,
        settings.floor,
        settings.explode,
        settings.cut,
        settings.landscape,
        renderer.domElement.width,
        renderer.domElement.height,
      ].join(",");
    },
    isEnabled: () => active && !tour.locked && !transition,
    isFrozen: (controller) =>
      quality.mode === "photo" && controller.kind === "water",
    invalidate,
  });
  function updatePhotoGround(mode = quality.mode) {
    photoGround.visible =
      mode === "photo" &&
      settings.landscape &&
      settings.floor === "all" &&
      !settings.cut &&
      settings.explode === 0;
  }
  $("#model-perspective").onchange = (event) => {
    perspective = event.target.checked;
    invalidate();
  };
  function render(now = performance.now()) {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    queued = false;
    if (!active) return;
    const doorsMoving = model.updateDoors(now);
    if (tour.enabled && (doorsMoving || previousDoorsMoving))
      renderer.shadowMap.needsUpdate = true;
    if (doorsMoving || previousDoorsMoving) quality.sceneChanged();
    previousDoorsMoving = doorsMoving;
    const waterMoving = quality.mode !== "photo" && model.updateWater(now);
    if (waterMoving) selection.optics.invalidate();
    if (transition) animateTransition(now);
    pivot.updateMatrixWorld(true);
    tour.update(now);
    updateCutPlanes();
    const viewCamera = renderedCamera();
    const dynamics = interaction.step(now);
    if (dynamics.changed) {
      quality.sceneChanged();
      renderer.shadowMap.needsUpdate = true;
    }
    const refining = quality.render(
      viewCamera,
      Boolean(doorsMoving || tour.locked || transition || dynamics.moving),
      pivot.matrixWorld.elements.join(",") +
        model.root.matrixWorld.elements.join(","),
    );
    const hoverHelp = $("#model-hover-help");
    const hint = tour.enabled
      ? "WASD to walk · mouse to look"
      : "Brush plants and water without clicking";
    if (hoverHelp.textContent !== hint) hoverHelp.textContent = hint;
    const width = host.clientWidth,
      height = host.clientHeight;
    function position(el, point, visible) {
      const p = point.project(viewCamera);
      el.hidden =
        !visible ||
        p.z > 1 ||
        p.z < -1 ||
        Math.abs(p.x) > 1 ||
        Math.abs(p.y) > 1;
      el.style.transform = `translate(${(p.x * 0.5 + 0.5) * width}px,${(-p.y * 0.5 + 0.5) * height}px) translate(-50%,-50%)`;
    }
    for (const a of model.labelAnchors)
      position(
        a.element,
        a.group.localToWorld(a.point.clone()),
        !tour.enabled &&
          !transition &&
          settings.labels &&
          a.group.visible &&
          (settings.floor !== "all" ||
            settings.explode > 0 ||
            a.floor === "first"),
      );
    for (const d of dims)
      position(
        d.element,
        dimGroup.localToWorld(d.point.clone()),
        !tour.enabled &&
          !transition &&
          settings.dimensions &&
          settings.floor === "all",
      );
    $("#model-scale").textContent =
      tour.enabled || transition
        ? "Eye level · WASD + mouse"
        : `${Math.round(camera.zoom * 100)}% · mm model`;
    if (
      doorsMoving ||
      waterMoving ||
      tour.locked ||
      transition ||
      refining ||
      dynamics.moving ||
      (quality.mode === "explore" && selection.optics.needsUpdate)
    )
      invalidate();
  }
  function invalidate() {
    if (!queued && active) {
      queued = true;
      animationFrame = requestAnimationFrame(render);
    }
  }
  orbit.addEventListener("change", invalidate);
  const rotation = modelRotation(renderer.domElement, pivot, camera, () => {
    for (const button of document.querySelectorAll("[data-camera]"))
      button.setAttribute("aria-pressed", "false");
    invalidate();
  });
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    selection.resize(w, h);
    const aspect = w / h;
    camera.left = -20 * aspect;
    camera.right = 20 * aspect;
    camera.top = 20;
    camera.bottom = -20;
    camera.updateProjectionMatrix();
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();
    quality.resize();
    tour.camera.aspect = aspect;
    tour.camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(resize).observe(host);
  function visibleBounds() {
    const b = new THREE.Box3();
    for (const f of model.floorGroups.values())
      if (f.group.visible) b.union(new THREE.Box3().setFromObject(f.group));
    if (model.roof.visible) b.union(new THREE.Box3().setFromObject(model.roof));
    return b;
  }
  function preset(name = "iso") {
    if (tour.enabled || transition) return;
    rotation.cancel();
    pivot.quaternion.identity();
    pivot.position.set(0, 0, 0);
    model.root.position.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    const box = visibleBounds(),
      centre = box.getCenter(new THREE.Vector3());
    const dirs = {
      street: [1, 0.32, 1.5],
      iso: [1, 1, 1],
      top: [0, 1, 0.001],
      front: [0, 0.16, 1],
      rear: [0, 0.16, -1],
      left: [-1, 0.16, 0],
      right: [1, 0.16, 0],
    };
    if (name === "street") {
      perspective = true;
      $("#model-perspective").checked = true;
    }
    const direction = new THREE.Vector3(
      ...(dirs[name] || dirs.iso),
    ).normalize();
    // Keep source coordinates unchanged; rotate their parent about this centre.
    pivot.position.copy(centre);
    model.root.position.copy(centre).negate();
    pivot.updateMatrixWorld(true);
    orbit.target.copy(centre);
    camera.position.copy(centre).addScaledVector(direction, 65);
    camera.zoom = 1;
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    // Fit projected corners, including height when the floors are separated.
    const inverse = camera.matrixWorldInverse;
    let maxX = 0,
      maxY = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
          maxX = Math.max(maxX, Math.abs(p.x));
          maxY = Math.max(maxY, Math.abs(p.y));
        }
    camera.zoom = Math.min(
      (camera.right - camera.left) / (maxX * 2.35),
      (camera.top - camera.bottom) / (maxY * 2.35),
    );
    camera.updateProjectionMatrix();
    orbit.update();
    rotation.reset();
    invalidate();
    for (const button of document.querySelectorAll("[data-camera]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.camera === name),
      );
  }
  // WebGPU encodes clipping in scene groups rather than material shaders.
  for (const entry of model.floorGroups.values()) {
    const clip = new THREE.ClippingGroup();
    clip.name = `${entry.floor.id}-cutaway`;
    clip.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2)];
    clip.clipShadows = true;
    clip.enabled = false;
    entry.group.add(clip);
    clip.add(entry.walls, entry.details);
    entry.clipGroup = clip;
    // Retain a material inventory for inspection and existing integration hooks.
    const materials = new Set();
    clip.traverse((object) => {
      if (object.material)
        [object.material].flat().forEach((material) => materials.add(material));
    });
    entry.clipMaterials = [...materials];
  }
  function updateCutPlanes() {
    if (!settings.cut) return;
    for (const entry of model.floorGroups.values()) {
      entry.clipGroup.clippingPlanes[0]
        .set(new THREE.Vector3(0, -1, 0), 1.2)
        .applyMatrix4(entry.group.matrixWorld);
    }
  }
  function update(refit = false) {
    quality.sceneChanged();
    updatePhotoGround();
    selection.select();
    // A connecting flight remains visible from its upper floor. Reparent the
    // same meshes, retaining building coordinates; never duplicate the stair.
    const groundEntry = model.floorGroups.get("ground");
    const firstEntry = model.floorGroups.get("first");
    const mainStair = groundEntry.stairGroups.get("stair");
    const host = settings.floor === "first" ? firstEntry : groundEntry;
    host.group.add(mainStair);
    mainStair.position.set(
      (groundEntry.floor.offset[0] - host.floor.offset[0]) / 1000,
      (groundEntry.floor.base - host.floor.base) / 1000,
      (groundEntry.floor.offset[1] - host.floor.offset[1]) / 1000,
    );
    for (const [id, e] of model.floorGroups) {
      e.group.visible = settings.floor === "all" || id === settings.floor;
      const index = { cellar: 0, ground: 1, first: 2 }[id];
      e.group.position.y =
        e.floor.base / 1000 +
        (settings.floor === "all" ? index * settings.explode : 0);
      e.plans.visible = settings.plans;
      e.caps.visible = settings.cut;
      e.clipGroup.enabled = settings.cut;
    }
    model.root.getObjectByName("landscaping").visible = settings.landscape;
    model.roof.position.y = 3 * settings.explode;
    model.roof.visible =
      settings.roof && !settings.cut && settings.floor === "all";
    model.garageRoof.visible =
      settings.roof && !settings.cut && settings.floor === "all";
    dimGroup.visible = settings.dimensions && settings.floor === "all";
    $("#model-state").textContent =
      settings.floor === "all"
        ? settings.explode
          ? "Exploded building"
          : "Whole building"
        : data.floors.find((f) => f.id === settings.floor).title;
    $("#explode").disabled = settings.floor !== "all";
    $("#model-roof").disabled = settings.floor !== "all" || settings.cut;
    $("#model-dimensions").disabled = settings.floor !== "all";
    $("#explode-value").textContent = settings.explode.toFixed(1) + " m";
    $("#model-selection").hidden = true;
    if (refit) preset();
    else invalidate();
  }
  function syncControls() {
    for (const button of document.querySelectorAll("[data-floor]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.floor === settings.floor),
      );
    for (const key of [
      "roof",
      "landscape",
      "cut",
      "labels",
      "dimensions",
      "plans",
    ])
      $("#model-" + key).checked = settings[key];
    $("#explode").value = settings.explode;
  }
  function setTourUI(value) {
    document.body.classList.toggle("mode-tour", value);
    $("#model-controls").inert = value;
    $("#model-selection").hidden = true;
    $("#model-view h1").textContent = value ? "3D tour" : "3D building";
    renderer.domElement.setAttribute(
      "aria-label",
      value
        ? "Building tour. WASD to walk, mouse to look, click highlighted doors, Escape to pause."
        : "Interactive 3D building. Drag to rotate model, scroll to zoom, right drag to pan.",
    );
  }
  function transitionPose(progress) {
    const t = progress * progress * (3 - 2 * progress);
    tour.setIllumination(t);
    const end = overview.entrance;
    const q = overview.cameraQuaternion.clone().slerp(end.quaternion, t);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const focus = overview.target
      .clone()
      .lerp(
        end.position
          .clone()
          .addScaledVector(
            new THREE.Vector3(0, 0, -1).applyQuaternion(end.quaternion),
            1.5,
          ),
        t,
      );
    const halfHeight = THREE.MathUtils.lerp(
      20 / overview.zoom,
      1.5 * Math.tan(THREE.MathUtils.degToRad(35)),
      t,
    );
    const fov = THREE.MathUtils.lerp(0.25, 70, t);
    const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    tour.camera.fov = fov;
    // A narrow starting lens approximates the overview's orthographic frame.
    // Keep the depth range around the building while the camera is far away.
    tour.camera.near = Math.max(0.04, distance - 70);
    tour.camera.far = distance + 100;
    tour.camera.position.copy(focus).addScaledVector(forward, -distance);
    tour.camera.quaternion.copy(q);
    tour.camera.updateProjectionMatrix();
    pivot.quaternion
      .copy(overview.pivotQuaternion)
      .slerp(new THREE.Quaternion(), t);
    pivot.position.copy(overview.pivotPosition).multiplyScalar(1 - t);
    model.root.position.copy(overview.rootPosition).multiplyScalar(1 - t);
    for (const [id, e] of model.floorGroups)
      e.group.position.y = THREE.MathUtils.lerp(
        overview.floorY.get(id),
        e.floor.base / 1000,
        t,
      );
    model.roof.position.y = THREE.MathUtils.lerp(overview.roofY, 0, t);
  }
  function animateTransition(now) {
    const elapsed = Math.min(1, Math.max(0, (now - transition.start) / 1800));
    transitionPose(transition.entering ? elapsed : 1 - elapsed);
    if (elapsed < 1) return;
    const entering = transition.entering;
    transition = null;
    $("#tour-transition").hidden = true;
    $("#tour-reset").disabled = false;
    if (entering) {
      tour.camera.far = 120;
      tour.camera.updateProjectionMatrix();
      pivot.updateMatrixWorld(true);
      tour.enter();
      renderer.shadowMap.autoUpdate = false;
      $("#model-state").textContent = "At the front door";
    } else {
      finishTour();
    }
  }
  function finishTour() {
    transition = null;
    tour.exit();
    $("#tour-reset").disabled = false;
    $("#tour-transition").hidden = true;
    if (overview) {
      renderer.shadowMap.autoUpdate = overview.shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = true;
      Object.assign(settings, overview.settings);
      pivot.quaternion.copy(overview.pivotQuaternion);
      pivot.position.copy(overview.pivotPosition);
      model.root.position.copy(overview.rootPosition);
      overview = null;
      syncControls();
      update();
    }
    orbit.enabled = true;
    rotation.enabled = true;
    setTourUI(false);
    invalidate();
  }
  function enterTour() {
    if (tour.enabled || transition?.entering) return;
    if (transition) finishTour();
    rotation.cancel();
    orbit.enabled = false;
    rotation.enabled = false;
    overview = {
      shadowAutoUpdate: renderer.shadowMap.autoUpdate,
      settings: { ...settings },
      target: orbit.target.clone(),
      zoom: camera.zoom,
      cameraQuaternion: camera.quaternion.clone(),
      pivotQuaternion: pivot.quaternion.clone(),
      pivotPosition: pivot.position.clone(),
      rootPosition: model.root.position.clone(),
      floorY: new Map(
        [...model.floorGroups].map(([id, e]) => [id, e.group.position.y]),
      ),
      roofY: model.roof.position.y,
    };
    Object.assign(settings, {
      floor: "all",
      explode: 0,
      roof: true,
      cut: false,
      labels: false,
      dimensions: false,
      plans: false,
    });
    update();
    pivot.quaternion.identity();
    pivot.position.set(0, 0, 0);
    model.root.position.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    // Prepare the canonical entrance pose before beginning the camera flight.
    tour.reset();
    overview.entrance = {
      position: tour.camera.position.clone(),
      quaternion: tour.camera.quaternion.clone(),
    };
    setTourUI(true);
    syncControls();
    $("#model-state").textContent = "Moving to the front door…";
    $("#tour-transition").hidden = false;
    $("#tour-transition").textContent = "Moving to the front door…";
    $("#tour-reset").disabled = true;
    transition = { entering: true, start: performance.now() };
    transitionPose(0);
    invalidate();
  }
  function exitTour(animate = true) {
    if (!overview) return;
    if (!animate || transition) return finishTour();
    overview.entrance = {
      position: tour.camera.position.clone(),
      quaternion: tour.camera.quaternion.clone(),
    };
    tour.exit();
    renderer.shadowMap.autoUpdate = true;
    $("#tour-reset").disabled = true;
    transition = { entering: false, start: performance.now() };
    $("#model-state").textContent = "Returning to model view…";
    $("#tour-transition").hidden = false;
    $("#tour-transition").textContent = "Returning to model view…";
    invalidate();
  }
  const raycaster = new THREE.Raycaster();
  let down;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (tour.enabled || transition) return;
    down = [e.clientX, e.clientY];
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (
      tour.enabled ||
      transition ||
      !down ||
      rotation.wasDragged() ||
      e.button !== 0 ||
      Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
    )
      return;
    pivot.updateMatrixWorld(true);
    const b = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1,
      ),
      renderedCamera(),
    );
    // Only registered surfaces are interactive. Descendant glass outlines are
    // decorative and have neither door metadata nor the surface clipping state.
    const hit = raycaster.intersectObjects(model.pickables, false).find((h) => {
      let o = h.object;
      while (o) {
        if (!o.visible) return false;
        o = o.parent;
      }
      const floor = model.floorGroups.get(h.object.userData.floor);
      return (
        !settings.cut ||
        !floor ||
        floor.group.worldToLocal(h.point.clone()).y <= 1.201
      );
    });
    const panel = $("#model-selection");
    panel.hidden = !hit;
    selection.select(hit ? [hit.object] : []);
    invalidate();
    if (!hit) return;
    const info = hit.object.userData;
    let doorStatus = null;
    if (info.doorKey) {
      selectDoor(info.doorKey);
      const open = model.toggleDoor(info.doorKey);
      doorStatus = open ? "Open · click to close" : "Closed · click to open";
      invalidate();
    }
    $("#model-selected-name").textContent = info.name;
    $("#model-selected-info").textContent = [
      info.kind,
      doorStatus,
      info.width ? `${Math.round(info.width).toLocaleString()} mm wide` : null,
      info.height
        ? `${Math.round(info.height).toLocaleString()} mm high`
        : null,
      info.source,
    ]
      .filter(Boolean)
      .join(" · ");
  });
  function download() {
    quality.present(renderedCamera());
    const a = document.createElement("a");
    a.download = `9-glenn-${quality.mode}-${settings.floor}.png`;
    a.href = renderer.domElement.toDataURL("image/png");
    a.click();
  }
  resize();
  update();
  preset();
  return {
    data,
    model,
    pivot,
    settings,
    renderer,
    scene,
    camera,
    tour,
    selection,
    quality,
    interaction,
    enterTour,
    exitTour,
    get transitioning() {
      return Boolean(transition);
    },
    orbit,
    update,
    preset,
    download,
    render,
    wallContains,
    activate(value) {
      active = value;
      if (!value) {
        interaction.pause();
        rotation.cancel();
        exitTour(false);
      }
      if (value) {
        resize();
        invalidate();
      }
    },
  };
}
async function route() {
  const touring = location.hash === "#tour";
  const enabled = location.hash === "#3d" || touring;
  const comparing = location.hash.startsWith("#compare/");
  const comparisonId = location.hash.slice(9);
  if (enabled && !instance) {
    $("#model-error").hidden = true;
    $("#model-error").textContent = "";
    try {
      initialization ??= init();
      instance = await initialization;
      window.Building3D.instance = instance;
      $("#model-error").hidden = true;
    } catch (error) {
      initialization = null;
      $("#model-error").hidden = false;
      $("#model-error").textContent = error.message;
      console.error(error);
    }
    // A route may have changed while the GPU was initializing.
    if (location.hash !== (touring ? "#tour" : "#3d")) return route();
  }
  instance?.activate(enabled);
  if (enabled) {
    if (touring) instance?.enterTour();
    else instance?.exitTour();
  }
  await triple.activate(comparing, comparisonId);
}
function boot() {
  triple = mountTripleView();
  $("#model-download").onclick = () => instance?.download();
  for (const b of document.querySelectorAll("[data-floor]"))
    b.onclick = () => {
      settings.floor = b.dataset.floor;
      for (const button of document.querySelectorAll("[data-floor]"))
        button.setAttribute("aria-pressed", String(button === b));
      instance?.update(true);
    };
  for (const key of [
    "roof",
    "landscape",
    "cut",
    "labels",
    "dimensions",
    "plans",
  ])
    $("#model-" + key).onchange = (e) => {
      settings[key] = e.target.checked;
      instance?.update();
    };
  $("#explode").oninput = (e) => {
    settings.explode = +e.target.value;
    instance?.update(true);
  };
  for (const b of document.querySelectorAll("[data-camera]"))
    b.onclick = () => instance?.preset(b.dataset.camera);
  $("#model-tour").onclick = () => {
    location.hash = "tour";
    instance?.enterTour();
    // Request capture in the button's user gesture so arrival flows directly
    // into walking. Direct URLs still offer a click-to-start panel.
    instance?.tour.capture();
  };
  $("#tour-exit").onclick = () => {
    location.hash = "3d";
  };
  $("#tour-reset").onclick = () => instance?.tour.reset();
  $("#model-reset").onclick = () => instance?.preset();
  document.addEventListener("keydown", (e) => {
    if (
      location.hash === "#3d" &&
      e.key.toLowerCase() === "r" &&
      !/INPUT|TEXTAREA/.test(e.target.tagName)
    )
      instance?.preset();
  });
}
window.Building3D = { parseBuilding, wallContains, activate: route };
boot();
