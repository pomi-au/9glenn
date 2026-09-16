import {
  BufferGeometry,
  Color,
  DataUtils,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  RectAreaLight,
  Scene,
  Source,
  Vector3,
} from "three";
import { getPhysicalMaterial } from "./planar-optics.js";

// The experimental tracer has no clipping-plane shader. Bake the same half-spaces
// into a disposable photo snapshot, preserving interpolated UVs and normals.
export function clipPhotoGeometry(geometry, worldMatrix, worldPlanes) {
  const inverse = worldMatrix.clone().invert();
  const planes = worldPlanes.map((plane) =>
    plane.clone().applyMatrix4(inverse),
  );
  const names = Object.keys(geometry.attributes).filter(
    (name) => !geometry.attributes[name].isInstancedBufferAttribute,
  );
  const output = Object.fromEntries(names.map((name) => [name, []]));
  const position = new Vector3();
  const result = new BufferGeometry();
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count, materialIndex: 0 }];
  const readVertex = (index) =>
    Object.fromEntries(
      names.map((name) => {
        const attribute = geometry.attributes[name];
        return [
          name,
          Array.from({ length: attribute.itemSize }, (_, i) =>
            attribute.getComponent(index, i),
          ),
        ];
      }),
    );
  const mix = (a, b, t) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        a[name].map((value, i) => value + (b[name][i] - value) * t),
      ]),
    );
  for (const group of groups) {
    const start = output.position.length / 3;
    const end = Math.min(
      count,
      group.start + group.count,
      geometry.drawRange.start + geometry.drawRange.count,
    );
    for (
      let i = Math.max(group.start, geometry.drawRange.start);
      i < end;
      i += 3
    ) {
      let polygon = [0, 1, 2].map((offset) =>
        readVertex(
          geometry.index ? geometry.index.getX(i + offset) : i + offset,
        ),
      );
      for (const plane of planes) {
        const clipped = [];
        for (let j = 0; j < polygon.length; j++) {
          const a = polygon[j],
            b = polygon[(j + 1) % polygon.length];
          const da = plane.distanceToPoint(position.fromArray(a.position));
          const db = plane.distanceToPoint(position.fromArray(b.position));
          const aInside = da >= 0;
          const bInside = db >= 0;
          if (aInside) clipped.push(a);
          if (aInside !== bInside) clipped.push(mix(a, b, da / (da - db)));
        }
        polygon = clipped;
        if (polygon.length < 3) break;
      }
      for (let j = 1; j < polygon.length - 1; j++) {
        for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
          for (const name of names) output[name].push(...vertex[name]);
        }
      }
    }
    const written = output.position.length / 3 - start;
    if (written) result.addGroup(start, written, group.materialIndex);
  }
  for (const name of names) {
    result.setAttribute(
      name,
      new Float32BufferAttribute(
        output[name],
        geometry.attributes[name].itemSize,
      ),
    );
  }
  result.normalizeNormals();
  return result;
}

export function createPhotoScene(source, camera) {
  source.updateMatrixWorld(true);
  const scene = new Scene();
  for (const key of [
    "background",
    "environment",
    "backgroundIntensity",
    "backgroundBlurriness",
    "environmentIntensity",
  ]) {
    scene[key] = source[key];
  }
  scene.backgroundRotation.copy(source.backgroundRotation);
  scene.environmentRotation.copy(source.environmentRotation);
  const ownedTextures = new Map();
  for (const key of ["background", "environment"]) {
    const texture = scene[key];
    if (!texture?.isTexture) continue;
    if (!ownedTextures.has(texture)) {
      const prepared = texture.clone();
      // Upstream uses explicit WGSL samplers. Three omits their bindings for
      // nearest-only and unfilterable float32 maps; half floats filter everywhere.
      prepared.minFilter = LinearFilter;
      prepared.magFilter = LinearFilter;
      prepared.generateMipmaps = false;
      if (
        texture.type === FloatType &&
        texture.image?.data instanceof Float32Array
      ) {
        prepared.source = new Source({
          ...texture.image,
          data: Uint16Array.from(texture.image.data, DataUtils.toHalfFloat),
        });
        prepared.type = HalfFloatType;
      }
      prepared.needsUpdate = true;
      ownedTextures.set(texture, prepared);
    }
    scene[key] = ownedTextures.get(texture);
  }
  const ownedGeometries = [];
  const copiedGeometries = new Map();
  const ownedMaterials = [];
  const matrix = new Matrix4();
  const instanceColor = new Color();
  const lightPosition = new Vector3();
  const lightTarget = new Vector3();
  source.traverseVisible((object) => {
    if (!object.layers.test(camera.layers) || object.userData.excludeFromPhoto)
      return;
    if (object.isLight && !object.isAmbientLight && !object.isHemisphereLight) {
      if (object.isDirectionalLight && object.userData.photoSun) {
        object.target.updateWorldMatrix(true, false);
        lightPosition.setFromMatrixPosition(object.matrixWorld);
        lightTarget.setFromMatrixPosition(object.target.matrixWorld);
        const width = object.userData.photoSunSize || 2;
        const distanceSquared = lightPosition.distanceToSquared(lightTarget);
        // A finite emitter gives the photograph soft penumbrae. Match irradiance
        // at the building using projected solid angle (area / distance squared).
        const sun = new RectAreaLight(
          object.color,
          (object.intensity * distanceSquared) / (width * width),
          width,
          width,
        );
        sun.position.copy(lightPosition);
        sun.lookAt(lightTarget);
        scene.add(sun);
        return;
      }
      const light = object.clone(false);
      light.matrix.copy(object.matrixWorld);
      light.matrixAutoUpdate = false;
      if (object.target) {
        object.target.updateWorldMatrix(true, false);
        light.target.position.setFromMatrixPosition(object.target.matrixWorld);
        scene.add(light.target);
      }
      scene.add(light);
      return;
    }
    if (!object.isMesh || !object.geometry.attributes.position?.count) return;
    const planes = [];
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (parent.isClippingGroup && parent.enabled) {
        if (parent.clipIntersection && parent.clippingPlanes.length > 1) {
          throw new Error(
            "Photo mode does not support intersecting clipping groups with multiple planes.",
          );
        }
        planes.push(...parent.clippingPlanes);
      }
    }
    // Retain native instances when there is no cutaway; the tracer builds a TLAS
    // over them without expanding the repeated roof and landscape geometry.
    if (!planes.length) {
      const mesh = object.clone(false);
      // BVH construction adds indices and tangent attributes. Keep those changes
      // out of geometry already uploaded by the live WebGPU renderer.
      if (!copiedGeometries.has(object.geometry)) {
        const geometry = object.geometry.clone();
        copiedGeometries.set(object.geometry, geometry);
        ownedGeometries.push(geometry);
      }
      mesh.geometry = copiedGeometries.get(object.geometry);
      mesh.material = getPhysicalMaterial(object);
      mesh.matrix.copy(object.matrixWorld);
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      return;
    }
    const instanceCount = object.isInstancedMesh ? object.count : 1;
    for (let i = 0; i < instanceCount; i++) {
      if (object.isInstancedMesh) {
        object.getMatrixAt(i, matrix);
        matrix.premultiply(object.matrixWorld);
      } else matrix.copy(object.matrixWorld);
      const geometry = clipPhotoGeometry(object.geometry, matrix, planes);
      ownedGeometries.push(geometry);
      if (!geometry.attributes.position.count) continue;
      let material = getPhysicalMaterial(object);
      if (object.isInstancedMesh && object.instanceColor) {
        object.getColorAt(i, instanceColor);
        const tint = (sourceMaterial) => {
          const tinted = sourceMaterial.clone();
          tinted.color.multiply(instanceColor);
          ownedMaterials.push(tinted);
          return tinted;
        };
        material = Array.isArray(material)
          ? material.map(tint)
          : tint(material);
      }
      const mesh = new Mesh(geometry, material);
      mesh.matrix.copy(matrix);
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    }
  });
  return {
    scene,
    dispose() {
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      ownedTextures.forEach((texture) => texture.dispose());
    },
  };
}
