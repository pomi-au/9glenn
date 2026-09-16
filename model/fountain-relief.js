import * as THREE from "three";

const TAU = Math.PI * 2;
const cache = new Map();
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

// Physical heights in metres, independent of the mottled patina colour.
// The small periodic harmonics describe cast grain, not living skin.
function castGrain(u, v) {
  return (
    Math.sin(TAU * (u * 17 + v * 11)) *
      Math.sin(TAU * (u * 13 - v * 19)) *
      0.42 +
    Math.cos(TAU * (u * 31 + v * 23)) * 0.22 +
    Math.sin(TAU * (u * 7 - v * 9)) * 0.36
  );
}

export function fountainReliefHeight(kind, u, v) {
  const grain = castGrain(u, v);
  if (kind === "hair") {
    const flow = u + 0.025 * Math.sin(TAU * v);
    return (
      0.00025 * Math.cos(TAU * flow * 6) +
      0.000065 * Math.cos(TAU * flow * 18) +
      grain * 0.000008
    );
  }
  if (kind !== "scales") return grain * (kind === "face" ? 0.000018 : 0.000035);
  // Two columns / four staggered rows per seamless 48 x 56 mm tile.
  // Each shield has a gently domed field and a narrow rounded overlapping lip.
  const x = u * 2,
    y = v * 4;
  let height = 0;
  for (let row = Math.floor(y) - 1; row <= Math.floor(y) + 1; row++) {
    const dx = x - row * 0.5 - Math.round(x - row * 0.5);
    const dy = y - row;
    const radius = Math.hypot(dx / 0.53, (dy - 0.18) / 0.98);
    const dome = Math.max(0, 1 - radius * radius);
    const lip =
      Math.exp(-(((radius - 0.84) / 0.065) ** 2)) * smooth(-0.15, 0.2, dy);
    const field =
      (0.0016 * dome + 0.00084 * lip) * (1 - smooth(0.94, 1.02, radius));
    height = Math.max(height, field);
  }
  return height + grain * 0.000012;
}

export function fountainReliefMaps(kind) {
  if (cache.has(kind)) return cache.get(kind);
  if (!["face", "body", "scales", "hair"].includes(kind))
    throw new Error(`Unknown fountain relief: ${kind}`);
  const size = 256;
  const width = kind === "scales" ? 0.048 : 0.032;
  const height = kind === "scales" ? 0.056 : kind === "hair" ? 0.064 : 0.032;
  const range = kind === "scales" ? 0.0048 : kind === "hair" ? 0.0007 : 0.00014;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      values[y * size + x] = fountainReliefHeight(kind, x / size, y / size);
  const normal = new Uint8Array(size * size * 4);
  const bump = new Uint8Array(normal.length);
  const sample = (x, y) =>
    values[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) * size) / (2 * width);
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) * size) / (2 * height);
      const length = Math.hypot(dx, dy, 1);
      // DataTexture has flipY=false: row direction follows increasing UV v.
      normal[i] = Math.round(127.5 * (1 - dx / length));
      normal[i + 1] = Math.round(127.5 * (1 - dy / length));
      normal[i + 2] = Math.round(127.5 * (1 + 1 / length));
      const h = Math.round(
        255 * THREE.MathUtils.clamp(0.5 + sample(x, y) / range, 0, 1),
      );
      bump[i] = bump[i + 1] = bump[i + 2] = h;
      normal[i + 3] = bump[i + 3] = 255;
    }
  const texture = (bytes, channel) => {
    const map = new THREE.DataTexture(bytes, size, size);
    map.name = `Fountain ${kind} · sculpted ${channel}`;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / width, 1 / height);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  };
  const maps = {
    normalMap: texture(normal, "normal"),
    bumpMap: texture(bump, "height"),
    bumpScale: range,
  };
  cache.set(kind, maps);
  return maps;
}
