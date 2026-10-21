import * as THREE from "three";

const IMAGE_SIZE = 2048;
const IMAGE_BYTES = IMAGE_SIZE * IMAGE_SIZE * 4 * 4 / 3;
const BUDGET_BYTES = 64 * 1024 * 1024;

/** Upgrade visible imagery without retaining every large image visited on the timeline. */
export function createTerrainTexturePool(anisotropy: number, invalidate: () => void) {
  const loader = new THREE.TextureLoader(new THREE.LoadingManager());
  const images = new Map<string, { uniform: THREE.IUniform<THREE.Texture>; preview: THREE.Texture }>();
  const resident = new Map<string, THREE.Texture>();
  const failed = new Set<string>();
  let wanted: string[] = [];
  let enabled = true;
  let pending: Promise<void> | undefined;
  let loading: string | undefined;
  let peakBytes = 0;
  let evictions = 0;

  const release = (texture: THREE.Texture) => {
    texture.dispose();
    texture.image = null;
  };
  const trim = () => {
    for (const [name, texture] of resident) {
      if (wanted.includes(name)) continue;
      images.get(name)!.uniform.value = images.get(name)!.preview;
      release(texture);
      resident.delete(name);
      evictions++;
    }
  };
  const drain = async () => {
    while (true) {
      const name = wanted.find(name => images.has(name) && !resident.has(name) && !failed.has(name));
      if (!name) return;
      loading = name;
      peakBytes = Math.max(peakBytes, (resident.size + 1) * IMAGE_BYTES);
      let texture: THREE.Texture | undefined;
      try {
        texture = await loader.loadAsync(`textures/mobile/detail/${name}`);
        // Reject accidental oversized exports before they can reach the GPU.
        const imageSize = texture.image as HTMLImageElement;
        if (imageSize.width > IMAGE_SIZE || imageSize.height > IMAGE_SIZE) throw new Error("Oversized terrain image");
        if (!wanted.includes(name)) { release(texture); continue; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(anisotropy, 8);
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        resident.set(name, texture);
        const image = images.get(name)!;
        image.uniform.value = texture;
        // Keep the small source image for recovery, but free its old GPU allocation.
        image.preview.dispose();
        invalidate();
      } catch {
        if (texture) release(texture);
        failed.add(name);
        // The correctly dated preview remains usable when an upgrade cannot load.
      } finally { loading = undefined; }
    }
  };
  const pump = () => {
    if (pending) return;
    pending = drain().finally(() => { pending = undefined; });
  };

  return {
    register(name: string, uniform: THREE.IUniform<THREE.Texture>) {
      images.set(name, { uniform, preview: uniform.value });
    },
    select(names: string[]) {
      const next = enabled ? [...new Set(names)].filter(name => images.has(name)).slice(0, Math.floor(BUDGET_BYTES / IMAGE_BYTES)) : [];
      if (next.join() === wanted.join()) return;
      wanted = next;
      trim();
      pump();
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) { wanted = []; trim(); }
      invalidate();
    },
    stats() {
      return { budgetBytes: BUDGET_BYTES, reservedBytes: (resident.size + Number(!!loading)) * IMAGE_BYTES,
        peakBytes, evictions, loading: loading ?? null, enabled,
        resident: [...resident].map(([name, texture]) => {
          const image = texture.image as HTMLImageElement;
          return { name, width: image.width, height: image.height };
        }) };
    },
  };
}
