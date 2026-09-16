import {
  Vector2,
  NearestFilter,
  RepeatWrapping,
  MirroredRepeatWrapping,
  HalfFloatType,
  DataUtils,
} from "three";

const pixelsByImage = new WeakMap();

function pixelsFor(image) {
  if (!image || typeof image !== "object") return null;
  if (pixelsByImage.has(image)) return pixelsByImage.get(image);
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (!(width > 0 && height > 0)) return null;
  let pixels = null;
  if (image.data) {
    pixels = {
      data: image.data,
      width,
      height,
      channels: image.data.length / (width * height),
    };
  } else if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      pixels = {
        data: context.getImageData(0, 0, width, height).data,
        width,
        height,
        channels: 4,
      };
    } catch {
      // Unreadable images remain conservative occluders; never retry per hit.
    }
  }
  pixelsByImage.set(image, pixels);
  return pixels;
}

function texelIndex(index, size, wrapping) {
  if (wrapping === RepeatWrapping) return ((index % size) + size) % size;
  if (wrapping === MirroredRepeatWrapping) {
    const repeated = ((index % (size * 2)) + size * 2) % (size * 2);
    return repeated < size ? repeated : size * 2 - 1 - repeated;
  }
  return Math.max(0, Math.min(size - 1, index));
}

function sample(texture, hit, channel) {
  const coordinates = texture.channel ? hit[`uv${texture.channel}`] : hit.uv;
  if (!coordinates) return 1;
  const pixels = pixelsFor(texture.image);
  if (!pixels) return 1;
  if (channel >= pixels.channels) return channel === 3 ? 1 : 0;
  const uv = new Vector2().copy(coordinates);
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  texture.transformUv(uv);
  if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return 1;
  const { data, width, height, channels } = pixels;
  const divisor =
    data instanceof Uint8Array || data instanceof Uint8ClampedArray
      ? 255
      : data instanceof Uint16Array
        ? 65535
        : data instanceof Uint32Array
          ? 4294967295
          : 1;
  function texel(x, y) {
    const index =
      (texelIndex(y, height, texture.wrapT) * width +
        texelIndex(x, width, texture.wrapS)) *
        channels +
      channel;
    return texture.type === HalfFloatType
      ? DataUtils.fromHalfFloat(data[index])
      : data[index] / divisor;
  }
  if (texture.magFilter === NearestFilter)
    return texel(Math.floor(uv.x * width), Math.floor(uv.y * height));
  // Base-level bilinear filtering approximates the visible cutout edge without
  // a GPU readback; transparent interiors still pass through exactly.
  const x = uv.x * width - 0.5,
    y = uv.y * height - 0.5;
  const left = Math.floor(x),
    top = Math.floor(y),
    fx = x - left,
    fy = y - top;
  return (
    (texel(left, top) * (1 - fx) + texel(left + 1, top) * fx) * (1 - fy) +
    (texel(left, top + 1) * (1 - fx) + texel(left + 1, top + 1) * fx) * fy
  );
}

/** Raycaster tests triangles, so reject fragments discarded by texture alpha. */
export function textureHitVisible(hit) {
  const materials = hit?.object?.material;
  const material = Array.isArray(materials)
    ? materials[hit.face?.materialIndex ?? 0]
    : materials;
  if (!material) return true;
  if (material.visible === false) return false;
  const threshold = material.alphaTest || 0;
  if (!threshold && !material.transparent) return true;
  let alpha = material.opacity ?? 1;
  if (material.map) alpha *= sample(material.map, hit, 3);
  if (material.alphaMap) alpha *= sample(material.alphaMap, hit, 1);
  return alpha >= threshold && (!material.transparent || alpha > 0);
}
