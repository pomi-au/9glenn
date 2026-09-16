import * as THREE from "three";
import clipping from "polygon-clipping";
import { generatedMaterial, foliageMaterial } from "./generated-textures.js";
import { siteSurfaceMaterial } from "./site-surface-material.js";
import { createGrass } from "./grass-mesh.js";
import { createFoliageMotion } from "./foliage-motion.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function siteGrade(x, z, grade = "garden") {
  if (grade === "drive") return -0.514;
  const front = THREE.MathUtils.clamp((z - 16070) / (22200 - 16070), 0, 1);
  const garden = -0.05 - front * 0.464;
  const blend = THREE.MathUtils.clamp((x - 6230) / 2270, 0, 1);
  return THREE.MathUtils.lerp(-0.514, garden, blend);
}
function noise(n) {
  const r = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return r - Math.floor(r);
}
function grassMap() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const shade = noise(i) * 12 - 6;
    const base = [115, 142, 74];
    base.forEach((value, channel) => {
      data[i * 4 + channel] = value + shade;
    });
    data[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(data, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / 3, 1 / 3);
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function leafClusterGeometry() {
  // Crossing cutout cards retain a leafy silhouette from every view direction.
  const cards = [
    new THREE.PlaneGeometry(2, 2),
    new THREE.PlaneGeometry(2, 2).rotateY(Math.PI / 2),
    new THREE.PlaneGeometry(2, 2).rotateX(Math.PI / 2),
  ];
  const geometry = mergeGeometries(cards);
  cards.forEach((card) => card.dispose());
  return geometry;
}

export function buildSite(group, floor, extrude, tag) {
  const controllers = [];
  const areas = floor.source.geometry.filter((g) => g.type === "site-area");
  const plants = floor.source.geometry.filter((g) => g.type === "site-plant");
  const pool = floor.source.geometry.find((g) => g.type === "pool");
  const blocked = [[floor.outline], ...(pool ? [[pool.parts.paving]] : [])];
  const mats = {
    concrete: siteSurfaceMaterial("concrete"),
    paving: siteSurfaceMaterial("paving"),
    asphalt: siteSurfaceMaterial("asphalt"),
    grass: new THREE.MeshStandardMaterial({
      map: grassMap(),
      roughness: 1,
    }),
    soil: siteSurfaceMaterial("soil"),
    bark: generatedMaterial("bark"),
    leaves: foliageMaterial(),
    pot: new THREE.MeshStandardMaterial({ color: 0xbeb69c, roughness: 1 }),
  };
  const hard = areas.filter((a) =>
    ["paving", "concrete", "asphalt"].includes(a.material),
  );
  for (const area of areas) {
    const others =
      area.material === "grass"
        ? areas.filter((a) => a !== area)
        : area.material === "soil"
          ? hard
          : hard.slice(0, hard.indexOf(area));
    const polygons = clipping.difference(
      [area.points],
      ...blocked,
      ...others.map((a) => [a.points]),
    );
    const patch = new THREE.Group();
    group.add(patch);
    extrude(patch, polygons, -60, 60, mats[area.material], {
      name: area.name,
      kind: "landscape",
      walkable: true,
      siteId: area.id,
      floor: "ground",
      source: area.source,
    });
    patch.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++)
        p.setY(
          i,
          p.getY(i) + siteGrade(p.getX(i) * 1000, p.getZ(i) * 1000, area.grade),
        );
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
    if (area.material === "grass" && polygons.length) {
      const targets = [];
      patch.traverse((mesh) => {
        if (mesh.isMesh) targets.push(mesh);
      });
      const grass = createGrass({
        polygons,
        grade: (x, z) => siteGrade(x, z, area.grade),
        siteId: area.id,
        name: area.name,
      });
      Object.assign(grass, {
        kind: "grass",
        id: `grass:${area.id}`,
        group: patch,
        targets,
      });
      for (const target of targets) target.userData.interactionKind = "grass";
      patch.add(grass.mesh);
      controllers.push(grass);
    }
  }
  const leafGeometry = leafClusterGeometry();
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  function branch(a, b, r, plant) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      length = start.distanceTo(end);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.6, r, length, 7),
      mats.bark,
    );
    const uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * length);
    uv.needsUpdate = true;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    mesh.castShadow = true;
    group.add(mesh);
    tag(mesh, {
      kind: "landscape",
      siteId: plant.id,
      name: plant.name,
      floor: "ground",
      source: plant.source,
    });
  }
  for (const [index, plant] of plants.entries()) {
    const x = plant.x / 1000,
      z = plant.z / 1000,
      h = plant.height / 1000,
      r = plant.radius / 1000;
    const y =
      plant.baseElevation === undefined
        ? siteGrade(plant.x, plant.z)
        : plant.baseElevation / 1000;
    const tree = plant.form === "tree",
      column = plant.form === "column",
      topiary = plant.form === "topiary";
    const count = tree ? 420 : column ? 128 : 84;
    const crown = new THREE.InstancedMesh(leafGeometry, mats.leaves, count);
    crown.castShadow = crown.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      const seed = index * 101 + i,
        angle = noise(seed) * Math.PI * 2,
        rad = Math.sqrt(noise(seed + 300));
      const vertical = noise(seed + 600);
      if (tree) {
        position.set(
          x + Math.cos(angle) * r * 0.76 * rad,
          y + h * 0.7 + (vertical - 0.5) * h * 0.27,
          z + Math.sin(angle) * r * 0.76 * rad,
        );
        scale.set(r * 0.22, r * 0.17, r * 0.22);
      } else if (column) {
        const spread = Math.sin((vertical * 0.84 + 0.08) * Math.PI);
        position.set(
          x + Math.cos(angle) * r * 0.5 * rad * spread,
          y + h * (0.12 + vertical * 0.77),
          z + Math.sin(angle) * r * 0.5 * rad * spread,
        );
        scale.set(r * 0.52, h * 0.13, r * 0.52);
      } else {
        const centre = topiary ? h * 0.76 : h * 0.53;
        position.set(
          x + Math.cos(angle) * r * 0.65 * rad,
          y + centre + (vertical - 0.5) * (topiary ? r : h * 0.48),
          z + Math.sin(angle) * r * 0.65 * rad,
        );
        scale.set(r * 0.47, topiary ? r * 0.42 : h * 0.32, r * 0.47);
      }
      rotation.setFromEuler(
        new THREE.Euler(
          (noise(seed + 120) - 0.5) * Math.PI,
          noise(seed + 150) * Math.PI * 2,
          (noise(seed + 180) - 0.5) * Math.PI,
        ),
      );
      if (plant.form === "box-shrub" || column) {
        // Keep constrained shrubs and tall evergreens inside their crown width.
        // Tilting tall cards sideways otherwise crosses planter or roof edges.
        const yaw = noise(seed + 150) * Math.PI * 2;
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const footprint = Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw));
        scale.x /= footprint;
        scale.z /= footprint;
      }
      matrix.compose(position, rotation, scale);
      crown.setMatrixAt(i, matrix);
      const tone = noise(seed + 80);
      const colour = new THREE.Color().setRGB(
        0.75 + tone * 0.25,
        0.85 + tone * 0.15,
        0.68 + tone * 0.27,
      );
      crown.setColorAt(i, colour);
    }
    group.add(crown);
    const motion = createFoliageMotion(crown, { plant });
    Object.assign(motion, { kind: "foliage", id: `foliage:${plant.id}` });
    controllers.push(motion);
    tag(crown, {
      kind: "landscape",
      siteId: plant.id,
      name: plant.name,
      floor: "ground",
      source: plant.source,
    });
    if (tree) {
      branch([x, y, z], [x + 0.18, y + h * 0.56, z], 0.24, plant);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        branch(
          [x, y + h * 0.34, z],
          [
            x + Math.cos(a) * r * 0.48,
            y + h * (0.63 + noise(i) * 0.1),
            z + Math.sin(a) * r * 0.48,
          ],
          0.12,
          plant,
        );
      }
    } else if (topiary) {
      branch([x, y, z], [x, y + h * 0.75, z], 0.035, plant);
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.16, 0.4, 12),
        mats.pot,
      );
      pot.position.set(x, y + 0.2, z);
      pot.castShadow = true;
      group.add(pot);
      tag(pot, {
        kind: "landscape",
        siteId: plant.id,
        name: "Entrance planter",
        floor: "ground",
        source: plant.source,
      });
    } else if (plant.form === "box-shrub") {
      extrude(
        group,
        [[plant.soilPoints]],
        plant.baseElevation - 20,
        20,
        mats.soil,
        {
          kind: "landscape",
          siteId: plant.id,
          name: "Planter box soil",
          floor: "ground",
          source: plant.source,
        },
      );
    }
  }
  return controllers;
}
