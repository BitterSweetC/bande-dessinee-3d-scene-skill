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

Then **must** customize all of the following to match the user's specific geography/biome across Stages 1–6 (never leave snow-mountain defaults on non-alpine prompts):
- **Geological topology & heightfield (`scripts/build_world.py`)**: Sculpt the exact landform requested (e.g., stepped canyon & hydrothermal basins, coastal sea stacks, volcanic caldera, desert mesas, or alpine massif).
- **Mineral color palette & shader zones (`scripts/build_world.py`, `src/scene.js`)**: Match authentic regional rock/water/foliage pigments and subdued natural saturation.
- **5-Act 3D flight spline (`src/camera-controller.js`) & real-time 3D mini-map projection (`src/main.js`)**: Design `keyPts` and `lookPts` so all 5 flight chapters (`05s, 15s, 26s, 36s, 47s`) present distinct, unobstructed vistas, and project `controller.splinePts` + live camera `(pos.x, pos.z)` directly onto the `#route-map` SVG.
- **Scene-specific musical score & environmental soundscape (`src/audio.js`)**: Compose a procedural WebAudio soundtrack whose lead instrument, harmonic mode, and environmental sound layers match the scene's geography (never reuse the alpine snow-wind + Cmaj9 piano soundtrack on non-snow scenes).
- **Editorial copy & literary quotes (`index.html`, `src/style.css`)**: Curate authentic published literature matching the specific landscape.

---

## End-to-End 6-Stage Execution Pipeline

Execute all six stages in order without stopping at intermediate blockouts unless the user explicitly asks for a checkpoint.

### Stage 1: Scene Layout & Camera Architecture
1. **Coordinate System & Scale**:
   - Author in metric world units (e.g., `32km × 32km` total extent, hero region `±6000m`, peak elevations `1800m–2800m`).
   - Note coordinate mapping between Blender `(X, Y, Z-up)` and Three.js `(X, Y-up = Z_blender, Z = -Y_blender)`.
2. **Hero Camera Framing**:
   - Position the default free-roam camera so the primary landmark sits at a balanced golden-ratio focal point with a sweeping foreground leading the eye into the scene (`FOV ~32°–38°`).
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

### Stage 5: Zero-Stutter 5-Act Drone Flight, Scene-Specific WebAudio & Real-Time 3D Mini-Map
Read [references/smooth-flight-and-audio.md](./references/smooth-flight-and-audio.md) to wire the interactive experience:
1. **Curated 5-Act Drone Flight (`src/camera-controller.js`) & True 3D Mini-Map (`src/main.js`)**:
   - Match `this.fpv.fov` to the cinematic telephoto range (`36°–38°`).
   - Build two `THREE.CatmullRomCurve3` splines (`keyPts` for camera position sampled via cubic B-spline, and `lookPts` for look-at targets, `centripetal`, `tension = 0.5`).
   - **Never** use a fixed template curve or let the camera drop into a low trench where canyon walls block half the screen. Design `keyPts` and `lookPts` around the 5 chapters (`05s, 15s, 26s, 36s, 47s`) so each chapter showcases a distinct, unobstructed landmark.
   - **Real 3D Mini-Map Projection**: Dynamically generate `.route-line`'s SVG `d` attribute from the top-down `(x, z)` projection of `controller.splinePts`, and update `#map-dot` (`cx, cy`) every frame from the active camera's real 3D world position `active.getWorldPosition(pos)`.
2. **Scene-Specific Procedural WebAudio Soundtrack (`src/audio.js`)**:
   - **Never** leave the fixed alpine snow-mountain audio on non-snow scenes. Design a composed procedural WebAudio score tailored to the prompt's biome (see biome instrumentation table in [references/smooth-flight-and-audio.md](./references/smooth-flight-and-audio.md)), paired with a real-time `#audio-volume` slider (`0–100%`) and flight-progress modulation (`audio.update(dt, pos.y, ratio)`).
3. **Editorial Typography, High-Contrast HUD & Authentic Literary Quotes (`index.html`, `src/style.css`)**:
   - Ensure `.flight-data` and `.flight-data .overline` have bright ivory/gold color (`#f7d9b5`) and strong dark text-shadow so chapter titles remain legible over sunlit terrain.
   - Populate `#about` with **authentic literary quotes** from classic literature matching the specific region/biome — never generic AI-written prose.
   - Frame the viewport in warm museum mat paper (`#ECE8DD`) without dark muddy radial vignettes over the sky.

### Stage 6: Automated Headless GPU & 5-Chapter Flight Verification
1. Run `npm run build` to verify zero bundler errors.
2. Launch headless Chromium via Playwright with hardware Metal acceleration (`args: ["--use-angle=metal"]` on macOS) at `1600×1000 @ 2x` device scale.
3. Capture the default hero view (`docs/final-browser.png`) AND **all 5 flight chapters** (`docs/chapter-05.png`, `docs/chapter-15.png`, `docs/chapter-26.png`, `docs/chapter-36.png`, `docs/chapter-47.png` via `tests/chapters.mjs`).
4. Visually inspect all captured screenshots with `view_file` to confirm:
   - All 5 flight chapters show distinct, progressive, unobstructed compositions matching their chapter titles (zero foreground wall/spur blocking the view, zero static camera);
   - The `#route-map` mini-map dashed curve and dot accurately reflect the true 3D `(x, z)` trajectory;
   - Zero vertical white snow stripes on steep peak faces, zero sky seams, and zero triangle-grid "caterpillar" teeth along ridges;
   - Crisp Bande Dessinée ink lines, legible HUD text, and 60 FPS runtime performance.
