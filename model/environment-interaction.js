import * as THREE from "three";
import { createPointerInteraction } from "./pointer-interaction.js";
import { textureHitVisible } from "./texture-hit.js";

function visible(object) {
  for (let current = object; current; current = current.parent)
    if (!current.visible) return false;
  return true;
}

/** Scene-local physical motion shared by WebGPU preview and Photo snapshots. */
export function environmentInteraction({
  model,
  element,
  getCamera,
  getSignature,
  isEnabled,
  isFrozen = () => false,
  invalidate,
}) {
  const controllers = model.environmentControllers;
  const owners = new Map();
  for (const controller of controllers) {
    for (const mesh of controller.targets) owners.set(mesh, controller);
  }
  // Grass blades are intentionally absent: their already-clipped lawn surfaces
  // are the interaction targets, keeping pointer work independent of blade count.
  const candidates = [...new Set([...model.pickables, ...owners.keys()])];
  const inverse = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const start = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let lastTime = null;
  let moving = false;
  let revision = 0;
  let candidateCount = 0;
  const pointer = createPointerInteraction({
    element,
    getCamera,
    getSignature,
    isEnabled,
    invalidate,
    resolveHit(raycaster) {
      model.root.updateWorldMatrix(true, true);
      const objects = candidates.filter(
        (object) =>
          visible(object) &&
          object.material &&
          [object.material]
            .flat()
            .some((material) => material.visible !== false),
      );
      candidateCount = objects.length;
      const hits = raycaster.intersectObjects(objects, false);
      for (const hit of hits) {
        if (!textureHitVisible(hit)) continue;
        let clipped = false;
        for (let parent = hit.object.parent; parent; parent = parent.parent) {
          if (
            parent.isClippingGroup &&
            parent.enabled &&
            parent.clippingPlanes.some(
              (plane) => plane.distanceToPoint(hit.point) < 0,
            )
          ) {
            clipped = true;
            break;
          }
        }
        if (clipped) continue;
        const owner = owners.get(hit.object);
        // The nearest building surface stops the stroke, even when a
        // grass/leaf/water target exists further down the ray.
        if (!owner || isFrozen(owner)) return null;
        const normal = hit.face
          ? hit.face.normal
              .clone()
              .applyNormalMatrix(
                normalMatrix.getNormalMatrix(hit.object.matrixWorld),
              )
          : null;
        return {
          controller: owner,
          point: hit.point,
          object: hit.object,
          instanceId: hit.instanceId,
          normal,
        };
      }
      return null;
    },
    onImpulse({
      controller,
      point: worldPoint,
      previousPoint,
      velocity: worldVelocity,
      instanceId,
      dt,
    }) {
      controller.group.updateWorldMatrix(true, false);
      inverse.copy(controller.group.matrixWorld).invert();
      point.copy(worldPoint).applyMatrix4(inverse);
      start.copy(previousPoint).applyMatrix4(inverse);
      velocity
        .copy(worldPoint)
        .add(worldVelocity)
        .applyMatrix4(inverse)
        .sub(point);
      const radius = controller.kind === "water" ? 0.55 : 1.0;
      const steps = Math.min(
        12,
        Math.max(1, Math.ceil(start.distanceTo(point) / (radius * 0.65))),
      );
      let affected = 0;
      for (let i = 1; i <= steps; i++) {
        const sample = start.clone().lerp(point, i / steps);
        affected +=
          Number(
            controller.impulse({
              point: sample,
              velocity,
              radius,
              instanceId,
              dt: dt / steps,
            }),
          ) || 0;
      }
      if (affected) {
        moving = true;
        revision++;
      }
      return affected;
    },
  });
  return {
    controllers,
    get diagnostics() {
      return {
        revision,
        moving,
        pointer: {
          ...pointer.diagnostics,
          candidateCount,
          targetCount: owners.size,
          grassMeshIsTarget: controllers
            .filter((c) => c.kind === "grass")
            .some((c) => owners.has(c.mesh)),
        },
        controllers: controllers.map((controller) => ({
          kind: controller.kind,
          id: controller.id,
          visible: visible(controller.group),
          ...(typeof controller.diagnostics === "function"
            ? controller.diagnostics()
            : controller.diagnostics),
        })),
      };
    },
    reset() {
      pointer.reset();
      for (const controller of controllers) controller.reset();
      moving = false;
      lastTime = null;
      revision++;
      invalidate();
    },
    pause() {
      pointer.reset();
      lastTime = null;
    },
    step(now) {
      const dt =
        lastTime === null
          ? 1 / 60
          : THREE.MathUtils.clamp((now - lastTime) / 1000, 0, 1 / 20);
      lastTime = now;
      const affected = pointer.process();
      const wasMoving = moving;
      moving = false;
      for (const controller of controllers) {
        if (visible(controller.group) && !isFrozen(controller))
          moving = controller.update(dt) || moving;
      }
      const changed = Boolean(affected || wasMoving || moving);
      if (changed) revision++;
      return { moving, changed };
    },
    dispose() {
      pointer.dispose();
      controllers.forEach((controller) => controller.dispose?.());
    },
  };
}
