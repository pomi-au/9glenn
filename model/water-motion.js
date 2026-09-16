import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  ShapeUtils,
  Vector2,
  DynamicDrawUsage,
} from "three";
import clipping from "polygon-clipping";

const MAX_WAVE_HEIGHT = 0.06;

function boundaryDistance(x, z, ring) {
  let nearest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
    nearest = Math.min(
      nearest,
      Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz),
    );
  }
  return nearest;
}
function inside(x, z, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}

/** Closed, footprint-clipped volume with a damped finite-difference wave field. */
export function createWaterMotion({
  group,
  footprint,
  top,
  bottom,
  material,
  metadata = {},
  tag = () => {},
}) {
  const ring = footprint.map((p) => [p[0], p[1]]);
  const minX = Math.min(...ring.map((p) => p[0])),
    maxX = Math.max(...ring.map((p) => p[0]));
  const minZ = Math.min(...ring.map((p) => p[1])),
    maxZ = Math.max(...ring.map((p) => p[1]));
  const nx = Math.min(
    maxX - minX > maxZ - minZ ? 128 : 64,
    Math.max(2, Math.ceil((maxX - minX) / 0.11)),
  );
  const nz = Math.min(
    maxX - minX > maxZ - minZ ? 64 : 128,
    Math.max(2, Math.ceil((maxZ - minZ) / 0.11)),
  );
  const dx = (maxX - minX) / nx,
    dz = (maxZ - minZ) / nz;
  const stride = nx + 1,
    count = stride * (nz + 1);
  const heights = new Float64Array(count),
    velocities = new Float64Array(count);
  const nextVelocity = new Float64Array(count),
    mask = new Uint8Array(count),
    damping = new Float64Array(count);
  const fieldWeights = new Float64Array(count);
  for (let z = 1; z < nz; z++)
    for (let x = 1; x < nx; x++) {
      const px = minX + x * dx,
        pz = minZ + z * dz,
        i = z * stride + x;
      const distance = boundaryDistance(px, pz, ring);
      mask[i] = inside(px, pz, ring) && distance > 1e-6 ? 1 : 0;
      damping[i] = 0.65 + 3.5 * Math.exp(-distance / 0.24);
    }
  const points = [],
    indices = [],
    cellTriangles = Array.from({ length: nx * nz }, () => []),
    pointMap = new Map();
  function vertex(x, z) {
    const key = `${Math.round(x * 1e7)},${Math.round(z * 1e7)}`;
    if (!pointMap.has(key)) {
      pointMap.set(key, points.length);
      points.push([x, z]);
    }
    return pointMap.get(key);
  }
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const x0 = minX + x * dx,
        x1 = minX + (x + 1) * dx;
      const z0 = minZ + z * dz,
        z1 = minZ + (z + 1) * dz;
      const polygons = clipping.intersection(
        [ring],
        [
          [
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
          ],
        ],
      );
      for (const polygon of polygons) {
        const contour = polygon[0].slice(0, -1).map((p) => new Vector2(...p));
        if (contour.length < 3) continue;
        const ids = contour.map((p) => vertex(p.x, p.y));
        for (const face of ShapeUtils.triangulateShape(contour, [])) {
          const triangle = [ids[face[0]], ids[face[2]], ids[face[1]]];
          indices.push(...triangle);
          cellTriangles[z * nx + x].push(triangle);
        }
      }
    }
  const surfaceCount = points.length;
  const surfaceIndices = indices.slice();
  const areas = new Float64Array(surfaceCount);
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3),
      pa = points[a],
      pb = points[b],
      pc = points[c];
    const area =
      Math.abs(
        (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]),
      ) / 6;
    areas[a] += area;
    areas[b] += area;
    areas[c] += area;
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a, b]);
    }
  }
  const samples = points.map(([x, z], index) => {
    const gx = Math.min(nx - 1e-8, Math.max(0, (x - minX) / dx));
    const gz = Math.min(nz - 1e-8, Math.max(0, (z - minZ) / dz));
    const ix = Math.floor(gx),
      iz = Math.floor(gz),
      fx = gx - ix,
      fz = gz - iz;
    const ids = [
      iz * stride + ix,
      iz * stride + ix + 1,
      (iz + 1) * stride + ix,
      (iz + 1) * stride + ix + 1,
    ];
    const weights = [
      (1 - fx) * (1 - fz),
      fx * (1 - fz),
      (1 - fx) * fz,
      fx * fz,
    ];
    const boundary = boundaryDistance(x, z, ring) < 1e-6;
    for (let n = 0; n < 4; n++) {
      if (boundary) weights[n] = 0;
      fieldWeights[ids[n]] += weights[n] * areas[index];
    }
    return { ids, weights, boundary };
  });
  const boundaryCount = samples.reduce(
    (count, sample) => count + Number(sample.boundary),
    0,
  );
  for (let i = 0; i < surfaceIndices.length; i += 3)
    indices.push(
      surfaceIndices[i] + surfaceCount,
      surfaceIndices[i + 2] + surfaceCount,
      surfaceIndices[i + 1] + surfaceCount,
    );
  for (const [a, b] of edges.values())
    indices.push(a, a + surfaceCount, b + surfaceCount, a, b + surfaceCount, b);
  const positions = [
    ...points.flatMap(([x, z]) => [x, top, z]),
    ...points.flatMap(([x, z]) => [x, bottom, z]),
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(positions, 3).setUsage(DynamicDrawUsage),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      [...points, ...points].flatMap(([x, z]) => [x - minX, z - minZ]),
      2,
    ),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.boundingBox.max.y += MAX_WAVE_HEIGHT;
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += MAX_WAVE_HEIGHT;
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  tag(mesh, metadata);
  // Navigation uses the resting surface, not the expanded wave-culling bounds.
  mesh.userData.restWaterLevel = top;
  group.add(mesh);
  const original = geometry.attributes.position.array.slice();
  let active = false,
    impulseCount = 0,
    impactCount = 0,
    lastImpactNet = 0,
    energy = 0,
    peak = 0;
  const areaWeight = fieldWeights.reduce(
    (sum, value, i) => sum + (mask[i] ? value : 0),
    0,
  );
  function visible() {
    for (let object = mesh; object; object = object.parent)
      if (!object.visible) return false;
    return true;
  }
  function sampleHeight(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const boundary = boundaryDistance(x, z, ring) < 1e-7;
    if (!inside(x, z, ring) && !boundary) return null;
    const ix = Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / dx)));
    const iz = Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / dz)));
    for (const [a, b, c] of cellTriangles[iz * nx + ix]) {
      const [ax, az] = points[a],
        [bx, bz] = points[b],
        [cx, cz] = points[c];
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
      const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) >= -1e-7) {
        const position = geometry.attributes.position;
        return (
          wa * position.getY(a) + wb * position.getY(b) + wc * position.getY(c)
        );
      }
    }
    return boundary ? top : null;
  }
  // A falling stream depresses its contact patch and displaces that same water
  // into the surrounding rim. Balancing the discrete, area-weighted impulse
  // preserves volume without adding a global push to the rest of the pool.
  function impact({
    point,
    velocity = { x: 0, y: -3, z: 0 },
    strength = 0.6,
    radius = 0.16,
    dt = 1 / 60,
  } = {}) {
    if (
      !visible() ||
      !point ||
      !velocity ||
      ![
        point.x,
        point.z,
        velocity.x,
        velocity.y,
        velocity.z,
        strength,
        radius,
        dt,
      ].every(Number.isFinite) ||
      (point.y !== undefined && !Number.isFinite(point.y)) ||
      velocity.y >= -0.01 ||
      strength <= 0 ||
      radius <= 0 ||
      dt <= 0 ||
      !inside(point.x, point.z, ring)
    )
      return false;
    const sigma = Math.max(Math.min(dx, dz) * 1.5, Math.min(radius, 0.6));
    const entries = [];
    let positiveArea = 0,
      negativeArea = 0;
    const x0 = Math.max(1, Math.floor((point.x - 3 * sigma - minX) / dx));
    const x1 = Math.min(nx - 1, Math.ceil((point.x + 3 * sigma - minX) / dx));
    const z0 = Math.max(1, Math.floor((point.z - 3 * sigma - minZ) / dz));
    const z1 = Math.min(nz - 1, Math.ceil((point.z + 3 * sigma - minZ) / dz));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const index = z * stride + x;
        if (!mask[index] || fieldWeights[index] <= 0) continue;
        const q =
          ((minX + x * dx - point.x) ** 2 + (minZ + z * dz - point.z) ** 2) /
          (sigma * sigma);
        if (q > 9) continue;
        const weight = (q - 1) * Math.exp(-q);
        entries.push({ index, weight });
        if (weight > 0) positiveArea += weight * fieldWeights[index];
        else negativeArea -= weight * fieldWeights[index];
      }
    if (positiveArea < 1e-12 || negativeArea < 1e-12) return false;
    const balance = negativeArea / positiveArea;
    let maximum = 1;
    for (const entry of entries) {
      if (entry.weight > 0) entry.weight *= balance;
      maximum = Math.max(maximum, Math.abs(entry.weight));
    }
    const impulse =
      Math.min(
        0.15,
        Math.min(-velocity.y, 8) * Math.min(strength, 2) * Math.min(dt, 1 / 30),
      ) / maximum;
    lastImpactNet = 0;
    for (const { index, weight } of entries) {
      const delta = impulse * weight;
      velocities[index] += delta;
      lastImpactNet += delta * fieldWeights[index];
    }
    active = true;
    impactCount++;
    return entries.length;
  }
  function reset() {
    const changed = active;
    heights.fill(0);
    velocities.fill(0);
    nextVelocity.fill(0);
    geometry.attributes.position.array.set(original);
    if (changed) {
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    active = false;
    energy = peak = 0;
    return changed;
  }
  return {
    kind: "water",
    id: `water:${metadata.poolId || "pool"}`,
    group,
    mesh,
    targets: [mesh],
    impact,
    sampleHeight,
    get diagnostics() {
      return {
        type: "water",
        active,
        impulseCount,
        impactCount,
        lastImpactNet,
        energy,
        maxHeight: peak,
        maxAllowedHeight: MAX_WAVE_HEIGHT,
        grid: [nx, nz],
        surfaceVertices: surfaceCount,
        boundaryVertices: boundaryCount,
      };
    },
    impulse({ point, velocity, radius = 0.55, dt = 1 / 60 }) {
      if (!visible()) return false;
      const speed = Math.hypot(velocity.x, velocity.z);
      if (
        !Number.isFinite(speed) ||
        speed < 0.015 ||
        !(dt > 0) ||
        !inside(point.x, point.z, ring)
      )
        return false;
      const ux = velocity.x / speed,
        uz = velocity.z / speed,
        duration = Math.min(dt, 1 / 15);
      const strength = Math.min(speed, 12) * duration * 12;
      const sigma = Math.max(0.16, Math.min(radius, 1.2));
      const sweep = Math.min(speed * duration, sigma * 1.5);
      for (let z = 1; z < nz; z++)
        for (let x = 1; x < nx; x++) {
          const i = z * stride + x;
          if (!mask[i]) continue;
          const rx = minX + x * dx - point.x,
            rz = minZ + z * dz - point.z;
          const along = rx * ux + rz * uz,
            projection = Math.max(-sweep, Math.min(0, along));
          const distanceSquared =
            (rx - projection * ux) ** 2 + (rz - projection * uz) ** 2;
          const q = distanceSquared / (sigma * sigma);
          if (q > 6) continue;
          const radial = (1 - q) * Math.exp(-q);
          const wake = (along / sigma) * Math.exp(-q * 0.9);
          velocities[i] += strength * (0.45 * radial + 0.75 * wake);
          velocities[i] = Math.max(-1.2, Math.min(1.2, velocities[i]));
        }
      active = true;
      impulseCount++;
      return true;
    },
    update(dt) {
      if (!active || !visible() || !(dt > 0)) return false;
      const elapsed = Math.min(dt, 1 / 15),
        waveSpeed = 1.45;
      const safeStep = Math.min(1 / 120, (0.4 * Math.min(dx, dz)) / waveSpeed);
      const steps = Math.ceil(elapsed / safeStep),
        h = elapsed / steps;
      for (let step = 0; step < steps; step++) {
        for (let z = 1; z < nz; z++)
          for (let x = 1; x < nx; x++) {
            const i = z * stride + x;
            if (!mask[i]) continue;
            const lap =
              (heights[i - 1] + heights[i + 1] - 2 * heights[i]) / (dx * dx) +
              (heights[i - stride] + heights[i + stride] - 2 * heights[i]) /
                (dz * dz);
            nextVelocity[i] =
              (velocities[i] + waveSpeed * waveSpeed * lap * h) *
              Math.exp(-damping[i] * h);
          }
        let mean = 0;
        for (let i = 0; i < count; i++)
          if (mask[i]) {
            velocities[i] = nextVelocity[i];
            heights[i] = Math.max(
              -MAX_WAVE_HEIGHT * 0.98,
              Math.min(MAX_WAVE_HEIGHT * 0.98, heights[i] + velocities[i] * h),
            );
            mean += heights[i] * fieldWeights[i];
          }
        mean /= areaWeight || 1;
        let amplitude = 0;
        for (let i = 0; i < count; i++)
          if (mask[i]) {
            heights[i] -= mean;
            amplitude = Math.max(amplitude, Math.abs(heights[i]));
          }
        if (amplitude > MAX_WAVE_HEIGHT)
          for (let i = 0; i < count; i++) {
            heights[i] *= MAX_WAVE_HEIGHT / amplitude;
            velocities[i] *= MAX_WAVE_HEIGHT / amplitude;
          }
      }
      energy = peak = 0;
      let maxSpeed = 0;
      for (let i = 0; i < count; i++) {
        peak = Math.max(peak, Math.abs(heights[i]));
        maxSpeed = Math.max(maxSpeed, Math.abs(velocities[i]));
        energy += heights[i] ** 2 + velocities[i] ** 2;
      }
      if (peak < 0.000015 && maxSpeed < 0.0001) {
        reset();
        return true;
      }
      const position = geometry.attributes.position;
      for (let i = 0; i < surfaceCount; i++) {
        const sample = samples[i];
        let y = top;
        for (let n = 0; n < 4; n++)
          y += heights[sample.ids[n]] * sample.weights[n];
        position.setY(i, y);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      return true;
    },
    reset,
  };
}
