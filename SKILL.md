---
name: bande-dessinee-3d-scene
description: >-
  End-to-end workflow to build an interactive 3D Bande Dessinee (French graphic novel / Mathieu Bablet "Cairn" style) web scene from a short text prompt and optional reference video/images. Covers reference/prompt analysis, procedural Blender chiseled terrain & normal-map generation, GLB Meshopt/WebP optimization, Three.js custom GLSL cel+ink shader, zero-stutter spline drone flight, procedural WebAudio soundscape, literary editorial UI, and headless GPU visual verification.
---

# Bande Dessinée 3D Scene Workflow (Cairn / Mathieu Bablet Standard)

Use this skill when the user wants to generate a complete, production-grade **French Bande Dessinée (*Ligne Claire* / Mathieu Bablet *Cairn*) 3D interactive web scene** from **a single text prompt** (and **optional reference video or images**).

This workflow produces the exact final quality standard of **SNOWLINE (`tinymountain-3d`)**:
- Monumental chiseled rock architecture (no heightmap pyramid creases or triangle-grid artifacts).
- High-contrast 3-band graphic novel lighting (warm sandstone-ochre sunlit faces vs deep Prussian-indigo shadows).
- Razor-sharp, contiguous snow/terrain color blocks with `1px` adaptive screen-space ink outlines (`fwidth`).
- Silky-smooth 60 FPS drone flight along a dual-spline damped camera corridor.
- Procedural WebAudio ambient soundscape with real-time volume control and authentic literary typography.

---

## Inputs Supported

1. **Prompt Only (Required)**: A short description of the landscape/scene (e.g., *"A solitary twin-peaked alpine ridge above the snowline at golden hour"*, *"A windswept basalt canyon with snow ledges"*).
2. **Reference Video / Images (Optional)**: An `.mp4`/`.mov` drone flight video or reference images.
   - If provided: extract metadata via `ffprobe` and keyframe contact sheets via `ffmpeg` to match camera focal length, horizon placement, ridge profile, and flight path.
   - If omitted: synthesize the geographic layout (main spine, secondary spurs, foreground framing ridge, distant 360° horizon ring, and a 50–60s cinematic flight corridor) directly from the prompt.

---

## Quick Start: Scaffold Golden Template

Before starting Stage 1 in a new or empty directory, run the bundled scaffolder to copy the golden reference pipeline (`scripts/build_world.py`, `scripts/optimize.mjs`, `textures/paint-layout.json`, and the complete `snow-mountain-web/` Three.js + WebAudio + Editorial UI app):

```bash
python3 <skill_dir>/scripts/scaffold_bande_dessinee_scene.py <target_project_dir>
```

Then customize the ridge coordinates, color palette, camera spline, and editorial copy according to the user's prompt (and optional video) across Stages 1–6.

---

## End-to-End 6-Stage Execution Pipeline

Execute all six stages in order without stopping at intermediate blockouts unless the user explicitly asks for a checkpoint.

### Stage 1: Scene Layout & Camera Architecture
1. **Coordinate System & Scale**:
   - Author in metric world units (e.g., `32km × 32km` total extent, hero region `±6000m`, peak elevations `1800m–2800m`).
   - Note coordinate mapping between Blender `(X, Y, Z-up)` and Three.js `(X, Y-up = Z_blender, Z = -Y_blender)`.
2. **Hero Camera Framing**:
   - Position the default free-roam camera so the primary peak sits at the upper-right golden ratio with a sweeping foreground ridge leading the eye from bottom-left to center-right (e.g., Three.js `position.set(8900, 3605, 2064)` looking at `target.set(200, 1750, -650)`, `FOV ~32°`).
   - If matching a user screenshot, solve for `(radius, elevation, azimuth, target)` via spherical coordinate grid search.

### Stage 2: Procedural Blender World & Texture Baking (`scripts/build_world.py`)
Read [references/blender-geology-pipeline.md](./references/blender-geology-pipeline.md) and generate the `.blend` + baseline `.glb` via headless Blender (`blender -b --python scripts/build_world.py`):
1. **Multi-Tile Seamless Grid**:
   - Split terrain into a `5×5` grid (`BOUND = [-16000, -6000, -2000, 2000, 6000, 16000]`) with highest vertex density (`384×384`) and `2048×2048` color + normal textures on `Hero` tiles, `1024×1024` on `Midground`, and `512×512` on `Background`.
   - Compute analytical world-space heights and finite-difference normals `(gx, gy)` using identical world coordinates along shared tile edges so seams never crack.
2. **Chiseled Geological Relief (No Smooth Cones)**:
   - Combine tectonic domain warping (`wx, wy`), folded angular ridges (`1 - abs(2*noise - 1)`), and stepped horizontal strata terraces (`terrace`) in `height(x, y)`.
3. **Strict Anti-Artifact Rules in Texture Baking**:
   - **NEVER** use per-tile `np.pad(..., mode='edge')` to compute concavity (causes ruler-straight white snow lines along tile borders `x = ±2000`).
   - **NEVER** paint straight 2D polyline snow strokes vertically down steep pyramid faces (`tanSlope > 0.70`).
   - Bake a `2048×2048` tangent-space normal map (`*_normal.png`) from stratified rock relief (`sin(strata * pi) * 1.6 + noise`) so every rock face has chiseled planar facets.

### Stage 3: GLB Validation & Compression (`scripts/optimize.mjs`)
1. Export raw `.glb` from Blender and compress using `@gltf-transform/cli` (`meshopt` geometry compression + `webp` textures) into `public/models/snow_mountain_world.glb` (~15–22 MB).
2. Validate with `gltf-validator` (`0 errors, 0 warnings`).

### Stage 4: Three.js Bande Dessinée Shader & Seamless Sky (`src/scene.js`)
Read [references/cairn-shader-and-sky.md](./references/cairn-shader-and-sky.md) and implement `createScene()`:
1. **Seamless Sky Dome**:
   - Load `painted-sky.png` with `t.wrapS = THREE.MirroredRepeatWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;` so `atan(d.z, d.x)` never creates a vertical branch-cut seam in the sky.
2. **Custom `onBeforeCompile` Bande Dessinée Shader (`applyCairnShader`)**:
   - Enforce all 5 mandatory shader rules from [references/cairn-shader-and-sky.md](./references/cairn-shader-and-sky.md):
     1. **No `fwidth(vVertexNormal)`**: Always compute crease and silhouette ink from `mappedWorldNorm = normalize((vec4(normal, 0.0) * viewMatrix).xyz)` (includes the 2048px normal map) to prevent triangle-grid "caterpillar" teeth on ridges.
     2. **No `floor()` in normal perturbation**: Use smooth-stepped waves `slabU - sin(slabU * 18.8495) / 22.0` to avoid `1px` stair-step speckles on sunlit rock faces.
     3. **Mutually exclusive ink regions**: Gate horizontal strata seams (`seamWave`) with `regionMask = smoothstep(-0.05, 0.15, n1)` and vertical dihedral cracks (`crackWave`) with `(1.0 - regionMask)` so lines never cross into `X` / `+` tic-tac-toe artifacts.
     4. **Steep-cliff snow suppression & clean rock fallback**: Suppress residual snow on steep cliffs (`cliffMask = smoothstep(0.56, 0.78, tanSlope) * smoothstep(1060.0, 1340.0, y)`) and replace high-luma texels in `rockBase` with `fallbackRock` so white snow texels never bleed into rock shading.
     5. **Native Hardware MSAA**: Render directly via `renderer.render(scene, camera)` with `antialias: true` and `ACESFilmicToneMapping`.

### Stage 5: Zero-Stutter Drone Flight, WebAudio & Literary Editorial UI
Read [references/smooth-flight-and-audio.md](./references/smooth-flight-and-audio.md) to wire the interactive experience:
1. **Silky-Smooth Drone Flight (`src/camera-controller.js`)**:
   - Build two `THREE.CatmullRomCurve3` splines (`posCurve` and `lookCurve`, `centripetal`, `tension = 0.5`), pre-sample `1200` arc-length points, and damp both camera position and orientation (`quaternion.slerp`) with `1 - Math.exp(-dt * rate)`. Never use finite-difference tangent `point(t + 0.008)` for camera look-at.
2. **Procedural WebAudio Soundscape (`src/audio.js`)**:
   - Synthesize altitude-reactive alpine wind (pink noise + dual bandpass filters), warm harmonic drone pads, and sparse crystalline notes (`C major9 / A aeolian`), paired with a real-time `#audio-volume` slider (`0–100%`).
3. **Editorial Typography & Authentic Literary Quotes (`index.html`, `src/style.css`)**:
   - Top masthead in Chinese (`雪 线 · 孤 山 绘 本`, `♪ 山间回响 · 开` + volume slider, `山间手记 ↗`); main HUD and flight chapters in poetic English.
   - Populate `山间手记` (`#about`) with **authentic literary quotes** from classic mountain literature (Nan Shepherd *The Living Mountain* 《活山》, Robert Macfarlane *Mountains of the Mind* 《心向群山》, John Muir *Our National Parks* 《我们的国家公园》) — never generic AI-written prose.
   - Frame the viewport in warm museum mat paper (`#ECE8DD`) without dark muddy radial vignettes over the sky.

### Stage 6: Automated Headless GPU Verification
1. Run `npm run build` to verify zero bundler errors.
2. Launch headless Chromium via Playwright with hardware Metal acceleration (`args: ["--use-angle=metal"]` on macOS) at `1600×1000 @ 2x` device scale.
3. Capture both the default hero view (`docs/final-browser.png`) and active ridge flight (`docs/flight-13.png`).
4. Visually inspect the captured screenshots to confirm:
   - Zero vertical white snow stripes on steep peak faces;
   - Zero sky seams;
   - Zero triangle-grid "caterpillar" teeth along ridges;
   - Crisp Bande Dessinée ink lines and 60 FPS runtime performance.
