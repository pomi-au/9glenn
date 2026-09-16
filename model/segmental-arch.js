/** Shallow circular heads. Coordinates are millimetres, Y up. */
export function segmentalRadius(width, rise) {
  return (width * width) / (8 * rise) + rise / 2;
}
export function segmentalHead(u, width, head, rise) {
  const r = segmentalRadius(width, rise);
  return head - r + Math.sqrt(Math.max(0, r * r - (u - width / 2) ** 2));
}
export function segmentalOpening(left, width, bottom, head, rise, steps = 32) {
  const ring = [
    [left, bottom],
    [left + width, bottom],
  ];
  for (let i = 0; i <= steps; i++) {
    const u = width * (1 - i / steps);
    ring.push([left + u, segmentalHead(u, width, head, rise)]);
  }
  return ring;
}
