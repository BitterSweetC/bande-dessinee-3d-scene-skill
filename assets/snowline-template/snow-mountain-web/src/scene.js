import * as THREE from 'three';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a4b7ce');
  scene.fog = new THREE.Fog('#a4b7ce', 9500, 25000);

  scene.add(new THREE.HemisphereLight('#bfd5f2', '#2c3652', 1.06));
  const sun = new THREE.DirectionalLight('#fff0d4', 3.15);
  sun.position.set(5000, 6200, 2500);
  sun.target.position.set(0, 1300, -500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -6200, right: 6200, top: 6200, bottom: -6200, near: 500, far: 20000 });
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
      fog: { value: new THREE.Color('#a4b7ce') },
      mid: { value: new THREE.Color('#7895b5') },
      top: { value: new THREE.Color('#4c6a8c') }
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
          float blend = smoothstep(0.0, 0.18, h) * p.a * 0.92;
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

  function applyCairnShader(mat, isFar) {
    mat.customProgramCacheKey = () => (isFar ? 'cairn_bd_v9_far' : 'cairn_bd_v9_near');
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
          float nearFade = clamp(1.0 - (camDist - 3800.0) / 13500.0, 0.0, 1.0);
          float detailFade = clamp(1.0 - (camDist - 2200.0) / 6800.0, 0.0, 1.0);

          float uCoord = 0.82 * vCairnWorldPos.x - 0.57 * vCairnWorldPos.z;
          float vCoord = 0.57 * vCairnWorldPos.x + 0.82 * vCairnWorldPos.z;
          vec3 geoPos = vec3(uCoord, vCairnWorldPos.y, vCoord);

          // 1. Clean, Contiguous Bande Dessinee Snow vs Rock Mask (suppress artificial polyline stripes on steep peak faces).
          float baseLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float n1 = cairnNoise(geoPos * 0.014) - 0.5;
          float n2 = cairnNoise(geoPos * 0.042 + 7.3) - 0.5;
          vec3 geomNorm = normalize(vCairnWorldNorm);
          vec3 mappedWorldNorm = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float slopeSteep = 1.0 - clamp(mappedWorldNorm.y, 0.0, 1.0);
          float tanSlope = length(geomNorm.xz) / max(geomNorm.y, 0.08);

          // Suppress baked straight polyline snow strokes on steep rock faces while keeping natural ledges & aprons.
          float cliffMask = smoothstep(0.56, 0.78, tanSlope) * smoothstep(1060.0, 1340.0, vCairnWorldPos.y);
          float snowField = (baseLuma - 0.438) - cliffMask * 0.60 + (n1 * 0.068 + n2 * 0.024) * nearFade;
          float fwSnow = max(fwidth(snowField), 0.0012);
          float snowFactor = smoothstep(-fwSnow * 1.15, fwSnow * 1.15, snowField);
          float snowBorderInk = (1.0 - smoothstep(0.0, fwSnow * 1.6, abs(snowField))) * smoothstep(0.10, 0.72, slopeSteep);

          // 2. Smooth-Stepped Planar Rock Facets (zero floor() stair-step speckles or triangle grid artifacts).
          float slabU = cairnNoise(geoPos * vec3(0.012, 0.019, 0.012)) - 0.5;
          float slabV = cairnNoise(geoPos * vec3(0.019, 0.011, 0.019) + 11.0) - 0.5;
          float stepU = slabU - sin(slabU * 18.8495) / 22.0;
          float stepV = slabV - sin(slabV * 18.8495) / 22.0;
          vec3 slabPerturb = vec3(stepU, stepV, 0.0) * 0.24 * (1.0 - snowFactor) * nearFade;
          vec3 cairnNorm = normalize(mappedWorldNorm + slabPerturb);

          // 3. Recover Cast Shadow & Compute Mathieu Bablet 3-Band Graphic Novel Cel Lighting.
          vec3 lightDir = normalize(vec3(5000.0, 6200.0, 2500.0));
          float rawNdotL = max(dot(mappedWorldNorm, lightDir), 0.0);
          float directLum = dot(reflectedLight.directDiffuse, vec3(0.3333));
          float baseLumSafe = max(dot(diffuseColor.rgb, vec3(0.3333)), 0.025);
          float shadowMask = rawNdotL > 0.03 ? clamp(directLum / (baseLumSafe * rawNdotL * 0.82), 0.0, 1.0) : 0.0;

          float ndl = dot(cairnNorm, lightDir);
          float litVal = ndl * (0.25 + 0.75 * shadowMask);

          // High-contrast cel-shading transitions (rich Prussian shadows vs warm ochre sunlight).
          float stepShadow = smoothstep(0.04, 0.16, litVal);
          float stepMid    = smoothstep(0.28, 0.40, litVal);
          float stepBright = smoothstep(0.56, 0.68, litVal);
          float terminatorBand = stepShadow * (1.0 - stepShadow) * 4.0;

          // Serene, monumental Bande Dessinee snow planes (warm ivory sunlit vs cool alpine periwinkle shadow).
          vec3 snowDeep = vec3(0.14, 0.19, 0.34);
          vec3 snowCool = vec3(0.31, 0.42, 0.62);
          vec3 snowWarm = vec3(0.87, 0.85, 0.78);
          vec3 snowKey  = vec3(0.97, 0.93, 0.83);
          vec3 snowShaded = mix(snowDeep, snowCool, stepShadow);
          snowShaded = mix(snowShaded, snowWarm, stepMid);
          snowShaded = mix(snowShaded, snowKey, stepBright);

          // Broad stepped geological rock color blocks (ochre-sandstone sunlit vs Prussian-indigo shadow).
          // Where a baked white snow stripe was suppressed on a steep cliff, substitute true mineral rock pigment.
          float rawStrata = fract(vCairnWorldPos.y * 0.0068 + uCoord * 0.0024 + n1 * 0.36);
          float strataTone = smoothstep(0.30, 0.36, rawStrata) * 0.5 + smoothstep(0.66, 0.72, rawStrata) * 0.5;
          vec3 rockTint = mix(vec3(0.86, 0.90, 1.04), vec3(1.14, 1.02, 0.89), strataTone);
          vec3 fallbackRock = mix(vec3(0.095, 0.115, 0.155), vec3(0.175, 0.148, 0.125), clamp(0.5 + n1 * 1.4, 0.0, 1.0));
          vec3 cleanRockTex = mix(diffuseColor.rgb, fallbackRock, smoothstep(0.28, 0.42, baseLuma));
          vec3 rockBase = cleanRockTex * rockTint;
          vec3 rockDeep = mix(rockBase * vec3(0.31, 0.39, 0.64), vec3(0.038, 0.055, 0.118), 0.52);
          vec3 rockMid  = rockBase * vec3(0.70, 0.75, 0.88);
          vec3 rockWarm = rockBase * vec3(1.24, 1.10, 0.93) + vec3(0.030, 0.018, 0.006);
          vec3 rockKey  = rockBase * vec3(1.42, 1.24, 0.99) + vec3(0.055, 0.035, 0.014);
          vec3 rockShaded = mix(rockDeep, rockMid, stepShadow);
          rockShaded = mix(rockShaded, rockWarm, stepMid);
          rockShaded = mix(rockShaded, rockKey, stepBright);

          // 4. Clean Architectural Bande Dessinee Ink Lines (mutually exclusive strata vs dihedral regions so they NEVER form X crosses!).
          float regionMask = smoothstep(-0.05, 0.15, n1);
          float seamWave = sin(vCairnWorldPos.y * 0.032 + uCoord * 0.011 + n1 * 1.45 + n2 * 0.28);
          float seamPx = abs(seamWave) / max(fwidth(seamWave), 0.001);
          float seamGate = regionMask * smoothstep(0.28, 0.58, slopeSteep);
          float seamInk = (1.0 - smoothstep(0.22, 1.25, seamPx)) * seamGate * (1.0 - snowFactor) * 0.68;
          float seamLip = (1.0 - smoothstep(0.35, 1.7, abs(seamWave - 0.15) / max(fwidth(seamWave), 0.001))) * seamGate * (1.0 - snowFactor) * stepMid;

          float crackWave = sin(uCoord * 0.030 - vCairnWorldPos.y * 0.016 + n1 * 1.25 - n2 * 0.38);
          float crackPx = abs(crackWave) / max(fwidth(crackWave), 0.001);
          float crackGate = (1.0 - regionMask) * smoothstep(0.02, 0.25, n2 + 0.10) * smoothstep(0.32, 0.64, slopeSteep);
          float crackInk = (1.0 - smoothstep(0.22, 1.25, crackPx)) * crackGate * (1.0 - snowFactor) * 0.76;

          // Crisp 1px shadow-terminator & normal-crevice ink (smooth per-pixel normal derivative, zero triangle caterpillars).
          float pixelCrease = length(fwidth(mappedWorldNorm));
          float creaseInk = smoothstep(0.08, 0.22, pixelCrease) * (1.0 - snowFactor * 0.65) * 0.78;

          float hatchWave = sin(uCoord * 0.20 + vCairnWorldPos.y * 0.32 + n1 * 0.85);
          float hatchPx = abs(hatchWave) / max(fwidth(hatchWave), 0.001);
          float hatchInk = (1.0 - smoothstep(0.20, 1.15, hatchPx)) * (1.0 - stepMid) * (1.0 - snowFactor) * detailFade * 0.50;

          float grazing = 1.0 - abs(dot(mappedWorldNorm, viewDir));
          float silhouetteInk = smoothstep(0.62, 0.80, grazing) * smoothstep(0.24, 0.54, slopeSteep) * 0.90;

          rockShaded = mix(rockShaded, rockShaded * 1.26 + vec3(0.055, 0.042, 0.022), seamLip * 0.52 * nearFade);
          vec3 stylizedColor = mix(rockShaded, snowShaded, snowFactor);
          stylizedColor = mix(stylizedColor, stylizedColor * vec3(0.74, 0.78, 0.94), terminatorBand * 0.28);

          float rockLineInk = max(creaseInk, max(seamInk, max(crackInk, hatchInk))) * (0.30 + 0.70 * nearFade);
          float structInk = max(silhouetteInk, snowBorderInk * 0.72) * (0.28 + 0.72 * nearFade);
          float totalInk = clamp(max(structInk, rockLineInk), 0.0, 1.0);

          vec3 inkColor = vec3(0.024, 0.032, 0.065);
          outgoingLight = mix(stylizedColor, inkColor, totalInk);
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
