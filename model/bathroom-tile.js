import * as THREE from "three";

// Inferred finish: 600 mm porcelain, 3 mm grout; a 2.4 m atlas of 16 tiles.
// Floor UVs are in metres, so these maps stay at the same physical scale.
export function bathroomTileMaterial() {
  const size = 1024,
    tilePixels = size / 4;
  const groutPixels = (3 / 600) * tilePixels;
  const bevelPixels = (2 / 600) * tilePixels;
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const groutColor = [184, 180, 171];
  const porcelainColor = [229, 225, 215];
  function hash(x, y) {
    let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 53, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const tx = x - ix,
      ty = y - iy;
    const u = tx * tx * (3 - 2 * tx),
      v = ty * ty * (3 - 2 * ty);
    const a = hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u;
    const b = hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u;
    return a * (1 - v) + b * v;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) % tilePixels,
        v = (y + 0.5) % tilePixels;
      const edge = Math.min(u, v, tilePixels - u, tilePixels - v);
      const grout = edge < groutPixels / 2;
      const bevel = THREE.MathUtils.smoothstep(
        edge,
        groutPixels / 2,
        groutPixels / 2 + bevelPixels,
      );
      const tone =
        (hash(Math.floor(x / tilePixels) + 101, Math.floor(y / tilePixels)) -
          0.5) *
        9;
      const cloud =
        (noise(x / 80, y / 80) - 0.5) * 5 + (noise(x / 23, y / 23) - 0.5) * 2;
      const grain = hash(x, y) - 0.5;
      const shade = grout
        ? grain * 7
        : tone + cloud + grain * 2 - (1 - bevel) * 8;
      const base = grout ? groutColor : porcelainColor;
      const height = grout
        ? 0.18 + grain * 0.04
        : 0.55 + bevel * 0.3 + grain * 0.006;
      const matte = grout ? 0.98 : 0.61 + noise(x / 42, y / 42) * 0.1;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        color[offset + channel] = Math.round(base[channel] + shade);
        relief[offset + channel] = Math.round(height * 255);
        roughness[offset + channel] = Math.round(matte * 255);
      }
      color[offset + 3] = relief[offset + 3] = roughness[offset + 3] = 255;
    }
  }
  function texture(bytes, colorSpace) {
    const map = new THREE.DataTexture(bytes, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / 2.4, 1 / 2.4);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.colorSpace = colorSpace;
    map.needsUpdate = true;
    return map;
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texture(color, THREE.SRGBColorSpace),
    bumpMap: texture(relief, THREE.NoColorSpace),
    bumpScale: 0.001,
    roughnessMap: texture(roughness, THREE.NoColorSpace),
    roughness: 1,
    metalness: 0,
  });
  material.name = "Ivory porcelain · 600 mm · 3 mm grout";
  return material;
}
