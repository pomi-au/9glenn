import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

let maps;

function tileMaps() {
  if (maps) return maps;
  const size = 512,
    tiles = 4,
    repeatMetres = 0.6;
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const smoothstep = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const u = (((x + 0.5) / size) * tiles) % 1;
      const v = (((y + 0.5) / size) * tiles) % 1;
      const edge = (Math.min(u, 1 - u, v, 1 - v) * repeatMetres) / tiles;
      const glazed = smoothstep(0.0015, 0.003, edge);
      const tileX = Math.floor((x / size) * tiles),
        tileY = Math.floor((y / size) * tiles);
      const variation = Math.sin(tileX * 13.2 + tileY * 31.7) * 4;
      const tile = [148 + variation, 199 + variation, 196 + variation];
      const grout = [197, 212, 206];
      for (let channel = 0; channel < 3; channel++) {
        albedo[index + channel] = Math.round(
          grout[channel] + (tile[channel] - grout[channel]) * glazed,
        );
        roughness[index + channel] = Math.round(205 - glazed * 115);
      }
      albedo[index + 3] = roughness[index + 3] = normal[index + 3] = 255;
      heights[y * size + x] = smoothstep(0.0015, 0.0045, edge) * 0.0006;
    }
  const height = (x, y) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx =
        ((height(x + 1, y) - height(x - 1, y)) * size) / (2 * repeatMetres);
      const dy =
        ((height(x, y + 1) - height(x, y - 1)) * size) / (2 * repeatMetres);
      const length = Math.hypot(dx, dy, 1),
        index = (y * size + x) * 4;
      normal[index] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      normal[index + 1] = Math.round((0.5 + (dy / length) * 0.5) * 255);
      normal[index + 2] = Math.round((0.5 + (1 / length) * 0.5) * 255);
    }
  function texture(data, colorSpace) {
    const map = new DataTexture(data, size, size);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(1 / repeatMetres, 1 / repeatMetres);
    map.minFilter = LinearMipmapLinearFilter;
    map.magFilter = LinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    if (colorSpace) map.colorSpace = colorSpace;
    map.needsUpdate = true;
    return map;
  }
  maps = {
    map: texture(albedo, SRGBColorSpace),
    normalMap: texture(normal),
    roughnessMap: texture(roughness),
  };
  return maps;
}

/** Inferred 150mm glazed basin tiles supply real detail for water refraction. */
export function poolTileMaterial() {
  const material = new MeshStandardMaterial({
    ...tileMaps(),
    roughness: 1,
    metalness: 0,
  });
  material.userData.physicalUV = true;
  material.userData.finish = "Inferred 150mm glazed pool tile with 3mm grout";
  return material;
}
