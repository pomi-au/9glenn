import { generatedMaterial } from "./generated-textures.js";
import { fountainReliefMaps } from "./fountain-relief.js";

export function fountainBronzeMaterial() {
  // Oxidized patina is less metallic than the underlying cast bronze.
  const material = generatedMaterial("bronze", { metalness: 0.42 });
  material.name = "Fountain · weathered green bronze with cast surface relief";
  material.userData.finish =
    "Verdigris patina over bronze; generated colour with derived normal, bump and roughness";
  return material;
}

/** Region-specific relief shares the generated patina, but never uses its
 * colour variations as facial anatomy or fish scales. Normal maps carry the
 * same height field in both live WebGPU and the Photo path tracer. */
export function fountainDetailMaterials(bronze) {
  const materials = Object.fromEntries(
    ["face", "body", "scales", "hair"].map((kind) => {
      const material = bronze.clone();
      Object.assign(material, fountainReliefMaps(kind));
      material.name = `Fountain · green bronze ${kind} relief`;
      material.userData.reliefRegion = kind;
      material.userData.reliefMethod =
        "Physical sculpted height and matching tangent normals; cast grain and overlapping scales";
      material.normalScale.set(1, 1);
      return [kind, material];
    }),
  );
  return (part, fallback) => {
    if (part.includes("hair")) return materials.hair;
    if (part.includes("scaled curled tail")) return materials.scales;
    if (part.includes("face with") || part.includes("eyelids and eyes"))
      return materials.face;
    if (
      [
        "sculpted torso",
        "raised arm",
        "arm across lap",
        "hands and fingers",
      ].some((name) => part.includes(name))
    )
      return materials.body;
    return fallback;
  };
}
