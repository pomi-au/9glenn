import * as THREE from "three";
import { EYE_HEIGHT, tourNavigation } from "./tour-navigation.js";

const REACH = 2.5;
const SPEED = 2.1;
const SWIM_SPEED = 1.2;
const LOOK_SPEED = 0.002;
const MOVEMENT = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

export function tourControls({
  model,
  element,
  onChange,
  onExit,
  onTargetChange,
}) {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.04, 120);
  camera.rotation.order = "YXZ";
  const illumination = new THREE.Group();
  illumination.name = "tour-illumination";
  const beam = new THREE.SpotLight(0xfff2df, 24, 10, Math.PI / 3, 0.8, 1.4);
  beam.name = "tour-beam";
  beam.position.set(0, 0.12, 0.08);
  beam.target.position.set(0, -0.12, -4);
  const fill = new THREE.PointLight(0xfff6e9, 2.5, 4, 1.5);
  fill.name = "tour-fill";
  illumination.add(beam, beam.target, fill);
  camera.add(illumination);
  function setIllumination(amount) {
    const strength = THREE.MathUtils.clamp(amount, 0, 1);
    illumination.visible = strength > 0;
    beam.intensity = 24 * strength;
    fill.intensity = 2.5 * strength;
  }
  setIllumination(0);
  const hud = document.querySelector("#tour-hud");
  const instructions = hud.querySelector(".tour-instructions");
  const walkingInstructions = instructions.textContent;
  const waterStatus = document.createElement("div");
  waterStatus.className = "tour-water-status";
  waterStatus.hidden = true;
  hud.append(waterStatus);
  let waterTransition = false;
  let displayedMovementMode;
  function updateWaterStatus() {
    const mode = navigation?.mode ?? "walking";
    if (mode === displayedMovementMode) return;
    displayedMovementMode = mode;
    waterStatus.hidden = mode === "walking";
    waterStatus.textContent =
      mode === "swimming"
        ? "Swimming · Use either rounded entry to get out"
        : "Wading · Pool entry";
    instructions.textContent =
      mode === "swimming"
        ? "WASD · Swim   Mouse · Look   Esc · Pause"
        : walkingInstructions;
  }
  const pausePanel = document.querySelector("#tour-pause");
  const message = document.querySelector("#tour-message");
  const prompt = document.querySelector("#tour-prompt");
  const crosshair = document.querySelector("#tour-crosshair");
  const keys = new Set();
  const ray = new THREE.Raycaster();
  ray.far = REACH;
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const displacement = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let captureRequested = false;
  let enabled = false,
    navigation,
    previousTime,
    target = null;
  const locked = () => enabled && document.pointerLockElement === element;

  function clearTarget() {
    onTargetChange(null);
    target = null;
    crosshair.classList.remove("has-target");
    prompt.hidden = true;
  }
  function aim() {
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(), camera);
    const hit = ray
      .intersectObjects(model.pickables, false)
      .find(({ object }) => {
        for (let p = object; p; p = p.parent) if (!p.visible) return false;
        return true;
      });
    const key = hit?.object.userData.doorKey ?? null;
    if (key !== target) {
      clearTarget();
      target = key;
      onTargetChange(key);
    }
    crosshair.classList.toggle("has-target", Boolean(target));
    prompt.hidden = !target;
    if (target) {
      const name = hit.object.userData.name;
      const label = `Click to ${model.doors.get(target).open ? "close" : "open"} · ${name}`;
      if (prompt.textContent !== label) prompt.textContent = label;
    }
  }
  function pause() {
    captureRequested = false;
    keys.clear();
    previousTime = undefined;
    clearTarget();
    if (document.pointerLockElement === element) document.exitPointerLock();
    if (enabled) {
      pausePanel.hidden = false;
      crosshair.hidden = true;
      message.textContent =
        "WASD to walk or swim · Mouse to look · Click a highlighted door to open or close.";
    }
    onChange();
  }
  function lockFailed() {
    if (!enabled || locked()) return;
    pause();
    message.textContent =
      "Mouse control could not start. Click Resume tour to try again in a desktop browser.";
  }
  function resume(allowInactive = false) {
    if ((!enabled && !allowInactive) || document.pointerLockElement === element)
      return;
    try {
      if (!element.requestPointerLock) return lockFailed();
      const request = element.requestPointerLock();
      request?.catch(lockFailed);
    } catch {
      lockFailed();
    }
  }
  document.addEventListener("pointerlockchange", () => {
    if (
      !enabled &&
      !captureRequested &&
      document.pointerLockElement === element
    ) {
      document.exitPointerLock();
      return;
    }
    keys.clear();
    previousTime = undefined;
    if (locked()) {
      pausePanel.hidden = true;
      crosshair.hidden = false;
      element.focus({ preventScroll: true });
      onChange();
    } else if (enabled) pause();
  });
  document.addEventListener("pointerlockerror", lockFailed);
  document.addEventListener("mousemove", (event) => {
    if (!locked()) return;
    camera.rotation.y -= event.movementX * LOOK_SPEED;
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x - event.movementY * LOOK_SPEED,
      -Math.PI / 2 + 0.03,
      Math.PI / 2 - 0.03,
    );
    onChange();
  });
  document.addEventListener("keydown", (event) => {
    if (
      !locked() ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
      event.target.isContentEditable
    )
      return;
    if (MOVEMENT.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === "Escape") pause();
  });
  document.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => {
    if (enabled || captureRequested) pause();
  });
  document.addEventListener("visibilitychange", () => {
    if ((enabled || captureRequested) && document.hidden) pause();
  });
  element.addEventListener("click", (event) => {
    if (!enabled || event.button !== 0) return;
    if (!locked()) return resume();
    model.root.updateWorldMatrix(true, true);
    aim();
    if (target) {
      model.toggleDoor(target);
      aim();
      onChange();
    }
  });
  document.querySelector("#tour-resume").onclick = () => resume();
  document.querySelector("#tour-pause-exit").onclick = onExit;

  function reset() {
    const door = model.doors.get("ground:front-entry-a");
    const mesh = model.pickables.find(
      (m) => m.userData.doorKey === "ground:front-entry-a",
    );
    // Use the canonical closed leaf centre even when this door is already open.
    mesh.geometry.computeBoundingBox();
    const centre = mesh.geometry.boundingBox
      .getCenter(new THREE.Vector3())
      .add(mesh.position);
    centre.applyAxisAngle(up, door.closedAngle).add(door.leaf.position);
    door.leaf.parent.localToWorld(centre);
    camera.position.set(
      centre.x,
      centre.y - mesh.position.y + EYE_HEIGHT,
      centre.z + 1.35,
    );
    navigation?.reset();
    waterTransition = false;
    updateWaterStatus();
    const floor = navigation?.support(camera.position);
    if (floor !== undefined) camera.position.y = floor + EYE_HEIGHT;
    camera.rotation.set(0, 0, 0, "YXZ");
    keys.clear();
    previousTime = undefined;
    clearTarget();
    onChange();
  }
  return {
    camera,
    setIllumination,
    get enabled() {
      return enabled;
    },
    get movementMode() {
      return navigation?.mode ?? "walking";
    },
    get locked() {
      return locked();
    },
    get target() {
      return target;
    },
    reset,
    pause,
    capture() {
      captureRequested = true;
      resume(true);
    },
    enter() {
      enabled = true;
      setIllumination(1);
      captureRequested = false;
      navigation = tourNavigation(model);
      hud.hidden = false;
      reset();
      if (locked()) {
        pausePanel.hidden = true;
        crosshair.hidden = false;
        element.focus({ preventScroll: true });
      } else pause();
    },
    exit() {
      enabled = false;
      setIllumination(0);
      pause();
      hud.hidden = true;
      navigation = undefined;
      waterTransition = false;
      updateWaterStatus();
    },
    update(now) {
      if (!enabled) return;
      const delta =
        previousTime === undefined
          ? 0
          : THREE.MathUtils.clamp((now - previousTime) / 1000, 0, 0.05);
      previousTime = now;
      if (!locked()) return;
      const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
      const sideways = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
      if (
        forward ||
        sideways ||
        navigation.mode !== "walking" ||
        waterTransition
      ) {
        direction.set(
          -Math.sin(camera.rotation.y),
          0,
          -Math.cos(camera.rotation.y),
        );
        right.crossVectors(direction, up);
        displacement
          .copy(direction)
          .multiplyScalar(forward)
          .addScaledVector(right, sideways)
          .normalize()
          .multiplyScalar(
            (navigation.mode === "swimming" ? SWIM_SPEED : SPEED) * delta,
          );
        const previousY = camera.position.y;
        const previousMode = navigation.mode;
        navigation.move(camera.position, displacement);
        if (previousMode !== "walking" || navigation.mode !== "walking")
          waterTransition = true;
        if (waterTransition) {
          const targetY = camera.position.y;
          camera.position.y = THREE.MathUtils.damp(
            previousY,
            targetY,
            9,
            delta,
          );
          if (Math.abs(camera.position.y - targetY) < 0.005) {
            camera.position.y = targetY;
            waterTransition = false;
          }
        }
        updateWaterStatus();
      }
      aim();
    },
  };
}
