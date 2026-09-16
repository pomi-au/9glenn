import * as THREE from "three";
import {
  generatedMaterial,
  awaitArchitecturalTextures,
} from "./generated-textures.js";

const REPEAT = 1.2;
const SLAB = 0.6;
const JOINT_DEPTH = 0.0025;
const pending = [];
let slabMaps;

const fraction = (value) => value - Math.floor(value);
function jointEdge(x, z) {
  const u = fraction(x / SLAB),
    v = fraction(z / SLAB);
  return Math.min(u, 1 - u, v, 1 - v) * SLAB;
}
function slabField(x, z) {
  return THREE.MathUtils.smoothstep(jointEdge(x, z), 0.002, 0.006);
}

/** Metre coordinates: 600mm slabs, 4mm recessed joint and softly bevelled edges. */
export function siteSlabHeight(x, z) {
  const u = x / REPEAT,
    v = z / REPEAT;
  const grain =
    0.000035 *
    Math.sin(2 * Math.PI * (u * 83 + v * 71)) *
    Math.sin(2 * Math.PI * (u * 113 - v * 97));
  return -JOINT_DEPTH * (1 - slabField(x, z)) + grain * slabField(x, z);
}

export function siteSlabMaps() {
  if (slabMaps) return slabMaps;
  const size = 1024,
    heights = new Float32Array(size * size);
  const normal = new Uint8Array(size * size * 4),
    bump = new Uint8Array(size * size * 4);
  const range = 0.003;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      heights[y * size + x] = siteSlabHeight(
        (x / size) * REPEAT,
        (y / size) * REPEAT,
      );
  const sample = (x, y) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) * size) / (2 * REPEAT);
      const dz = ((sample(x, y + 1) - sample(x, y - 1)) * size) / (2 * REPEAT);
      const length = Math.hypot(dx, dz, 1);
      normal[i] = Math.round(127.5 * (1 - dx / length));
      normal[i + 1] = Math.round(127.5 * (1 - dz / length));
      normal[i + 2] = Math.round(127.5 * (1 + 1 / length));
      const value = Math.round(
        255 * THREE.MathUtils.clamp((sample(x, y) + JOINT_DEPTH) / range, 0, 1),
      );
      bump[i] = bump[i + 1] = bump[i + 2] = value;
      normal[i + 3] = bump[i + 3] = 255;
    }
  const texture = (bytes, channel) => {
    const map = new THREE.DataTexture(bytes, size, size);
    map.name = `Site paving · ${channel}, 600mm slabs`;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / REPEAT, 1 / REPEAT);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  };
  slabMaps = {
    normalMap: texture(normal, "normal"),
    bumpMap: texture(bump, "height"),
    bumpScale: range,
  };
  return slabMaps;
}

function tintSlabs(material) {
  if (typeof document === "undefined" || !material.map) return;
  const source = material.map;
  // Keep the generated source shared and untouched; this private canvas aligns
  // subdued slab tones and grout colour with the physical joint normal map.
  const ready = awaitArchitecturalTextures().then(() => {
    const size = 1024,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source.image, 0, 0, size, size);
    const image = context.getImageData(0, 0, size, size);
    const tones = [0.985, 1.025, 0.965, 1.01];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const field = slabField((x / size) * REPEAT, (y / size) * REPEAT);
        const tone =
          tones[Math.floor(x / (size / 2)) + 2 * Math.floor(y / (size / 2))];
        for (let c = 0; c < 3; c++)
          image.data[i + c] *= THREE.MathUtils.lerp(0.72, tone, field);
      }
    context.putImageData(image, 0, 0);
    const map = source.clone();
    map.source = new THREE.Source(canvas);
    map.repeat.set(1 / REPEAT, 1 / REPEAT);
    map.name = "Generated site stone · individual slab tones and joint colour";
    map.needsUpdate = true;
    material.map = map;
    material.needsUpdate = true;
  });
  pending.push(ready);
}

/** Shared physical UV convention: top surfaces use world-local x/z in metres. */
export function siteSurfaceMaterial(kind) {
  if (!["soil", "asphalt", "paving", "concrete"].includes(kind))
    throw new Error(`Unknown site surface: ${kind}`);
  const material = generatedMaterial(kind === "paving" ? "sitePaving" : kind);
  material.name = `Site · ${kind} physical finish`;
  material.userData.siteSurface = kind;
  if (kind === "paving" || kind === "concrete") {
    Object.assign(material, siteSlabMaps());
    material.normalScale.set(1, 1);
    material.userData.slabSize = SLAB;
    material.userData.jointDepth = JOINT_DEPTH;
    material.userData.reliefMethod =
      "600mm bevelled slabs; matching physical height and tangent normals";
    tintSlabs(material);
  }
  return material;
}

export async function awaitSiteSurfaceMaterials() {
  await Promise.all(pending);
}
