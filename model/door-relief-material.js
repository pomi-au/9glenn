import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  Vector2,
} from "three";
import { awaitArchitecturalTextures } from "./generated-textures.js";

const pending = [];
const textureSets = new Map();
const imagePixels = new WeakMap();
const RESOLUTION = [384, 768];

function pixelsFor(texture) {
  const image = texture?.image;
  if (!image) return null;
  if (imagePixels.has(image)) return imagePixels.get(image);
  let pixels;
  if (image.data) pixels = image;
  else if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    pixels = context.getImageData(0, 0, image.width, image.height);
  }
  if (pixels) imagePixels.set(image, pixels);
  return pixels;
}

function texture(bytes, name) {
  const map = new DataTexture(bytes, ...RESOLUTION);
  map.name = name;
  map.channel = 1;
  map.wrapS = map.wrapT = ClampToEdgeWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.colorSpace = NoColorSpace;
  map.needsUpdate = true;
  return map;
}

// Signed distance to an inset rounded rectangle, in physical door metres.
function rectangleDistance(x, y, panel, inset, radius) {
  const halfWidth = (panel.right - panel.left) / 2 - inset;
  const halfHeight = (panel.top - panel.bottom) / 2 - inset;
  if (Math.min(halfWidth, halfHeight) <= radius) return Infinity;
  const qx = Math.abs(x - (panel.left + panel.right) / 2) - halfWidth + radius;
  const qy = Math.abs(y - (panel.bottom + panel.top) / 2) - halfHeight + radius;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

function buildMaps(base, options, maps) {
  const { width, height, panels, depth, fieldInset, woodUVOffset } = options;
  const [columns, rows] = RESOLUTION;
  const heights = new Float32Array(columns * rows);
  const source = base.bumpMap;
  const pixels = pixelsFor(source);
  const uv = new Vector2();
  source?.updateMatrix();
  const grain = (x, y) => {
    if (!pixels) return 0;
    uv.set(x + woodUVOffset[0], y + woodUVOffset[1]);
    source.transformUv(uv);
    const px = Math.min(
      pixels.width - 1,
      Math.max(0, uv.x * pixels.width - 0.5),
    );
    const py = Math.min(
      pixels.height - 1,
      Math.max(0, uv.y * pixels.height - 0.5),
    );
    const x0 = Math.floor(px),
      y0 = Math.floor(py);
    const x1 = Math.min(pixels.width - 1, x0 + 1),
      y1 = Math.min(pixels.height - 1, y0 + 1);
    const sample = (a, b) => pixels.data[(b * pixels.width + a) * 4] / 255;
    const a = sample(x0, y0) * (1 - px + x0) + sample(x1, y0) * (px - x0);
    const b = sample(x0, y1) * (1 - px + x0) + sample(x1, y1) * (px - x0);
    // The source image is generated oak, not a measured displacement scan.
    return (a * (1 - py + y0) + b * (py - y0) - 0.5) * 0.00028;
  };
  for (let row = 0; row < rows; row++) {
    const y = ((row + 0.5) / rows - 0.5) * height;
    for (let column = 0; column < columns; column++) {
      const x = ((column + 0.5) / columns - 0.5) * width;
      let carving = 0;
      for (const panel of panels) {
        // Real mesh mouldings supply the broad profile. Only the shallow router
        // cuts inside the panel field belong in these height/normal maps.
        const inset = (panel.fieldInset ?? fieldInset) + 0.012;
        const d = rectangleDistance(x, y, panel, inset, 0.014);
        const second = rectangleDistance(x, y, panel, inset + 0.009, 0.01);
        carving -= depth * Math.exp(-((d / 0.0032) ** 2));
        carving -= depth * 0.48 * Math.exp(-((second / 0.0024) ** 2));
      }
      heights[row * columns + column] = carving + grain(x, y);
    }
  }
  const heightRange = options.heightRange;
  const sample = (x, y) =>
    heights[
      Math.min(rows - 1, Math.max(0, y)) * columns +
        Math.min(columns - 1, Math.max(0, x))
    ];
  const bump = maps.bumpMap.image.data,
    normal = maps.normalMap.image.data;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 4;
      const dx =
        ((sample(x + 1, y) - sample(x - 1, y)) * columns) / (2 * width);
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) * rows) / (2 * height);
      const length = Math.hypot(dx, dy, 1);
      // DataTexture row zero is v=0 (flipY=false): the tangent normal's green
      // component therefore uses -dy, unlike a top-down canvas source image.
      normal[i] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      normal[i + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
      normal[i + 2] = Math.round((0.5 + 0.5 / length) * 255);
      normal[i + 3] = bump[i + 3] = 255;
      const h = Math.round(
        Math.max(
          0,
          Math.min(1, (sample(x, y) + heightRange / 2) / heightRange),
        ) * 255,
      );
      bump[i] = bump[i + 1] = bump[i + 2] = h;
    }
  }
  maps.bumpMap.needsUpdate = maps.normalMap.needsUpdate = true;
}

/**
 * Add whole-leaf fine carving to generated timber. Dimensions/panel bounds are
 * centred local metres, and uv1=(x/width+.5,y/height+.5). Call after UV0 finish
 * variation, supplying its final offset, then await awaitDoorReliefMaterials().
 */
export function createDoorReliefMaterial(baseMaterial, options) {
  const { width, height, panels } = options;
  if (!(width > 0 && height > 0 && panels?.length))
    throw new Error(
      "Door relief requires physical width, height and panel bounds",
    );
  const depth = options.fineCarvingDepth ?? 0.0011;
  const normalized = {
    width,
    height,
    panels,
    depth,
    fieldInset: options.fieldInset ?? 0.035,
    woodUVOffset: options.woodUVOffset ?? [0, 0],
    heightRange: Math.max(0.004, depth * 3),
  };
  const key = JSON.stringify([baseMaterial.bumpMap?.uuid, normalized]);
  let maps = textureSets.get(key);
  if (!maps) {
    const length = RESOLUTION[0] * RESOLUTION[1] * 4;
    maps = {
      bumpMap: texture(
        new Uint8Array(length),
        "Door carving · physical height · whole leaf",
      ),
      normalMap: texture(
        new Uint8Array(length),
        "Door carving + generated oak grain · tangent normal",
      ),
    };
    textureSets.set(key, maps);
    pending.push(
      awaitArchitecturalTextures().then(() =>
        buildMaps(baseMaterial, normalized, maps),
      ),
    );
  }
  const material = baseMaterial.clone();
  material.name = `${baseMaterial.name} · carved panel relief`;
  material.bumpMap = maps.bumpMap;
  material.normalMap = maps.normalMap;
  material.bumpScale = normalized.heightRange;
  material.normalScale.set(1, 1);
  // Three uses normalMap in preference to bumpMap. These encode the same field,
  // so WebGPU/Photo agree without applying the relief twice or displacing edges.
  material.userData.doorRelief = {
    kind: "routed-panel-carving",
    uvChannel: 1,
    width,
    height,
    depth,
    fieldInset: normalized.fieldInset,
    woodUVOffset: [...normalized.woodUVOffset],
    heightRange: normalized.heightRange,
    resolution: [...RESOLUTION],
    source:
      "Procedural router grooves plus artistically derived generated oak micrograin; not measured displacement",
  };
  return material;
}

export async function awaitDoorReliefMaterials() {
  await Promise.all(pending);
}
