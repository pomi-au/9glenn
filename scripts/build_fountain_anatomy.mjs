import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as THREE from "three";

// Asset-only pipeline: no MakeHuman application code is used. CC0 source files
// remain beside the generated asset so anatomy and pose are reproducible.
const directory = path.resolve("assets/models/sources/mermaid-anatomy");
const read = (name) => fs.readFileSync(path.join(directory, name), "utf8");
const vertices = [],
  bodyFaces = [];
let group = "";
for (const line of read("base.obj").split("\n")) {
  const p = line.trim().split(/\s+/);
  if (p[0] === "v")
    vertices.push(new THREE.Vector3(...p.slice(1, 4).map(Number)));
  if (p[0] === "g") group = p[1];
  if (p[0] === "f" && group === "body")
    bodyFaces.push(p.slice(1).map((v) => Number(v.split("/")[0]) - 1));
}
const morphs = {
  "caucasian-female-young.target": 1,
  // The average build target is intentionally empty upstream; include it as
  // part of the documented MakeHuman macro blend rather than inventing deltas.
  "universal-female-young-averagemuscle-averageweight.target": 1,
  "female-young-averagemuscle-averageweight-maxcup-averagefirmness.target": 0.45,
  "chin-bones-decr.target": 0.35,
  "chin-width-decr.target": 0.18,
};
for (const [file, weight] of Object.entries(morphs)) {
  for (const line of read(file).split("\n")) {
    const p = line.trim().split(/\s+/);
    if (!p[0] || p[0].startsWith("#")) continue;
    vertices[Number(p[0])].addScaledVector(
      new THREE.Vector3(...p.slice(1, 4).map(Number)),
      weight,
    );
  }
}
const skeleton = JSON.parse(read("default.mhskel"));
const weights = JSON.parse(read("default_weights.mhw")).weights;
// Flip the source's +Z face toward the fountain's -Z front. Reverse winding below.
const local = (v) =>
  new THREE.Vector3(
    v.x * 0.075 + 0.025,
    v.y * 0.075 + 0.8775,
    -v.z * 0.075 + 0.035,
  );
const rest = vertices.map(local);
const joint = (name) => {
  const ids = skeleton.joints[name];
  return ids
    .reduce((sum, id) => sum.add(rest[id]), new THREE.Vector3())
    .multiplyScalar(1 / ids.length);
};
const heads = {},
  tails = {};
for (const [name, bone] of Object.entries(skeleton.bones)) {
  heads[name] = joint(bone.head);
  tails[name] = joint(bone.tail);
}
const around = (pivot, rotation, destination = pivot, scale = 1) =>
  new THREE.Matrix4()
    .makeTranslation(...destination.toArray())
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(
      new THREE.Matrix4().makeTranslation(...pivot.clone().negate().toArray()),
    );
const align = (fromA, fromB, toA, toB) => {
  const a = fromB.clone().sub(fromA),
    b = toB.clone().sub(toA);
  return around(
    fromA,
    new THREE.Quaternion().setFromUnitVectors(
      a.clone().normalize(),
      b.clone().normalize(),
    ),
    toA,
    b.length() / a.length(),
  );
};
const transforms = {},
  identity = new THREE.Matrix4();
const headPivot = heads.neck01;
const headRotation = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.3, -0.08, -0.23, "XYZ"),
);
const headTransform = around(headPivot, headRotation, headPivot, 1.14);
const armTargets = {
  L: {
    elbow: new THREE.Vector3(0.12, 1.425, 0.095),
    wrist: new THREE.Vector3(0.02, 1.525, 0.06),
    handDirection: new THREE.Vector3(-0.035, -0.015, 0.025),
  },
  R: {
    elbow: new THREE.Vector3(-0.137, 1.145, -0.018),
    wrist: new THREE.Vector3(0.015, 1.125, -0.155),
    handDirection: new THREE.Vector3(0.08, -0.005, -0.003),
  },
};
for (const [side, target] of Object.entries(armTargets)) {
  const shoulder = heads[`upperarm01.${side}`],
    elbow = heads[`lowerarm01.${side}`],
    wrist = heads[`wrist.${side}`];
  const upper = align(shoulder, elbow, shoulder, target.elbow);
  const upperRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(upper),
  );
  const restForearm = wrist.clone().sub(elbow),
    posedForearm = target.wrist.clone().sub(target.elbow);
  // Carry upper-arm twist through the hinge before bending the elbow. Choosing
  // two independent shortest-arc rotations introduced an almost half-turn twist
  // at the elbow even though the two joint centers coincided.
  const lowerRotation = new THREE.Quaternion()
    .setFromUnitVectors(
      restForearm.clone().applyQuaternion(upperRotation).normalize(),
      posedForearm.clone().normalize(),
    )
    .multiply(upperRotation);
  const lower = around(
    elbow,
    lowerRotation,
    target.elbow,
    posedForearm.length() / restForearm.length(),
  );
  transforms[`upperarm01.${side}`] = upper;
  transforms[`upperarm02.${side}`] = upper;
  transforms[`lowerarm01.${side}`] = lower;
  transforms[`lowerarm02.${side}`] = lower;
  transforms[`wrist.${side}`] = around(
    wrist,
    new THREE.Quaternion().setFromUnitVectors(
      tails[`wrist.${side}`].clone().sub(wrist).normalize(),
      target.handDirection.clone().normalize(),
    ),
    target.wrist,
  );
  const handTransform = transforms[`wrist.${side}`];
  for (let finger = 1; finger <= 5; finger++) {
    const name = `finger${finger}-1.${side}`;
    const pivot = heads[name].clone().applyMatrix4(handTransform);
    const direction = tails[name]
      .clone()
      .sub(heads[name])
      .transformDirection(handTransform);
    const desired = target.handDirection.clone().normalize();
    // Relax the spread while preserving the thumb's opposing anatomical angle.
    desired.lerp(direction, finger === 1 ? 0.7 : 0.22).normalize();
    const fold = around(
      pivot,
      new THREE.Quaternion().setFromUnitVectors(direction, desired),
    );
    transforms[name] = fold.multiply(handTransform);
    for (let segment = 2; segment <= 3; segment++) {
      const child = `finger${finger}-${segment}.${side}`,
        parent = `finger${finger}-${segment - 1}.${side}`;
      const parentMatrix = transforms[parent];
      const jointPoint = heads[child].clone().applyMatrix4(parentMatrix);
      const oldDirection = tails[child]
        .clone()
        .sub(heads[child])
        .transformDirection(parentMatrix);
      const curlDirection = oldDirection
        .clone()
        .lerp(
          new THREE.Vector3(0, -1, side === "L" ? 0.2 : 0),
          side === "L" ? 0.3 : 0.12,
        )
        .normalize();
      transforms[child] = around(
        jointPoint,
        new THREE.Quaternion().setFromUnitVectors(oldDirection, curlDirection),
      ).multiply(parentMatrix);
    }
  }
}
function transformFor(name) {
  if (transforms[name]) return transforms[name];
  if (name === "neck01") return (transforms[name] = headTransform);
  const parent = skeleton.bones[name]?.parent;
  return (transforms[name] = parent ? transformFor(parent) : identity);
}
for (const name of Object.keys(skeleton.bones)) transformFor(name);
const influences = rest.map(() => []);
for (const [name, entries] of Object.entries(weights)) {
  const matrix = transformFor(name);
  const translation = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  matrix.decompose(translation, rotation, scale);
  for (const [id, weight] of entries)
    influences[id].push({ weight, rotation, matrix });
}
// Dual-quaternion blending retains the elbow's cross-section at the overhead
// bend; linear matrix blends visibly collapsed it into a severed-looking pinch.
const posed = rest.map((point, i) => {
  const list = influences[i];
  if (!list.length) return point.clone();
  const reference = list.reduce((a, b) =>
    a.weight > b.weight ? a : b,
  ).rotation;
  const real = new THREE.Quaternion(0, 0, 0, 0),
    dual = new THREE.Quaternion(0, 0, 0, 0);
  for (const item of list) {
    const sign = reference.dot(item.rotation) < 0 ? -1 : 1;
    // Center each rigid blend at this rest vertex. This incorporates each
    // bone's modest length scale without scaling a world-space translation.
    const mapped = point.clone().applyMatrix4(item.matrix);
    const partDual = new THREE.Quaternion(
      mapped.x,
      mapped.y,
      mapped.z,
      0,
    ).multiply(item.rotation);
    for (const key of ["x", "y", "z", "w"]) {
      real[key] += item.rotation[key] * item.weight * sign;
      dual[key] += partDual[key] * 0.5 * item.weight * sign;
    }
  }
  const norm = real.length();
  for (const key of ["x", "y", "z", "w"]) {
    real[key] /= norm;
    dual[key] /= norm;
  }
  const projection = real.dot(dual);
  for (const key of ["x", "y", "z", "w"]) dual[key] -= real[key] * projection;
  const translation = dual.multiply(real.clone().conjugate());
  return new THREE.Vector3(
    translation.x,
    translation.y,
    translation.z,
  ).multiplyScalar(2);
});
// Hide the short waist boundary inside the tail. Preserve low-rest-position
// fingers: arm vertices are spatially separate from the discarded leg topology.
let faces = bodyFaces
  .filter((face) => {
    const center = face
      .reduce((v, id) => v.add(vertices[id]), new THREE.Vector3())
      .multiplyScalar(1 / face.length);
    return center.y > 1.15 || (Math.abs(center.x) > 2.3 && center.y > -0.7);
  })
  .map((face) => face.toReversed());
const used = [...new Set(faces.flat())],
  remap = new Map(used.map((v, i) => [v, i]));
let points = used.map((i) => posed[i]);
faces = faces.map((face) => face.map((i) => remap.get(i)));

// One Catmull-Clark step gives the face, fingers and shoulder transitions
// continuous curvature without adding independent primitive anatomy.
function subdivide(points, faces) {
  const edges = new Map(),
    incident = points.map(() => []),
    adjacent = points.map(() => []);
  const centers = faces.map((face) =>
    face
      .reduce((v, i) => v.add(points[i]), new THREE.Vector3())
      .multiplyScalar(1 / face.length),
  );
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  faces.forEach((face, f) =>
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length],
        key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, { a, b, faces: [] });
      edges.get(key).faces.push(f);
      incident[a].push(f);
    }),
  );
  for (const edge of edges.values()) {
    adjacent[edge.a].push(edge);
    adjacent[edge.b].push(edge);
  }
  const output = points.map((p, i) => {
    const boundary = adjacent[i].filter((e) => e.faces.length === 1);
    if (boundary.length === 2)
      return p
        .clone()
        .multiplyScalar(0.75)
        .addScaledVector(
          points[boundary[0].a === i ? boundary[0].b : boundary[0].a],
          0.125,
        )
        .addScaledVector(
          points[boundary[1].a === i ? boundary[1].b : boundary[1].a],
          0.125,
        );
    const n = incident[i].length;
    if (!n) return p.clone();
    const f = incident[i]
      .reduce((v, k) => v.add(centers[k]), new THREE.Vector3())
      .multiplyScalar(1 / n);
    const r = adjacent[i]
      .reduce(
        (v, e) => v.add(points[e.a]).add(points[e.b]),
        new THREE.Vector3(),
      )
      .multiplyScalar(0.5 / adjacent[i].length);
    return f
      .addScaledVector(r, 2)
      .addScaledVector(p, n - 3)
      .multiplyScalar(1 / n);
  });
  for (const edge of edges.values()) {
    edge.index = output.length;
    const point = points[edge.a].clone().add(points[edge.b]);
    if (edge.faces.length === 2) {
      point
        .add(centers[edge.faces[0]])
        .add(centers[edge.faces[1]])
        .multiplyScalar(0.25);
    } else point.multiplyScalar(0.5);
    output.push(point);
  }
  const centerStart = output.length;
  output.push(...centers);
  const quads = [];
  faces.forEach((face, f) =>
    face.forEach((a, k) =>
      quads.push([
        a,
        edges.get(edgeKey(a, face[(k + 1) % face.length])).index,
        centerStart + f,
        edges.get(edgeKey(face[(k + face.length - 1) % face.length], a)).index,
      ]),
    ),
  );
  return [output, quads];
}
const sourcePoints = subdivide(
  used.map((i) => vertices[i]),
  faces,
)[0];
[points, faces] = subdivide(points, faces);
const rounded = (n) => Math.round(n * 1e6) / 1e6;
const pack = (points, faces) => ({
  position: points.flatMap((v) => v.toArray().map(rounded)),
  index: faces.flatMap((f) =>
    f.length === 4 ? [f[0], f[1], f[2], f[0], f[2], f[3]] : f,
  ),
});
const body = pack(points, faces);
const scalpFaces = faces.filter((face) => {
  const center = face
    .reduce((v, i) => v.add(sourcePoints[i]), new THREE.Vector3())
    .multiplyScalar(1 / face.length);
  const { y, z } = center;
  return y > 6.55 && (z < 0.55 || (y > 7.35 && z < 1.3));
});
const bodyGeometry = new THREE.BufferGeometry();
bodyGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(body.position, 3),
);
bodyGeometry.setIndex(body.index);
bodyGeometry.computeVertexNormals();
const scalpIds = [...new Set(scalpFaces.flat())],
  scalpMap = new Map(scalpIds.map((v, i) => [v, i]));
const scalpPoints = scalpIds.map((i) =>
  points[i]
    .clone()
    .addScaledVector(
      new THREE.Vector3().fromBufferAttribute(
        bodyGeometry.attributes.normal,
        i,
      ),
      0.002,
    ),
);
const scalp = pack(
  scalpPoints,
  scalpFaces.map((face) => face.map((i) => scalpMap.get(i))),
);
bodyGeometry.dispose();
const eyePoints = [],
  eyeFaces = [];
for (const side of ["L", "R"]) {
  const center = heads[`eye.${side}`].clone().applyMatrix4(headTransform);
  const sphere = new THREE.SphereGeometry(0.0113 * 1.14, 28, 18);
  sphere.translate(...center.toArray());
  const offset = eyePoints.length;
  for (let i = 0; i < sphere.attributes.position.count; i++)
    eyePoints.push(
      new THREE.Vector3().fromBufferAttribute(sphere.attributes.position, i),
    );
  for (let i = 0; i < sphere.index.count; i += 3)
    eyeFaces.push([0, 1, 2].map((k) => sphere.index.getX(i + k) + offset));
  sphere.dispose();
}
const bounds = new THREE.Box3().setFromPoints(points);
const metadata = {
  source:
    "MakeHuman CC0 hm08 base with adult female morph; individually posed and cropped for this fountain. Not a scan or exact reconstruction of the photographed sculpture.",
  revision: "a8bc2d54ff0ac92e78ff71431b1023eda42bf482",
  license: "CC0-1.0",
  subdivision: 1,
  bodyVertices: points.length,
  bodyTriangles: body.index.length / 3,
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  neck: heads.neck01.clone().applyMatrix4(headTransform).toArray(),
  headBase: heads.head.clone().applyMatrix4(headTransform).toArray(),
  headTop: tails.head.clone().applyMatrix4(headTransform).toArray(),
  eyeCenters: ["L", "R"].map((side) =>
    heads[`eye.${side}`].clone().applyMatrix4(headTransform).toArray(),
  ),
  waistCutHeight: 1.15 * 0.075 + 0.8775,
};
metadata.morphs = morphs;
metadata.skinning = "dual-quaternion";
metadata.chinLiftDegrees = (0.3 * 180) / Math.PI;
for (const n of [...body.position, ...eyePoints.flatMap((v) => v.toArray())])
  if (!Number.isFinite(n)) throw new Error("Non-finite anatomy vertex");
for (const index of body.index)
  if (index < 0 || index >= points.length)
    throw new Error("Invalid anatomy topology index");
if (bounds.min.y < 0.94 || bounds.max.y > 1.58)
  throw new Error("Anatomy outside fountain figure envelope");
metadata.wrists = Object.fromEntries(
  Object.entries(armTargets).map(([side, t]) => [side, t.wrist.toArray()]),
);
metadata.elbows = Object.fromEntries(
  Object.entries(armTargets).map(([side, t]) => [side, t.elbow.toArray()]),
);
const scalpBounds = new THREE.Box3().setFromPoints(scalpPoints);
metadata.scalpBounds = {
  min: scalpBounds.min.toArray(),
  max: scalpBounds.max.toArray(),
};
fs.writeFileSync(
  "assets/models/mermaid-anatomy.json",
  JSON.stringify({ metadata, body, eyes: pack(eyePoints, eyeFaces), scalp }),
);
const sourcePaths = {
  "base.obj": "makehuman/data/3dobjs/base.obj",
  "default.mhskel": "makehuman/data/rigs/default.mhskel",
  "default_weights.mhw": "makehuman/data/rigs/default_weights.mhw",
  "caucasian-female-young.target":
    "makehuman/data/targets/macrodetails/caucasian-female-young.target",
  "LICENSE.md": "LICENSE.md",
  "LICENSE.ASSETS.md": "LICENSE.ASSETS.md",
};
sourcePaths["universal-female-young-averagemuscle-averageweight.target"] =
  "makehuman/data/targets/macrodetails/universal-female-young-averagemuscle-averageweight.target";
sourcePaths[
  "female-young-averagemuscle-averageweight-maxcup-averagefirmness.target"
] =
  "makehuman/data/targets/breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target";
for (const file of ["chin-bones-decr.target", "chin-width-decr.target"])
  sourcePaths[file] = `makehuman/data/targets/chin/${file}`;
const files = Object.entries(sourcePaths).map(([file, source]) => ({
  file,
  source: `https://raw.githubusercontent.com/makehumancommunity/makehuman/${metadata.revision}/${source}`,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(directory, file)))
    .digest("hex"),
}));
fs.writeFileSync(
  path.join(directory, "provenance.json"),
  JSON.stringify(
    {
      repository: "https://github.com/makehumancommunity/makehuman",
      revision: metadata.revision,
      license: metadata.license,
      files,
      build: "node scripts/build_fountain_anatomy.mjs",
      notes: metadata.source,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(metadata, null, 2));
