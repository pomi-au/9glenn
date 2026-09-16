import * as THREE from "three";

// Reference viewer: maxPolarAngle = PI * .485, azimuth unrestricted.
// Apply equivalent view bounds to the object while the real camera stays fixed.
const MIN_ELEVATION = Math.PI * (0.5 - 0.485);
const MAX_ELEVATION = Math.PI / 2 - 0.000001;

export function modelRotation(element, pivot, camera, onChange) {
  const pointers = new Map();
  const yaw = new THREE.Quaternion();
  const pitch = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const view = new THREE.Vector3();
  let enabled = true;
  let dragged = false;
  let azimuth = 0;
  let baseElevation = 0;
  let elevation = 0;

  function reset() {
    pointers.clear();
    azimuth = 0;
    view.set(0, 0, 1).applyQuaternion(camera.quaternion);
    baseElevation = Math.asin(THREE.MathUtils.clamp(view.y, -1, 1));
    elevation = baseElevation;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    pivot.quaternion.identity();
  }
  reset();

  element.addEventListener("pointerdown", (event) => {
    if (!enabled) return;
    if (
      event.pointerType !== "touch" &&
      (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey)
    )
      return;
    if (pointers.size === 0) dragged = false;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x,
      dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointers.size !== 1) {
      dragged = true;
      return;
    }
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 4)
      dragged = true;
    if (!dragged || (!dx && !dy)) return;
    const scale = (Math.PI * 2) / Math.max(element.clientHeight, 1);
    azimuth = (azimuth + dx * scale) % (Math.PI * 2);
    elevation = THREE.MathUtils.clamp(
      elevation + dy * scale,
      MIN_ELEVATION,
      MAX_ELEVATION,
    );
    yaw.setFromAxisAngle(up, azimuth);
    pitch.setFromAxisAngle(right, elevation - baseElevation);
    // Recompose independent yaw and pitch so repeated drags cannot add roll.
    pivot.quaternion.copy(pitch).multiply(yaw);
    onChange();
  });
  function release(event) {
    pointers.delete(event.pointerId);
  }
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
  return {
    set enabled(value) {
      enabled = value;
      if (!value) pointers.clear();
    },
    reset,
    wasDragged: () => dragged,
    cancel: () => pointers.clear(),
  };
}
