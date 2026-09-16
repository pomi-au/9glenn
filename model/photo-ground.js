import * as THREE from "three/webgpu";

/** A surrounding stage with an opening for the entire modeled site.
 * The opening preserves the sloped garden, cellar and submerged pool geometry. */
export function createPhotoGround(model) {
  const bounds = new THREE.Box3().setFromObject(model.root);
  const centre = bounds.getCenter(new THREE.Vector3());
  const surface = new THREE.Shape();
  surface.absarc(centre.x, -centre.z, 180, 0, Math.PI * 2, false);
  const opening = new THREE.Path();
  const inset = 0.02;
  opening.moveTo(bounds.min.x - inset, -bounds.min.z + inset);
  opening.lineTo(bounds.max.x + inset, -bounds.min.z + inset);
  opening.lineTo(bounds.max.x + inset, -bounds.max.z - inset);
  opening.lineTo(bounds.min.x - inset, -bounds.max.z - inset);
  opening.closePath();
  surface.holes.push(opening);
  const ground = new THREE.Mesh(
    new THREE.ShapeGeometry(surface, 64),
    new THREE.MeshStandardMaterial({ color: 0x9a9b83, roughness: 1 }),
  );
  ground.name = "photographic-ground";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.574;
  ground.receiveShadow = true;
  ground.visible = false;
  return ground;
}
