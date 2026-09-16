import * as THREE from "three/webgpu";

/** Linear-radiance daylight environment, shared by exploration and path tracing. */
export function daylightEnvironment() {
  const width = 512,
    height = 256;
  const pixels = new Uint16Array(width * height * 4);
  const zenith = new THREE.Color(0.43, 0.64, 0.95);
  const horizon = new THREE.Color(0.92, 0.94, 0.97);
  const ground = new THREE.Color(0.19, 0.21, 0.18);
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) {
    const altitude = Math.sin(((y + 0.5) / height - 0.5) * Math.PI);
    if (altitude >= 0)
      color.copy(horizon).lerp(zenith, Math.pow(altitude, 0.45));
    else
      color
        .copy(horizon)
        .multiplyScalar(0.45)
        .lerp(ground, Math.pow(-altitude, 0.3));
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      pixels[offset] = THREE.DataUtils.toHalfFloat(color.r);
      pixels[offset + 1] = THREE.DataUtils.toHalfFloat(color.g);
      pixels[offset + 2] = THREE.DataUtils.toHalfFloat(color.b);
      pixels[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const map = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.mapping = THREE.EquirectangularReflectionMapping;
  map.colorSpace = THREE.LinearSRGBColorSpace;
  map.needsUpdate = true;
  return map;
}
