import { AtlasTexture } from "three-gpu-pathtracer/src/webgpu/AtlasTexture.js";

const installed = Symbol.for("9glenn.photoAtlasQuadUV");

/**
 * Compatibility for the pinned experimental tracer (010d2109). Its atlas
 * fullscreen quad has only UV0, but source textures can address UV1 on a door.
 * Leaving that channel on the blit material samples a missing quad attribute;
 * material reuse then copies foliage's transparent corner across its tile.
 * Normalize only temporary blit handles. Actual material texture descriptors
 * retain their UV channels, transforms, sources, and packing identities.
 */
export function installPhotoAtlasCompatibility() {
  const prototype = AtlasTexture.prototype;
  if (prototype[installed]) return;
  const renderTextures = prototype._renderTextures;
  if (typeof renderTextures !== "function")
    throw new Error("Photo texture atlas API changed; review UV compatibility");
  prototype._renderTextures = function (renderer, textures, placements) {
    const owned = [];
    const blitTextures = textures.map((texture) => {
      if (texture.channel === 0) return texture;
      const copy = texture.clone();
      copy.channel = 0;
      owned.push(copy);
      return copy;
    });
    try {
      return renderTextures.call(this, renderer, blitTextures, placements);
    } finally {
      owned.forEach((texture) => texture.dispose());
    }
  };
  prototype[installed] = true;
}
