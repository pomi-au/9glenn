import * as THREE from "three";
import { generatedMaterial } from "./generated-textures.js";

function hash(x, y) {
  let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 53, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function texture(bytes, size, width, length, colorSpace) {
  const map = new THREE.DataTexture(bytes, size, size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / width, 1 / length);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.colorSpace = colorSpace;
  map.needsUpdate = true;
  return map;
}

// Self-contained, deterministic finishes: map dimensions are in metres.
function mappedMaterial(name, width, length, pixel, roughness, bumpScale) {
  const size = 512;
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [rgb, height] = pixel(x / size, y / size, hash(x, y));
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        color[index + channel] = THREE.MathUtils.clamp(
          Math.round(rgb[channel]),
          0,
          255,
        );
        relief[index + channel] = Math.round(height * 255);
      }
      color[index + 3] = relief[index + 3] = 255;
    }
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture(color, size, width, length, THREE.SRGBColorSpace),
    bumpMap: texture(relief, size, width, length, THREE.NoColorSpace),
    bumpScale,
    roughness,
  });
  material.name = name;
  return material;
}

export function woodMaterial({ planks = false, dark = false } = {}) {
  const material = generatedMaterial(planks ? "oak" : "timber", {
    color: dark ? 0x665447 : 0xffffff,
  });
  material.name = planks
    ? "Generated oak flooring · 180 mm planks"
    : dark
      ? "Generated dark oak timber"
      : "Generated oak cabinetry";
  material.userData.wood = true;
  return material;
}

export function mosaicMaterial() {
  const palette = [
    [229, 223, 210],
    [211, 202, 186],
    [239, 234, 222],
    [187, 184, 174],
    [220, 214, 201],
  ];
  return mappedMaterial(
    "Stone mosaic · 50 mm · 2 mm grout",
    0.6,
    0.6,
    (u, v, noise) => {
      const x = Math.floor(u * 12),
        y = Math.floor(v * 12);
      const a = (u * 12) % 1,
        b = (v * 12) % 1;
      const edge = Math.min(a, b, 1 - a, 1 - b);
      const grout = edge < 0.02;
      const base = grout
        ? [168, 163, 151]
        : palette[Math.floor(hash(x, y) * palette.length) % palette.length];
      const shade =
        (noise - 0.5) * 5 + (grout ? 0 : (hash(x + 9, y) - 0.5) * 6);
      return [base.map((c) => c + shade), grout ? 0.2 : 0.75];
    },
    0.78,
    0.0007,
  );
}

// Physical-scale grain on horizontal tops and vertical faces, including door edges.
export function woodUVs(geometry) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else
      uv.setXY(i, Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
}
