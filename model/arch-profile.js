/** Circular arch profiles in mm, shared by aperture and moulding meshes. */
export function archOpeningProfile(
  left,
  right,
  bottom,
  spring,
  radius,
  centre,
) {
  const ring = [
    [left, bottom],
    [right, bottom],
    [right, spring],
    [centre + radius, spring],
  ];
  for (let i = 1; i <= 48; i++) {
    const angle = (Math.PI * i) / 48;
    ring.push([
      centre + radius * Math.cos(angle),
      spring + radius * Math.sin(angle),
    ]);
  }
  ring.push([left, spring]);
  return ring;
}
export function archBandProfile(left, right, spring, radius, centre, depth) {
  const ring = [
    [left, spring],
    [centre - radius, spring],
  ];
  for (let i = 1; i <= 48; i++) {
    const angle = Math.PI * (1 - i / 48);
    ring.push([
      centre + radius * Math.cos(angle),
      spring + radius * Math.sin(angle),
    ]);
  }
  const outer = radius + depth,
    theta = Math.asin(depth / outer);
  ring.push(
    [right, spring],
    [right, spring + depth],
    [centre + outer * Math.cos(theta), spring + depth],
  );
  for (let i = 1; i <= 48; i++) {
    const angle = theta + ((Math.PI - 2 * theta) * i) / 48;
    ring.push([
      centre + outer * Math.cos(angle),
      spring + outer * Math.sin(angle),
    ]);
  }
  ring.push([left, spring + depth]);
  return ring;
}
