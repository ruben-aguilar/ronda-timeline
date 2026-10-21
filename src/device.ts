// Choose the initial budget before any textures or render buffers are allocated.
const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
export const constrainedDevice = matchMedia("(pointer: coarse)").matches
  || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (memory !== undefined && memory <= 4);

export const terrainTexturePath = (name: string) => `textures/${constrainedDevice ? "mobile/" : ""}${name}`;
