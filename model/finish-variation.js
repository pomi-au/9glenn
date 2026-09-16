const variantsByMaterial = new WeakMap();
const originalUVs = new WeakMap();
const texturedFinishes = new Set([
  "plaster",
  "timber",
  "oak",
  "bark",
  "carpet",
  "soil",
  "asphalt",
]);

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return (value ^ (value >>> 13)) >>> 0;
}

function materialVariant(material, index) {
  if (!variantsByMaterial.has(material)) variantsByMaterial.set(material, []);
  const palette = variantsByMaterial.get(material);
  if (!palette[index]) {
    const result = material.clone();
    const kind = material.userData.generatedTexture;
    const tint =
      kind === "plaster"
        ? 0.988 + index * 0.008
        : kind === "bark"
          ? 0.92 + index * 0.05
          : 0.96 + index * 0.025;
    result.color.multiplyScalar(tint);
    result.roughness *= 0.955 + index * 0.015;
    result.name = `${material.name} · finish ${index + 1}`;
    result.userData.finishVariant = {
      index,
      tint,
      roughness: result.roughness,
    };
    // Materials share every texture; only their small uniform values vary.
    palette[index] = result;
  }
  return palette[index];
}

/** Stable, renderer-independent variation without per-object texture copies. */
export function applyFinishVariation(mesh) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.finishVariation)
    return;
  const materials = [mesh.material].flat();
  const source = materials.find((material) =>
    texturedFinishes.has(material.userData?.generatedTexture),
  );
  const uv = mesh.geometry.attributes.uv;
  if (!source || !uv) return;
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  const info = mesh.userData;
  const key = [
    info.floor,
    info.kind,
    info.siteId,
    info.doorKey,
    info.name,
    ...mesh.position.toArray(),
    ...bounds.min.toArray(),
    ...bounds.max.toArray(),
  ].join(":");
  const seed = hash(key),
    variant = seed % 4;
  const kind = source.userData.generatedTexture;
  const [width, length] = source.userData.physicalRepeat;
  const offset = [
    kind === "oak"
      ? (hash(`${key}:u`) % 6) * 0.18
      : (hash(`${key}:u`) / 4294967296) * width,
    (hash(`${key}:v`) / 4294967296) * length,
  ];
  let base = originalUVs.get(mesh.geometry);
  if (base) {
    // Shared geometry can still receive a distinct object phase without moving
    // another object's UVs or multiplying the previous object's offset.
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.attributes.uv.array.set(base);
  } else {
    base = uv.array.slice();
    originalUVs.set(mesh.geometry, base);
  }
  const targetUV = mesh.geometry.attributes.uv;
  for (let i = 0; i < targetUV.count; i++)
    targetUV.setXY(i, base[i * 2] + offset[0], base[i * 2 + 1] + offset[1]);
  targetUV.needsUpdate = true;
  const varied = materials.map((material) =>
    texturedFinishes.has(material.userData?.generatedTexture)
      ? materialVariant(material, variant)
      : material,
  );
  mesh.material = Array.isArray(mesh.material) ? varied : varied[0];
  const applied = varied.find(
    (material) => material.userData.generatedTexture === kind,
  );
  mesh.userData.finishVariation = {
    kind,
    seed,
    variant,
    uvOffset: offset,
    tint: applied.userData.finishVariant.tint,
    roughness: applied.roughness,
  };
}
