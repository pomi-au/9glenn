import * as THREE from "three";

/** Samples contain { point: Vector3 in world metres, time: milliseconds }.
 * A stale/first/stationary sample has no force; velocity is bounded in m/s. */
export function pointerStroke(previous, current, maxSpeed = 8) {
  if (!previous || !current) return null;
  const dt = (current.time - previous.time) / 1000;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.2) return null;
  const velocity = current.point.clone().sub(previous.point);
  if (![velocity.x, velocity.y, velocity.z].every(Number.isFinite)) return null;
  if (velocity.lengthSq() < 1e-10) return null;
  velocity.divideScalar(Math.max(dt, 0.001)).clampLength(0, maxSpeed);
  return { velocity, dt };
}

/** Pointer events only queue work. A frame processes at most one scene raycast. */
export function createPointerInteraction({
  element,
  getCamera,
  getSignature,
  isEnabled,
  resolveHit,
  onImpulse,
  invalidate,
}) {
  const raycaster = new THREE.Raycaster();
  const previousRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const normal = new THREE.Vector3();
  const plane = new THREE.Plane();
  let pending = null;
  let previous = null;
  const state = {
    impulses: 0,
    raycasts: 0,
    lastTarget: null,
    lastVelocity: [0, 0, 0],
    speed: 0,
  };
  function reset() {
    pending = previous = null;
    state.lastTarget = null;
    state.lastVelocity = [0, 0, 0];
    state.speed = 0;
  }
  function move(event) {
    if (
      event.target !== element ||
      (event.pointerType && event.pointerType !== "mouse") ||
      event.buttons ||
      !isEnabled()
    ) {
      reset();
      return;
    }
    pending = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp || performance.now(),
    };
    invalidate();
  }
  function setRay(ray, point, camera, rect) {
    ndc.set(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      1 - ((point.y - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(ndc, camera);
  }
  const listeners = {
    pointermove: move,
    pointerleave: reset,
    pointercancel: reset,
    pointerdown: reset,
    lostpointercapture: reset,
  };
  for (const [name, listener] of Object.entries(listeners))
    element.addEventListener(name, listener);
  return {
    get diagnostics() {
      return {
        ...state,
        lastVelocity: [...state.lastVelocity],
        pending: Boolean(pending),
      };
    },
    reset,
    process() {
      if (!pending) return 0;
      const current = pending;
      pending = null;
      if (!isEnabled()) {
        reset();
        return 0;
      }
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        current.x < rect.left ||
        current.x > rect.right ||
        current.y < rect.top ||
        current.y > rect.bottom
      ) {
        reset();
        return 0;
      }
      const camera = getCamera();
      camera.updateMatrixWorld();
      const signature = getSignature();
      setRay(raycaster, current, camera, rect);
      state.raycasts++;
      const hit = resolveHit(raycaster);
      if (!hit) {
        reset();
        return 0;
      }
      const controller = hit.controller;
      state.lastTarget = controller.id;
      state.lastVelocity = [0, 0, 0];
      state.speed = 0;
      const sample = { ...current, controller, signature };
      if (
        !previous ||
        previous.controller !== controller ||
        previous.signature !== signature
      ) {
        previous = sample;
        return 0;
      }
      // Project both mouse positions onto one plane, avoiding false velocities
      // when a ray moves between leaf cards at different depths in a crown.
      if (controller.kind === "foliage") camera.getWorldDirection(normal);
      else if (hit.normal) normal.copy(hit.normal);
      else normal.set(0, 1, 0).transformDirection(controller.group.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, hit.point);
      setRay(previousRay, previous, camera, rect);
      const origin = previousRay.ray.intersectPlane(plane, new THREE.Vector3());
      const stroke =
        origin &&
        pointerStroke(
          { point: origin, time: previous.time },
          { point: hit.point, time: current.time },
        );
      previous = sample;
      if (!stroke) return 0;
      state.lastVelocity = stroke.velocity.toArray();
      state.speed = stroke.velocity.length();
      const affected =
        onImpulse({
          controller,
          point: hit.point,
          instanceId: hit.instanceId,
          previousPoint: origin,
          ...stroke,
        }) || 0;
      if (affected) state.impulses++;
      return affected;
    },
    dispose() {
      reset();
      for (const [name, listener] of Object.entries(listeners))
        element.removeEventListener(name, listener);
    },
  };
}
