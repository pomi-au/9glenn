const NS = "http://www.w3.org/2000/svg";

export function matchesRoof(part, selection) {
  if (selection === "all") return true;
  if (selection === "upper" || selection === "lower")
    return part.level === selection;
  return part.component === selection;
}

// Project the delivered roof surfaces; never maintain a second roof outline.
export function roofComparison(drawing, assembly, offset, component) {
  const vector = window.DrawingModel.documentFor(drawing);
  for (const original of vector.querySelectorAll(
    "[data-roof-annotation], [data-roof-face]",
  ))
    original.remove();
  for (const layer of vector.querySelectorAll("[data-layer]"))
    layer.setAttribute("opacity", "0.16");
  const lines = document.createElementNS(NS, "g");
  lines.setAttribute("data-roof-comparison", "model");
  lines.setAttribute("fill", "none");
  lines.setAttribute("stroke", "#00847c");
  lines.setAttribute("stroke-width", "22");
  lines.setAttribute("pointer-events", "none");
  const vertices = [],
    heights = [],
    seen = new Set();
  for (const face of assembly.faces) {
    if (face.kind !== "surface" || !matchesRoof(face, component)) continue;
    for (const ring of face.rings) {
      heights.push(...ring.map((point) => point[1]));
      const points = ring.map(([x, , z]) => [x - offset[0], z - offset[1]]);
      vertices.push(...points);
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) continue;
        const key = [a.join(","), b.join(",")].sort().join(";");
        if (seen.has(key)) continue;
        seen.add(key);
        const line = document.createElementNS(NS, "line");
        for (const [k, value] of Object.entries({
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
        }))
          line.setAttribute(k, value);
        line.setAttribute("data-component", face.component);
        lines.append(line);
      }
    }
  }
  vector.append(lines.cloneNode(true));
  const min = [0, 1].map((axis) => Math.min(...vertices.map((p) => p[axis])));
  const max = [0, 1].map((axis) => Math.max(...vertices.map((p) => p[axis])));
  return {
    vector,
    lines,
    height: (Math.min(...heights) + Math.max(...heights)) / 2,
    bounds: [
      min[0] - 450,
      min[1] - 450,
      max[0] - min[0] + 900,
      max[1] - min[1] + 900,
    ],
  };
}
