import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { generatedMaterial } from "./generated-textures.js";
import { createWaterMotion } from "./water-motion.js";
import { poolTileMaterial } from "./pool-tile.js";
import { createFountainSculpture } from "./fountain-sculpture.js";
import { createFountainFlow } from "./fountain-flow.js";
import {
  fountainBronzeMaterial,
  fountainDetailMaterials,
} from "./fountain-material.js";
import { fountainWaterMaterial } from "./fountain-water-material.js";

function poolMaterials() {
  return {
    stone: generatedMaterial("paving"),
    coping: generatedMaterial("paving"),
    shell: new THREE.MeshStandardMaterial({ color: 0xc6bfae, roughness: 1 }),
    tile: poolTileMaterial(),
    water: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.333,
      thickness: 1.4,
      attenuationColor: new THREE.Color(0x55c8c4),
      attenuationDistance: 4,
      roughness: 0.055,
      metalness: 0,
      // The closed bottom meets the basin floor exactly. Cull its back face in
      // live views so it cannot render a second, coplanar refracting surface.
      // Photo tracing handles both sides of thick transmission volumes itself.
      side: THREE.FrontSide,
    }),
  };
}

export function buildPool(group, pool, profile, extrude, tag) {
  const parts = pool.parts;
  const mats = poolMaterials();
  mats.water.thickness = (profile.depth - profile.waterDrop) / 1000;
  function solid(part, polygons, bottom, height, material) {
    extrude(group, polygons, bottom, height, material, {
      name: `Swimming pool · ${part}`,
      kind: "pool",
      poolId: pool.id,
      part,
      floor: "ground",
      source: pool.source,
    });
  }
  solid(
    "stone paving",
    [[parts.paving, parts.coping]],
    -profile.pavingThickness,
    profile.pavingThickness,
    mats.stone,
  );
  solid(
    "coping",
    [[parts.coping, parts.water]],
    -profile.copingThickness,
    profile.copingThickness,
    mats.coping,
  );
  solid(
    "basin shell",
    [[parts.coping, parts.water]],
    -profile.depth - profile.shellThickness,
    profile.depth + profile.shellThickness - profile.copingThickness,
    mats.shell,
  );
  solid(
    "basin floor",
    [[parts.water]],
    -profile.depth - profile.shellThickness,
    profile.shellThickness,
    mats.tile,
  );
  solid(
    "basin lining",
    [[parts.water, parts.lining]],
    -profile.depth,
    profile.depth - profile.copingThickness,
    mats.tile,
  );
  for (const indices of profile.stepGroups) {
    for (const [position, index] of indices.entries()) {
      const drop = profile.stepDrops[index];
      const step = [parts[`step-${index}`]];
      const nextIndex = indices[position + 1];
      const next = nextIndex === undefined ? null : parts[`step-${nextIndex}`];
      const polygons = next ? polygonClipping.difference(step, [next]) : [step];
      solid(
        `entry step ${index + 1}`,
        polygons,
        -profile.depth,
        profile.depth - drop,
        mats.tile,
      );
    }
  }
  // A closed volume lets transmitted paths travel the actual water depth.
  const waterMotion = createWaterMotion({
    group,
    footprint: parts.water.map(([x, z]) => [x / 1000, z / 1000]),
    // Let rays hit the opaque basin before the hidden water exit boundary.
    // Coincident bottom faces otherwise produce unstable material-hit ties.
    bottom: -profile.depth / 1000 - 0.002,
    top: -profile.waterDrop / 1000,
    material: mats.water,
    tag,
    metadata: {
      name: "Swimming pool · water",
      kind: "pool",
      poolId: pool.id,
      part: "water",
      floor: "ground",
      source: pool.source,
    },
  });
  const support = profile.stepDrops[1];
  solid(
    "fountain pedestal",
    [[parts.fountain]],
    -support,
    support + 150,
    mats.stone,
  );
  const footprint = parts.fountain;
  const origin = new THREE.Vector3(
    footprint.reduce((sum, p) => sum + p[0], 0) / footprint.length / 1000,
    0,
    footprint.reduce((sum, p) => sum + p[1], 0) / footprint.length / 1000,
  );
  const bronze = fountainBronzeMaterial();
  const detailMaterial = fountainDetailMaterials(bronze);
  function add(geometry, material, part) {
    const mesh = new THREE.Mesh(geometry, detailMaterial(part, material));
    mesh.position.copy(origin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tag(mesh, {
      name: `Swimming pool · ${part}`,
      kind: "pool",
      poolId: pool.id,
      part,
      floor: "ground",
      source:
        "User mermaid fountain reference; reconstructed sculptural geometry",
    });
    group.add(mesh);
    return mesh;
  }
  const sculpture = createFountainSculpture(add, mats.stone, bronze);
  const flow = createFountainFlow({
    add,
    origin,
    ...sculpture,
    water: waterMotion,
    waterLevel: -profile.waterDrop / 1000,
  });
  if (sculpture.basinWater) {
    const { center, radius } = sculpture.basinWater;
    const volume = new THREE.CylinderGeometry(radius, radius * 0.86, 0.035, 64);
    volume.translate(center.x, center.y - 0.0175, center.z);
    const basinMaterial = fountainWaterMaterial();
    basinMaterial.physical.thickness = 0.035;
    const basin = basinMaterial.bind(
      add(volume, basinMaterial.live, "fountain basin water"),
    );
    basin.castShadow = false;
  }
  group.traverse((object) => {
    if (object.userData.part === "water") {
      object.castShadow = false;
      object.renderOrder = 2;
    }
  });
  let lastTime = null;
  const updateFountain = (now) => {
    for (let parent = group; parent; parent = parent.parent)
      if (!parent.visible) return false;
    const dt =
      lastTime === null
        ? 1 / 60
        : Math.max(0, Math.min((now - lastTime) / 1000, 1 / 20));
    lastTime = now;
    flow.update(dt);
    return true;
  };
  updateFountain.interaction = waterMotion;
  return updateFountain;
}
