import * as THREE from "three";
import plaster from "../assets/textures/plaster-v2.png";
import oak from "../assets/textures/floor-oak-v2.png";
import terracotta from "../assets/textures/terracotta-albedo.jpg";
import paving from "../assets/textures/paving-albedo.jpg";
import roof from "../assets/textures/roof-albedo.jpg";
import foliage from "../assets/textures/foliage-albedo.png";
import timber from "../assets/textures/door-oak-v2.png";
import bark from "../assets/textures/bark-v2.png";
import carpet from "../assets/textures/carpet-v2.png";
import bronze from "../assets/textures/fountain-bronze.png";
import soil from "../assets/textures/site-soil.png";
import asphalt from "../assets/textures/site-asphalt.png";
import sitePaving from "../assets/textures/site-paving.png";
import cement from "../assets/textures/loft-cement.png";

const sources = {
  plaster,
  oak,
  timber,
  bark,
  carpet,
  bronze,
  soil,
  asphalt,
  sitePaving,
  concrete: sitePaving,
  cement,
  terracotta,
  paving,
  roof,
};
const cache = new Map();
const pending = [];

// UVs are in metres except the existing roof UVs (one 640 × 600 mm repeat).
const finishes = {
  cement: {
    width: 2.4,
    length: 2.4,
    roughness: 0.52,
    relief: 0.00035,
    variation: 0.14,
  },
  soil: {
    colorContrast: 0.75,
    width: 1.2,
    length: 1.2,
    roughness: 0.96,
    relief: 0.002,
    variation: 0.08,
  },
  asphalt: {
    colorContrast: 0.65,
    width: 1.2,
    length: 1.2,
    roughness: 0.91,
    relief: 0.00065,
    variation: 0.12,
  },
  sitePaving: {
    width: 1.2,
    length: 1.2,
    roughness: 0.78,
    relief: 0.0007,
    variation: 0.14,
  },
  concrete: {
    width: 1.2,
    length: 1.2,
    roughness: 0.83,
    relief: 0.0007,
    variation: 0.1,
  },
  bronze: {
    colorContrast: 0.32,
    width: 0.38,
    length: 0.38,
    roughness: 0.54,
    relief: 0.00045,
    variation: 0.28,
  },
  plaster: {
    width: 1,
    length: 1,
    roughness: 0.88,
    relief: 0.0014,
    variation: 0.18,
  },
  oak: {
    width: 1.08,
    length: 2.4,
    roughness: 0.52,
    relief: 0.0011,
    variation: 0.22,
  },
  timber: {
    width: 0.6,
    length: 1.2,
    roughness: 0.48,
    relief: 0.001,
    variation: 0.24,
  },
  bark: {
    width: 0.8,
    length: 1,
    roughness: 0.9,
    relief: 0.009,
    variation: 0.2,
  },
  carpet: {
    width: 0.6,
    length: 0.6,
    roughness: 0.94,
    relief: 0.0035,
    variation: 0.1,
  },
  terracotta: { width: 0.6, length: 0.6, roughness: 0.83, relief: 0.0006 },
  paving: { width: 2.4, length: 2.4, roughness: 0.76, relief: 0.0012 },
  roof: { width: 1, length: 1, roughness: 0.88, relief: 0.0007 },
};

function configure(map, spec, colorSpace = THREE.NoColorSpace) {
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / spec.width, 1 / spec.length);
  map.colorSpace = colorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  return map;
}

function mapsFor(kind) {
  if (cache.has(kind)) return cache.get(kind);
  // Model geometry checks also construct materials in Node without a DOM.
  if (typeof document === "undefined") return {};
  const spec = finishes[kind];
  const map = configure(new THREE.Texture(), spec, THREE.SRGBColorSpace);
  const normalMap = configure(new THREE.Texture(), spec);
  const roughnessMap = configure(new THREE.Texture(), spec);
  const bumpMap = configure(new THREE.Texture(), spec);
  const maps = { map, normalMap, roughnessMap, bumpMap };
  for (const [channel, texture] of Object.entries(maps)) {
    texture.name = `${kind} · generated ${channel}`;
    texture.userData.surface = kind;
  }
  cache.set(kind, maps);
  const ready = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const size = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        map.image = canvas;
        map.needsUpdate = true;
        const pixels = context.getImageData(0, 0, size, size).data;
        if (spec.colorContrast !== undefined) {
          // Keep natural colour variation without exaggerated surface contrast.
          const toned = context.createImageData(size, size);
          const mean = [0, 0, 0];
          for (let i = 0; i < pixels.length; i += 4)
            for (let c = 0; c < 3; c++)
              mean[c] += pixels[i + c] / (size * size);
          for (let i = 0; i < pixels.length; i += 4) {
            for (let c = 0; c < 3; c++)
              toned.data[i + c] =
                mean[c] + (pixels[i + c] - mean[c]) * spec.colorContrast;
            toned.data[i + 3] = 255;
          }
          context.putImageData(toned, 0, 0);
        }
        const heights = new Float32Array(size * size);
        const luminance = (i) =>
          (pixels[i * 4] * 0.2126 +
            pixels[i * 4 + 1] * 0.7152 +
            pixels[i * 4 + 2] * 0.0722) /
          255;
        for (let i = 0; i < heights.length; i++) {
          heights[i] = luminance(i) * spec.relief;
          if (kind === "roof") {
            // Preserve the inferred 320 × 300 mm tile courses as separate relief.
            const x = i % size,
              y = Math.floor(i / size);
            const course = Math.floor((y / size) * 2);
            const u = ((x / size) * 2 + course * 0.5) % 1;
            const v = ((y / size) * 2) % 1;
            const joint = u < 0.025 || v < 0.035;
            heights[i] +=
              (joint
                ? 0.1
                : 0.42 + Math.sin(u * Math.PI) ** 2 * 0.28 + v * 0.22) * 0.035;
          }
        }
        const normal = context.createImageData(size, size);
        const roughness = context.createImageData(size, size);
        const bump = context.createImageData(size, size);
        const sample = (x, y) =>
          heights[((y + size) % size) * size + ((x + size) % size)];
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const dx =
              ((sample(x + 1, y) - sample(x - 1, y)) * size) /
              (2 * (kind === "roof" ? 0.64 : spec.width));
            const dy =
              ((sample(x, y + 1) - sample(x, y - 1)) * size) /
              (2 * (kind === "roof" ? 0.6 : spec.length));
            const length = Math.hypot(dx, dy, 1);
            normal.data[i] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
            normal.data[i + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
            normal.data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
            normal.data[i + 3] = roughness.data[i + 3] = bump.data[i + 3] = 255;
            const height = Math.round(luminance(y * size + x) * 255);
            bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = height;
            // Restrained variation: luminance is an artistic proxy, not measured roughness.
            const r = Math.round(
              THREE.MathUtils.clamp(
                spec.roughness +
                  (0.5 - luminance(y * size + x)) * (spec.variation || 0.12),
                0.15,
                1,
              ) * 255,
            );
            roughness.data[i] =
              roughness.data[i + 1] =
              roughness.data[i + 2] =
                r;
          }
        for (const [texture, data] of [
          [normalMap, normal],
          [roughnessMap, roughness],
          [bumpMap, bump],
        ]) {
          const output = document.createElement("canvas");
          output.width = output.height = size;
          output.getContext("2d").putImageData(data, 0, 0);
          texture.image = output;
          texture.needsUpdate = true;
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () =>
      reject(new Error(`Unable to load generated ${kind} finish`));
    image.src = sources[kind];
  });
  pending.push(ready);
  return maps;
}

export function generatedMaterial(kind, options = {}) {
  const maps = mapsFor(kind);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: maps.roughnessMap ? 1 : finishes[kind].roughness,
    bumpScale: finishes[kind].relief,
    ...maps,
    ...options,
  });
  material.name = `Generated ${kind} · physical surface finish`;
  material.userData.generatedTexture = kind;
  material.userData.physicalUV = !["roof", "bark"].includes(kind);
  material.userData.reliefMethod =
    "Artistically derived luminance normal/height maps; not measured scans";
  material.userData.physicalRepeat = [
    finishes[kind].width,
    finishes[kind].length,
  ];
  return material;
}

export async function awaitArchitecturalTextures() {
  await Promise.all(pending);
}

let foliageMap;
export function foliageMaterial() {
  if (!foliageMap && typeof document !== "undefined") {
    foliageMap = new THREE.Texture();
    foliageMap.colorSpace = THREE.SRGBColorSpace;
    foliageMap.anisotropy = 8;
    pending.push(
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          foliageMap.image = image;
          foliageMap.needsUpdate = true;
          resolve();
        };
        image.onerror = () =>
          reject(new Error("Unable to load generated foliage"));
        image.src = foliage;
      }),
    );
  }
  const material = new THREE.MeshStandardMaterial({
    map: foliageMap || null,
    color: 0xffffff,
    roughness: 0.72,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  material.name = "Generated evergreen foliage · transparent leaf clusters";
  material.userData.generatedTexture = "foliage";
  return material;
}
