/** Route downward slab caps to their original finish, preserving all geometry.
 * Three's extrusion groups normally share one material for top and bottom. */
export function separateSlabUnderside(geometry, undersideMaterialIndex) {
  const groups = geometry.groups.map((group) => ({ ...group }));
  geometry.clearGroups();
  for (const group of groups) {
    if (group.materialIndex !== 0) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
      continue;
    }
    let runStart = group.start;
    let previous = null;
    const end = group.start + group.count;
    for (let triangle = group.start; triangle < end; triangle += 3) {
      const vertex = geometry.index?.getX(triangle) ?? triangle;
      const material =
        geometry.attributes.normal.getY(vertex) < -0.5
          ? undersideMaterialIndex
          : 0;
      if (previous !== null && material !== previous) {
        geometry.addGroup(runStart, triangle - runStart, previous);
        runStart = triangle;
      }
      previous = material;
    }
    if (previous !== null)
      geometry.addGroup(runStart, end - runStart, previous);
  }
}
