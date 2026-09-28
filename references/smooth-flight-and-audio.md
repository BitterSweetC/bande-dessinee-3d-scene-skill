# Zero-Stutter 5-Act Drone Flight, Real 3D Mini-Map & Scene-Specific WebAudio

## 1. Curated 5-Act Dual-Spline Drone Flight (`src/camera-controller.js`)

### Why Naive or Template Spline Cameras Fail
1. Computing the look-at target via a finite-difference tangent `point(t + 0.008)` on a piecewise cubic spline causes visible camera jerks because the second derivative jumps at every control point.
2. Reusing a fixed template spline or dropping the camera into a narrow low-altitude slot causes protruding canyon walls or spurs to block half the viewport, while keeping the camera too far back makes all 5 chapters look identical.

### The Production Solution
1. **Match Telephoto Lens (`36°–38°` FOV)**: Set `this.fpv.fov = 38; this.fpv.updateProjectionMatrix();` so the flight camera shares the same graphic-novel compression as the free-roam camera.
2. **Design a 5-Act Expedition Spline (`keyPts` & `lookPts`)**:
   - Construct **two** `THREE.CatmullRomCurve3` curves (`keyPts` sampled via a smooth cubic B-spline `_sampleBSpline`, and `lookPts` for the look-at target, with `'centripetal'` parameterization and `tension = 0.5`).
   - Map out the terrain centerline and rim elevations first, then place control points so each of the 5 chapters (`t = 5s, 15s, 26s, 36s, 47s` out of `52s`) frames a **distinct, unobstructed landmark** matching its chapter title:
     - **Chapter 01 (`~05s`)**: Low-mid entry framing the foreground geological feature (e.g., hydrothermal geyser basins, foothills, or valley floor) in crisp detail.
     - **Chapter 02 (`~15s`)**: Lateral bank across the central formation looking toward the sunlit cliff walls or secondary peak.
     - **Chapter 03 (`~26s`)**: Ascent to a high rim/ridge overlook framing the S-bend or mid-valley below.
     - **Chapter 04 (`~36s`)**: Straight, unobstructed corridor aligned with the gorge/ridge centerline framing the primary focal feature (e.g., waterfall, summit pyramid, or arch).
     - **Chapter 05 (`~47s–52s`)**: High panoramic ascent revealing the wider caldera, valley meander, and distant horizon range.
3. **Keep Banking Subtle (`≤ 0.035 rad`)**: Apply framerate-independent exponential damping (`const alpha = 1 - Math.exp(-dt * 14)`) and keep roll banking under `0.035 rad` so the horizon never tilts unnaturally.

---

## 2. Real-Time 3D Mini-Map Projection (`#route-map` in `src/main.js`)

**Never** leave a hardcoded static SVG curve in `.route-line` or drive `#map-dot` purely from time `ratio` along a static path. Instead, project the true 3D `(x, z)` coordinates of `controller.splinePts` and the live camera `active.getWorldPosition(pos)` onto the `180 × 120` SVG `viewBox`:

```js
// 1. Compute bounding box of the 3D flight spline and project .route-line dynamically:
const pts = controller.splinePts;
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of pts) {
  if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
  if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
}
const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
const sx = 78 / Math.max(400, maxX - minX), sz = 88 / Math.max(400, maxZ - minZ);
const toMap = (x, z) => ({
  x: Math.max(10, Math.min(170, 90 + (x - cx) * sx)),
  y: Math.max(10, Math.min(110, 58 + (z - cz) * sz))
});
const elRoute = document.querySelector('.route-line');
if (elRoute) {
  const d = pts.filter((_, i) => i % 20 === 0 || i === controller.splineN)
    .map((p, i) => { const m = toMap(p.x, p.z); return `${i ? 'L' : 'M'}${m.x.toFixed(1)} ${m.y.toFixed(1)}`; })
    .join(' ');
  elRoute.setAttribute('d', d);
}

// 2. Every frame in the animation loop, project the camera's real 3D (pos.x, pos.z):
const m = toMap(pos.x, pos.z);
elDot.setAttribute('cx', m.x.toFixed(1));
elDot.setAttribute('cy', m.y.toFixed(1));
```

---

## 3. Scene-Specific Procedural WebAudio Soundtrack (`src/audio.js`)

**Never** reuse the fixed snow-mountain audio (`C major9` felt piano + icy alpine wind whistle) on non-snow scenes. Use 100% local, zero-asset WebAudio synthesis tailored to the prompt's specific biome and landscape:

| Biome / Landscape | Harmonic Mode & Progression | Lead & Accompaniment Instruments | Environmental Soundscape Layers |
| :--- | :--- | :--- | :--- |
| **Volcanic Caldera / Canyon / Geothermal (e.g., Yellowstone)** | **D Dorian / Mixolydian** (`Dm9 → C6/9 → Gm7/Bb → Asus4 → Dm`) | Fingerpicked **Acoustic Baritone Canyon Guitar / Ronroco** (32-step composed arpeggio + `195 Hz` body resonance + canyon slapback delay) + **Native American Wooden Cedar Flute** (`5.2 Hz` breath vibrato, portamento, chiff attack) + **Bowed Cello Open-Fifth Drone** (`D2–A2–D3`) | Rushing **waterfall cascade** (bandpass/lowpass noise that swells as flight approaches falls) + **hydrothermal hot-spring percolation** & steam vents |
| **High Alpine Snow Peak / Glacier (e.g., Snowline)** | **A Aeolian / C Major 9** (`Am9 → Fmaj7 → Cmaj9 → Em7`) | Sparse **Crystalline Felt Piano / Harp Harmonics** with long cathedral delay + **Warm Analog String Pad** | Altitude-reactive **alpine ridge wind** (dual resonant bandpass filters modulated by camera altitude) |
| **Desert Red-Rock Mesa / Badlands** | **E Phrygian Dominant / D Minor Pentatonic** | Resonant **Slide Guitar / Tremolo Baritone** + **Low Harmonium / Bowed Bass Drone** | Warm **desert canyon thermal breeze** + dry sandstone echo |
| **Coastal Cliffs / Fjord / Ocean Archipelago** | **G Lydian / E Dorian** | **Celtic Harp / Acoustic 12-String Arpeggio** + **Warm French Horn / Cello Swell** | Rhythmic **ocean surf swell** (LFO-modulated pink/brown noise) + coastal wind |

Always provide:
- `setVolume(v)` (`0.0` to `1.0`) wired to the `#audio-volume` slider, ramping `master.gain` smoothly with `setTargetAtTime(v * 0.85, now, 0.08)`.
- `update(dt, altitude, flightProgress)` so environmental layers (such as waterfall roar, thermal springs, or summit wind) respond dynamically to the camera's 3D position and flight progress.

---

## 4. Editorial UI, High-Contrast HUD & Authentic Literary Copy (`index.html`, `src/style.css`)

1. **Bilingual Hierarchy**:
   - Keep the top masthead (`header.masthead`) and the `#about` drawer in refined Chinese matching the scene (`黄 石 · 荒 原 绘 本` / `雪 线 · 孤 山 绘 本`), and keep the main viewport HUD, flight chapters, and interactive controls in poetic English.
2. **High-Contrast Flight HUD**:
   - Style `.flight-data .overline` in warm ivory-gold (`#f7d9b5`) and apply a multi-layer dark shadow (`text-shadow: 0 2px 18px #14222ecc, 0 1px 4px #14222eaa`) to `.flight-data` so chapter labels and altitude readouts never wash out over sunlit yellow/ochre rock walls.
3. **Authentic Literary Quotes Only**:
   - Inside `#about`, always quote real, published literature verbatim matching the specific landscape (e.g., John Muir *Our National Parks* 《我们的国家公园》 for Yellowstone/Yosemite, Nan Shepherd *The Living Mountain* 《活山》 or Robert Macfarlane *Mountains of the Mind* 《心向群山》 for alpine peaks).
4. **Framing & Styling**:
   - Frame the canvas in warm museum paper (`#ECE8DD`) with crisp `1px` hairline borders, without dark radial vignettes over the sky.

