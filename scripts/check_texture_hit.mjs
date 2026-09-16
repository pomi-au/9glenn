import assert from "node:assert/strict";
import * as THREE from "three";
import { textureHitVisible } from "../model/texture-hit.js";

function texture(alpha, width = alpha.length, height = 1) {
  const data = new Uint8Array(width * height * 4);
  alpha.forEach((value, index) => data.set([255, 255, 255, value], index * 4));
  return new THREE.DataTexture(data, width, height);
}
function hit(material, u = 0.25, v = 0.5, face = { materialIndex: 0 }) {
  return { object: { material }, uv: new THREE.Vector2(u, v), face };
}
const map = texture([0, 255]);
const leaf = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45 });
assert.equal(
  textureHitVisible(hit(leaf)),
  false,
  "Transparent leaf-card gap passes through",
);
assert.equal(
  textureHitVisible(hit(leaf, 0.75)),
  true,
  "Visible leaf retains its hit",
);
map.repeat.x = 2;
map.offset.x = 0.2;
map.wrapS = THREE.RepeatWrapping;
assert.equal(
  textureHitVisible(hit(leaf, 0.3)),
  true,
  "Texture repeat and offset affect the hit UV",
);
assert.equal(
  textureHitVisible(hit(leaf, 0.5)),
  false,
  "Wrapped texels match the shader",
);
map.repeat.x = 1;
map.offset.x = 0;
map.wrapS = THREE.MirroredRepeatWrapping;
assert.equal(textureHitVisible(hit(leaf, 1.25)), true);
assert.equal(textureHitVisible(hit(leaf, 1.75)), false);
map.wrapS = THREE.ClampToEdgeWrapping;
assert.equal(textureHitVisible(hit(leaf, -2)), false);
assert.equal(textureHitVisible(hit(leaf, 2)), true);

const vertical = texture([0, 255], 1, 2);
leaf.map = vertical;
assert.equal(textureHitVisible(hit(leaf, 0.5, 0.25)), false);
vertical.flipY = true;
assert.equal(
  textureHitVisible(hit(leaf, 0.5, 0.25)),
  true,
  "flipY matches image upload orientation",
);
vertical.channel = 1;
const alternate = hit(leaf, 0.5, 0.25);
alternate.uv1 = new THREE.Vector2(0.5, 0.75);
assert.equal(
  textureHitVisible(alternate),
  false,
  "Alternate texture UV channel is used",
);
assert.equal(
  textureHitVisible(hit(leaf)),
  true,
  "Unknown alternate UV remains a conservative occluder",
);

const alphaMap = new THREE.DataTexture(
  new Uint8Array([255, 0, 255, 255]),
  1,
  1,
);
leaf.map = texture([255]);
leaf.alphaMap = alphaMap;
assert.equal(
  textureHitVisible(hit(leaf)),
  false,
  "alphaMap uses green, not red or alpha",
);
alphaMap.image.data[1] = 255;
leaf.opacity = 0.3;
assert.equal(
  textureHitVisible(hit(leaf)),
  false,
  "Material opacity multiplies sampled alpha",
);
leaf.opacity = 0.5;
leaf.alphaTest = 0.5;
assert.equal(
  textureHitVisible(hit(leaf)),
  true,
  "Alpha equal to the cutoff survives",
);
const opaque = new THREE.MeshStandardMaterial();
assert.equal(
  textureHitVisible(hit([opaque, leaf], 0.5, 0.5, { materialIndex: 0 })),
  true,
);
leaf.opacity = 0;
assert.equal(
  textureHitVisible(hit([opaque, leaf], 0.5, 0.5, { materialIndex: 1 })),
  false,
  "Face material index selects the right alpha rule",
);
leaf.visible = false;
assert.equal(textureHitVisible(hit(leaf)), false);
leaf.visible = true;
leaf.alphaTest = 0;
assert.equal(
  textureHitVisible(hit(leaf)),
  true,
  "Opaque blending without alphaTest ignores fragment alpha",
);
leaf.transparent = true;
assert.equal(
  textureHitVisible(hit(leaf)),
  false,
  "Fully transparent blending is invisible",
);
assert.equal(
  textureHitVisible({
    object: {
      material: new THREE.MeshStandardMaterial({ map, alphaTest: 0.5 }),
    },
  }),
  true,
  "Missing UV never exposes an unknown surface",
);
assert.equal(textureHitVisible({}), true);

const linear = texture([0, 255]);
linear.magFilter = THREE.LinearFilter;
const linearLeaf = new THREE.MeshStandardMaterial({
  map: linear,
  alphaTest: 0.45,
});
assert.equal(textureHitVisible(hit(linearLeaf, 0.46)), false);
assert.equal(
  textureHitVisible(hit(linearLeaf, 0.5)),
  true,
  "Bilinear cutout-edge sampling preserves a partial alpha threshold",
);
linear.rotation = Math.PI;
linear.center.set(0.5, 0.5);
assert.equal(
  textureHitVisible(hit(linearLeaf, 0.25)),
  true,
  "Texture rotation and center are respected",
);

const floatMap = new THREE.DataTexture(
  new Float32Array([1, 1, 1, 0.25]),
  1,
  1,
  THREE.RGBAFormat,
  THREE.FloatType,
);
assert.equal(
  textureHitVisible(
    hit(new THREE.MeshStandardMaterial({ map: floatMap, alphaTest: 0.5 })),
  ),
  false,
  "Floating-point texture alpha is already normalized",
);
const halfMap = new THREE.DataTexture(
  new Uint16Array([0, 0, 0, THREE.DataUtils.toHalfFloat(0.75)]),
  1,
  1,
  THREE.RGBAFormat,
  THREE.HalfFloatType,
);
assert.equal(
  textureHitVisible(
    hit(new THREE.MeshStandardMaterial({ map: halfMap, alphaTest: 0.5 })),
  ),
  true,
  "Half-float texture values are decoded",
);

let canvases = 0,
  readbacks = 0;
const savedDocument = globalThis.document;
globalThis.document = {
  createElement() {
    canvases++;
    return {
      getContext: () => ({
        drawImage() {},
        getImageData() {
          readbacks++;
          return { data: new Uint8ClampedArray([255, 255, 255, 0]) };
        },
      }),
    };
  },
};
try {
  const sharedImage = { width: 1, height: 1 };
  const a = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(sharedImage),
    alphaTest: 0.5,
  });
  const b = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(sharedImage),
    alphaTest: 0.5,
  });
  assert.equal(textureHitVisible(hit(a)), false);
  assert.equal(textureHitVisible(hit(b)), false);
  assert.equal(textureHitVisible(hit(a)), false);
  assert.equal(canvases, 1);
  assert.equal(
    readbacks,
    1,
    "Shared image pixels are read once across maps and hits",
  );
  globalThis.document.createElement = () => {
    canvases++;
    return {
      getContext: () => ({
        drawImage() {
          throw new Error("tainted image");
        },
      }),
    };
  };
  const unreadable = new THREE.MeshStandardMaterial({
    map: new THREE.Texture({ width: 2, height: 2 }),
    alphaTest: 0.5,
  });
  assert.equal(textureHitVisible(hit(unreadable)), true);
  assert.equal(textureHitVisible(hit(unreadable)), true);
  assert.equal(canvases, 2, "Unreadable texture fallback is also cached");
} finally {
  if (savedDocument === undefined) delete globalThis.document;
  else globalThis.document = savedDocument;
}
console.log(
  "PASS texture hit visibility: alphaTest/opacity, face materials, map alpha/alphaMap green, UV channels/transforms/wrapping/flipY, bilinear edges, data/half-float pixels, single cached readback, safe missing/unreadable images",
);
