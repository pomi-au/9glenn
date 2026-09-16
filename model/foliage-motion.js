import { Matrix4, Quaternion, Vector3, DynamicDrawUsage } from "three";

function visible(object) {
  for (let node = object; node; node = node.parent)
    if (!node.visible) return false;
  return true;
}

/** CPU instance transforms are shared by WebGPU preview and Photo snapshots. */
export function createFoliageMotion(crown, { plant }) {
  const count = crown.count;
  const rest = crown.instanceMatrix.array.slice();
  const angles = new Float64Array(count * 3);
  const velocities = new Float64Array(count * 3);
  const anchors = [],
    centres = [],
    stems = [],
    limits = [];
  const matrix = new Matrix4(),
    rotation = new Matrix4(),
    offset = new Matrix4();
  const axis = new Vector3(),
    torque = new Vector3(),
    quaternion = new Quaternion();
  const constrained = plant.form === "box-shrub" || plant.form === "column";
  const maxDisplacement = constrained
    ? 0.0025
    : plant.form === "tree"
      ? 0.38
      : 0.08;
  const geometry = crown.geometry.attributes.position;
  const vertex = new Vector3();
  for (let i = 0; i < count; i++) {
    matrix.fromArray(rest, i * 16);
    const anchor = new Vector3(0, -0.8, 0).applyMatrix4(matrix);
    anchors.push(anchor);
    centres.push(new Vector3().setFromMatrixPosition(matrix));
    stems.push(centres[i].clone().sub(anchor).normalize());
    let reach = 0;
    for (let j = 0; j < geometry.count; j++) {
      vertex.fromBufferAttribute(geometry, j).applyMatrix4(matrix);
      reach = Math.max(reach, vertex.distanceTo(anchor));
    }
    // Rotation about the attachment moves every vertex by at most reach * angle.
    limits.push(Math.min(0.48, maxDisplacement / Math.max(reach, 0.001)));
  }
  crown.instanceMatrix.setUsage(DynamicDrawUsage);
  crown.computeBoundingSphere();
  crown.boundingSphere.radius += maxDisplacement;
  let active = false,
    impulseCount = 0,
    maxAngle = 0,
    energy = 0;

  function reset() {
    const changed = active;
    angles.fill(0);
    velocities.fill(0);
    crown.instanceMatrix.array.set(rest);
    if (changed) crown.instanceMatrix.needsUpdate = true;
    active = false;
    maxAngle = energy = 0;
    return changed;
  }

  return {
    kind: "foliage",
    id: `foliage:${plant.id}`,
    group: crown.parent,
    mesh: crown,
    targets: [crown],
    get diagnostics() {
      return {
        type: "foliage",
        active,
        instanceCount: count,
        impulseCount,
        maxAngle,
        energy,
        maxDisplacement,
        constrained,
      };
    },
    impulse({ point, velocity, radius = 0.85, dt = 1 / 60, instanceId }) {
      if (!visible(crown)) return false;
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      if (!Number.isFinite(speed) || speed < 0.015 || !(dt > 0)) return false;
      const scale = Math.min(speed, 10) / speed;
      const duration = Math.min(dt, 1 / 15);
      let touched = false;
      for (let i = 0; i < count; i++) {
        const selected = Number.isInteger(instanceId) && i === instanceId;
        const distance = centres[i].distanceTo(point);
        if (!selected && distance >= radius) continue;
        // A ray can hit a card edge outside its centre's neighbourhood. Always
        // drive that actual hit cluster; nearby clusters retain spatial falloff.
        const influence = selected ? 1 : 1 - distance / radius;
        const force = limits[i] * 90 * influence * duration * scale;
        // Transverse drag bends the cluster about its attachment. Motion along
        // the stem adds mild torsional flutter, so vertical brushing responds
        // even on upright shrubs without lifting the fixed attachment.
        torque
          .crossVectors(stems[i], velocity)
          .addScaledVector(stems[i], stems[i].dot(velocity) * 0.35);
        velocities[i * 3] += torque.x * force;
        velocities[i * 3 + 1] += torque.y * force;
        velocities[i * 3 + 2] += torque.z * force;
        touched = true;
      }
      if (touched) {
        active = true;
        impulseCount++;
      }
      return touched;
    },
    update(dt) {
      if (!active || !visible(crown) || !(dt > 0)) return false;
      const elapsed = Math.min(dt, 1 / 15);
      const steps = Math.ceil(elapsed / (1 / 120));
      const h = elapsed / steps;
      for (let step = 0; step < steps; step++) {
        for (let i = 0; i < count; i++) {
          const stiffness = 16 + (i % 7) * 1.1;
          for (let d = 0; d < 3; d++) {
            const j = i * 3 + d;
            velocities[j] += -stiffness * angles[j] * h;
            velocities[j] *= Math.exp(-2.6 * h);
            angles[j] += velocities[j] * h;
          }
          const magnitude = Math.hypot(
            angles[i * 3],
            angles[i * 3 + 1],
            angles[i * 3 + 2],
          );
          if (magnitude > limits[i]) {
            const ratio = limits[i] / magnitude;
            for (let d = 0; d < 3; d++) {
              angles[i * 3 + d] *= ratio;
              velocities[i * 3 + d] *= 0.35;
            }
          }
        }
      }
      maxAngle = energy = 0;
      let residual = 0;
      for (let i = 0; i < count; i++) {
        const x = angles[i * 3],
          y = angles[i * 3 + 1],
          z = angles[i * 3 + 2];
        const angle = Math.hypot(x, y, z);
        const speed = Math.hypot(
          velocities[i * 3],
          velocities[i * 3 + 1],
          velocities[i * 3 + 2],
        );
        maxAngle = Math.max(maxAngle, angle);
        energy += speed * speed + 16 * angle * angle;
        residual = Math.max(residual, angle / limits[i], speed / limits[i]);
        axis.set(x, y, z).normalize();
        quaternion.setFromAxisAngle(axis, angle);
        rotation.makeRotationFromQuaternion(quaternion);
        const anchor = anchors[i];
        matrix.makeTranslation(anchor.x, anchor.y, anchor.z).multiply(rotation);
        offset.makeTranslation(-anchor.x, -anchor.y, -anchor.z);
        matrix.multiply(offset);
        offset.fromArray(rest, i * 16);
        matrix.multiply(offset);
        crown.setMatrixAt(i, matrix);
      }
      if (residual < 0.001) reset();
      crown.instanceMatrix.needsUpdate = true;
      return true;
    },
    reset,
  };
}
