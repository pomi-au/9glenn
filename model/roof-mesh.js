import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { bounds, offsetRing, rectangle } from "./model-geometry.js";

// Presentation details are inferred: 320 × 300 mm tile exposure, 110 mm fascia.
// Generate small repeatable maps locally so the standalone viewer stays offline.
export function roofTileMaps() {
  const size = 256;
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const course = Math.floor((y / size) * 2);
    const v = ((y / size) * 2) % 1;
    for (let x = 0; x < size; x++) {
      const u = ((x / size) * 2 + course * 0.5) % 1;
      const joint = u < 0.025 || v < 0.035;
      const roll = Math.sin(u * Math.PI) ** 2;
      const grain = Math.sin(x * 127.1 + y * 311.7) * 0.006;
      const shade = joint ? 0.74 : 0.93 + roll * 0.05 + grain;
      const height = joint ? 0.1 : 0.42 + roll * 0.28 + v * 0.22;
      const i = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        color[i + channel] = Math.round(shade * 255);
        relief[i + channel] = Math.round(height * 255);
      }
      color[i + 3] = relief[i + 3] = 255;
    }
  }
  function texture(bytes, colorSpace) {
    const map = new THREE.DataTexture(bytes, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.colorSpace = colorSpace;
    map.needsUpdate = true;
    return map;
  }
  return {
    map: texture(color, THREE.SRGBColorSpace),
    bumpMap: texture(relief, THREE.NoColorSpace),
    bumpScale: 0.035,
  };
}

export function roofSkin(
  group,
  outline,
  base,
  pitch,
  name,
  materials,
  tag,
  overhang = 160,
) {
  const perimeter = offsetRing(outline, -overhang);
  const b = bounds(perimeter);
  const radians = THREE.MathUtils.degToRad(pitch);
  const slope = Math.tan(radians);
  const half = Math.min(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
  const yAt = (x, z) =>
    base +
    Math.max(0, Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z)) *
      slope;
  const mx = (b.minX + b.maxX) / 2;
  const mz = (b.minZ + b.maxZ) / 2;
  const longX = b.maxX - b.minX >= b.maxZ - b.minZ;
  const ridgeA = longX ? [b.minX + half, mz] : [mx, b.minZ + half];
  const ridgeB = longX ? [b.maxX - half, mz] : [mx, b.maxZ - half];
  const corners = rectangle(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
  const faces = longX
    ? [
        [corners[0], corners[1], ridgeB, ridgeA],
        [corners[1], corners[2], ridgeB],
        [corners[2], corners[3], ridgeA, ridgeB],
        [corners[3], corners[0], ridgeA],
      ]
    : [
        [corners[0], corners[1], ridgeA],
        [corners[1], corners[2], ridgeB, ridgeA],
        [corners[2], corners[3], ridgeB],
        [corners[3], corners[0], ridgeA, ridgeB],
      ];
  const info = {
    name,
    floor: "roof",
    kind: "roof",
    source: "SVG footprint + elevation pitch; inferred tile and trim details",
  };
  const edges = new Map();
  function addMesh(geometry, material, detail) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh, { ...info, name: `${name}${detail ? ` · ${detail}` : ""}` });
    group.add(mesh);
  }
  for (const [side, face] of faces.entries()) {
    const clipped = polygonClipping.intersection([face], [perimeter]);
    for (const polygon of clipped) {
      const ring = polygon[0].slice(0, -1);
      const points = ring.map((p) => new THREE.Vector2(...p));
      const triangles = THREE.ShapeUtils.triangulateShape(points, []);
      const vertices = [],
        uvs = [];
      for (const triangle of triangles) {
        const [a, c, d] = triangle.map((i) => ring[i]);
        // Counterclockwise x/z rings point downward in Three's y-up space.
        const cross =
          (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
        const indices = cross > 0 ? [...triangle].reverse() : triangle;
        for (const i of indices) {
          const [x, z] = ring[i];
          vertices.push(x / 1000, yAt(x, z) / 1000, z / 1000);
          const u = [x, z, -x, -z][side];
          const run = [z - b.minZ, b.maxX - x, b.maxZ - z, x - b.minX][side];
          uvs.push(u / 640, run / Math.cos(radians) / 600);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      addMesh(geometry, materials.roof);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          end = ring[(i + 1) % ring.length];
        const key = [a, end]
          .map((p) => p.map((v) => v.toFixed(2)).join(","))
          .sort()
          .join("|");
        const edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { a, end, count: 1 });
      }
    }
  }
  // Only shared face edges receive caps; clipped perimeter edges remain eaves.
  const caps = [];
  for (const { a, end, count } of edges.values()) {
    if (count !== 2) continue;
    const start = new THREE.Vector3(
      a[0] / 1000,
      yAt(...a) / 1000 + 0.025,
      a[1] / 1000,
    );
    const finish = new THREE.Vector3(
      end[0] / 1000,
      yAt(...end) / 1000 + 0.025,
      end[1] / 1000,
    );
    const direction = finish.clone().sub(start);
    const length = direction.length();
    if (length < 0.01) continue;
    const segments = Math.ceil(length / 0.3);
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    for (let i = 0; i < segments; i++) {
      const position = start.clone().lerp(finish, (i + 0.5) / segments);
      caps.push(
        new THREE.Matrix4().compose(
          position,
          rotation,
          new THREE.Vector3(1, length / segments - 0.006, 1),
        ),
      );
    }
  }
  if (caps.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.09, 0.105, 1, 10),
      materials.roofCap,
      caps.length,
    );
    caps.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh, { ...info, name: `${name} · ridge and hip caps` });
    group.add(mesh);
  }
  function strip(a, end, lowerA, lowerB, upperA, upperB, material, detail) {
    const vertices = [
      a[0],
      lowerA,
      a[1],
      end[0],
      lowerB,
      end[1],
      end[0],
      upperB,
      end[1],
      a[0],
      lowerA,
      a[1],
      end[0],
      upperB,
      end[1],
      a[0],
      upperA,
      a[1],
    ].map((v) => v / 1000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    addMesh(geometry, material, detail);
  }
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i],
      end = perimeter[(i + 1) % perimeter.length];
    const topA = yAt(...a),
      topB = yAt(...end);
    strip(
      a,
      end,
      base - 120,
      base - 120,
      topA - 110,
      topB - 110,
      materials.roofInfill,
      "eave infill",
    );
    strip(
      a,
      end,
      topA - 110,
      topB - 110,
      topA + 12,
      topB + 12,
      materials.fascia,
      "fascia",
    );
  }
}
