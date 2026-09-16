import * as THREE from "three";
import { woodMaterial, woodUVs } from "./finish-materials.js";

// Every furniture transform and size comes from its editable plan footprint.
export function buildFurniture(parent, floor, tag, timber = woodMaterial()) {
  const frame = new THREE.MeshStandardMaterial({
    color: 0x343c39,
    roughness: 0.7,
  });
  const cushion = new THREE.MeshStandardMaterial({
    color: 0xe8e0ce,
    roughness: 0.95,
  });
  const canvas = new THREE.MeshStandardMaterial({
    color: 0xeee4cb,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const furniture = new THREE.Group();
  furniture.name = "outdoor-furniture";
  parent.add(furniture);
  for (const item of floor.source.geometry.filter(
    (g) => g.type === "furniture",
  )) {
    const [a, b, , d] = item.points;
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000;
    const depth = Math.hypot(d[0] - a[0], d[1] - a[1]) / 1000;
    const group = new THREE.Group();
    group.name = item.id;
    group.position.set((b[0] + d[0]) / 2000, 0, (b[1] + d[1]) / 2000);
    group.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    furniture.add(group);
    function box(x, y, z, w, h, l, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
      if (material.userData?.wood) woodUVs(mesh.geometry);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      tag(mesh, {
        kind: "furniture",
        furnitureId: item.id,
        name: item.name,
        floor: floor.id,
        source: item.source,
      });
      return mesh;
    }
    function legs(height, inset = 0.065) {
      for (const x of [-width / 2 + inset, width / 2 - inset])
        for (const z of [-depth / 2 + inset, depth / 2 - inset])
          box(x, height / 2, z, 0.04, height, 0.04, frame);
    }
    if (item.form === "canopy") {
      const eaves = 2.55,
        ridge = 2.95;
      const halfW = width / 2 - 0.06,
        halfD = depth / 2 - 0.06;
      for (const x of [-halfW, halfW]) {
        for (const z of [-halfD, halfD])
          box(x, eaves / 2, z, 0.06, eaves, 0.06, frame);
        box(x, eaves - 0.03, 0, 0.06, 0.06, depth, frame);
        box(x, eaves - 0.075, 0, 0.012, 0.15, depth, canvas);
      }
      box(0, ridge - 0.05, 0, 0.045, 0.06, depth, frame);
      for (const z of [-halfD, halfD]) {
        for (const sign of [-1, 1]) {
          const rafter = box(
            (sign * halfW) / 2,
            (eaves + ridge) / 2 - 0.08,
            z,
            Math.hypot(halfW, ridge - eaves),
            0.045,
            0.045,
            frame,
          );
          rafter.rotation.z = -sign * Math.atan2(ridge - eaves, halfW);
        }
      }
      // Two taut canvas slopes with a slight fabric dip between ridge and eave.
      const roof = new THREE.PlaneGeometry(width, depth, 24, 1);
      const vertices = roof.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i),
          z = vertices.getY(i);
        const t = Math.abs(x) / (width / 2);
        vertices.setXYZ(
          i,
          x,
          ridge - (ridge - eaves) * t - 0.025 * Math.sin(Math.PI * t),
          z,
        );
      }
      roof.computeVertexNormals();
      const fabric = new THREE.Mesh(roof, canvas);
      fabric.castShadow = fabric.receiveShadow = true;
      group.add(fabric);
      tag(fabric, {
        kind: "furniture",
        furnitureId: item.id,
        name: item.name,
        floor: floor.id,
        source: item.source,
      });
    } else if (item.form === "table" || item.form === "side-table") {
      const height = item.form === "table" ? 0.75 : 0.46;
      legs(height - 0.045);
      const count = Math.max(3, Math.round(width / 0.12));
      for (let i = 0; i < count; i++)
        box(
          -width / 2 + ((i + 0.5) * width) / count,
          height - 0.0225,
          0,
          width / count - 0.006,
          0.045,
          depth,
          timber,
        );
      for (const x of [-width / 2 + 0.065, width / 2 - 0.065])
        box(x, height - 0.095, 0, 0.035, 0.1, depth - 0.1, frame);
    } else if (item.form === "chair") {
      legs(0.42);
      box(0, 0.425, 0, width - 0.02, 0.045, depth - 0.04, timber);
      box(0, 0.467, -0.025, width - 0.055, 0.065, depth - 0.095, cushion);
      for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) {
        box(x, 0.64, depth / 2 - 0.04, 0.035, 0.47, 0.035, frame);
        box(x, 0.66, 0, 0.045, 0.035, depth - 0.03, timber);
      }
      for (let row = 0; row < 3; row++)
        box(
          0,
          0.63 + row * 0.09,
          depth / 2 - 0.05,
          width - 0.07,
          0.07,
          0.035,
          timber,
        );
      box(0, 0.72, depth / 2 - 0.08, width - 0.09, 0.27, 0.045, cushion);
    } else if (item.form === "lounger") {
      legs(0.28, 0.09);
      for (const x of [-width / 2 + 0.07, width / 2 - 0.07])
        box(x, 0.29, 0, 0.045, 0.06, depth - 0.1, frame);
      box(0, 0.3, -depth * 0.12, width, 0.07, depth * 0.7, timber);
      box(0, 0.36, -depth * 0.12, width - 0.05, 0.06, depth * 0.68, cushion);
      const back = box(
        0,
        0.51,
        depth * 0.32,
        width,
        0.06,
        depth * 0.36,
        timber,
      );
      back.rotation.x = -0.48;
      const pad = box(
        0,
        0.56,
        depth * 0.3,
        width - 0.05,
        0.065,
        depth * 0.34,
        cushion,
      );
      pad.rotation.x = -0.48;
    }
  }
}
