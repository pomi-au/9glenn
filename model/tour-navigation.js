import * as THREE from "three";
import { Octree } from "three/addons/math/Octree.js";
import { Capsule } from "three/addons/math/Capsule.js";

export const EYE_HEIGHT = 1.65;
const RADIUS = 0.18;
const STEP = 0.24;
const MAX_DROP = 0.3;
const FOOT_CLEARANCE = { walking: STEP, wading: 0.4, swimming: 0 };

// Cache world-space triangles and reject distant meshes with their bounds.
// Large architectural slabs span many spatial cells; a per-mesh broad phase
// avoids duplicating those triangles across a deeply subdivided world index.
function collidersFor(meshes) {
  return meshes.map((mesh) => {
    const geometry = mesh.geometry;
    const vertices = geometry.attributes.position;
    const indices = geometry.index;
    const count = indices ? indices.count : vertices.count;
    const triangles = [];
    const point = (i) =>
      new THREE.Vector3()
        .fromBufferAttribute(vertices, indices ? indices.getX(i) : i)
        .applyMatrix4(mesh.matrixWorld);
    for (let i = 0; i < count; i += 3)
      triangles.push(new THREE.Triangle(point(i), point(i + 1), point(i + 2)));
    geometry.computeBoundingBox();
    return {
      bounds: geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      triangles,
    };
  });
}

export function tourNavigation(model) {
  model.root.updateWorldMatrix(true, true);
  const surfaces = model.pickables.filter(
    (mesh) =>
      ["slab", "room", "finish", "stair"].includes(mesh.userData.kind) ||
      mesh.userData.walkable === true ||
      (mesh.userData.kind === "pool" &&
        ["stone paving", "coping"].includes(mesh.userData.part)),
  );
  const solids = model.pickables.filter((mesh) =>
    [
      "slab",
      "wall",
      "window",
      "stair",
      "guard",
      "fixture",
      "furniture",
      "shower-screen",
      "pilaster",
      "cornice",
    ].includes(mesh.userData.kind),
  );
  const poolMeshes = model.pickables.filter(
    (mesh) => mesh.userData.kind === "pool",
  );
  const pools = poolMeshes
    .filter((mesh) => mesh.userData.part === "water")
    .map((water) => ({
      water,
      level: Number.isFinite(water.userData.restWaterLevel)
        ? water.localToWorld(
            new THREE.Vector3(0, water.userData.restWaterLevel, 0),
          ).y
        : new THREE.Box3().setFromObject(water).max.y,
      bottoms: poolMeshes.filter(
        (mesh) =>
          mesh.userData.poolId === water.userData.poolId &&
          (mesh.userData.part === "basin floor" ||
            mesh.userData.part.startsWith("entry step")),
      ),
    }));
  const poolSolids = poolMeshes.filter(
    (mesh) =>
      ["basin shell", "basin lining", "fountain pedestal"].includes(
        mesh.userData.part,
      ) ||
      (mesh.userData.part.startsWith("fountain") && mesh.castShadow),
  );
  const world = collidersFor([...solids, ...poolSolids]);
  const triangleTester = new Octree();
  const doorColliders = [...model.doors].map(([key, door]) => ({
    door,
    meshes: model.pickables.filter((mesh) => mesh.userData.doorKey === key),
    angle: NaN,
    colliders: [],
  }));
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const capsule = new Capsule();
  const candidate = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let mode = "walking";
  let supportHeight;
  let lastPosition;

  function poolState(position) {
    for (const pool of pools) {
      ray.set(
        new THREE.Vector3(position.x, pool.level + 0.5, position.z),
        down,
      );
      ray.far = 10;
      if (!ray.intersectObject(pool.water, false).length) continue;
      const bottom = ray
        .intersectObjects(pool.bottoms, false)
        .find(
          (hit) =>
            hit.face &&
            normal
              .copy(hit.face.normal)
              .transformDirection(hit.object.matrixWorld).y > 0.6,
        );
      if (!bottom) continue;
      const swimming = pool.level - bottom.point.y > 0.5;
      return {
        mode: swimming ? "swimming" : "wading",
        floor: bottom.point.y,
        eye: swimming ? pool.level + 0.22 : bottom.point.y + EYE_HEIGHT,
      };
    }
    return null;
  }

  function syncDoors() {
    for (const entry of doorColliders) {
      if (entry.angle === entry.door.leaf.rotation.y) continue;
      entry.door.leaf.updateWorldMatrix(true, true);
      entry.colliders = collidersFor(entry.meshes);
      entry.angle = entry.door.leaf.rotation.y;
    }
  }
  function support(
    position,
    feet = position.y - EYE_HEIGHT,
    maxStep = STEP,
    maxDrop = MAX_DROP,
  ) {
    ray.set(
      new THREE.Vector3(position.x, feet + maxStep + 0.01, position.z),
      down,
    );
    ray.far = maxStep + maxDrop + 0.02;
    const hit = ray
      .intersectObjects(surfaces, false)
      .find(
        (h) =>
          h.face &&
          normal.copy(h.face.normal).transformDirection(h.object.matrixWorld)
            .y > 0.6,
      );
    return hit?.point.y;
  }
  function blocked(position, state) {
    const swimming = state.mode === "swimming";
    const feet = swimming ? position.y - 0.6 : state.floor;
    // Lift the lower cap past one stair riser; the support ray decides which
    // heights are actually reachable and prevents stepping out over voids.
    capsule.start.set(
      position.x,
      feet + FOOT_CLEARANCE[state.mode] + RADIUS,
      position.z,
    );
    capsule.end.set(position.x, position.y - RADIUS + 0.08, position.z);
    capsule.radius = RADIUS;
    function intersects({ bounds, triangles }) {
      return (
        capsule.intersectsBox(bounds) &&
        triangles.some((triangle) =>
          triangleTester.triangleCapsuleIntersect(capsule, triangle),
        )
      );
    }
    if (world.some(intersects)) return true;
    return doorColliders.some(({ colliders }) => colliders.some(intersects));
  }
  function tryStep(position, dx, dz) {
    candidate.copy(position);
    candidate.x += dx;
    candidate.z += dz;
    let state = poolState(candidate);
    if (!state) {
      // Get out using a shallow entry platform; a deep pool wall is not a step.
      if (mode === "swimming") return false;
      const height = support(
        candidate,
        supportHeight,
        mode === "wading" ? 0.4 : STEP,
      );
      if (height === undefined) return false;
      state = { mode: "walking", floor: height, eye: height + EYE_HEIGHT };
    }
    candidate.y = state.eye;
    if (blocked(candidate, state)) return false;
    position.copy(candidate);
    mode = state.mode;
    supportHeight = state.floor;
    return true;
  }
  return {
    support,
    get mode() {
      return mode;
    },
    reset() {
      mode = "walking";
      lastPosition = undefined;
      supportHeight = undefined;
    },
    move(position, displacement) {
      if (
        !lastPosition ||
        Math.hypot(position.x - lastPosition.x, position.z - lastPosition.z) >
          0.0001
      ) {
        mode = "walking";
        supportHeight = position.y - EYE_HEIGHT;
      }
      syncDoors();
      const steps = Math.max(1, Math.ceil(displacement.length() / 0.045));
      const dx = displacement.x / steps,
        dz = displacement.z / steps;
      for (let i = 0; i < steps; i++) {
        if (!tryStep(position, dx, dz)) {
          // Resolve axes independently so walking into a wall slides along it.
          if (dx) tryStep(position, dx, 0);
          if (dz) tryStep(position, 0, dz);
        }
      }
      lastPosition = position.clone();
    },
  };
}
