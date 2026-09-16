const SWING = (70 * Math.PI) / 180;
const DURATION = 450;

export function advanceDoor(door, now) {
  const motion = door.animation;
  if (!motion) return false;
  const progress = Math.min(
    1,
    Math.max(0, (now - motion.start) / motion.duration),
  );
  const eased = progress * progress * (3 - 2 * progress);
  door.leaf.rotation.y = motion.from + (motion.to - motion.from) * eased;
  if (progress === 1) door.animation = null;
  return progress < 1;
}

export function toggleDoor(door, now) {
  return setDoorOpen(door, !door.open, now);
}

export function setDoorOpen(door, open, now) {
  // Sample the current swing before reversing, so repeated clicks never jump.
  advanceDoor(door, now);
  door.open = open;
  const from = door.leaf.rotation.y;
  const to = door.closedAngle - (door.open ? SWING * door.swing : 0);
  const duration = (DURATION * Math.abs(to - from)) / SWING;
  door.animation = duration > 0 ? { from, to, start: now, duration } : null;
  return door.open;
}

export function pairedDoorId(door, records) {
  if (!/-[ab]$/.test(door.id)) return null;
  const otherId = door.id.slice(0, -1) + (door.id.endsWith("a") ? "b" : "a");
  const other = records.find((record) => record.id === otherId);
  if (!other) return null;
  function closedTip(record) {
    const angle = (record.angle * Math.PI) / 180;
    return [
      record.x + Math.cos(angle) * record.width,
      record.y + Math.sin(angle) * record.width,
    ];
  }
  const a = closedTip(door),
    b = closedTip(other);
  // Matching names alone are insufficient: independent cupboard doors also
  // use a/b suffixes. A double door's two closed leaves meet at the same point.
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1 ? otherId : null;
}
