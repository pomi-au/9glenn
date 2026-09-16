import * as THREE from "three";
import { fountainWaterMaterial } from "./fountain-water-material.js";

export const FOUNTAIN_GRAVITY = 9.81;
export function flightTime(height, verticalVelocity, surface) {
  const discriminant =
    verticalVelocity ** 2 + 2 * FOUNTAIN_GRAVITY * (height - surface);
  return discriminant > 0
    ? Math.max(
        0,
        (verticalVelocity + Math.sqrt(discriminant)) / FOUNTAIN_GRAVITY,
      )
    : 0;
}
export function ballisticPoint(
  origin,
  velocity,
  time,
  target = new THREE.Vector3(),
) {
  return target.set(
    origin.x + velocity.x * time,
    origin.y + velocity.y * time - 0.5 * FOUNTAIN_GRAVITY * time * time,
    origin.z + velocity.z * time,
  );
}

/** A closed falling stream and finite ballistic droplets sharing one impact. */
export function createFountainFlow({
  add,
  origin,
  nozzle,
  velocity,
  water,
  waterLevel,
}) {
  const waterMaterial = fountainWaterMaterial();
  const material = waterMaterial.live;
  const rings = 48,
    sides = 10,
    positions = [],
    indices = [];
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < sides; j++) positions.push(0, 0, 0);
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j,
        b = i * sides + ((j + 1) % sides);
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  const start = positions.length / 3;
  positions.push(0, 0, 0);
  const end = positions.length / 3;
  positions.push(0, 0, 0);
  for (let j = 0; j < sides; j++) {
    indices.push(start, (j + 1) % sides, j);
    indices.push(end, rings * sides + j, rings * sides + ((j + 1) % sides));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setIndex(indices);
  const stream = waterMaterial.bind(
    add(geometry, material, "fountain water jet"),
  );
  stream.castShadow = false;
  stream.frustumCulled = false;
  const droplets = Array.from({ length: 18 }, () => {
    const drop = waterMaterial.bind(
      add(
        new THREE.SphereGeometry(1, 8, 6),
        material,
        "fountain flowing water",
      ),
    );
    drop.castShadow = false;
    return drop;
  });
  const splashes = Array.from({ length: 24 }, () => {
    const drop = waterMaterial.bind(
      add(
        new THREE.SphereGeometry(1, 8, 6),
        material,
        "fountain impact splash",
      ),
    );
    drop.castShadow = false;
    return drop;
  });
  const point = new THREE.Vector3(),
    tangent = new THREE.Vector3(),
    vertical = new THREE.Vector3();
  const across = new THREE.Vector3(1, 0, 0),
    up = new THREE.Vector3(0, 1, 0);
  const impact = new THREE.Vector3();
  let time = 0,
    impacts = 0;
  const diagnostic = {
    nozzle: origin.clone().add(nozzle).toArray(),
    impact: [],
    incomingVelocity: [],
    flightTime: 0,
    impacts: 0,
    time: 0,
  };
  stream.userData.fountain = diagnostic;
  function update(dt = 0, emit = true) {
    time += Math.max(0, Math.min(dt, 1 / 20));
    let duration = flightTime(nozzle.y, velocity.y, waterLevel);
    ballisticPoint(nozzle, velocity, duration, impact);
    const surface =
      water.sampleHeight(origin.x + impact.x, origin.z + impact.z) ??
      waterLevel;
    duration = flightTime(nozzle.y, velocity.y, surface);
    ballisticPoint(nozzle, velocity, duration, impact);
    const travelTime = Math.min(time, duration);
    const attr = geometry.attributes.position;
    for (let i = 0; i <= rings; i++) {
      const fraction = i / rings,
        age = travelTime * fraction;
      ballisticPoint(nozzle, velocity, age, point);
      tangent.copy(velocity);
      tangent.y -= FOUNTAIN_GRAVITY * age;
      tangent.normalize();
      vertical.crossVectors(tangent, across).normalize();
      // Constant discharge: the section narrows as gravity accelerates the flow.
      const speed = Math.hypot(velocity.z, velocity.y - FOUNTAIN_GRAVITY * age);
      const narrowing = Math.sqrt(velocity.length() / speed);
      const modulation = 1 + 0.09 * Math.sin(31 * age - 15 * time) * fraction;
      for (let j = 0; j < sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        const p = point
          .clone()
          .addScaledVector(
            across,
            Math.cos(angle) * 0.019 * narrowing * modulation,
          )
          .addScaledVector(
            vertical,
            Math.sin(angle) * 0.006 * narrowing * modulation,
          );
        attr.setXYZ(i * sides + j, p.x, p.y, p.z);
      }
    }
    attr.setXYZ(start, nozzle.x, nozzle.y, nozzle.z);
    ballisticPoint(nozzle, velocity, travelTime, point);
    attr.setXYZ(end, point.x, point.y, point.z);
    attr.needsUpdate = true;
    geometry.computeVertexNormals();
    droplets.forEach((drop, i) => {
      const phase = (time * 2.5 + i / droplets.length) % 1;
      const age = duration * (0.62 + 0.38 * phase);
      drop.visible = age <= time;
      ballisticPoint(nozzle, velocity, age, point);
      point.x += Math.sin(i * 2.399) * 0.012 * phase;
      drop.position.copy(origin).add(point);
      const radius = 0.004 + (0.5 + 0.5 * Math.sin(i * 4.1)) * 0.003;
      drop.scale.set(radius, radius * (1.2 + phase), radius);
      tangent.copy(velocity);
      tangent.y -= FOUNTAIN_GRAVITY * age;
      drop.quaternion.setFromUnitVectors(up, tangent.normalize());
    });
    splashes.forEach((drop, i) => {
      drop.visible = time >= duration;
      const initialY = 0.38 + (i % 5) * 0.06;
      const lifetime = (2 * initialY) / FOUNTAIN_GRAVITY;
      const age = (time + i * 0.073) % lifetime,
        angle = i * 2.39996;
      const radialSpeed = 0.26 + (i % 4) * 0.065;
      point.set(
        impact.x + Math.cos(angle) * radialSpeed * age,
        impact.y + initialY * age - 0.5 * FOUNTAIN_GRAVITY * age * age,
        impact.z + Math.sin(angle) * radialSpeed * age,
      );
      drop.position.copy(origin).add(point);
      const radius = 0.003 + (i % 3) * 0.0012;
      drop.scale.set(radius, radius * 1.4, radius);
    });
    const incoming = new THREE.Vector3(
      velocity.x,
      velocity.y - FOUNTAIN_GRAVITY * duration,
      velocity.z,
    );
    if (emit && dt > 0 && time >= duration) {
      const affected = water.impact({
        point: origin.clone().add(impact),
        velocity: incoming,
        // Unsteady impact sustains outgoing waves instead of only a steady
        // depression. The wave solver conserves volume and limits amplitude.
        strength:
          1.15 * (1 + 0.72 * Math.sin(time * 10) + 0.2 * Math.sin(time * 23)),
        radius: 0.17,
        dt,
      });
      if (affected) impacts++;
    }
    Object.assign(diagnostic, {
      impact: origin.clone().add(impact).toArray(),
      incomingVelocity: incoming.toArray(),
      flightTime: duration,
      impacts,
      time,
    });
    return diagnostic;
  }
  update(0, false);
  return { update, stream, diagnostics: diagnostic };
}
