# Procedural Blender Chiseled Geology & GLB Pipeline

## 1. Sculpting Chiseled Bande Dessinée Mountains (`height(x, y)`)

Standard heightmap interpolation creates smooth cones with artificial diagonal pyramid creases. To achieve the chiseled, monolithic slab architecture of *Cairn* (Mathieu Bablet):

1. **Tectonic Domain Warping**:
   Warp `(x, y)` before evaluating ridge distance so ridges bend organically:
   ```python
   wx = x + 270 * (noise(x / 780, y / 860) - 0.5)
   wy = y + 200 * (noise(x / 810 + 17, y / 720) - 0.5)
   ```
2. **Folded Angular Buttresses & Stepped Terraces**:
   Add sharp-crested folded noise (`1 - abs(2 * noise - 1)`) and stepped horizontal geological strata (`terrace`):
   ```python
   u = 0.82 * x - 0.57 * y
   v = 0.57 * x + 0.82 * y
   folded = 1 - np.abs(2 * noise((u + 90 * noise(x / 410, y / 380)) / 290, v / 580) - 1)
   broken = 1 - np.abs(2 * noise(u / 115 + 17, v / 230) - 1)
   strata_step = result / 135 + u / 310 + noise(x / 380, y / 420) * 0.50
   terrace = (np.floor(strata_step) + np.clip((strata_step - np.floor(strata_step) - 0.24) * 2.0, 0, 1) - strata_step) * 26
   detail = (folded ** 1.6 - 0.40) * 215 + (broken ** 1.5 - 0.38) * 76 + terrace
   detail += (noise(x / 650, y / 540) - 0.5) * 175 + (noise(u / 58, v / 105) - 0.5) * 20
   ```

---

## 2. Seamless Multi-Tile Texture & Normal Map Baking (`paint_texture`)

1. **Zero Tile-Boundary Seams**:
   - Evaluate all noise, slope, and strata formulas in continuous world coordinates `(X, Y, Z)`.
   - **Never** use tile-local `np.pad(geometry_z, mode='edge')` to estimate concavity — edge padding creates a false concavity spike along tile boundaries (`x = ±2000`), painting straight vertical white lines up the mountain.
2. **3-Tone Bande Dessinée Mineral Rock Base**:
   - Blend three distinct mineral pigments across strata and tectonic blocks:
     - Cool Slate: `#535E73`
     - Mid Umber-Slate: `#716C6D`
     - Warm Sandstone Ochre: `#968678`
   - Warm Ivory Snow: `#F2EFE6` blended with Cool Alpine Drift `#DCE6F2`.
3. **Sculpted Tangent-Space Normal Maps**:
   - For Hero (`2048×2048`) and Midground (`1024×1024`) tiles, bake tangent-space normal maps from stratified rock relief so the Three.js shader's `mappedWorldNorm` captures chiseled rock facets:
     ```python
     relief = (np.sin(strata * 3.14159) * 1.6 + noise(u / 68, v / 98) * 2.8) * (1 - mask) + noise(u / 95, v / 180) * 0.55 * mask
     dy, dx = np.gradient(relief, (y1 - y0) / (T - 1), (x1 - x0) / (T - 1))
     ts = np.stack([-dx * 1.4, -dy * 1.4, np.ones_like(dx)], axis=-1)
     ts /= np.linalg.norm(ts, axis=-1)[..., None]
     normal_image = image_array(name + '_normal', ts * 0.5 + 0.5, False)
     ```

---

## 3. Reproducible Build & GLB Optimization Commands

```bash
# 1. Build .blend and raw .glb in headless Blender
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build_world.py

# 2. Compress with Meshopt + WebP and validate with gltf-validator
node scripts/optimize.mjs

# 3. Copy optimized GLB into web public folder
cp exports/snow_mountain_world.glb snow-mountain-web/public/models/snow_mountain_world.glb
```
