import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  carvedDoorLayout,
  createCarvedDoorGeometry,
} from "../model/door-relief.js";

const near = (actual, expected, message) =>
  assert(
    Math.abs(actual - expected) < 1e-6,
    `${message}: ${actual} != ${expected}`,
  );
for (const size of [
  { width: 0.82, height: 2.04, thickness: 0.04 },
  { width: 0.38, height: 2.1, thickness: 0.035 },
  { width: 1.1, height: 2.4, thickness: 0.06 },
  { width: 0.2, height: 0.6, thickness: 0.015 },
]) {
  const geometry = createCarvedDoorGeometry(size);
  const layout = geometry.userData.carvedDoor;
  assert.deepEqual(layout, carvedDoorLayout(size));
  assert.equal(layout.panels.length, 3);
  const position = geometry.attributes.position,
    normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv,
    uv1 = geometry.attributes.uv1;
  assert(
    position.count <= 1200,
    "A carved leaf must remain one compact geometry",
  );
  assert.equal(position.count % 3, 0);
  assert.equal(normal.count, position.count);
  assert.equal(uv.count, position.count);
  assert.equal(uv1.count, position.count);
  for (const [axis, dimension] of [
    ["x", "width"],
    ["y", "height"],
    ["z", "thickness"],
  ]) {
    near(
      geometry.boundingBox.min[axis],
      -size[dimension] / 2,
      `Original ${axis} minimum`,
    );
    near(
      geometry.boundingBox.max[axis],
      size[dimension] / 2,
      `Original ${axis} maximum`,
    );
  }
  const key = (v) =>
    v
      .toArray()
      .map((value) => Math.round(value * 1e7))
      .join(":");
  const points = new Map(),
    edges = new Map();
  let volume = 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    assert(cross.lengthSq() > 1e-18, "Every triangle must have nonzero area");
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let offset = 0; offset < 3; offset++) {
      const n = new Vector3().fromBufferAttribute(normal, index + offset);
      assert(
        cross.clone().normalize().dot(n) > 0.99999,
        "Shading normals agree with outward triangle winding",
      );
    }
    for (const point of [a, b, c]) points.set(key(point), point.clone());
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ka = key(from),
        kb = key(to),
        edgeKey = [ka, kb].sort().join("|");
      const edge = edges.get(edgeKey) || { count: 0, balance: 0 };
      edge.count++;
      edge.balance += ka < kb ? 1 : -1;
      edges.set(edgeKey, edge);
    }
  }
  for (const { count, balance } of edges.values()) {
    assert.equal(
      count,
      2,
      "Every welded edge belongs to exactly two triangles",
    );
    assert.equal(
      balance,
      0,
      "Adjacent faces traverse shared edges in opposite directions",
    );
  }
  assert.equal(
    points.size - edges.size + position.count / 3,
    2,
    "The leaf is one closed solid without through-holes",
  );
  const boxVolume = size.width * size.height * size.thickness;
  assert(
    volume > boxVolume * 0.5 && volume < boxVolume * 0.999,
    "Carving removes material while retaining an outward-wound solid core",
  );
  for (const point of points.values()) {
    assert(
      points.has(key(new Vector3(point.x, point.y, -point.z))),
      "Real carved relief exists symmetrically on both faces",
    );
  }
  for (const panel of layout.panels) {
    assert(panel.left >= -size.width / 2 + layout.stile - 1e-9);
    assert(panel.right <= size.width / 2 - layout.stile + 1e-9);
    assert(panel.left + panel.fieldInset < panel.right - panel.fieldInset);
    assert(panel.bottom + panel.fieldInset < panel.top - panel.fieldInset);
    const depth = Math.max(...panel.profile.map((p) => p.depth));
    assert(depth > 0 && depth < size.thickness / 2);
    for (const side of [1, -1]) {
      assert(
        [...points.values()].some(
          (point) =>
            point.x > panel.left &&
            point.x < panel.right &&
            point.y > panel.bottom &&
            point.y < panel.top &&
            Math.abs(point.z - side * (size.thickness / 2 - depth)) < 1e-6,
        ),
        "Each panel has an actual recessed groove on both faces",
      );
    }
  }
  for (let index = 0; index < position.count; index++) {
    assert(Number.isFinite(uv.getX(index)) && Number.isFinite(uv.getY(index)));
    near(
      uv1.getX(index),
      position.getX(index) / size.width + 0.5,
      "Whole-leaf UV1 x",
    );
    near(
      uv1.getY(index),
      position.getY(index) / size.height + 0.5,
      "Whole-leaf UV1 y",
    );
    assert(uv1.getX(index) >= 0 && uv1.getX(index) <= 1);
    assert(uv1.getY(index) >= 0 && uv1.getY(index) <= 1);
  }
  geometry.dispose();
}
for (const invalid of [0, -1, NaN, Infinity]) {
  assert.throws(
    () =>
      createCarvedDoorGeometry({ width: invalid, height: 2, thickness: 0.04 }),
    /positive finite/,
  );
}
console.log(
  "PASS carved doors: closed outward-wound solid, unchanged envelope, real relief on both faces, small-leaf fit, normalized UV1 and compact vertex budget",
);
