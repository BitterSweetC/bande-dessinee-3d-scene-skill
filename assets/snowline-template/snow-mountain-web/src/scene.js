import * as THREE from 'three';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ab0ca');
  // Disable uniform grey scene fog; depth separation is handled via localized valley mist & sky-tinted far ranges.
  scene.fog = null;

  scene.add(new THREE.HemisphereLight('#c6daf5', '#252f4f', 1.05));
  const sun = new THREE.DirectionalLight('#fff1d6', 3.25);
  // Side-lighting from South-Southwest so one side of each peak/spur is warm sunlit ochre and the other is a unified blue-violet shadow block.
  sun.position.set(3400, 4400, 6200);
  sun.target.position.set(200, 1400, -400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -6500, right: 6500, top: 6500, bottom: -6500, near: 500, far: 22000 });
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 5;
  scene.add(sun, sun.target);

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      paint: { value: null },
      hasPaint: { value: 0 },
      fog: { value: new THREE.Color('#b8cae0') },
      mid: { value: new THREE.Color('#7b98b9') },
      top: { value: new THREE.Color('#4b688b') }
    },
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec3 direction;
      uniform sampler2D paint;
      uniform float hasPaint;
      uniform vec3 fog;
      uniform vec3 mid;
      uniform vec3 top;
      void main(){
        vec3 d = normalize(direction);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(fog, mid, smoothstep(-0.02, 0.28, h));
        c = mix(c, top, smoothstep(0.22, 0.72, h));
        if (hasPaint > 0.5) {
          float u = atan(d.z, d.x) / 6.2831853 + 0.5;
          float v = mix(0.57, 0.97, clamp(h * 1.5, 0.0, 1.0));
          vec4 p = texture2D(paint, vec2(u, v));
          float blend = smoothstep(0.0, 0.18, h) * p.a * 0.90;
          c = mix(c, p.rgb, blend);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), skyMaterial);
  sky.renderOrder = -1;
  scene.add(sky);

  const skyReady = new THREE.TextureLoader()
    .loadAsync(`${import.meta.env.BASE_URL}environment/painted-sky.png`)
    .then(t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.MirroredRepeatWrapping;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      skyMaterial.uniforms.paint.value = t;
      skyMaterial.uniforms.hasPaint.value = 1;
    })
    .catch(() => {});

  function quality(level) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, level === 'high' ? 1.5 : 1));
    sun.castShadow = level === 'high';
    renderer.shadowMap.needsUpdate = true;
  }

  const clayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clay');

  function applyCairnShader(mat, isFar) {
    mat.customProgramCacheKey = () => (isFar ? 'cairn_bd_v11_far' : 'cairn_bd_v11_near') + (clayMode ? '_clay' : '');
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCairnWorldPos;\nvarying vec3 vCairnWorldNorm;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvCairnWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvCairnWorldNorm=normalize(mat3(modelMatrix)*objectNormal);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vCairnWorldPos;
          varying vec3 vCairnWorldNorm;
          float cairnHash(vec3 p){
            p=fract(p*0.3183099+0.1);p*=17.0;
            return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
          }
          float cairnNoise(vec3 x){
            vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
            return mix(mix(mix(cairnHash(i+vec3(0,0,0)),cairnHash(i+vec3(1,0,0)),f.x),
                           mix(cairnHash(i+vec3(0,1,0)),cairnHash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(cairnHash(i+vec3(0,0,1)),cairnHash(i+vec3(1,0,1)),f.x),
                           mix(cairnHash(i+vec3(0,1,1)),cairnHash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }`
        )
        .replace(
          '#include <opaque_fragment>',
          `vec3 viewVec = cameraPosition - vCairnWorldPos;
          float camDist = length(viewVec);
          vec3 viewDir = viewVec / max(camDist, 1.0);

          // Depth hierarchy weights:
          // - Foreground framing ridge (<7600m & x > 2200m)
          // - Hero Peak (6000-11500m)
          // - Far Horizon Range (>11200m or Background_* tiles)
          float fgWeight   = (1.0 - smoothstep(5400.0, 7600.0, camDist)) * smoothstep(2200.0, 3300.0, vCairnWorldPos.x);
          float heroWeight = smoothstep(5800.0, 7200.0, camDist) * (1.0 - smoothstep(10600.0, 13000.0, camDist));
          float farWeight  = max(${isFar ? '0.52' : '0.0'}, smoothstep(11200.0, 16500.0, camDist));
          float nearFade   = 1.0 - farWeight * 0.85;

          float uCoord = 0.82 * vCairnWorldPos.x - 0.57 * vCairnWorldPos.z;
          float vCoord = 0.57 * vCairnWorldPos.x + 0.82 * vCairnWorldPos.z;
          vec3 geoPos = vec3(uCoord, vCairnWorldPos.y, vCoord);

          // 1. Topographic Snow vs Rock Mask:
          //    - Gentle slopes & basins form coherent snowfields
          //    - Steep planar walls expose large expanses of bare rock
          //    - Concave gullies retain longitudinal snow ribbons
          float baseLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float n1 = cairnNoise(geoPos * 0.0090) - 0.5;
          float n2 = cairnNoise(geoPos * 0.026 + 7.3) - 0.5;
          vec3 geomNorm = normalize(vCairnWorldNorm);
          vec3 mappedWorldNorm = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float slopeSteep = 1.0 - clamp(mappedWorldNorm.y, 0.0, 1.0);
          float tanSlope = length(geomNorm.xz) / max(geomNorm.y, 0.08);

          // Steep upper/mid cliff walls shed snow cleanly while couloirs and gentle basins keep coherent snow
          float steepWallClear = smoothstep(0.76, 1.06, tanSlope) * smoothstep(1400.0, 1800.0, vCairnWorldPos.y);
          float gentleBasinFill = (1.0 - smoothstep(0.52, 0.76, tanSlope)) * (1.0 - smoothstep(1180.0, 1480.0, vCairnWorldPos.y)) * 0.22;
          float snowField = (baseLuma - 0.430) - steepWallClear * 0.28 + gentleBasinFill + (n1 * 0.040 + n2 * 0.014) * nearFade;
          float fwSnow = max(fwidth(snowField), 0.0012);
          float snowFactor = smoothstep(-fwSnow * 1.15, fwSnow * 1.15, snowField);
          float pureRockMask = smoothstep(0.14, 0.01, snowFactor);
          float snowBorderInk = (1.0 - smoothstep(0.0, fwSnow * 1.45, abs(snowField))) * smoothstep(0.15, 0.68, slopeSteep);

          // 2. Macro Normal for Monumental Color Blocks vs Faceted Normal for Sunlit Highlights.
          vec3 macroNorm = normalize(mix(geomNorm, mappedWorldNorm, 0.22));
          float slabU = cairnNoise(geoPos * vec3(0.0068, 0.011, 0.0068)) - 0.5;
          float slabV = cairnNoise(geoPos * vec3(0.011, 0.0068, 0.011) + 11.0) - 0.5;
          vec3 slabPerturb = vec3(slabU, slabV, 0.0) * 0.14 * pureRockMask * nearFade;
          vec3 facetNorm = normalize(mappedWorldNorm + slabPerturb);

          // 3. Large Graphic Color Blocks:
          //    - Sunlit flank receives warm golden-ochre light
          //    - Opposite flank forms a unified blue-violet shadow block
          //    - Foreground ridge sits under a cool alpine cloud-shadow so it frames the bright Hero Peak
          vec3 lightDir = normalize(vec3(3400.0, 4400.0, 6200.0));
          float rawNdotL = max(dot(mappedWorldNorm, lightDir), 0.0);
          float directLum = dot(reflectedLight.directDiffuse, vec3(0.3333));
          float baseLumSafe = max(dot(diffuseColor.rgb, vec3(0.3333)), 0.025);
          float shadowMask = rawNdotL > 0.03 ? clamp(directLum / (baseLumSafe * rawNdotL * 0.82), 0.0, 1.0) : 0.0;

          float fgShadowAtten = 1.0 - fgWeight * 0.72;
          float macroLit = dot(macroNorm, lightDir) * (0.32 + 0.68 * shadowMask) * fgShadowAtten;
          float facetLit = dot(facetNorm, lightDir) * (0.28 + 0.72 * shadowMask) * fgShadowAtten;

          float stepShadow = smoothstep(0.11, 0.22, macroLit);
          float stepMid    = smoothstep(0.24, 0.38, mix(macroLit, facetLit, 0.42));
          float stepBright = smoothstep(0.50, 0.66, facetLit) * stepShadow;
          float terminatorBand = stepShadow * (1.0 - stepShadow) * 4.0;

          // Serene snow planes: unified cool blue-violet shadow vs warm sunlit ivory.
          vec3 snowShadow = vec3(0.24, 0.32, 0.55);
          vec3 snowMid    = vec3(0.41, 0.50, 0.68);
          vec3 snowWarm   = vec3(0.89, 0.86, 0.79);
          vec3 snowKey    = vec3(0.97, 0.93, 0.84);
          vec3 snowShaded = mix(snowShadow, snowMid, stepShadow * 0.45);
          snowShaded = mix(snowShaded, snowWarm, stepMid);
          snowShaded = mix(snowShaded, snowKey, stepBright);

          // Monumental rock color blocks: unified blue-violet shadow wall vs warm golden-ochre sunlit wall.
          vec3 fallbackRock = mix(vec3(0.10, 0.12, 0.16), vec3(0.18, 0.15, 0.125), clamp(0.5 + n1 * 1.3, 0.0, 1.0));
          vec3 cleanRockTex = mix(diffuseColor.rgb, fallbackRock, smoothstep(0.28, 0.42, baseLuma));
          float blockTone = smoothstep(-0.08, 0.12, n1);
          vec3 rockTint = mix(vec3(0.90, 0.93, 1.04), vec3(1.12, 1.01, 0.90), blockTone);
          vec3 rockBase = cleanRockTex * rockTint;

          vec3 rockShadow = mix(rockBase * vec3(0.32, 0.40, 0.76), vec3(0.092, 0.116, 0.248), 0.72);
          vec3 rockMid    = mix(rockShadow, rockBase * vec3(0.84, 0.82, 0.92), 0.54);
          vec3 rockWarm   = rockBase * vec3(1.34, 1.13, 0.88) + vec3(0.044, 0.026, 0.008);
          vec3 rockKey    = rockBase * vec3(1.52, 1.29, 0.98) + vec3(0.070, 0.044, 0.016);
          vec3 rockShaded = mix(rockShadow, rockMid, stepShadow);
          rockShaded = mix(rockShaded, rockWarm, stepMid);
          rockShaded = mix(rockShaded, rockKey, stepBright);

          // 4. Focused Structural Linework:
          //    - Zero internal lines on snow (pureRockMask)
          //    - Hushed lines inside shadow blocks (shadowQuiet) so 3D volume reads at first glance
          //    - Rock lines follow bedding planes & fractures, concentrated in key zones (keyZoneMask)
          float shadowQuiet = mix(0.08, 1.0, stepShadow);
          float keyZoneMask = smoothstep(0.03, 0.22, n1 + 0.12 * n2) * smoothstep(0.34, 0.58, slopeSteep);
          float regionMask  = smoothstep(-0.05, 0.15, n1);

          // Dipping geological bedding seams
          float seamWave = sin(vCairnWorldPos.y * 0.020 + uCoord * 0.0076 + n1 * 1.10 + n2 * 0.20);
          float seamPx = abs(seamWave) / max(fwidth(seamWave), 0.001);
          float seamGate = regionMask * keyZoneMask;
          float seamInk = (1.0 - smoothstep(0.20, 1.12, seamPx)) * seamGate * pureRockMask * shadowQuiet * 0.64;
          float seamLip = (1.0 - smoothstep(0.30, 1.5, abs(seamWave - 0.14) / max(fwidth(seamWave), 0.001))) * seamGate * pureRockMask * stepMid;

          // Steep dihedral fractures along cliff faces
          float crackWave = sin(uCoord * 0.021 - vCairnWorldPos.y * 0.0115 + n1 * 1.02 - n2 * 0.25);
          float crackPx = abs(crackWave) / max(fwidth(crackWave), 0.001);
          float crackGate = (1.0 - regionMask) * keyZoneMask * smoothstep(0.02, 0.22, n2 + 0.10);
          float crackInk = (1.0 - smoothstep(0.20, 1.12, crackPx)) * crackGate * pureRockMask * shadowQuiet * 0.70;

          float grazing = 1.0 - abs(dot(mappedWorldNorm, viewDir));
          float silhouetteInk = smoothstep(0.58, 0.78, grazing) * smoothstep(0.18, 0.48, slopeSteep) * (0.90 + 0.35 * fgWeight);

          rockShaded = mix(rockShaded, rockShaded * 1.24 + vec3(0.050, 0.038, 0.018), seamLip * 0.50 * heroWeight);
          vec3 stylizedColor = mix(rockShaded, snowShaded, snowFactor);
          stylizedColor = mix(stylizedColor, stylizedColor * vec3(0.76, 0.80, 0.96), terminatorBand * 0.24);

          // 5. Depth Hierarchy:
          //    - Foreground: deeper indigo-slate values & crisp silhouette framing
          //    - Hero Peak: full dynamic range & finest structural detail
          //    - Far Mountains: shifted toward sky blue-lavender while preserving 3D sunlit/shadow planes
          //    - Valley Mist: localized in low troughs between mountain layers so the painting never grays out
          vec3 fgDeepRock = vec3(0.075, 0.105, 0.215);
          vec3 fgDeepSnow = vec3(0.30, 0.39, 0.60);
          vec3 fgTarget   = mix(fgDeepRock, fgDeepSnow, snowFactor);
          stylizedColor   = mix(stylizedColor, mix(stylizedColor * 0.68, fgTarget, 0.58), fgWeight * 0.82);

          vec3 farShadowPlane = mix(vec3(0.38, 0.49, 0.70), vec3(0.48, 0.59, 0.78), snowFactor * 0.65);
          vec3 farSunlitPlane = mix(vec3(0.66, 0.72, 0.84), vec3(0.85, 0.89, 0.95), snowFactor * 0.75);
          vec3 farSkyColor = mix(farShadowPlane, farSunlitPlane, clamp(stepShadow * 0.55 + stepMid * 0.45, 0.0, 1.0));
          stylizedColor = mix(stylizedColor, farSkyColor, farWeight * 0.66);

          // Localized valley mist separating Foreground -> Hero Peak and Hero Peak -> Far Range
          float troughMist1 = smoothstep(1560.0, 980.0, vCairnWorldPos.y)
                            * smoothstep(5000.0, 6600.0, camDist)
                            * (1.0 - smoothstep(8600.0, 10600.0, camDist)) * 0.42;
          float troughMist2 = smoothstep(2020.0, 1260.0, vCairnWorldPos.y)
                            * smoothstep(10200.0, 13400.0, camDist) * 0.46;
          float layerMist = clamp(troughMist1 + troughMist2, 0.0, 0.50);
          vec3 mistColor = vec3(0.75, 0.82, 0.91);
          stylizedColor = mix(stylizedColor, mistColor, layerMist);

          float detailVisibility = clamp((0.32 + 0.68 * heroWeight) * (1.0 - farWeight * 0.92) * (1.0 - layerMist * 0.85), 0.0, 1.0);
          float rockLineInk = max(seamInk, crackInk) * detailVisibility;
          float structInk = max(silhouetteInk * (1.0 - farWeight * 0.48), snowBorderInk * 0.62 * detailVisibility);
          float totalInk = clamp(max(structInk, rockLineInk), 0.0, 1.0);

          vec3 inkColor = mix(vec3(0.028, 0.038, 0.078), vec3(0.24, 0.33, 0.50), farWeight * 0.72);
          outgoingLight = mix(stylizedColor, inkColor, totalInk);
          ${clayMode ? `
          // Untextured sculptural clay inspection mode (?clay=1)
          float clayLit = clamp(dot(geomNorm, lightDir) * (0.35 + 0.65 * shadowMask), -0.4, 1.0);
          vec3 clayShadow = vec3(0.28, 0.34, 0.48);
          vec3 clayMid    = vec3(0.62, 0.65, 0.70);
          vec3 clayKey    = vec3(0.92, 0.90, 0.86);
          vec3 clayCol = mix(clayShadow, clayMid, smoothstep(-0.05, 0.22, clayLit));
          clayCol = mix(clayCol, clayKey, smoothstep(0.28, 0.62, clayLit));
          clayCol = mix(clayCol, clayCol * 0.68, fgWeight * 0.65);
          clayCol = mix(clayCol, vec3(0.74, 0.80, 0.88), farWeight * 0.55 + layerMist * 0.65);
          outgoingLight = mix(clayCol, vec3(0.10, 0.13, 0.20), silhouetteInk * 0.75);
          ` : ''}
          #include <opaque_fragment>`
        );
    };
    mat.needsUpdate = true;
  }

  function prepare(model) {
    model.traverse(o => {
      if (!o.isMesh) return;
      const far = o.name.startsWith('Background');
      o.castShadow = !far;
      o.receiveShadow = !far;
      for (const map of [o.material.map, o.material.normalMap].filter(Boolean)) {
        map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;
      }
      applyCairnShader(o.material, far);
    });
  }

  function renderWorld(camera) {
    renderer.render(scene, camera);
  }

  return { renderer, scene, sky, sun, skyReady, prepare, quality, render: renderWorld };
}
