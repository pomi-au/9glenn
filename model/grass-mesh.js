import * as THREE from "three";

const BLADES_PER_CLUMP = 64;
const MAX_BEND = 1.15;
const ROOT_MARGIN = 0.14;
const GRID_SIZE = 0.75;
const STIFFNESS = 30;
const DAMPING = 4;

function random(seed) {
  let value = Math.imul(seed ^ 0x6d2b79f5, 1597334677);
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(area) / 2;
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}

function distanceToRing(x, z, ring) {
  let closest = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j];
    const dx = bx - ax,
      dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared
      ? THREE.MathUtils.clamp(
          ((x - ax) * dx + (z - az) * dz) / lengthSquared,
          0,
          1,
        )
      : 0;
    closest = Math.min(closest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return closest;
}

function clumpGeometry() {
  const positions = [],
    colors = [],
    indices = [];
  const rootColor = new THREE.Color(0x42652e);
  const tipColor = new THREE.Color(0x789344);
  const color = new THREE.Color();
  for (let blade = 0; blade < BLADES_PER_CLUMP; blade++) {
    const angle = random(blade + 7) * Math.PI * 2;
    const rootAngle = blade * 2.399963229728653;
    const rootRadius = Math.sqrt((blade + 0.5) / BLADES_PER_CLUMP) * 0.06;
    const rootX = Math.cos(rootAngle) * rootRadius;
    const rootZ = Math.sin(rootAngle) * rootRadius;
    const forwardX = Math.cos(angle),
      forwardZ = Math.sin(angle);
    const height = 0.2 + random(blade + 80) * 0.12;
    const lean = 0.02 + random(blade + 120) * 0.035;
    const width = 0.006 + random(blade + 171) * 0.005;
    const start = positions.length / 3;
    for (let segment = 0; segment <= 3; segment++) {
      const t = segment / 3;
      const halfWidth = width * 0.5 * (1 - t * t);
      color
        .copy(rootColor)
        .lerp(tipColor, t * 0.72)
        .multiplyScalar(0.88 + random(blade + 237) * 0.22);
      for (const side of [-1, 1]) {
        positions.push(
          rootX + forwardX * lean * t * t - forwardZ * halfWidth * side,
          height * t,
          rootZ + forwardZ * lean * t * t + forwardX * halfWidth * side,
        );
        colors.push(color.r, color.g, color.b);
      }
      if (segment < 3) {
        const a = start + segment * 2;
        indices.push(a, a + 1, a + 2);
        if (segment < 2) indices.push(a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

/** Instanced real grass. Input polygons are clipped multi-polygons in millimetres. */
export function createGrass({
  polygons,
  grade = () => 0,
  siteId = "lawn",
  name = "Grass",
  density = 160,
  maxClumps = 12000,
}) {
  const metres = polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([x, z]) => [x / 1000, z / 1000])),
  );
  const area = metres.reduce(
    (sum, polygon) =>
      sum +
      ringArea(polygon[0]) -
      polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0),
    0,
  );
  const limit = Math.min(12000, Math.max(0, Math.floor(maxClumps)));
  const step =
    Math.sqrt(Math.max(1 / Math.max(1, density), area / Math.max(1, limit))) *
    1.03;
  const roots = [],
    sizes = [],
    clearances = [],
    yaws = [],
    slopes = [];
  for (const polygon of metres) {
    const xs = polygon[0].map((p) => p[0]),
      zs = polygon[0].map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    for (
      let iz = Math.floor(minZ / step);
      iz <= Math.ceil(maxZ / step) && roots.length < limit;
      iz++
    ) {
      for (
        let ix = Math.floor(minX / step);
        ix <= Math.ceil(maxX / step) && roots.length < limit;
        ix++
      ) {
        const seed = Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663);
        const x = (ix + 0.5 + (random(seed) - 0.5) * 0.75) * step;
        const z = (iz + 0.5 + (random(seed + 17) - 0.5) * 0.75) * step;
        if (
          !inRing(x, z, polygon[0]) ||
          polygon.slice(1).some((ring) => inRing(x, z, ring))
        )
          continue;
        const clearance = Math.min(
          ...polygon.map((ring) => distanceToRing(x, z, ring)),
        );
        if (clearance < ROOT_MARGIN) continue;
        roots.push(new THREE.Vector3(x, grade(x * 1000, z * 1000) + 0.001, z));
        sizes.push(0.9 + random(seed + 81) * 0.1);
        clearances.push(clearance);
        yaws.push(random(seed + 122) * Math.PI * 2);
        slopes.push([
          (grade(x * 1000 + 1, z * 1000) - grade(x * 1000 - 1, z * 1000)) /
            0.002,
          (grade(x * 1000, z * 1000 + 1) - grade(x * 1000, z * 1000 - 1)) /
            0.002,
        ]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(
    clumpGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.88,
      side: THREE.DoubleSide,
    }),
    roots.length,
  );
  mesh.name = `${name} · individual grass blades`;
  mesh.userData = { kind: "grass", siteId, bladesPerClump: BLADES_PER_CLUMP };
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const bladePositions = mesh.geometry.attributes.position;
  let restRadius = 0,
    maxHeight = 0;
  for (let vertex = 0; vertex < bladePositions.count; vertex++) {
    restRadius = Math.max(
      restRadius,
      Math.hypot(bladePositions.getX(vertex), bladePositions.getZ(vertex)),
    );
    maxHeight = Math.max(maxHeight, bladePositions.getY(vertex));
  }
  const bendLimits = sizes.map((size, index) => {
    // Every point remains in a disk wholly inside the lawn. Near an edge, the
    // available clearance limits bending instead of leaving a wide bare border.
    const reach = Math.max(0, clearances[index] - restRadius * size - 0.003);
    const height = maxHeight * size;
    if (reach >= height) return MAX_BEND;
    return Math.min(
      MAX_BEND,
      reach / Math.sqrt(height * height - reach * reach),
    );
  });
  // Pointer hits use the existing broad lawn surface, avoiding thousands of tests.
  mesh.raycast = () => {};
  const bendX = new Float32Array(roots.length),
    bendZ = new Float32Array(roots.length);
  const velocityX = new Float32Array(roots.length),
    velocityZ = new Float32Array(roots.length);
  const active = new Set(),
    cells = new Map();
  const matrix = new THREE.Matrix4(),
    yaw = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0),
    scale = new THREE.Vector3();
  function writeInstance(index) {
    yaw.setFromAxisAngle(up, yaws[index]);
    matrix.compose(roots[index], yaw, scale.setScalar(sizes[index]));
    const m = matrix.elements;
    const [slopeX, slopeZ] = slopes[index];
    m[1] = slopeX * m[0] + slopeZ * m[2];
    m[9] = slopeX * m[8] + slopeZ * m[10];
    // Shear only the vertical basis: every distributed blade root (local y=0)
    // remains fixed on the graded soil while the upper blade bends in the stroke.
    const vertical = sizes[index] / Math.hypot(bendX[index], 1, bendZ[index]);
    m[4] = bendX[index] * vertical;
    m[6] = bendZ[index] * vertical;
    m[5] = vertical;
    mesh.setMatrixAt(index, matrix);
  }
  roots.forEach((root, index) => {
    writeInstance(index);
    const key = `${Math.floor(root.x / GRID_SIZE)},${Math.floor(root.z / GRID_SIZE)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
    const tone = 0.8 + random(index + 711) * 0.2;
    mesh.setColorAt(index, new THREE.Color(tone, 0.9 + tone * 0.1, tone));
  });
  mesh.instanceMatrix.needsUpdate = true;
  // A conservative fixed bound covers every allowed bend without per-frame scans.
  mesh.boundingBox = new THREE.Box3().setFromPoints(roots).expandByScalar(0.45);
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());

  function impulse({ point, velocity, radius = 0.75, dt = 1 / 60 }) {
    if (
      !point ||
      !velocity ||
      ![point.x, point.z, velocity.x, velocity.z, radius, dt].every(
        Number.isFinite,
      )
    )
      return 0;
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 0.001 || dt <= 0) return 0;
    radius = THREE.MathUtils.clamp(radius, 0.1, 2);
    const force = Math.min(1, 12 / speed) * Math.min(dt, 0.05) * 80;
    let affected = 0;
    for (
      let z = Math.floor((point.z - radius) / GRID_SIZE);
      z <= Math.floor((point.z + radius) / GRID_SIZE);
      z++
    ) {
      for (
        let x = Math.floor((point.x - radius) / GRID_SIZE);
        x <= Math.floor((point.x + radius) / GRID_SIZE);
        x++
      ) {
        for (const index of cells.get(`${x},${z}`) || []) {
          const distance = Math.hypot(
            roots[index].x - point.x,
            roots[index].z - point.z,
          );
          if (distance >= radius) continue;
          const falloff = 1 - distance / radius;
          velocityX[index] += velocity.x * force * falloff;
          velocityZ[index] += velocity.z * force * falloff;
          const angularSpeed = Math.hypot(velocityX[index], velocityZ[index]);
          if (angularSpeed > 10) {
            velocityX[index] *= 10 / angularSpeed;
            velocityZ[index] *= 10 / angularSpeed;
          }
          active.add(index);
          affected++;
        }
      }
    }
    return affected;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !active.size) return active.size > 0;
    const elapsed = Math.min(dt, 0.05),
      steps = Math.ceil(elapsed * 120),
      h = elapsed / steps;
    for (const index of active) {
      for (let step = 0; step < steps; step++) {
        velocityX[index] +=
          (-STIFFNESS * bendX[index] - DAMPING * velocityX[index]) * h;
        velocityZ[index] +=
          (-STIFFNESS * bendZ[index] - DAMPING * velocityZ[index]) * h;
        bendX[index] += velocityX[index] * h;
        bendZ[index] += velocityZ[index] * h;
        const bend = Math.hypot(bendX[index], bendZ[index]);
        if (bend > bendLimits[index]) {
          bendX[index] *= bendLimits[index] / bend;
          bendZ[index] *= bendLimits[index] / bend;
          velocityX[index] = velocityZ[index] = 0;
        }
      }
      if (
        Math.hypot(bendX[index], bendZ[index]) < 0.00005 &&
        Math.hypot(velocityX[index], velocityZ[index]) < 0.0001
      ) {
        bendX[index] = bendZ[index] = velocityX[index] = velocityZ[index] = 0;
        active.delete(index);
      }
      writeInstance(index);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return active.size > 0;
  }

  function reset() {
    for (const index of active) {
      bendX[index] = bendZ[index] = velocityX[index] = velocityZ[index] = 0;
      writeInstance(index);
    }
    active.clear();
    mesh.instanceMatrix.needsUpdate = true;
  }

  function diagnostics() {
    let energy = 0,
      maxBend = 0;
    for (const index of active) {
      const squaredBend = bendX[index] ** 2 + bendZ[index] ** 2;
      energy +=
        (velocityX[index] ** 2 +
          velocityZ[index] ** 2 +
          STIFFNESS * squaredBend) /
        2;
      maxBend = Math.max(maxBend, Math.sqrt(squaredBend));
    }
    const sampleIndices = [
      ...new Set(
        [0, 0.25, 0.5, 0.75, 1].map((t) => Math.floor(t * (roots.length - 1))),
      ),
    ];
    return {
      clumps: roots.length,
      blades: roots.length * BLADES_PER_CLUMP,
      moving: active.size > 0,
      activeClumps: active.size,
      maxBend,
      energy,
      rootMargin: ROOT_MARGIN,
      maxAllowedBend: MAX_BEND,
      bladeHeightRange: [0.18, 0.32],
      sampleRoots: sampleIndices
        .filter((index) => index >= 0 && index < roots.length)
        .map((index) => roots[index].toArray()),
    };
  }
  return { mesh, targets: [], impulse, update, reset, diagnostics };
}
