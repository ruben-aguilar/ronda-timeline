/** One photo projection for ground, roofs and courts, with identical overlap priority. */
export const MODERN_PHOTO_GLSL = /* glsl */ `
uniform sampler2D tModernBase, tModernCenter, tModernStation, tModernNortheast, tModernTajo, tModernWest, tModernSouth;
uniform float uRoofStation, uRoofNortheast, uRoofTajo, uRoofWest, uRoofSouth;
float photoEdge(vec2 uv, float feather) {
  return smoothstep(0.0, feather, min(min(uv.x, uv.y), min(1.0-uv.x, 1.0-uv.y)));
}
vec3 modernPhoto(vec2 uv) {
  vec3 c = texture2D(tModernBase, uv).rgb;
  vec2 p = (uv - 0.25) * 2.0;
  float w = photoEdge(p, 0.02);
  if (w > 0.0) c = mix(c, texture2D(tModernCenter, p).rgb, w);
  p = (uv - vec2(0.2875, 0.625)) / 0.3; w = photoEdge(p, 0.025) * uRoofWest;
  if (w > 0.0) c = mix(c, texture2D(tModernWest, p).rgb, w);
  p = (uv - vec2(0.3375, 0.0625)) / 0.3; w = photoEdge(p, 0.025) * uRoofSouth;
  if (w > 0.0) c = mix(c, texture2D(tModernSouth, p).rgb, w);
  // North/east edges coincide with the terrain boundary: do not fade to the coarse image.
  p = (uv - 0.7) / 0.3; w = smoothstep(0.0, 0.025, min(p.x, p.y)) * uRoofNortheast;
  if (w > 0.0) c = mix(c, texture2D(tModernNortheast, clamp(p, 0.0, 1.0)).rgb, w);
  p = (uv - vec2(0.5, 0.625)) / 0.3; w = photoEdge(p, 0.025) * uRoofStation;
  if (w > 0.0) c = mix(c, texture2D(tModernStation, p).rgb, w);
  p = (uv - 0.3375) / 0.3; w = photoEdge(p, 0.025) * uRoofTajo;
  if (w > 0.0) c = mix(c, texture2D(tModernTajo, p).rgb, w);
  return c;
}
`;
