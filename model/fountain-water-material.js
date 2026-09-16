import { Color, MeshPhysicalMaterial } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { normalView, positionViewDirection, float } from "three/tsl";
import { setPhysicalMaterial } from "./planar-optics.js";

/** Small water volumes use direct transparent composition in live views, like
 * the pool, without sharing Three's screen-refraction targets across captures.
 * Photo receives the closed geometry's original physical water material. */
export function fountainWaterMaterial() {
  const physical = new MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    ior: 1.333,
    roughness: 0.045,
    thickness: 0.02,
    attenuationColor: new Color(0xe1f2ef),
    attenuationDistance: 3,
  });
  physical.name = "Fountain · physical clear water";
  const live = new MeshStandardNodeMaterial({
    color: 0xd5e5e4,
    roughness: 0.055,
    transparent: true,
    depthWrite: false,
  });
  const grazing = normalView.dot(positionViewDirection).abs().oneMinus().pow(5);
  live.opacityNode = float(0.2).add(grazing.mul(0.65));
  live.name = "Fountain · live reflective clear water";
  return {
    live,
    physical,
    bind(mesh) {
      setPhysicalMaterial(mesh, physical);
      return mesh;
    },
  };
}
