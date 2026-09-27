# Zero-Stutter Drone Flight, Procedural WebAudio & Editorial UI

## 1. Silky-Smooth Dual-Spline Drone Flight (`src/camera-controller.js`)

### Why Naive Spline Cameras Stutter
Computing the look-at target via a finite-difference tangent `point(t + 0.008)` on a piecewise cubic spline causes visible camera jerks because the second derivative jumps at every control point.

### The Production Solution
1. Construct **two** `THREE.CatmullRomCurve3` curves (`posCurve` and `lookCurve`) with `'centripetal'` parameterization and `tension = 0.5`.
2. Pre-sample `1200` arc-length spaced points via `getSpacedPoints(1200)` and interpolate linearly in `O(1)` time per frame.
3. Apply framerate-independent exponential damping (`const alpha = 1 - Math.exp(-dt * 4.5)`) to both `camera.position.lerp(...)` and `camera.quaternion.slerp(...)`.

---

## 2. Solving Camera Coordinates from a User Reference Screenshot

When the user provides a screenshot of a desired view and asks to set it as the default camera angle:
1. Keep `controls.target` fixed (e.g., `(200, 1750, -650)`).
2. Parameterize `camera.position` in spherical coordinates `(R, phi, theta)` around `target`:
   - Estimate distance `R` from apparent scale of the hero peak;
   - Estimate elevation angle `phi` from the vertical screen position of the horizon line relative to the target height;
   - Estimate azimuth angle `theta` from the horizontal separation and occlusion of the twin peaks.
3. Verify by rendering in headless Chromium (`--use-angle=metal`) and comparing the screenshot side-by-side.

---

## 3. Procedural WebAudio Alpine Soundscape (`src/audio.js`)

Use 100% local, zero-asset WebAudio synthesis:
1. **Pink Noise Wind Generator**:
   - Generate a 6-second looping pink-noise buffer routed through two resonant `bandpass` filters (`windFilterLow` ~160–420 Hz, `windFilterHigh` ~550–1200 Hz) modulated by camera altitude and LFOs.
2. **Warm Harmonic Drone Pad**:
   - Layered `sine` + `triangle` oscillators (`C2`, `G2`, `D3`, `E3`) through a low-pass filter (`~320 Hz`).
3. **Sparse Crystalline Mountain Notes**:
   - Schedule gentle harp/piano-like `sine`+`triangle` plucks from an alpine modal scale (`[261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]`) with long exponential decay and stereo delay feedback.
4. **Real-Time Volume Slider**:
   - Provide `setVolume(v)` on the audio controller (`0.0` to `1.0`), ramping `master.gain` smoothly with `setTargetAtTime(v * 0.85, now, 0.08)`.

---

## 4. Editorial UI & Authentic Literary Copy (`index.html`, `src/style.css`)

1. **Bilingual Hierarchy**:
   - Keep the top masthead (`header.masthead`) and the `#about` (`山间手记`) drawer in refined Chinese (`雪 线 · 孤 山 绘 本`, `♪ 山间回响 · 开` + `#audio-volume` slider, `山间手记 ↗`).
   - Keep the main viewport HUD, flight chapters, and interactive controls in poetic English (*"Beyond the snowline."*, *"Where the world falls silent along the ridgeline."*).
2. **Authentic Literary Quotes Only**:
   - Inside `山间手记` (`#about`), always quote real, published mountain literature verbatim rather than writing synthetic prose:
     - Nan Shepherd — *The Living Mountain*（《活山》）
     - Robert Macfarlane — *Mountains of the Mind*（《心向群山》）
     - John Muir — *Our National Parks*（《我们的国家公园》）
3. **Framing & Styling**:
   - Frame the canvas in warm museum paper (`#ECE8DD`) with crisp `1px` hairline borders.
   - Do **not** overlay dark radial vignettes or noisy CSS stipple patterns over the WebGL canvas, as they muddy the painted sky dome.
