/* Dream Home — Interactive 3D Architectural Villa Engine (Ravn Technology) */
(() => {
  'use strict';
window.__studio3DModuleLoaded = true;
/* Conditionally polyfill Popover & Interest Invokers only when native support is missing (per modern-web-guidance) */
try {
  if (!('popover' in HTMLElement.prototype)) {
    import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => { });
  }
  if (!('interestForElement' in HTMLButtonElement.prototype)) {
    import('https://unpkg.com/interestfor@latest').catch(() => { });
  }
} catch { }

/* On-Demand / Pre-Warmed 3D Engine Boot (Zero Startup Contention, Multi-CDN Fallback & Chunked Non-Blocking Build!) */
const yieldMain = () => window.yieldToMain ? window.yieldToMain() : new Promise(r => setTimeout(r, 0));
let bootStarted = false, bootSucceeded = false, pendingPreset = null;

async function loadThreeEngine(statusEl) {
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);
  const mirrors = [
    {
      label: 'Loading Three.js rendering engine…',
      ms: 8000,
      load: () => Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js')
      ])
    },
    {
      label: 'Switching to backup 3D engine mirror (esm.sh)…',
      ms: 9000,
      load: () => Promise.all([
        import('https://esm.sh/three@0.160.1'),
        import('https://esm.sh/three@0.160.1/examples/jsm/controls/OrbitControls.js')
      ])
    },
    {
      label: 'Switching to backup 3D engine mirror (unpkg)…',
      ms: 9000,
      load: () => Promise.all([
        import('https://unpkg.com/three@0.160.1/build/three.module.js'),
        import('https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js?module')
      ])
    }
  ];
  let lastErr = null;
  for (const mirror of mirrors) {
    try {
      if (statusEl) statusEl.textContent = mirror.label;
      const [THREE, orbitMod] = await withTimeout(mirror.load(), mirror.ms, mirror.label);
      if (THREE && orbitMod?.OrbitControls) return [THREE, orbitMod];
      throw new Error('Incomplete 3D module export');
    } catch (err) {
      lastErr = err;
      console.warn('3D mirror failed, trying next:', err);
    }
  }
  throw lastErr || new Error('Unable to load Three.js from any CDN mirror.');
}

async function init3DViewer() {
  if (bootStarted || bootSucceeded) return;
  bootStarted = true;
  const loaderEl = document.getElementById('viewerLoading');
  const fallbackEl = document.getElementById('viewerFallback');
  if (loaderEl) loaderEl.style.display = 'flex';
  if (fallbackEl) fallbackEl.style.display = 'none';
  const loadTimeoutId = window.setTimeout(() => {
    if (bootSucceeded) return;
    const loader = document.getElementById('viewerLoading');
    if (loader && getComputedStyle(loader).display !== 'none') {
      bootStarted = false;
      loader.style.display = 'none';
      document.getElementById('viewerFallback').style.display = 'flex';
      document.getElementById('viewerErrorMessage').textContent = '3D engine loading timed out.';
      document.getElementById('viewerErrorDetail').textContent = 'Check internet access to cdn.jsdelivr.net / esm.sh / unpkg.com, or click Retry 3D viewer.';
    }
  }, 28000);

  try {
  const statusEl = document.getElementById('modelLoadStatus');
  const [THREE, { OrbitControls }] = await loadThreeEngine(statusEl);
  if (statusEl) statusEl.textContent = 'Sculpting curved villa geometry & spiral atrium…';
  await yieldMain();
  const canvas = document.getElementById('modelCanvas');
  if (!window.WebGLRenderingContext) throw new Error('WebGL is not available in this browser.');

  /* Architectural Renderer with ACES Filmic Tone Mapping & Soft Shadows */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x16263b, 0.0085);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.2, 240);
  camera.position.set(3.2, 11.4, 38.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0.4, 6.0, 2.0);
  controls.minDistance = 3.5;
  controls.maxDistance = 85;
  controls.maxPolarAngle = Math.PI * 0.492;

  /* Procedural Studio/Sky PMREM Environment Map (Zero external HDR downloads!) */
  function buildEnvMap(topHex, midHex, botHex, sunHex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(50, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        cTop: { value: new THREE.Color(topHex) },
        cMid: { value: new THREE.Color(midHex) },
        cBot: { value: new THREE.Color(botHex) }
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 cTop,cMid,cBot; varying vec3 vPos; void main(){ float h=vPos.y; vec3 col = h>0.0 ? mix(cMid,cTop,pow(h,0.55)) : mix(cMid,cBot,pow(-h,0.65)); gl_FragColor=vec4(col,1.0); }'
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: sunHex }));
    sunDisc.position.set(-22, 14, 24);
    envScene.add(sunDisc);
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    skyGeo.dispose();
    skyMat.dispose();
    return rt.texture;
  }

  /* Procedural Sky Dome visible in scene */
  const skyUniforms = {
    cTop: { value: new THREE.Color(0x1b3764) },
    cHorizon: { value: new THREE.Color(0xe69f6c) },
    cGround: { value: new THREE.Color(0x0c1a2a) }
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
    uniform vec3 cTop, cHorizon, cGround;
    varying vec3 vDir;
    void main() {
      float y = vDir.y;
      vec3 col = y >= 0.0
        ? mix(cHorizon, cTop, pow(clamp(y, 0.0, 1.0), 0.48))
        : mix(cHorizon, cGround, pow(clamp(-y * 2.5, 0.0, 1.0), 0.7));
      gl_FragColor = vec4(col, 1.0);
    }
  `
    })
  );
  scene.add(skyDome);

  /* Lights */
  const hemiLight = new THREE.HemisphereLight(0xffe9cc, 0x26394d, 1.15);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffdca8, 2.3);
  sunLight.position.set(-18, 22, 22);
  sunLight.castShadow = true;
  const shadowRes = window.innerWidth < 780 ? 1024 : 1536;
  sunLight.shadow.mapSize.set(shadowRes, shadowRes);
  sunLight.shadow.camera.near = 4;
  sunLight.shadow.camera.far = 75;
  sunLight.shadow.camera.left = -22;
  sunLight.shadow.camera.right = 22;
  sunLight.shadow.camera.top = 24;
  sunLight.shadow.camera.bottom = -14;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x88b4e6, 0.65);
  fillLight.position.set(18, 12, -14);
  scene.add(fillLight);

  /* Warm Interior & Chandelier Practical Lights */
  const chandelierLight = new THREE.PointLight(0xffcf87, 34, 24, 1.6);
  chandelierLight.position.set(4.5, 8.2, 4.1);
  scene.add(chandelierLight);

  const garageLight = new THREE.PointLight(0xffca7a, 18, 14, 1.8);
  garageLight.position.set(-3.2, 2.6, 2.8);
  scene.add(garageLight);

  const balconyGlowLight = new THREE.PointLight(0xffcb80, 14, 18, 1.7);
  balconyGlowLight.position.set(-3.5, 7.2, 5.8);
  scene.add(balconyGlowLight);

  /* PBR Materials */
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f2eb, roughness: 0.34, metalness: 0.04 });
  const warmWallMat = new THREE.MeshStandardMaterial({ color: 0xebe2d4, roughness: 0.55, metalness: 0.03 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4ad6a, roughness: 0.24, metalness: 0.82 });
  const darkBronzeMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.36, metalness: 0.55 });
  const atriumGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2fa, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.34,
    reflectivity: 0.92, clearcoat: 1.0, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false
  });
  const railGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcce8f2, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.28,
    clearcoat: 0.9, side: THREE.DoubleSide, depthWrite: false
  });
  const warmLedMat = new THREE.MeshStandardMaterial({ color: 0xffe4ad, emissive: 0xffc66e, emissiveIntensity: 1.85, roughness: 0.2 });
  const chandelierOrbMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd78c, emissiveIntensity: 2.1, roughness: 0.12, metalness: 0.1 });
  const interiorGlowMat = new THREE.MeshStandardMaterial({ color: 0xf7dfc0, emissive: 0xffba66, emissiveIntensity: 0.42, roughness: 0.7 });
  const garageFloorMat = new THREE.MeshStandardMaterial({ color: 0x9b958b, roughness: 0.52, metalness: 0.06 });
  const drivewayMat = new THREE.MeshStandardMaterial({ color: 0xbcb8af, roughness: 0.62, metalness: 0.04 });
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x2d5e37, roughness: 0.92 });
  const foliageDark = new THREE.MeshStandardMaterial({ color: 0x275432, roughness: 0.85 });
  const foliageLight = new THREE.MeshStandardMaterial({ color: 0x457d46, roughness: 0.82 });
  const oliveFoliage = new THREE.MeshStandardMaterial({ color: 0x5c7556, roughness: 0.86 });
  const lavenderMat = new THREE.MeshStandardMaterial({ color: 0x9c7ec9, roughness: 0.78 });
  const planterMat = new THREE.MeshStandardMaterial({ color: 0xd6d1c8, roughness: 0.65 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4432, roughness: 0.9 });
  const upholsteryMat = new THREE.MeshStandardMaterial({ color: 0xc8bba8, roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b563c, roughness: 0.58 });
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xebe6dd, roughness: 0.88 });
  const partitionMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.7, transparent: true, opacity: 0.92 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x161d2b, emissive: 0x274066, emissiveIntensity: 0.35, roughness: 0.25 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x14335e, roughness: 0.18, metalness: 0.65 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5dc, roughness: 0.28, metalness: 0.78 });
  const stoneWallMat = new THREE.MeshStandardMaterial({ color: 0xd8d5cb, roughness: 0.72 });

  /* Shared Unit Geometries (~90% fewer GPU vertex buffer allocations & instant 3D startup!) */
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
  const UNIT_POT = new THREE.CylinderGeometry(0.32, 0.26, 0.34, 14);
  const UNIT_TRUNK = new THREE.CylinderGeometry(0.04, 0.065, 0.72, 8);
  const UNIT_ICO = new THREE.IcosahedronGeometry(1, 1);
  function addBox(parent, w, h, d, x, y, z, mat, cast = true, recv = true) {
    const m = new THREE.Mesh(UNIT_BOX, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  }

  /* Organic Potted Olive/Bonsai Tree & Planter Builder */
  function addPlanterTree(parent, x, y, z, scale = 1, hasFlowers = false) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const pot = new THREE.Mesh(UNIT_POT, planterMat);
    pot.scale.setScalar(scale);
    pot.position.y = 0.17 * scale;
    pot.castShadow = true;
    g.add(pot);
    const trunk = new THREE.Mesh(UNIT_TRUNK, trunkMat);
    trunk.scale.setScalar(scale);
    trunk.position.y = 0.62 * scale;
    trunk.rotation.z = 0.08;
    g.add(trunk);
    const clusters = [
      [0, 1.05, 0, 0.36], [-0.25, 0.92, 0.14, 0.26], [0.24, 0.96, -0.1, 0.28], [0.06, 1.24, -0.06, 0.24]
    ];
    clusters.forEach(([cx, cy, cz, cr], idx) => {
      const leaf = new THREE.Mesh(UNIT_ICO, idx % 2 ? foliageLight : oliveFoliage);
      leaf.scale.set(cr * scale, cr * scale * 0.82, cr * scale);
      leaf.position.set(cx * scale, cy * scale, cz * scale);
      leaf.castShadow = true;
      g.add(leaf);
    });
    if (hasFlowers) {
      for (let i = 0; i < 4; i++) {
        const fl = new THREE.Mesh(UNIT_ICO, lavenderMat);
        fl.scale.setScalar(0.11 * scale);
        fl.position.set((i - 1.5) * 0.16 * scale, 0.36 * scale, 0.2 * scale);
        g.add(fl);
      }
    }
    parent.add(g);
    return g;
  }

  /* Rounded 2D Balcony Footprint Shape (matching sweeping curved white facade of home photo!) */
  function createCurvedWingShape(xMin, xMax, zBack, zFront, rFrontLeft) {
    const s = new THREE.Shape();
    // Shape in XY mapped onto XZ via rotateX(PI/2): shape y -> +Z
    s.moveTo(xMin, zBack);
    s.lineTo(xMax, zBack);
    s.lineTo(xMax, zFront - 0.55);
    s.quadraticCurveTo(xMax - 0.4, zFront + 0.15, xMax - 1.55, zFront + 0.22);
    s.lineTo(xMin + rFrontLeft, zFront + 0.22);
    s.quadraticCurveTo(xMin, zFront + 0.22, xMin, zFront - rFrontLeft);
    s.closePath();
    return s;
  }

  function sampleCurvedFrontEdge(xMin, xMax, zFront, rFrontLeft, steps = 84, zBack = -5.10, closeRearX = -7.45) {
    // Full continuous wraparound perimeter: closes rear-left end (closeRearX -> xMin at zBack), sweeps along entire extended left balcony flank, curves smoothly around front-left corner & across entire front facade!
    const curve = new THREE.CurvePath();
    if (closeRearX !== null && closeRearX > xMin) {
      curve.add(new THREE.LineCurve3(new THREE.Vector3(closeRearX, 0, zBack), new THREE.Vector3(xMin, 0, zBack)));
    }
    curve.add(new THREE.LineCurve3(new THREE.Vector3(xMin, 0, zBack), new THREE.Vector3(xMin, 0, zFront - rFrontLeft)));
    curve.add(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(xMin, 0, zFront - rFrontLeft),
      new THREE.Vector3(xMin, 0, zFront + 0.22),
      new THREE.Vector3(xMin + rFrontLeft, 0, zFront + 0.22)
    ));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(xMin + rFrontLeft, 0, zFront + 0.22), new THREE.Vector3(xMax - 1.45, 0, zFront + 0.22)));
    curve.add(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(xMax - 1.45, 0, zFront + 0.22),
      new THREE.Vector3(xMax - 0.35, 0, zFront + 0.15),
      new THREE.Vector3(xMax, 0, zFront - 0.55)
    ));
    return curve.getPoints(steps);
  }

  /* Floor Groups (Zero intersection with Spiral Atrium!) */
  const villaRoot = new THREE.Group();
  scene.add(villaRoot);
  const levels = {
    ground: new THREE.Group(),
    first: new THREE.Group(),
    second: new THREE.Group(),
    roof: new THREE.Group()
  };
  Object.values(levels).forEach(g => villaRoot.add(g));
  const interiorWalls = [];
  const interiorDecor = [];
  const cutawayShells = []; // Outer walls hidden cleanly in 3D Interior Cutaway mode

  /* Additional architectural interior, garden, decor & full MEP materials */
  const rugMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.95 });
  const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 0.16, metalness: 0.08 });
  const tileAccentMat = new THREE.MeshStandardMaterial({ color: 0xe2d8c7, roughness: 0.30, metalness: 0.05 });
  const towelMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.94 });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: 0x22272f, roughness: 0.42, metalness: 0.18 });
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x5d3d28, roughness: 0.52, metalness: 0.05 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd8a846, roughness: 0.24, metalness: 0.86 });
  const curtainSheerMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f2e8, roughness: 0.88, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  const velvetDrapeMat = new THREE.MeshStandardMaterial({ color: 0x3b4859, roughness: 0.90 });
  const frostedGlassMat = new THREE.MeshPhysicalMaterial({ color: 0xe6f0f8, roughness: 0.64, metalness: 0.02, transmission: 0.20, transparent: true, opacity: 0.78, ior: 1.50, side: THREE.DoubleSide });
  const bathCurtainMat = new THREE.MeshStandardMaterial({ color: 0x5c849e, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide }); // Luxury spa slate-blue waterproof linen fabric!
  const acBodyMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.24, metalness: 0.12 });
  const rgbPurpleMat = new THREE.MeshStandardMaterial({ color: 0xc074ff, emissive: 0x9b3eff, emissiveIntensity: 2.0, roughness: 0.2 });
  const rgbCyanMat = new THREE.MeshStandardMaterial({ color: 0x62e8ff, emissive: 0x22c8ff, emissiveIntensity: 1.9, roughness: 0.2 });
  const waterGlowMat = new THREE.MeshPhysicalMaterial({ color: 0x2ab5f5, emissive: 0x0b5278, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.78 });
  const pipeColdMat = new THREE.MeshStandardMaterial({ color: 0x32b8f5, emissive: 0x0d5c85, emissiveIntensity: 0.52, roughness: 0.28, metalness: 0.42 });
  const pipeHotMat = new THREE.MeshStandardMaterial({ color: 0xf58842, emissive: 0x8a3a10, emissiveIntensity: 0.55, roughness: 0.28, metalness: 0.42 });
  const pipeDrainMat = new THREE.MeshStandardMaterial({ color: 0x9c7cff, emissive: 0x452b9e, emissiveIntensity: 0.46, roughness: 0.34, metalness: 0.30 });
  const pipeRainMat = new THREE.MeshStandardMaterial({ color: 0x38cc9b, emissive: 0x0e6346, emissiveIntensity: 0.48, roughness: 0.28, metalness: 0.40 });
  const pipeStormMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0b7487, emissiveIntensity: 0.54, roughness: 0.28, metalness: 0.38 });
  const pipeGasMat = new THREE.MeshStandardMaterial({ color: 0xf6c93b, emissive: 0x8c6706, emissiveIntensity: 0.52, roughness: 0.26, metalness: 0.55 });
  const ductVentMat = new THREE.MeshStandardMaterial({ color: 0xb6d8eb, emissive: 0x235574, emissiveIntensity: 0.36, roughness: 0.28, metalness: 0.68 });
  const gasFlameMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0ea5e9, emissiveIntensity: 2.4, roughness: 0.2 });
  const gasLockLedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.4, roughness: 0.2 });
  const gasSensorLedMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 2.2, roughness: 0.2 });
  const lpgRedMat = new THREE.MeshStandardMaterial({ color: 0xd94836, roughness: 0.32, metalness: 0.35 });
  const fireEmberMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a1a, emissiveIntensity: 2.6, roughness: 0.3 });
  const bougMat = new THREE.MeshStandardMaterial({ color: 0xd65c96, roughness: 0.78 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6d7780, roughness: 0.88 });
  const serviceShaftMat = new THREE.MeshStandardMaterial({ color: 0xded5c6, roughness: 0.62, transparent: true, opacity: 1.0 });

  /* Live Animated TV, Gaming Monitor, Karaoke, Office CAD & Water Filter SCADA CanvasTextures + Gallery Art */
  const spinningFans = [];
  const mepFlowBeads = [];
  const gasFlameMeshes = [];
  const filterSimDrops = [];
  let vrCarMotionPivot = null, vrSteeringWheel = null;
  const nanoLeafPanels = [];

  function addFlatScreen(parent, w, h, x, y, z, rotY, screenMat, glowMat = warmLedMat) {
    // Zero-Z-fighting OLED display: separated rear LED bezel (-0.048), obsidian chassis (0), front single-sided display plane (+0.028)
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    if (glowMat) addBox(g, w + 0.09, h + 0.09, 0.02, 0, 0, -0.048, glowMat, false, false);
    addBox(g, w + 0.03, h + 0.03, 0.042, 0, 0, 0, charcoalMat, false, false);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
    face.position.set(0, 0, 0.024);
    g.add(face);
    parent.add(g);
    return g;
  }

  function makeLiveScreen(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.92, roughness: 0.16, metalness: 0.08
    });
    return { c, ctx, tex, mat, drawFn, w, h };
  }

  const liveScreens = {
    cinema: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0f274a'); g.addColorStop(0.52, '#d87a4a'); g.addColorStop(0.72, '#f5c26b'); g.addColorStop(1, '#102338');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // Sun & moving golden reflection ripples
      const sunX = w * 0.5 + Math.sin(t * 0.35) * 18;
      ctx.fillStyle = 'rgba(255,244,205,0.92)';
      ctx.beginPath(); ctx.arc(sunX, h * 0.46, 17, 0, Math.PI * 2); ctx.fill();
      // Himalayan silhouette peaks
      ctx.fillStyle = '#182b45';
      ctx.beginPath(); ctx.moveTo(0, h * 0.66);
      ctx.lineTo(w * 0.22, h * 0.42); ctx.lineTo(w * 0.42, h * 0.58);
      ctx.lineTo(w * 0.68, h * 0.38); ctx.lineTo(w * 0.88, h * 0.55); ctx.lineTo(w, h * 0.46);
      ctx.lineTo(w, h * 0.68); ctx.lineTo(0, h * 0.68); ctx.fill();
      // Animated lake light shimmer
      for (let i = 0; i < 7; i++) {
        const wy = h * 0.72 + i * 5.5;
        const ww = 38 - i * 3 + Math.sin(t * 3 + i) * 7;
        ctx.fillStyle = `rgba(255,222,148,${0.48 - i * 0.05})`;
        ctx.fillRect(sunX - ww / 2 + Math.cos(t * 2.2 + i) * 4, wy, ww, 2.2);
      }
      // Drifting clouds
      ctx.fillStyle = 'rgba(255,235,210,0.22)';
      for (let i = 0; i < 3; i++) {
        const cx = ((t * 14 + i * 96) % (w + 60)) - 30;
        ctx.fillRect(cx, 18 + i * 11, 42, 6);
      }
      // Subtle 4K cinema playback bar
      ctx.fillStyle = 'rgba(8,16,28,0.62)'; ctx.fillRect(8, h - 18, w - 16, 11);
      ctx.fillStyle = '#f5c26b'; ctx.fillRect(12, h - 14, ((t * 18) % (w - 58)), 3);
      ctx.fillStyle = '#e8f1fa'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('4K HDR LIVE', w - 48, h - 10);
    }),
    pcGame: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      ctx.fillStyle = '#070414'; ctx.fillRect(0, 0, w, h);
      const horizon = h * 0.48;
      // Neon synthwave cyber sunset & horizon grid
      const sg = ctx.createLinearGradient(0, 0, 0, horizon);
      sg.addColorStop(0, '#12052b'); sg.addColorStop(1, '#581c87');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.arc(w * 0.5, horizon - 4, 22, Math.PI, 0); ctx.fill();
      // Moving perspective neon highway grid
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.2;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath(); ctx.moveTo(w * 0.5 + i * 6, horizon); ctx.lineTo(w * 0.5 + i * 44, h); ctx.stroke();
      }
      for (let r = 0; r < 6; r++) {
        const p = ((r / 6 + (t * 0.85) % 1) % 1);
        const ry = horizon + p * p * (h - horizon);
        ctx.strokeStyle = `rgba(192,116,255,${0.25 + p * 0.75})`;
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(w, ry); ctx.stroke();
      }
      // Racing car / spaceship silhouette swaying smoothly
      const carX = w * 0.5 + Math.sin(t * 2.1) * 34;
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(carX - 18, h - 28, 36, 11);
      ctx.fillStyle = '#f43f5e'; ctx.fillRect(carX - 15, h - 22, 7, 4); ctx.fillRect(carX + 8, h - 22, 7, 4);
      // Live FPS + Boost HUD
      ctx.fillStyle = 'rgba(6,12,26,0.78)'; ctx.fillRect(6, 6, 70, 18); ctx.fillRect(w - 78, 6, 72, 18);
      ctx.fillStyle = '#38ef7d'; ctx.font = 'bold 9px monospace';
      ctx.fillText(`FPS ${236 + Math.round(Math.sin(t * 5) * 4)}`, 10, 18);
      ctx.fillStyle = '#22d3ee'; ctx.fillText(`SPD ${282 + Math.round(Math.cos(t * 3) * 18)}`, w - 72, 18);
    }),
    consoleGame: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      // Animated futuristic arena match
      const bg = ctx.createRadialGradient(w / 2, h / 2, 12, w / 2, h / 2, w * 0.7);
      bg.addColorStop(0, '#16355c'); bg.addColorStop(1, '#081326');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // Pitch / arena lines
      ctx.strokeStyle = 'rgba(98,232,255,0.42)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(14, 24, w - 28, h - 38);
      ctx.beginPath(); ctx.moveTo(w / 2, 24); ctx.lineTo(w / 2, h - 14); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h * 0.54, 22, 0, Math.PI * 2); ctx.stroke();
      // Moving players & glowing energy orb
      const bx = w * 0.5 + Math.sin(t * 2.4) * 82;
      const by = h * 0.54 + Math.cos(t * 3.1) * 34;
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(w * 0.30 + Math.sin(t * 1.6) * 26, by * 0.85 + 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(w * 0.70 + Math.cos(t * 1.9) * 26, h - by * 0.75, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, Math.PI * 2); ctx.fill();
      // Top Scoreboard HUD
      ctx.fillStyle = 'rgba(5,10,20,0.86)'; ctx.fillRect(w / 2 - 58, 5, 116, 15);
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('P1  04', w / 2 - 48, 16);
      ctx.fillStyle = '#facc15'; ctx.fillText('-', w / 2 - 2, 16);
      ctx.fillStyle = '#f472b6'; ctx.fillText('03  P2', w / 2 + 12, 16);
    }),
    partyTv: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      ctx.fillStyle = '#0a0819'; ctx.fillRect(0, 0, w, h);
      const cols = ['#f5c26b', '#fb7185', '#c084fc', '#38bdf8', '#34d399'];
      for (let i = 0; i < 16; i++) {
        const amp = 0.22 + 0.72 * Math.abs(Math.sin(t * 4.2 + i * 0.58) * Math.cos(t * 1.9 + i * 0.3));
        const bh = amp * (h - 46);
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(14 + i * 14.5, h - 18 - bh, 10, bh);
      }
      ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText('ROOFTOP PARTY · LIVE MIX', 46, 22);
    }),
    officeCad: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      ctx.fillStyle = '#091828'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(56,189,248,0.22)'; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      // Rotating 3D architectural wireframe box
      const cx = w * 0.34, cy = h * 0.52, r = 34;
      const a = t * 0.8;
      ctx.strokeStyle = '#f5c26b'; ctx.lineWidth = 2;
      ctx.strokeRect(cx - r * Math.cos(a), cy - 24, r * 2 * Math.cos(a), 48);
      ctx.strokeStyle = '#38bdf8'; ctx.strokeRect(cx - 28, cy - 18, 56, 36);
      // Telemetry bars on right
      for (let i = 0; i < 5; i++) {
        const bw = 32 + 46 * (0.5 + 0.5 * Math.sin(t * 1.4 + i));
        ctx.fillStyle = i % 2 ? '#38bdf8' : '#f5c26b';
        ctx.fillRect(w * 0.62, 24 + i * 20, bw, 9);
      }
      ctx.fillStyle = '#e2eef8'; ctx.font = 'bold 8px monospace'; ctx.fillText('BIM · MEP STUDIO LIVE', 10, 14);
    }),
    waterHud: makeLiveScreen(256, 144, (ctx, w, h, t) => {
      ctx.fillStyle = '#061524'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(56,189,248,0.45)'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 10px monospace'; ctx.fillText('5-STAGE WATER PURIFIER · LIVE', 12, 20);
      const stages = [
        ['1. VORTEX SILT', '#d97706', 0.94],
        ['2. SAND / CARBON', '#14b8a6', 0.97],
        ['3. SOFTENER', '#38bdf8', 0.98],
        ['4. UV-C 254nm', '#a855f7', 1.00],
        ['5. RO PURE', '#67e8f9', 0.99]
      ];
      stages.forEach(([lbl, col, pct], i) => {
        const sy = 32 + i * 17;
        ctx.fillStyle = '#cbd5e1'; ctx.font = 'bold 8px monospace'; ctx.fillText(lbl, 12, sy + 7);
        ctx.fillStyle = '#122b44'; ctx.fillRect(102, sy, 138, 8);
        const animW = (pct * 124) + Math.sin(t * 2.4 + i) * 5;
        ctx.fillStyle = col; ctx.fillRect(102, sy, Math.min(138, animW), 8);
      });
      const tds = 27 + Math.round(Math.sin(t * 1.3) * 1);
      ctx.fillStyle = '#10b981'; ctx.font = 'bold 10px monospace';
      ctx.fillText(`RAW 340ppm -> PURE ${tds}ppm · 99.99%`, 12, h - 12);
    })
  };

  function updateLiveScreens(tSec) {
    Object.values(liveScreens).forEach(s => {
      s.drawFn(s.ctx, s.w, s.h, tSec);
      s.tex.needsUpdate = true;
    });
  }

  // Procedural Framed Gallery Wall Art Textures (zero network overhead, crisp gallery aesthetic)
  const artMats = [
    ['#182d46', '#d8a557', '#e8dfd1', '#c76d4b'],
    ['#233344', '#e8c484', '#5b8278', '#f2ece1'],
    ['#2e241f', '#dca95f', '#f4efe6', '#8d5b3e'],
    ['#141b2e', '#62e8ff', '#c074ff', '#f43f5e']
  ].map((pal, idx) => {
    const c = document.createElement('canvas'); c.width = 192; c.height = 144;
    const ctx = c.getContext('2d');
    ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, 192, 144);
    ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.arc(idx % 2 ? 124 : 68, 66, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal[1]; ctx.fillRect(24, 92, 144, 24);
    ctx.strokeStyle = pal[3]; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(22, 118); ctx.bezierCurveTo(64, 26, 126, 128, 170, 34); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.06 });
  });

  /* Wall Decoration, Curtains, Ceiling Cove/Chandelier/Fan & Exhaust Vent Builders */
  function addWallArt(parent, x, y, z, w, h, rotY = 0, artIdx = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    addBox(g, w + 0.12, h + 0.12, 0.05, 0, 0, 0, goldMat, false, false);
    addBox(g, w, h, 0.06, 0, 0, 0.015, artMats[artIdx % artMats.length], false, false);
    // Brass museum picture lamp above frame
    addBox(g, w * 0.42, 0.035, 0.12, 0, h / 2 + 0.10, 0.06, goldMat, false, false);
    addBox(g, w * 0.36, 0.02, 0.04, 0, h / 2 + 0.08, 0.09, warmLedMat, false, false);
    parent.add(g); return g;
  }

  const curtainSystems = [];
  const safetyDoors = [];
  const slidingDoors = [];

  function addCurtainPair(parent, x, y, z, width, height, rotY = 0) {
    // Motorized Smart Pleated Velvet + Translucent Sheer Curtain Assembly (animates Folded=0 <-> Unfolded=1!)
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    // Matte-bronze motorized track rail + warm recessed pelmet cove glow
    addBox(g, width + 0.28, 0.045, 0.06, 0, height - 0.05, 0, darkBronzeMat, false, false);
    addBox(g, width + 0.16, 0.022, 0.03, 0, height - 0.085, 0.02, warmLedMat, false, false);
    const hDrape = height - 0.12;
    const makePleatWing = (mat, depthZ, zOff) => {
      const wing = new THREE.Group();
      wing.position.set(0, hDrape / 2 + 0.02, zOff);
      const pleats = 5;
      for (let i = 0; i < pleats; i++) {
        const px = (i + 0.5) / pleats - 0.5;
        const fold = addBox(wing, 1 / pleats * 0.92, hDrape, depthZ + (i % 2 ? 0.035 : 0), px, 0, i % 2 ? 0.015 : -0.015, mat, false, false);
      }
      return wing;
    };
    const leftVelvet = makePleatWing(velvetDrapeMat, 0.055, 0.04);
    const rightVelvet = makePleatWing(velvetDrapeMat, 0.055, 0.04);
    const leftSheer = makePleatWing(curtainSheerMat, 0.025, -0.015);
    const rightSheer = makePleatWing(curtainSheerMat, 0.025, -0.015);
    g.add(leftVelvet, rightVelvet, leftSheer, rightSheer);
    const entry = { width, leftVelvet, rightVelvet, leftSheer, rightSheer };
    curtainSystems.push(entry);
    parent.add(g);
    return g;
  }

  function updateCurtains(unfoldRatio) {
    // unfoldRatio: 0 = Folded neatly at window/bath sides; 1 = Fully unfolded across entire glazing or privacy opening!
    for (let i = 0; i < curtainSystems.length; i++) {
      const c = curtainSystems[i];
      const halfW = c.width * 0.5;
      const vW = Math.max(halfW * 0.24, halfW * (0.24 + 0.76 * unfoldRatio));
      const sW = Math.max(halfW * 0.30, halfW * (0.30 + 0.70 * unfoldRatio));
      c.leftVelvet.scale.x = vW;
      c.leftVelvet.position.x = -halfW + vW * 0.5;
      c.rightVelvet.scale.x = vW;
      c.rightVelvet.position.x = halfW - vW * 0.5;
      c.leftSheer.scale.x = sW;
      c.leftSheer.position.x = -halfW + sW * 0.5;
      c.rightSheer.scale.x = sW;
      c.rightSheer.position.x = halfW - sW * 0.5;
    }
  }

  function addOfficeChair(parent, x, y, z, rotY = 0, seatMat = charcoalMat, isExec = true) {
    // Sculpted 5-Star Swivel Ergonomic Executive / Family Office Chair with Gas Lift, Lumbar & Armrests!
    const ch = new THREE.Group();
    ch.position.set(x, y, z); ch.rotation.y = rotY;
    // 5-star chrome caster base + central gas-lift column
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leg = addBox(ch, 0.30, 0.032, 0.04, Math.cos(a) * 0.14, 0.055, Math.sin(a) * 0.14, steelMat, false, false);
      leg.rotation.y = -a;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), charcoalMat);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(Math.cos(a) * 0.27, 0.025, Math.sin(a) * 0.27); ch.add(wheel);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.38, 10), steelMat);
    post.position.y = 0.25; ch.add(post);
    // Contoured ergonomic leather seat cushion
    addBox(ch, 0.52, 0.09, 0.50, 0, 0.46, 0.02, seatMat, false, false);
    // Tall sculpted ergonomic backrest + lumbar cushion + executive headrest
    const backH = isExec ? 0.68 : 0.52;
    const back = addBox(ch, 0.48, backH, 0.08, 0, 0.48 + backH * 0.5, -0.21, seatMat, false, false);
    back.rotation.x = -0.10;
    addBox(ch, 0.38, 0.12, 0.06, 0, 0.66, -0.15, upholsteryMat, false, false); // Lumbar pad
    if (isExec) addBox(ch, 0.30, 0.14, 0.07, 0, 1.22, -0.24, seatMat, false, false); // Headrest
    // Twin brushed-gold / dark-bronze ergonomic armrests
    for (const ax of [-0.28, 0.28]) {
      addBox(ch, 0.035, 0.22, 0.04, ax, 0.56, -0.02, goldMat, false, false);
      addBox(ch, 0.055, 0.035, 0.32, ax, 0.67, 0.02, seatMat, false, false);
    }
    parent.add(ch); return ch;
  }

  function addSafetyDoor(parent, x, y, z, width, height, rotY = 0, swingSign = 1) {
    // Heavy-Duty Brushed-Bronze & Armored Walnut Security Safety Door with Biometric Keypad LED & Hinged Pivot!
    const frame = new THREE.Group();
    frame.position.set(x, y, z); frame.rotation.y = rotY;
    // Heavy steel perimeter door frame jambs + lintel (OPEN walkthrough interior!)
    addBox(frame, 0.12, height, 0.16, -width / 2 - 0.04, height / 2, 0, goldMat, false, false);
    addBox(frame, 0.12, height, 0.16, width / 2 + 0.04, height / 2, 0, goldMat, false, false);
    addBox(frame, width + 0.20, 0.14, 0.18, 0, height + 0.05, 0, goldMat, false, false);
    // Biometric Smart-Lock Keypad on right jamb (emerald security LED)
    addBox(frame, 0.07, 0.16, 0.05, width / 2 + 0.05, 1.24, 0.09, charcoalMat, false, false);
    addBox(frame, 0.03, 0.03, 0.02, width / 2 + 0.05, 1.29, 0.12, gasSensorLedMat, false, false);
    // Hinged Armored Door Leaf (pivots cleanly at left jamb!)
    const pivot = new THREE.Group();
    pivot.position.set(-width / 2, 0, 0);
    frame.add(pivot);
    addBox(pivot, width - 0.02, height - 0.02, 0.075, width / 2, height / 2, 0, walnutMat, true, false);
    // Steel perimeter armor trim + horizontal brushed-gold security inlay ribs + frosted safety vision slit
    addBox(pivot, width, 0.055, 0.085, width / 2, height - 0.03, 0, darkBronzeMat, false, false);
    addBox(pivot, width, 0.055, 0.085, width / 2, 0.03, 0, darkBronzeMat, false, false);
    for (const ry of [0.52, 1.04, 1.56]) {
      addBox(pivot, width - 0.16, 0.026, 0.082, width / 2, ry, 0, goldMat, false, false);
    }
    addBox(pivot, 0.14, 1.38, 0.082, width * 0.24, height * 0.54, 0, railGlassMat, false, false); // Narrow laminated safety glass slit
    // Tall vertical champagne-gold designer pull bar (both sides!) + stainless deadbolt mortise
    addBox(pivot, 0.038, 0.92, 0.05, width - 0.16, 1.06, 0.07, goldMat, false, false);
    addBox(pivot, 0.038, 0.92, 0.05, width - 0.16, 1.06, -0.07, goldMat, false, false);
    addBox(pivot, 0.04, 0.14, 0.088, width - 0.02, 1.02, 0, steelMat, false, false); // Deadbolt latch
    safetyDoors.push({ pivot, swingSign });
    parent.add(frame);
    return frame;
  }

  function addSlidingBalconyDoor(parent, x, y, z, width, height, rotY = 0, openSide = 1) {
    // Interactive Animated Walk-Through Sliding Glass Balcony Doorway (Overhead twin bronze track, flush sill, animated glass leaf & champagne-gold pull handles!)
    const d = new THREE.Group();
    d.position.set(x, y, z); d.rotation.y = rotY;
    const hw = width / 2;
    // Dark-bronze perimeter frame (top twin sliding track, flush floor sill track & side jambs)
    addBox(d, width + 0.08, 0.08, 0.16, 0, height - 0.04, 0, darkBronzeMat, false, false);
    addBox(d, width + 0.08, 0.032, 0.14, 0, 0.016, 0, darkBronzeMat, false, false);
    addBox(d, 0.07, height, 0.14, -hw, height / 2, 0, darkBronzeMat, false, false);
    addBox(d, 0.07, height, 0.14, hw, height / 2, 0, darkBronzeMat, false, false);
    // Fixed outer glass leaf (50% on parked side) + smoothly animated sliding glass leaf on front track (zero gap when closed, wide walk-through when open!)
    const leafW = width * 0.50;
    const leafH = height - 0.11;
    const parkX = -openSide * (hw - leafW / 2 - 0.04);
    const closedX = openSide * (hw - leafW / 2 - 0.04);
    const openX = parkX + openSide * 0.12;
    // Fixed pane (rear track)
    addBox(d, leafW, leafH, 0.036, parkX, leafH / 2 + 0.03, -0.028, atriumGlassMat, false, false);
    addBox(d, 0.042, leafH, 0.046, parkX + openSide * (leafW / 2), leafH / 2 + 0.03, -0.028, darkBronzeMat, false, false);
    // Animated sliding glass leaf (front track) grouped cleanly for real-time horizontal glide simulation!
    const slideLeaf = new THREE.Group();
    slideLeaf.position.set(openX, 0, 0.032);
    addBox(slideLeaf, leafW, leafH, 0.036, 0, leafH / 2 + 0.03, 0, atriumGlassMat, false, false);
    addBox(slideLeaf, 0.044, leafH, 0.052, openSide * (leafW / 2), leafH / 2 + 0.03, 0, darkBronzeMat, false, false);
    addBox(slideLeaf, 0.044, leafH, 0.052, -openSide * (leafW / 2), leafH / 2 + 0.03, 0, darkBronzeMat, false, false);
    addBox(slideLeaf, leafW, 0.044, 0.052, 0, leafH + 0.02, 0, darkBronzeMat, false, false);
    addBox(slideLeaf, leafW, 0.044, 0.052, 0, 0.05, 0, darkBronzeMat, false, false);
    // Tall brushed champagne-gold vertical pull handles on BOTH interior & exterior faces of the sliding leaf!
    const hx = openSide * (leafW / 2 - 0.09);
    addBox(slideLeaf, 0.032, 0.78, 0.045, hx, Math.min(1.12, leafH * 0.52), 0.040, goldMat, false, false);
    addBox(slideLeaf, 0.032, 0.78, 0.045, hx, Math.min(1.12, leafH * 0.52), -0.044, goldMat, false, false);
    d.add(slideLeaf);
    slidingDoors.push({
      kind: 'balcony',
      leaf: slideLeaf,
      doorGroup: d,
      closedX,
      openX,
      defaultOpen: 0.92,
      pos: 0.92,
      target: 0.92,
      phase: slidingDoors.length * 0.24
    });
    parent.add(d);
    return d;
  }

  function addPrivacySlidingDoor(parent, x, y, z, width, height, rotY = 0, isFrosted = true, closedRatio = 0.90) {
    // Interactive Animated Pocket/Track Privacy Sliding Door (Dark-Bronze Track + Walnut Stile Frame + Satin Frosted Privacy Glass + Champagne-Gold Handles!)
    const d = new THREE.Group();
    d.position.set(x, y, z); d.rotation.y = rotY;
    const hw = width / 2;
    // Extended overhead concealed bronze sliding pelmet track supporting full open glide + slim floor guide + perimeter jambs
    addBox(d, width * 1.90, 0.085, 0.14, -hw * 0.45, height - 0.04, 0, darkBronzeMat, false, false);
    addBox(d, width + 0.08, 0.024, 0.10, 0, 0.012, 0, darkBronzeMat, false, false);
    addBox(d, 0.065, height, 0.13, -hw, height / 2, 0, walnutMat, false, false);
    addBox(d, 0.065, height, 0.13, hw, height / 2, 0, walnutMat, false, false);
    // Animated privacy sliding leaf gliding smoothly from flush-closed (0) to wide-open (-0.86 * width) along the bronze pelmet track!
    const leafW = width - 0.04;
    const leafH = height - 0.09;
    const closedX = 0;
    const openX = -(width * 0.86);
    const defaultOpen = Math.max(0, Math.min(0.14, 1 - closedRatio));
    const leaf = new THREE.Group();
    leaf.position.set(closedX + (openX - closedX) * defaultOpen, leafH / 2 + 0.02, 0.022);
    // Solid walnut perimeter stiles & top/bottom rails
    addBox(leaf, 0.11, leafH, 0.052, -leafW / 2 + 0.055, 0, 0, walnutMat, true, false);
    addBox(leaf, 0.11, leafH, 0.052, leafW / 2 - 0.055, 0, 0, walnutMat, true, false);
    addBox(leaf, leafW, 0.12, 0.052, 0, leafH / 2 - 0.06, 0, walnutMat, false, false);
    addBox(leaf, leafW, 0.14, 0.052, 0, -leafH / 2 + 0.07, 0, walnutMat, false, false);
    // Center privacy infill: acid-etched satin frosted privacy glass (soft daylight, zero sightline!) or fluted walnut acoustic panel
    const innerW = Math.max(0.22, leafW - 0.22);
    const innerH = leafH - 0.26;
    addBox(leaf, innerW, innerH, 0.036, 0, 0, 0, isFrosted ? frostedGlassMat : warmWallMat, false, false);
    // Slim champagne-gold horizontal privacy muntin bars + tall vertical designer pull handles on BOTH faces!
    for (const my of [-innerH * 0.22, innerH * 0.22]) {
      addBox(leaf, innerW, 0.022, 0.046, 0, my, 0, goldMat, false, false);
    }
    const hx = leafW / 2 - 0.14;
    addBox(leaf, 0.030, 0.76, 0.042, hx, -0.04, 0.048, goldMat, false, false);
    addBox(leaf, 0.030, 0.76, 0.042, hx, -0.04, -0.048, goldMat, false, false);
    d.add(leaf);
    slidingDoors.push({
      kind: 'privacy',
      leaf,
      doorGroup: d,
      closedX,
      openX,
      defaultOpen,
      pos: defaultOpen,
      target: defaultOpen,
      phase: slidingDoors.length * 0.24
    });
    parent.add(d);
    return d;
  }

  function applySlidingDoorPose(sd, ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const eased = clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    sd.leaf.position.x = sd.closedX + (sd.openX - sd.closedX) * eased;
  }

  function setAllSlidingDoorTargets(mode) {
    // mode: 'default' (balconies breezy open, suites private closed) | 'open' (all 28 open) | 'closed' (all 28 closed)
    for (let i = 0; i < slidingDoors.length; i++) {
      const sd = slidingDoors[i];
      sd.target = mode === 'open' ? 1 : mode === 'closed' ? 0 : sd.defaultOpen;
    }
  }

  function updateSafetyDoors(openRatio) {
    for (let i = 0; i < safetyDoors.length; i++) {
      const d = safetyDoors[i];
      d.pivot.rotation.y = d.swingSign * openRatio * (Math.PI * 0.52);
    }
  }

  function addCeilingDecor(parent, x, y, z, w, d, opts = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // Clean Zero-Z-Fighting Recessed Dropped Gypsum Tray (0.10 m thick) + Inset Warm Perimeter Cove LED Glow!
    addBox(g, w, 0.10, 0.22, 0, 0, -d / 2 + 0.11, whiteMat, false, false);
    addBox(g, w, 0.10, 0.22, 0, 0, d / 2 - 0.11, whiteMat, false, false);
    addBox(g, 0.22, 0.10, d - 0.44, -w / 2 + 0.11, 0, 0, whiteMat, false, false);
    addBox(g, 0.22, 0.10, d - 0.44, w / 2 - 0.11, 0, 0, whiteMat, false, false);
    // Inset cove LED strips 3.5 cm clear of the gypsum tray inner faces (ZERO coplanar Z-fighting!)
    addBox(g, w - 0.50, 0.026, 0.04, 0, -0.025, -d / 2 + 0.255, warmLedMat, false, false);
    addBox(g, w - 0.50, 0.026, 0.04, 0, -0.025, d / 2 - 0.255, warmLedMat, false, false);
    addBox(g, 0.04, 0.026, d - 0.50, -w / 2 + 0.255, -0.025, 0, warmLedMat, false, false);
    addBox(g, 0.04, 0.026, d - 0.50, w / 2 - 0.255, -0.025, 0, warmLedMat, false, false);
    if (opts.baffles) {
      for (let bx = -w / 2 + 0.58; bx <= w / 2 - 0.58; bx += 0.42) {
        addBox(g, 0.065, 0.075, d - 0.72, bx, 0.005, 0, walnutMat, false, false);
      }
    }
    if (opts.ringChandelier) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.032, 8, 28), goldMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.34, 0); g.add(ring);
      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.60, 0.018, 6, 28), chandelierOrbMat);
      glowRing.rotation.x = Math.PI / 2; glowRing.position.set(0, -0.36, 0); g.add(glowRing);
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3;
        addBox(g, 0.012, 0.34, 0.012, Math.cos(a) * 0.60, -0.17, Math.sin(a) * 0.60, goldMat, false, false);
      }
    }
    if (opts.fan) {
      addBox(g, 0.04, 0.26, 0.04, 0, -0.13, 0, darkBronzeMat, false, false);
      const fanRotor = new THREE.Group();
      fanRotor.position.set(0, -0.27, 0);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), darkBronzeMat);
      fanRotor.add(hub);
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), chandelierOrbMat);
      led.position.y = -0.035; fanRotor.add(led);
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(UNIT_BOX, walnutMat);
        blade.scale.set(0.66, 0.02, 0.14);
        const a = k * (Math.PI * 2 / 3);
        blade.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
        blade.rotation.y = -a;
        fanRotor.add(blade);
      }
      g.add(fanRotor);
      spinningFans.push({ obj: fanRotor, axis: 'y', speed: opts.fanSpeed || 2.8 });
    }
    parent.add(g); return g;
  }

  function addBathCurtain(parent, x, y, z, width, height, rotY = 0, withWindow = true) {
    // Luxury Waterproof Pleated Spa-Blue Bathroom & Toilet Privacy Curtain + Brushed-Gold Track & Curtain Rings (+ optional Satin Frosted Backing Window!)
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    if (withWindow) {
      // Frosted privacy window glass behind the toilet/bath curtain
      addBox(g, width, height, 0.035, 0, height / 2, -0.055, frostedGlassMat, false, false);
      addBox(g, width + 0.06, 0.04, 0.06, 0, height + 0.01, -0.055, darkBronzeMat, false, false);
      addBox(g, width + 0.06, 0.04, 0.06, 0, 0.02, -0.055, darkBronzeMat, false, false);
    }
    // Brushed-gold waterproof curtain rod + decorative brass rings
    addBox(g, width + 0.14, 0.036, 0.044, 0, height - 0.025, 0.020, goldMat, false, false);
    for (let r = 0; r < 6; r++) {
      const rx = -width * 0.44 + (r / 5) * (width * 0.88);
      addBox(g, 0.022, 0.046, 0.052, rx, height - 0.05, 0.024, goldMat, false, false);
    }
    const hDrape = height - 0.08;
    const makeWing = (mat, depthZ, zOff) => {
      const wing = new THREE.Group();
      wing.position.set(0, hDrape / 2 + 0.02, zOff);
      for (let i = 0; i < 4; i++) {
        const px = (i + 0.5) / 4 - 0.5;
        addBox(wing, 0.24, hDrape, depthZ + (i % 2 ? 0.028 : 0), px, 0, i % 2 ? 0.014 : -0.014, mat, false, false);
      }
      return wing;
    };
    const leftVelvet = makeWing(bathCurtainMat, 0.042, 0.038);
    const rightVelvet = makeWing(bathCurtainMat, 0.042, 0.038);
    const leftSheer = makeWing(curtainSheerMat, 0.022, 0.010);
    const rightSheer = makeWing(curtainSheerMat, 0.022, 0.010);
    g.add(leftVelvet, rightVelvet, leftSheer, rightSheer);
    curtainSystems.push({ width, leftVelvet, rightVelvet, leftSheer, rightSheer });
    parent.add(g);
    return g;
  }

  function addACUnit(parent, x, y, z, rotY = 0, w = 0.94) {
    // Modern Wall-Mounted Split-Inverter AC Indoor Unit (Matte Pearl Body + Motorized Dark-Bronze Swing Louver + Cyan 22°C LED Display!)
    const ac = new THREE.Group();
    ac.position.set(x, y, z); ac.rotation.y = rotY;
    addBox(ac, w, 0.27, 0.20, 0, 0, 0.10, acBodyMat, true, false);
    addBox(ac, w - 0.04, 0.028, 0.04, 0, 0.125, 0.17, charcoalMat, false, false); // Top intake grille
    addBox(ac, w - 0.06, 0.014, 0.015, 0, 0.01, 0.204, goldMat, false, false);   // Subtle brushed-gold accent line
    // Angled air-outlet swing louver vane + recessed cool-air slot
    addBox(ac, w - 0.10, 0.055, 0.06, 0, -0.105, 0.165, charcoalMat, false, false);
    const vane = addBox(ac, w - 0.12, 0.024, 0.06, 0, -0.115, 0.195, acBodyMat, false, false);
    vane.rotation.x = 0.42;
    // Glowing Cyan Digital Temperature Readout (22°C) + Emerald Inverter Power LED
    addBox(ac, 0.11, 0.048, 0.012, w * 0.30, 0.045, 0.203, charcoalMat, false, false);
    addBox(ac, 0.065, 0.024, 0.014, w * 0.29, 0.045, 0.206, rgbCyanMat, false, false);
    addBox(ac, 0.018, 0.018, 0.014, w * 0.36, 0.045, 0.206, gasSensorLedMat, false, false);
    parent.add(ac);
    return ac;
  }

  function addExhaustFan(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    addBox(g, 0.34, 0.04, 0.34, 0, 0, 0, whiteMat, false, false);
    addBox(g, 0.26, 0.05, 0.26, 0, -0.01, 0, charcoalMat, false, false);
    const rotor = new THREE.Group();
    rotor.position.set(0, -0.03, 0);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(UNIT_BOX, steelMat);
      b.scale.set(0.19, 0.012, 0.045);
      b.rotation.y = k * (Math.PI / 4);
      rotor.add(b);
    }
    g.add(rotor);
    spinningFans.push({ obj: rotor, axis: 'y', speed: 6.5 });
    parent.add(g); return g;
  }

  /* Reusable Architectural 3D Furniture Builders */
  function addSofaUnit(parent, x, y, z, rotY = 0, w = 2.4) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    addBox(g, w, 0.36, 0.92, 0, 0.22, 0, upholsteryMat, false, true);
    addBox(g, w, 0.58, 0.20, 0, 0.52, -0.36, upholsteryMat, false, false);
    addBox(g, 0.20, 0.50, 0.92, -w / 2 + 0.1, 0.38, 0, upholsteryMat, false, false);
    addBox(g, 0.20, 0.50, 0.92, w / 2 - 0.1, 0.38, 0, upholsteryMat, false, false);
    addBox(g, w - 0.36, 0.14, 0.68, 0, 0.44, 0.08, bedMat, false, false);
    parent.add(g); return g;
  }
  function addBedSuite(parent, x, y, z, rotY = 0, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY; g.scale.setScalar(scale);
    addBox(g, 3.0, 0.03, 2.8, 0, 0.015, 0.15, rugMat, false, true);
    addBox(g, 2.05, 0.36, 2.25, 0, 0.22, 0, walnutMat, false, true);
    addBox(g, 1.94, 0.22, 2.12, 0, 0.48, 0.02, bedMat, false, false);
    addBox(g, 1.96, 0.10, 0.85, 0, 0.59, 0.58, upholsteryMat, false, false);
    // Pillows + backlit fluted headboard
    addBox(g, 0.72, 0.14, 0.42, -0.44, 0.64, -0.78, whiteMat, false, false);
    addBox(g, 0.72, 0.14, 0.42, 0.44, 0.64, -0.78, whiteMat, false, false);
    addBox(g, 2.65, 1.25, 0.14, 0, 0.72, -1.16, walnutMat, false, false);
    addBox(g, 2.55, 0.05, 0.06, 0, 1.36, -1.14, warmLedMat, false, false);
    // Twin nightstands & warm bedside lamps
    for (const dx of [-1.34, 1.34]) {
      addBox(g, 0.46, 0.44, 0.42, dx, 0.22, -0.92, walnutMat, false, false);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.26, 10), warmLedMat);
      lamp.position.set(dx, 0.58, -0.92); g.add(lamp);
    }
    parent.add(g); return g;
  }
  function addDiningSet(parent, x, y, z, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    addBox(g, 2.35, 0.09, 1.05, 0, 0.76, 0, marbleMat, false, true);
    addBox(g, 1.45, 0.72, 0.36, 0, 0.36, 0, walnutMat, false, false);
    for (const cx of [-0.78, 0, 0.78]) {
      for (const cz of [-0.72, 0.72]) {
        addBox(g, 0.44, 0.44, 0.44, cx, 0.24, cz, upholsteryMat, false, false);
        addBox(g, 0.44, 0.42, 0.08, cx, 0.64, cz + (cz > 0 ? 0.18 : -0.18), upholsteryMat, false, false);
      }
    }
    for (const ex of [-1.42, 1.42]) {
      addBox(g, 0.44, 0.44, 0.44, ex, 0.24, 0, upholsteryMat, false, false);
      addBox(g, 0.08, 0.42, 0.44, ex + (ex > 0 ? 0.18 : -0.18), 0.64, 0, upholsteryMat, false, false);
    }
    // Suspended gold linear crystal chandelier above dining table
    addBox(g, 1.55, 0.16, 0.28, 0, 2.25, 0, goldMat, false, false);
    addBox(g, 1.45, 0.08, 0.20, 0, 2.15, 0, chandelierOrbMat, false, false);
    parent.add(g); return g;
  }
  function addKitchenIsland(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // Matte charcoal back cabinetry + warm LED under-cabinet glow + oven
    addBox(g, 2.85, 2.35, 0.56, 0, 1.18, 0.78, charcoalMat, false, false);
    addBox(g, 2.25, 0.62, 0.58, 0, 1.28, 0.76, marbleMat, false, false);
    addBox(g, 2.20, 0.04, 0.06, 0, 1.56, 0.50, warmLedMat, false, false);
    // Backlit marble waterfall island + 3 bar stools + gold faucet
    addBox(g, 2.25, 0.90, 0.86, 0, 0.45, -0.35, marbleMat, false, true);
    addBox(g, 2.10, 0.05, 0.05, 0, 0.82, -0.78, warmLedMat, false, false);
    addBox(g, 0.05, 0.34, 0.05, 0.42, 1.06, -0.35, goldMat, false, false);
    for (const sx of [-0.65, 0, 0.65]) {
      addBox(g, 0.38, 0.62, 0.38, sx, 0.31, -1.02, darkBronzeMat, false, false);
      addBox(g, 0.40, 0.12, 0.40, sx, 0.66, -1.02, upholsteryMat, false, false);
    }
    parent.add(g); return g;
  }
  /* Upgraded Luxury Ceramic Toilet, Spa Ensuite Bathroom & Guest WC 3D Builders (with flush plates, bidets, towel racks & exhaust fans!) */
  const porcelainMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfa, roughness: 0.12, metalness: 0.06 });
  function addToilet(parent, x, y, z, rotY = 0) {
    const t = new THREE.Group();
    t.position.set(x, y, z); t.rotation.y = rotY;
    // Concealed tiled cistern wall box + brushed-chrome dual-flush actuator plate
    addBox(t, 0.54, 1.12, 0.18, 0, 0.56, -0.24, tileAccentMat, false, false);
    addBox(t, 0.22, 0.13, 0.025, 0, 0.94, -0.14, steelMat, false, false);
    addBox(t, 0.06, 0.07, 0.03, -0.04, 0.94, -0.132, goldMat, false, false);
    addBox(t, 0.08, 0.07, 0.03, 0.04, 0.94, -0.132, goldMat, false, false);
    // Sculpted porcelain pedestal + rounded rim bowl + contoured seat & closed lid
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.28, 16), porcelainMat);
    base.position.set(0, 0.14, 0.04); t.add(base);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.17, 18), porcelainMat);
    bowl.scale.set(0.94, 1.0, 1.24);
    bowl.position.set(0, 0.35, 0.09); t.add(bowl);
    const seatRing = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.025, 8, 18), porcelainMat);
    seatRing.rotation.x = Math.PI / 2; seatRing.scale.set(0.94, 1.18, 1);
    seatRing.position.set(0, 0.44, 0.09); t.add(seatRing);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.03, 16), porcelainMat);
    lid.scale.set(0.92, 1.0, 1.20);
    lid.position.set(0, 0.465, 0.08); t.add(lid);
    // Toilet paper roll holder (left) + chrome bidet / health faucet spray (right)
    addBox(t, 0.03, 0.03, 0.11, -0.32, 0.62, -0.10, goldMat, false, false);
    const tpRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.11, 10), towelMat);
    tpRoll.rotation.z = Math.PI / 2; tpRoll.position.set(-0.34, 0.62, -0.04); t.add(tpRoll);
    addBox(t, 0.03, 0.12, 0.04, 0.30, 0.56, -0.12, steelMat, false, false);
    addBox(t, 0.018, 0.24, 0.018, 0.30, 0.42, -0.12, darkBronzeMat, false, false);
    parent.add(t); return t;
  }
  function addEnsuiteBath(parent, x, y, z, rotY = 0, scale = 1) {
    const b = new THREE.Group();
    b.position.set(x, y, z); b.rotation.y = rotY; b.scale.setScalar(scale);
    // Patterned anti-slip travertine floor + full-height marble wet-zone accent back wall
    addBox(b, 2.20, 0.04, 1.98, 0, 0.02, 0, marbleMat, false, true);
    addBox(b, 2.18, 2.38, 0.06, 0, 1.20, -0.95, tileAccentMat, false, true);
    // Upgraded Ceramic WC toilet against rear wet wall + Frosted Privacy Glass Divider + Full-Height Toilet Privacy Curtain & Window Curtain!
    addToilet(b, -0.58, 0.03, -0.62, 0);
    addBox(b, 0.04, 2.12, 0.72, -0.14, 1.06, -0.56, frostedGlassMat, false, false); // Frosted toilet privacy divider
    addBox(b, 0.046, 2.12, 0.046, -0.14, 1.06, -0.20, goldMat, false, false);
    addBathCurtain(b, -0.54, 0.92, -0.88, 0.80, 1.24, 0, true);  // Frosted rear toilet window + waterproof curtain!
    addBathCurtain(b, -0.58, 0.04, -0.16, 0.84, 2.14, 0, false); // Full-height toilet compartment privacy curtain!
    // Floating walnut & marble vanity, ceramic vessel basin, curved gold tap, folded towels & glowing halo mirror
    addBox(b, 0.96, 0.34, 0.48, 0.44, 0.70, -0.66, walnutMat, false, false);
    addBox(b, 0.98, 0.05, 0.50, 0.44, 0.89, -0.66, marbleMat, false, false);
    addBox(b, 0.90, 0.03, 0.04, 0.44, 0.52, -0.44, warmLedMat, false, false); // Under-vanity night glow
    addBox(b, 0.34, 0.12, 0.28, 0.44, 0.34, -0.64, towelMat, false, false); // Rolled towels on lower shelf
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.13, 16), porcelainMat);
    basin.position.set(0.44, 0.97, -0.64); b.add(basin);
    addBox(b, 0.035, 0.24, 0.035, 0.44, 1.04, -0.82, goldMat, false, false);
    addBox(b, 0.035, 0.035, 0.12, 0.44, 1.15, -0.77, goldMat, false, false);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.03, 24), warmLedMat);
    halo.rotation.x = Math.PI / 2; halo.position.set(0.44, 1.54, -0.90); b.add(halo);
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.04, 24), atriumGlassMat);
    mirror.rotation.x = Math.PI / 2; mirror.position.set(0.44, 1.54, -0.88); b.add(mirror);
    // UPGRADED FROSTED-GLASS WALK-IN RAIN & HANDHELD SHOWER CUBICLE + Linear Drain + Shampoo Niche + Shimmering Spray!
    addBox(b, 1.00, 0.04, 0.96, -0.56, 0.04, 0.48, tileAccentMat, false, true);
    addBox(b, 0.76, 0.02, 0.06, -0.56, 0.065, 0.86, steelMat, false, false); // Linear stainless floor drain
    addBox(b, 0.04, 2.22, 0.98, -0.05, 1.11, 0.46, frostedGlassMat, false, false); // Satin frosted glass side panel
    addBox(b, 0.98, 2.22, 0.04, -0.54, 1.11, -0.02, frostedGlassMat, false, false); // Satin frosted glass partition
    addBox(b, 0.045, 2.22, 0.045, -0.05, 1.11, 0.95, goldMat, false, false); // Gold frame upright
    addBox(b, 0.045, 2.22, 0.045, -0.05, 1.11, -0.02, goldMat, false, false);
    addBox(b, 0.03, 0.44, 0.04, -0.02, 1.08, 0.62, goldMat, false, false); // Shower door pull handle
    addBathCurtain(b, -0.54, 0.05, 0.94, 0.98, 2.18, 0, false); // Full-height waterproof pleated shower privacy curtain on gold rail!
    addBox(b, 0.04, 2.02, 0.04, -0.96, 1.06, 0.46, goldMat, false, false); // Brushed-gold shower riser column
    addBox(b, 0.28, 0.04, 0.04, -0.82, 2.06, 0.46, goldMat, false, false); // Overhead shower arm
    addBox(b, 0.34, 0.03, 0.34, -0.64, 2.04, 0.46, goldMat, false, false); // Wide square rainfall shower head!
    addBox(b, 0.14, 0.14, 0.05, -0.94, 1.12, 0.46, steelMat, false, false); // Thermostatic mixer valve
    addBox(b, 0.04, 0.22, 0.04, -0.92, 1.38, 0.64, steelMat, false, false); // Chrome handheld shower wand!
    addBox(b, 0.08, 0.26, 0.42, -1.00, 1.24, 0.22, warmLedMat, false, false); // Backlit recessed shampoo niche
    for (const [sx, sz] of [[-0.72, 0.38], [-0.56, 0.46], [-0.64, 0.54]]) {
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1.84, 6), waterGlowMat);
      stream.position.set(sx, 1.10, sz); b.add(stream);
    }
    // Heated gold towel rail + ceiling exhaust fan grille (spins in real time!)
    addBox(b, 0.04, 0.75, 0.48, 1.02, 1.25, 0.25, goldMat, false, false);
    addBox(b, 0.06, 0.36, 0.36, 0.99, 1.32, 0.25, towelMat, false, false);
    addExhaustFan(b, 0.0, 2.38, 0.05);
    parent.add(b); return b;
  }
  function addGuestWC(parent, x, y, z, rotY = 0) {
    const w = new THREE.Group();
    w.position.set(x, y, z); w.rotation.y = rotY;
    addBox(w, 1.58, 0.04, 1.32, 0, 0.02, 0, marbleMat, false, true);
    addBox(w, 1.56, 2.30, 0.05, 0, 1.15, -0.62, tileAccentMat, false, false);
    addToilet(w, -0.36, 0.03, -0.34, 0);
    // Frosted Privacy Glass Toilet Divider + Full-Height Toilet Privacy Curtain & Frosted Window Curtain!
    addBox(w, 0.04, 2.08, 0.64, 0.02, 1.04, -0.30, frostedGlassMat, false, false);
    addBox(w, 0.044, 2.08, 0.044, 0.02, 1.04, 0.02, goldMat, false, false);
    addBathCurtain(w, -0.36, 0.96, -0.56, 0.70, 1.16, 0, true);  // Frosted toilet window curtain!
    addBathCurtain(w, -0.36, 0.04, 0.06, 0.74, 2.08, 0, false);  // Full-height waterproof toilet enclosure privacy curtain!
    addBox(w, 0.66, 0.30, 0.42, 0.40, 0.70, -0.36, walnutMat, false, false);
    addBox(w, 0.68, 0.05, 0.44, 0.40, 0.87, -0.36, marbleMat, false, false);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.11, 14), porcelainMat);
    basin.position.set(0.40, 0.94, -0.35); w.add(basin);
    addBox(w, 0.035, 0.20, 0.035, 0.40, 0.98, -0.50, goldMat, false, false);
    addBox(w, 0.60, 0.70, 0.04, 0.40, 1.46, -0.58, warmLedMat, false, false);
    addBox(w, 0.54, 0.62, 0.05, 0.40, 1.46, -0.56, atriumGlassMat, false, false);
    addExhaustFan(w, 0.0, 2.28, -0.05);
    parent.add(w); return w;
  }
  function addSpaBath(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // Full-suite luxury travertine marble floor & wet-zone accent back wall
    addBox(g, 2.85, 0.04, 2.45, -0.05, 0.02, -0.05, marbleMat, false, true);
    addBox(g, 2.82, 2.65, 0.06, -0.05, 1.32, -1.20, tileAccentMat, false, true);
    // BOTH LUXURY FREESTANDING EGG SOAKING TUB AND FULL FROSTED-GLASS WALK-IN RAIN + HANDHELD SHOWER CUBICLE!
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.56, 22), porcelainMat);
    tub.scale.set(1.56, 1.0, 0.92);
    tub.position.set(0.24, 0.29, 0.58); g.add(tub);
    const waterIn = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.04, 20), waterGlowMat);
    waterIn.scale.set(1.46, 1.0, 0.84);
    waterIn.position.set(0.24, 0.53, 0.58); g.add(waterIn);
    addBox(g, 0.22, 0.04, 0.80, 0.24, 0.59, 0.58, walnutMat, false, false); // Teak bath caddy
    const spaCandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 10), chandelierOrbMat);
    spaCandle.position.set(0.24, 0.66, 0.48); g.add(spaCandle);
    addBox(g, 0.05, 0.82, 0.05, 0.96, 0.41, 0.58, goldMat, false, false);
    addBox(g, 0.20, 0.04, 0.04, 0.86, 0.80, 0.58, goldMat, false, false);
    // Upgraded Ceramic WC Toilet + Satin Frosted Privacy Partition + Full-Height Toilet Alcove Curtain, Tub Privacy Drape & Frosted Window Curtain!
    addToilet(g, 0.96, 0.03, -0.52, -Math.PI / 2);
    addBox(g, 0.72, 2.25, 0.04, 0.96, 1.12, -0.04, frostedGlassMat, false, false); // Frosted toilet privacy glass!
    addBox(g, 0.046, 2.25, 0.046, 0.60, 1.12, -0.04, goldMat, false, false);
    addBathCurtain(g, 0.92, 0.95, -1.12, 0.84, 1.48, 0, true);             // Frosted rear toilet window + waterproof curtain!
    addBathCurtain(g, 0.55, 0.04, -0.56, 0.98, 2.24, -Math.PI / 2, false); // Full-height toilet alcove privacy curtain!
    addBathCurtain(g, 0.24, 0.04, 1.10, 1.72, 2.34, Math.PI, false);       // Luxury spa soaking-tub & bath privacy curtain!
    // Floating walnut & Calacatta double vanity + twin vessel basins + gold taps + wide backlit mirror
    addBox(g, 1.26, 0.36, 0.48, -0.05, 0.72, -0.92, walnutMat, false, false);
    addBox(g, 1.30, 0.05, 0.50, -0.05, 0.92, -0.92, marbleMat, false, false);
    addBox(g, 1.18, 0.03, 0.04, -0.05, 0.52, -0.68, warmLedMat, false, false);
    for (const vx of [-0.36, 0.26]) {
      const vb = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.12, 16), porcelainMat);
      vb.position.set(vx, 1.00, -0.90); g.add(vb);
      addBox(g, 0.035, 0.22, 0.035, vx, 1.06, -1.06, goldMat, false, false);
    }
    addBox(g, 1.24, 0.96, 0.04, -0.05, 1.54, -1.14, warmLedMat, false, false);
    addBox(g, 1.14, 0.86, 0.05, -0.05, 1.54, -1.11, atriumGlassMat, false, false);
    // FULL FROSTED-GLASS WALK-IN RAINFALL & HANDHELD SHOWER CUBICLE (Left Wet Bay — Both Tub & Shower!)
    addBox(g, 0.96, 0.04, 1.42, -1.02, 0.04, -0.25, tileAccentMat, false, true);
    addBox(g, 0.04, 2.34, 1.44, -0.56, 1.17, -0.25, frostedGlassMat, false, false); // Full frosted shower glass side
    addBox(g, 0.92, 2.34, 0.04, -1.02, 1.17, 0.46, frostedGlassMat, false, false);  // Frosted hinged shower door
    addBox(g, 0.048, 2.34, 0.048, -0.56, 1.17, 0.46, goldMat, false, false);
    addBox(g, 0.048, 2.34, 0.048, -0.56, 1.17, -0.96, goldMat, false, false);
    addBox(g, 0.04, 0.48, 0.04, -0.78, 1.12, 0.50, goldMat, false, false); // Shower door gold handle
    addBox(g, 0.56, 0.44, 0.36, -1.16, 0.22, -0.92, marbleMat, false, false); // Built-in marble shower seat
    addBox(g, 0.06, 0.02, 0.96, -1.36, 0.065, -0.25, steelMat, false, false); // Linear stainless floor drain
    addBox(g, 0.06, 0.30, 0.52, -1.44, 1.32, -0.35, warmLedMat, false, false); // Backlit recessed shower niche
    // Overhead Square Rainfall Shower Head + Chrome Handheld Shower Wand on Slide Bar + Shimmering Water Streams!
    addBox(g, 0.045, 2.18, 0.045, -1.42, 1.12, -0.25, goldMat, false, false);
    addBox(g, 0.34, 0.04, 0.04, -1.24, 2.22, -0.25, goldMat, false, false);
    addBox(g, 0.38, 0.032, 0.38, -1.04, 2.20, -0.25, goldMat, false, false); // Wide square rain shower head!
    addBox(g, 0.16, 0.16, 0.05, -1.39, 1.16, -0.05, steelMat, false, false); // Thermostatic mixer valve
    addBox(g, 0.04, 0.24, 0.04, -1.36, 1.44, 0.08, steelMat, false, false);  // Chrome handheld shower wand!
    for (const [sx, sz] of [[-1.14, -0.34], [-0.96, -0.25], [-1.05, -0.14]]) {
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.020, 2.02, 6), waterGlowMat);
      stream.position.set(sx, 1.16, sz); g.add(stream);
    }
    // Heated gold ladder towel warmer with stacked cream spa towels + spinning ceiling exhaust fan
    addBox(g, 0.04, 1.15, 0.52, 1.28, 1.25, 0.32, goldMat, false, false);
    addBox(g, 0.07, 0.42, 0.38, 1.24, 1.42, 0.32, towelMat, false, false);
    addExhaustFan(g, -0.15, 2.62, -0.15);
    parent.add(g); return g;
  }

  /* === GROUND FLOOR: SCULPTURAL ROUNDED GARAGE PORTAL + 2 SLEEK CARS + FULL 3D LIVING / DINING / KITCHEN === */
  const gf = levels.ground;
  // Ground plinth slab (stops cleanly before spiral tower at x=1.95)
  addBox(gf, 10.6, 0.26, 10.2, -3.1, 0.13, -0.1, warmWallMat, false, true);
  // EXTENDED GROUND LEFT COVERED GARDEN VERANDA DECK & COLONNADE SUPPORTING THE 1.9 m LEFT BALCONIES ABOVE!
  addBox(gf, 1.18, 0.24, 9.35, -8.78, 0.12, -0.45, marbleMat, true, true);
  addBox(gf, 0.05, 0.04, 9.25, -9.35, 0.04, -0.45, warmLedMat, false, false);
  // 3 Slim Sculptural White Colonnade Columns supporting the extended x=-9.35 left wraparound balconies
  for (const cz of [-4.85, -0.45, 3.85]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.36, 18), whiteMat);
    col.position.set(-9.18, 1.80, cz); col.castShadow = true; col.receiveShadow = true; gf.add(col);
    addBox(gf, 0.36, 0.07, 0.36, -9.18, 0.27, cz, goldMat, false, false);
    addBox(gf, 0.36, 0.07, 0.36, -9.18, 3.36, cz, goldMat, false, false);
  }
  // Architectural Closed Rear-Left Privacy Louver Screen (z=-5.10, x=-9.35..-8.20) + Veranda Teak Bench & Sconces
  addBox(gf, 1.24, 3.34, 0.14, -8.78, 1.79, -5.06, darkBronzeMat, true, true);
  for (let lx = -9.24; lx <= -8.32; lx += 0.18) {
    addBox(gf, 0.045, 3.16, 0.18, lx, 1.79, -5.06, goldMat, false, false);
  }
  // Ground Left Veranda Slatted Teak Bench + Potted Planters + Warm Wall Sconces
  addBox(gf, 0.50, 0.44, 1.85, -8.68, 0.46, -2.25, woodMat, true, true);
  addBox(gf, 0.46, 0.08, 1.78, -8.68, 0.72, -2.25, upholsteryMat, false, false);
  addPlanterTree(gf, -8.76, 0.24, -4.25, 0.78, false);
  addPlanterTree(gf, -8.76, 0.24, 1.95, 0.76, true);
  for (const sz of [-3.4, -0.9, 1.6]) {
    addBox(gf, 0.10, 0.34, 0.10, -8.44, 2.08, sz, darkBronzeMat, false, false);
    addBox(gf, 0.09, 0.06, 0.09, -8.46, 2.26, sz, warmLedMat, false, false);
  }
  // Rear living/dining glass bay with REAL OPEN 2.0 m sliding garden patio door (x=-3.10) — top strictly 1.5 cm below 1F ceiling (3.27)!
  addBox(gf, 3.60, 2.98, 0.14, -5.90, 1.75, -5.05, atriumGlassMat, false, false);
  addBox(gf, 3.60, 2.98, 0.14, -0.30, 1.75, -5.05, atriumGlassMat, false, false);
  for (const mx of [-7.6, -5.9, -4.1, -2.1, -0.3, 1.4]) addBox(gf, 0.10, 2.98, 0.14, mx, 1.75, -5.05, darkBronzeMat);
  addSlidingBalconyDoor(gf, -3.10, 0.26, -5.05, 2.00, 2.84, 0, 1);
  // Left exterior wall split cleanly at z=-0.82..+0.62 with REAL OPEN sliding glass door out to Covered Left Garden Veranda (top = 3.24 < 3.27 slab underside!)
  const gfLeftWallGrp = new THREE.Group();
  addBox(gfLeftWallGrp, 0.35, 2.98, 4.28, -8.25, 1.75, -2.96, whiteMat); // Rear section (-5.10..-0.82)
  addBox(gfLeftWallGrp, 0.35, 2.98, 4.28, -8.25, 1.75, 2.76, whiteMat);  // Front section (+0.62..+4.90)
  addBox(gfLeftWallGrp, 0.35, 0.26, 1.46, -8.25, 3.11, -0.10, whiteMat); // Flush header above veranda door
  addSlidingBalconyDoor(gfLeftWallGrp, -8.25, 0.26, -0.10, 1.44, 2.72, Math.PI / 2, 1);
  gf.add(gfLeftWallGrp);
  cutawayShells.push(gfLeftWallGrp);
  addBox(gf, 0.26, 2.98, 6.02, 1.55, 1.75, -2.03, whiteMat); // Rear section (-5.04..+0.98)
  addBox(gf, 0.26, 2.98, 1.85, 1.55, 1.75, 3.225, whiteMat); // Front section (+2.30..+4.15)
  addBox(gf, 0.26, 0.24, 1.32, 1.55, 3.12, 1.64, whiteMat);  // Doorway header cleanly below 3.27 ceiling!

  // GROUND FLOOR 3D INTERIORS (Rear Living TV 1, 8-Seat Dining, Modern Marble Kitchen Island)
  const gfInterior = new THREE.Group();
  gf.add(gfInterior);
  // Main Living Room (Live 4K Animated TV 1, Fluted Marble Feature Wall, Gallery Art, Drapes & Cove Ceiling Fan!)
  addBox(gfInterior, 3.6, 0.03, 3.0, -5.15, 0.28, -2.55, rugMat, false, true);
  addSofaUnit(gfInterior, -5.15, 0.27, -1.35, Math.PI, 2.5);
  addSofaUnit(gfInterior, -5.15, 0.27, -3.75, 0, 2.5);
  addBox(gfInterior, 1.35, 0.32, 0.78, -5.15, 0.43, -2.55, walnutMat, false, true);
  addBox(gfInterior, 1.28, 0.04, 0.72, -5.15, 0.60, -2.55, marbleMat, false, false);
  addBox(gfInterior, 0.36, 0.03, 0.24, -5.25, 0.635, -2.55, goldMat, false, false);
  // Bookmatched marble + fluted walnut TV wall + Zero-Z-fighting Live Animated 85" OLED Cinema TV!
  addBox(gfInterior, 0.12, 2.55, 3.45, -7.88, 1.56, -2.55, marbleMat, false, false);
  for (let vz = -4.15; vz <= -0.95; vz += 0.24) {
    if (Math.abs(vz + 2.55) > 1.05) addBox(gfInterior, 0.06, 2.50, 0.08, -7.81, 1.56, vz, walnutMat, false, false);
  }
  addFlatScreen(gfInterior, 1.92, 1.05, -7.73, 1.55, -2.55, Math.PI / 2, liveScreens.cinema.mat, warmLedMat);
  // Under-sink Chrome RO Pure Drinking Water Tap on Kitchen Island
  addBox(gfInterior, 0.025, 0.24, 0.025, -0.22, 1.29, -1.60, steelMat, false, false);
  addBox(gfInterior, 0.09, 0.022, 0.022, -0.26, 1.41, -1.60, steelMat, false, false);
  // Living Wall Art, Split-Inverter AC, Velvet/Sheer Rear Window Curtains & Dropped LED Cove Ceiling with Spinning Fan
  addWallArt(gfInterior, -5.15, 1.75, -0.30, 1.35, 0.92, Math.PI, 0);
  addACUnit(gfInterior, -5.15, 2.74, -0.22, Math.PI, 1.04); // Ground Living Room Split-Inverter AC
  addCurtainPair(gfInterior, -5.15, 0.28, -4.88, 4.4, 2.82, 0);
  addCeilingDecor(gfInterior, -5.15, 3.16, -2.55, 4.6, 3.8, { baffles: true, fan: true, fanSpeed: 2.4 });
  // Sculptural gold floor lamp beside living sofa
  const gfLampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.85, 8), goldMat);
  gfLampPole.position.set(-7.05, 1.20, -1.25); gfInterior.add(gfLampPole);
  const gfLampOrb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), chandelierOrbMat);
  gfLampOrb.position.set(-7.05, 2.16, -1.25); gfInterior.add(gfLampOrb);
  addPlanterTree(gfInterior, -7.35, 0.27, -4.35, 0.72, false);
  // 8-Seater Dining Area + Chandelier + Gallery Wall Art + Split-Inverter AC + Cove Ceiling (x=-0.95, z=-3.6)
  addDiningSet(gfInterior, -0.95, 0.27, -3.65, 0);
  addWallArt(gfInterior, 1.40, 1.72, -3.55, 1.35, 0.95, -Math.PI / 2, 1);
  addACUnit(gfInterior, 1.40, 2.74, -3.55, -Math.PI / 2, 0.98); // Ground Dining & Kitchen Split-Inverter AC
  addCurtainPair(gfInterior, -0.95, 0.28, -4.88, 3.6, 2.82, 0);
  addCeilingDecor(gfInterior, -0.95, 3.16, -2.85, 3.8, 3.4, { ringChandelier: false });
  // Modern Charcoal & Marble Waterfall Kitchen Island (x=-0.95, z=-1.2) + Piped 4-Burner Gas Hob, Island Chimney Hood & Gas Leak Sensor!
  addKitchenIsland(gfInterior, -0.95, 0.27, -1.25);
  addBox(gfInterior, 0.92, 2.12, 0.72, 1.02, 1.33, -0.58, steelMat, false, false); // Double-door stainless refrigerator
  addBox(gfInterior, 0.03, 1.95, 0.04, 1.02, 1.33, -0.95, darkBronzeMat, false, false);
  addBox(gfInterior, 0.64, 0.56, 0.06, -0.95, 1.24, -0.73, charcoalMat, false, false); // Built-in oven glass
  // Upgraded 4-Burner Glass Gas Cooktop + Brass Burners + Subtle Blue Gas Flame Glow!
  addBox(gfInterior, 0.84, 0.04, 0.52, -1.35, 1.19, -1.60, charcoalMat, false, false);
  for (const [bx, bz] of [[-1.55, -1.72], [-1.15, -1.72], [-1.55, -1.48], [-1.15, -1.48]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 12), brassMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(bx, 1.22, bz); gfInterior.add(ring);
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 12), gasFlameMat);
    flame.rotation.x = Math.PI / 2; flame.position.set(bx, 1.238, bz); gfInterior.add(flame);
    gasFlameMeshes.push(flame);
  }
  // Brushed-Steel Island Chimney Exhaust Hood directly above 4-Burner Gas Hob + Warm LED Hood Strip (top 3.22 < 3.27 ceiling!)
  addBox(gfInterior, 0.98, 0.14, 0.66, -1.35, 2.38, -1.60, steelMat, false, false);
  addBox(gfInterior, 0.34, 0.78, 0.30, -1.35, 2.83, -1.60, steelMat, false, false);
  addBox(gfInterior, 0.84, 0.025, 0.05, -1.35, 2.30, -1.60, warmLedMat, false, false);
  // Inline Kitchen Gas Isolation Shutoff Valve + Wall-Mounted Smart Gas Leak Sensor (Green pulsing LED!)
  addBox(gfInterior, 0.14, 0.18, 0.07, 0.25, 1.92, -0.52, whiteMat, false, false);
  addBox(gfInterior, 0.04, 0.04, 0.02, 0.25, 1.96, -0.48, gasSensorLedMat, false, false);
  addBox(gfInterior, 0.10, 0.10, 0.10, -0.25, 0.84, -0.52, brassMat, false, false);
  addBox(gfInterior, 0.14, 0.03, 0.03, -0.25, 0.90, -0.47, lpgRedMat, false, false); // Red quarter-turn valve handle
  for (const kx of [-0.55, 0.05]) {
    addBox(gfInterior, 0.018, 0.85, 0.018, kx, 2.68, -1.60, goldMat, false, false);
    const kp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), chandelierOrbMat);
    kp.position.set(kx, 2.22, -1.60); gfInterior.add(kp);
  }
  // REAR-RIGHT BEHIND-SPIRAL GROUND WING: Ground Guest WC + Ensuite Bathroom 1 (Full Privacy Enclosures + Frosted Sliding Doors!)
  addBox(gf, 6.2, 0.26, 4.45, 4.85, 0.13, -2.65, warmWallMat, false, true);
  addBox(gf, 5.4, 3.00, 0.14, 4.95, 1.75, -4.82, atriumGlassMat, false, false);
  for (const bx of [2.3, 4.0, 5.7, 7.4]) addBox(gf, 0.08, 3.00, 0.16, bx, 1.75, -4.82, darkBronzeMat);
  cutawayShells.push(addBox(gf, 0.22, 3.00, 2.45, 7.85, 1.75, -3.62, whiteMat));
  // Full-depth acoustic privacy wall dividing Guest WC from Ensuite 1 + Frosted Bathroom Privacy Sliding Doors!
  addBox(gf, 0.14, 2.98, 4.25, 4.45, 1.75, -2.65, whiteMat, false, false);
  addBox(gf, 2.65, 2.98, 0.14, 3.08, 1.75, -0.52, whiteMat, false, false); // Privacy front wall shielding GF Guest WC
  addPrivacySlidingDoor(gfInterior, 3.05, 0.27, -1.62, 0.88, 2.18, 0, true, 0.90);  // GF Guest WC Frosted Sliding Privacy Door!
  addPrivacySlidingDoor(gfInterior, 6.15, 0.27, -2.35, 0.98, 2.22, 0, true, 0.90);  // GF Ensuite 1 Frosted Sliding Privacy Door!
  addGuestWC(gfInterior, 3.05, 0.27, -2.35, Math.PI);
  addEnsuiteBath(gfInterior, 6.15, 0.27, -3.45, Math.PI, 0.94);
  addBathCurtain(gfInterior, 6.15, 0.28, -4.68, 2.20, 2.80, 0, false); // Exterior rear glazed window curtain for GF Ensuite 1!
  interiorDecor.push(gfInterior);

  // ICONIC ROUNDED WHITE GARAGE PORTAL ARCH (Matches exterior-photo.webp & dream-home-refined-front.webp!)
  const portalShape = new THREE.Shape();
  portalShape.moveTo(-8.45, 0);
  portalShape.lineTo(-8.45, 2.15);
  portalShape.quadraticCurveTo(-8.45, 3.45, -7.1, 3.45);
  portalShape.lineTo(0.45, 3.45);
  portalShape.quadraticCurveTo(2.15, 3.45, 2.15, 1.75);
  portalShape.lineTo(2.15, 0);
  portalShape.lineTo(1.12, 0);
  portalShape.lineTo(1.12, 2.02);
  portalShape.quadraticCurveTo(1.12, 2.74, 0.38, 2.74);
  portalShape.lineTo(-6.68, 2.74);
  portalShape.quadraticCurveTo(-7.35, 2.74, -7.35, 2.04);
  portalShape.lineTo(-7.35, 0);
  portalShape.closePath();

  const portalMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(portalShape, { depth: 1.55, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 24 }),
    whiteMat
  );
  portalMesh.position.set(0, 0, 4.2);
  portalMesh.castShadow = true;
  portalMesh.receiveShadow = true;
  gf.add(portalMesh);

  // Recessed warm gold LED cove accent running along the iconic rounded garage arch!
  const archLedPts = [
    new THREE.Vector3(-8.24, 0.12, 5.79),
    new THREE.Vector3(-8.24, 2.15, 5.79),
    new THREE.Vector3(-7.95, 2.98, 5.79),
    new THREE.Vector3(-7.1, 3.24, 5.79),
    new THREE.Vector3(0.42, 3.24, 5.79),
    new THREE.Vector3(1.45, 2.95, 5.79),
    new THREE.Vector3(1.94, 1.95, 5.79),
    new THREE.Vector3(1.94, 0.12, 5.79)
  ];
  gf.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archLedPts), 80, 0.036, 8, false), warmLedMat));

  // Recessed Warm-Lit 2-Car Garage Interior (Zero-Z-Fighting Ceiling + REAL OPEN INNER HOME ENTRANCE DOORWAY at x=-3.15, z=-0.15 between RR & Benz!)
  addBox(gf, 8.8, 0.1, 5.3, -3.15, 0.09, 2.45, garageFloorMat, false, true);
  addBox(gf, 8.8, 0.06, 5.2, -3.15, 2.89, 2.4, interiorGlowMat, false, false);
  // Rear garage wall precision-cut at x=-3.76..-2.54 (1.22 m clear opening) for direct inner garage-to-home entrance!
  addBox(gf, 3.79, 2.74, 0.22, -5.655, 1.46, -0.15, warmWallMat); // Left rear wall (-7.55..-3.76)
  addBox(gf, 3.79, 2.74, 0.22, -0.645, 1.46, -0.15, warmWallMat); // Right rear wall (-2.54..+1.25)
  addBox(gf, 1.24, 0.43, 0.22, -3.15, 2.615, -0.15, warmWallMat); // Flush header lintel above inner garage door (y=2.40..2.83)
  // Interactive Fire-Rated Biometric Inner Garage Safety Door + Illuminated Marble Mudroom Entry Step + Welcome Sconce!
  addSafetyDoor(gf, -3.15, 0.26, -0.15, 1.08, 2.12, 0, -1);
  addBox(gf, 1.44, 0.12, 0.44, -3.15, 0.20, 0.18, marbleMat, true, true);      // Inlaid marble transition step (garage 0.14 -> home 0.26)
  addBox(gf, 1.36, 0.025, 0.03, -3.15, 0.155, 0.405, warmLedMat, false, false); // Warm under-step welcome LED strip
  addBox(gf, 1.24, 0.03, 0.05, -3.15, 2.38, -0.02, warmLedMat, false, false);   // Overhead inner entrance welcome light bar
  addBox(gf, 0.18, 2.74, 5.0, -7.45, 1.46, 2.4, warmWallMat);
  addBox(gf, 0.18, 2.74, 5.0, 1.15, 1.46, 2.4, warmWallMat);
  // Warm linear LED ceiling strips inside garage
  for (const gx of [-5.2, -1.2]) {
    addBox(gf, 2.2, 0.04, 0.09, gx, 2.75, 3.6, warmLedMat, false, false);
    addBox(gf, 2.2, 0.04, 0.09, gx, 2.75, 1.6, warmLedMat, false, false);
  }
  // Framed wall art inside garage (shifted cleanly right behind Mercedes-Benz, 50 cm clear of inner entrance!)
  addBox(gf, 0.05, 1.35, 0.95, -7.33, 1.42, 3.2, darkBronzeMat, false, false);
  addBox(gf, 0.06, 1.18, 0.80, -7.31, 1.42, 3.2, goldMat, false, false);
  addBox(gf, 2.10, 1.05, 0.06, -1.05, 1.5, -0.02, darkBronzeMat, false, false);
  // Exterior pillar black sconce lamps
  for (const sx of [-7.85, 1.62]) {
    addBox(gf, 0.12, 0.34, 0.14, sx, 1.95, 5.8, darkBronzeMat);
    addBox(gf, 0.10, 0.06, 0.10, sx, 2.13, 5.8, warmLedMat, false, false);
    addBox(gf, 0.10, 0.06, 0.10, sx, 1.77, 5.8, warmLedMat, false, false);
  }

  /* === MOTORIZED ARTICULATED SECTIONAL ROLLING GARAGE DOOR (12 slats curving smoothly along garage ceiling!) === */
  const garageDoorGroup = new THREE.Group();
  gf.add(garageDoorGroup);
  const gdCX = -3.115, gdW = 8.34, gdZ = 5.18;
  // Vertical side guide tracks + overhead horizontal ceiling tracks + concealed brushed-steel roller drum housing
  for (const tx of [-7.30, 1.07]) {
    addBox(garageDoorGroup, 0.07, 2.58, 0.09, tx, 1.41, gdZ, darkBronzeMat, false, false);
    addBox(garageDoorGroup, 0.07, 0.07, 2.75, tx, 2.68, 3.80, darkBronzeMat, false, false);
  }
  const rollerDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, gdW + 0.12, 16), steelMat);
  rollerDrum.rotation.z = Math.PI / 2;
  rollerDrum.position.set(gdCX, 2.66, 4.96);
  garageDoorGroup.add(rollerDrum);
  addBox(garageDoorGroup, gdW + 0.18, 0.16, 0.34, gdCX, 2.72, 5.02, darkBronzeMat, false, false);

  const garageSlats = [];
  const GD_COUNT = 12, GD_STEP = 0.218;
  for (let si = 0; si < GD_COUNT; si++) {
    const slat = new THREE.Group();
    slat.position.set(gdCX, 0.24 + si * GD_STEP, gdZ);
    if (si === 10) {
      // Clerestory frosted-glass vision slat row (lets warm interior glow peek through when closed!)
      addBox(slat, gdW, 0.035, 0.06, 0, -0.09, 0, darkBronzeMat, false, false);
      addBox(slat, gdW, 0.035, 0.06, 0, 0.09, 0, darkBronzeMat, false, false);
      addBox(slat, gdW - 0.16, 0.15, 0.035, 0, 0, 0, railGlassMat, false, false);
      for (let mx = -3.4; mx <= 3.45; mx += 1.36) {
        addBox(slat, 0.12, 0.19, 0.065, mx, 0, 0, darkBronzeMat, false, false);
      }
    } else {
      // Insulated ribbed matte-charcoal architectural metal slat + subtle champagne-gold horizontal pinstripe
      addBox(slat, gdW, 0.195, 0.055, 0, 0, 0, charcoalMat, true, true);
      if (si === 0) {
        // Bottom brushed-gold weatherseal & safety bar
        addBox(slat, gdW + 0.02, 0.045, 0.07, 0, -0.09, 0, goldMat, false, false);
      } else if (si % 2 === 0) {
        addBox(slat, gdW - 0.10, 0.016, 0.062, 0, 0, 0, goldMat, false, false);
      }
    }
    garageDoorGroup.add(slat);
    garageSlats.push(slat);
  }
  function updateGarageDoor(openRatio) {
    const travel = 2.54;
    const curveR = 0.28, curveArc = (Math.PI / 2) * curveR; // ~0.44m smooth 90° elbow
    const vTop = 2.38;
    for (let si = 0; si < GD_COUNT; si++) {
      const s = 0.24 + si * GD_STEP + openRatio * travel;
      const slat = garageSlats[si];
      if (s <= vTop) {
        slat.position.set(gdCX, s, gdZ);
        slat.rotation.x = 0;
      } else if (s <= vTop + curveArc) {
        const a = ((s - vTop) / curveArc) * (Math.PI / 2);
        slat.position.set(gdCX, vTop + Math.sin(a) * curveR, gdZ - (1 - Math.cos(a)) * curveR);
        slat.rotation.x = -a;
      } else {
        const hRun = s - (vTop + curveArc);
        slat.position.set(gdCX, vTop + curveR, gdZ - curveR - hRun);
        slat.rotation.x = -Math.PI / 2;
      }
    }
    // Gentle automatic interior brightness boost as garage rolling door opens
    garageLight.userData.doorFactor = 0.45 + 0.55 * openRatio;
  }

  /* === TWO BESPOKE LUXURY GARAGE CARS: ROLLS-ROYCE PHANTOM (LEFT) & MERCEDES-BENZ S-CLASS AMG (RIGHT) === */
  const carTyreMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.86 });
  const carChromeMat = new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.10, metalness: 0.96 });
  const carCabinGlass = new THREE.MeshPhysicalMaterial({ color: 0x121d2a, roughness: 0.06, metalness: 0.25, clearcoat: 1.0 });
  const carTailRed = new THREE.MeshStandardMaterial({ color: 0xff2d24, emissive: 0xd91810, emissiveIntensity: 1.8, roughness: 0.2 });
  const carCaliperRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 });

  function addLuxuryWheel(parent, x, y, z, r, isAMG = false) {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 20), carTyreMat);
    tyre.rotation.z = Math.PI / 2; wg.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.68, r * 0.68, 0.235, 16), carChromeMat);
    rim.rotation.z = Math.PI / 2; wg.add(rim);
    const sign = x < 0 ? -1 : 1;
    // Multi-spoke alloy star pattern + RR floating center cap / AMG red caliper
    for (let s = 0; s < (isAMG ? 5 : 7); s++) {
      const a = (s / (isAMG ? 5 : 7)) * Math.PI * 2;
      const sp = addBox(wg, 0.025, r * 1.15, 0.026, sign * 0.116, 0, 0, isAMG ? charcoalMat : carChromeMat, false, false);
      sp.rotation.x = a;
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.20, r * 0.20, 0.25, 12), isAMG ? carChromeMat : charcoalMat);
    cap.rotation.z = Math.PI / 2; wg.add(cap);
    if (isAMG) addBox(wg, 0.04, 0.14, 0.09, sign * 0.09, 0.04, -0.09, carCaliperRed, false, false);
    parent.add(wg);
  }

  function createRollsRoyce(x, z) {
    // Iconic Two-Tone Rolls-Royce Phantom: Obsidian Black lower body + Brushed Pearl-Silver upper bonnet/pillars, tall Parthenon chrome grille & Gold Spirit of Ecstasy!
    const car = new THREE.Group();
    car.position.set(x, 0.14, z);
    const rrBlack = new THREE.MeshPhysicalMaterial({ color: 0x161a21, roughness: 0.12, metalness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.05 });
    const rrSilver = new THREE.MeshPhysicalMaterial({ color: 0xe6ebf2, roughness: 0.14, metalness: 0.72, clearcoat: 1.0, clearcoatRoughness: 0.06 });
    // Stately tall long-bonnet Rolls-Royce silhouette
    const prof = new THREE.Shape();
    prof.moveTo(-2.38, 0.24);
    prof.lineTo(2.38, 0.24);
    prof.lineTo(2.40, 0.84);   // Vertical stately Parthenon nose!
    prof.lineTo(2.26, 0.90);
    prof.lineTo(0.86, 0.94);   // Long flat regal bonnet
    prof.lineTo(0.40, 1.42);   // Tall formal greenhouse
    prof.lineTo(-1.12, 1.42);
    prof.lineTo(-1.72, 0.96);  // Classic formal C-pillar
    prof.lineTo(-2.34, 0.86);
    prof.lineTo(-2.40, 0.42);
    prof.closePath();
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 1.88, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }), rrBlack);
    hull.rotation.y = -Math.PI / 2; hull.position.set(0.94, 0, 0); hull.castShadow = true; car.add(hull);
    // Signature Two-Tone Silver Hood, Roof & A-Pillars + Hand-Painted Champagne-Gold Coachline Pinstripe!
    addBox(car, 1.72, 0.07, 1.50, 0, 0.95, 1.56, rrSilver, false, false);
    addBox(car, 1.66, 0.07, 1.56, 0, 1.44, -0.36, rrSilver, false, false);
    for (const sx of [-0.995, 0.995]) {
      addBox(car, 0.02, 0.025, 4.42, sx, 0.82, 0.02, goldMat, false, false); // Gold coachline
      addBox(car, 0.04, 0.04, 0.22, sx, 0.88, -0.10, carChromeMat, false, false); // Coach/suicide door twin handles!
      addBox(car, 0.04, 0.04, 0.22, sx, 0.88, -0.42, carChromeMat, false, false);
    }
    // Dark tinted greenhouse windows with thick chrome surround
    addBox(car, 1.68, 0.44, 1.88, 0, 1.16, -0.34, carCabinGlass, false, false);
    // ICONIC UPRIGHT CHROME PARTHENON GRILLE (11 Vertical Chrome Slats + Pediment Cap!)
    addBox(car, 0.96, 0.56, 0.10, 0, 0.62, 2.41, carChromeMat, false, false);
    addBox(car, 0.88, 0.48, 0.11, 0, 0.61, 2.42, charcoalMat, false, false);
    for (let gx = -0.38; gx <= 0.385; gx += 0.076) {
      addBox(car, 0.026, 0.47, 0.13, gx, 0.61, 2.43, carChromeMat, false, false);
    }
    addBox(car, 1.00, 0.07, 0.12, 0, 0.91, 2.42, carChromeMat, false, false); // Parthenon top bar
    // GOLDEN SPIRIT OF ECSTASY HOOD ORNAMENT on chrome pedestal!
    addBox(car, 0.08, 0.03, 0.08, 0, 0.96, 2.38, carChromeMat, false, false);
    addBox(car, 0.032, 0.12, 0.032, 0, 1.03, 2.38, goldMat, false, false); // Figurine torso
    const wL = addBox(car, 0.02, 0.07, 0.12, -0.04, 1.06, 2.33, goldMat, false, false); wL.rotation.y = -0.38;
    const wR = addBox(car, 0.02, 0.07, 0.12, 0.04, 1.06, 2.33, goldMat, false, false); wR.rotation.y = 0.38;
    // Crisp Rectangular Rolls-Royce Laser LED Headlights & Jewel Chrome-Framed Taillights
    for (const dx of [-0.72, 0.72]) {
      addBox(car, 0.36, 0.13, 0.08, dx, 0.76, 2.40, chandelierOrbMat, false, false);
      addBox(car, 0.38, 0.025, 0.09, dx, 0.83, 2.40, carChromeMat, false, false);
      addBox(car, 0.24, 0.22, 0.07, dx, 0.66, -2.39, carChromeMat, false, false);
      addBox(car, 0.18, 0.16, 0.08, dx, 0.66, -2.40, carTailRed, false, false);
    }
    addBox(car, 1.88, 0.08, 0.12, 0, 0.32, 2.41, carChromeMat, false, false); // Lower chrome bumper trim
    for (const dx of [-0.95, 0.95]) for (const dz of [-1.42, 1.44]) addLuxuryWheel(car, dx, 0.36, dz, 0.36, false);
    return car;
  }

  function createMercedesBenz(x, z) {
    // Sleek Metallic Selenite-Silver Mercedes-Benz S-Class / AMG GT with Wide Chrome Grille, Iconic 3-Pointed Star Emblem & Red Caliper AMG Turbine Wheels!
    const car = new THREE.Group();
    car.position.set(x, 0.14, z);
    const mbSilver = new THREE.MeshPhysicalMaterial({ color: 0xcbd4df, roughness: 0.14, metalness: 0.82, clearcoat: 1.0, clearcoatRoughness: 0.05 });
    const prof = new THREE.Shape();
    prof.moveTo(-2.22, 0.20);
    prof.lineTo(2.24, 0.20);
    prof.quadraticCurveTo(2.36, 0.52, 1.98, 0.72); // Low sculpted aerodynamic nose
    prof.lineTo(1.02, 0.82);
    prof.quadraticCurveTo(0.42, 1.28, -0.35, 1.28); // Flowing Mercedes fastback coupe arch!
    prof.quadraticCurveTo(-1.12, 1.26, -1.68, 0.84);
    prof.quadraticCurveTo(-2.22, 0.78, -2.26, 0.44);
    prof.closePath();
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3 }), mbSilver);
    hull.rotation.y = -Math.PI / 2; hull.position.set(0.92, 0, 0); hull.castShadow = true; car.add(hull);
    // Panoramic tinted glass coupe roof + frameless side greenhouse
    const cabin = addBox(car, 1.60, 0.38, 1.85, 0, 1.02, -0.22, carCabinGlass, false, false);
    cabin.rotation.x = 0.03;
    // WIDE MERCEDES AMG DIAMOND/PANAMERICANA GRILLE + ICONIC 3-POINTED CHROME STAR IN RING!
    addBox(car, 1.12, 0.32, 0.08, 0, 0.48, 2.27, charcoalMat, false, false);
    addBox(car, 1.16, 0.035, 0.09, 0, 0.64, 2.27, carChromeMat, false, false);
    addBox(car, 1.16, 0.035, 0.09, 0, 0.32, 2.27, carChromeMat, false, false);
    addBox(car, 1.08, 0.04, 0.09, 0, 0.48, 2.29, carChromeMat, false, false); // Central horizontal chrome louver bar
    // Iconic Mercedes 3-Pointed Star Emblem centered in grille!
    const starRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 24), carChromeMat);
    starRing.position.set(0, 0.48, 2.34); car.add(starRing);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + k * (Math.PI * 2 / 3);
      const spoke = addBox(car, 0.11, 0.022, 0.022, Math.cos(a) * 0.052, 0.48 + Math.sin(a) * 0.052, 2.34, carChromeMat, false, false);
      spoke.rotation.z = a;
    }
    // Sculpted Angular Multibeam LED Eyebrow DRL Headlights + AMG Front Splitter Intakes!
    for (const dx of [-0.72, 0.72]) {
      const hl = addBox(car, 0.38, 0.11, 0.08, dx, 0.58, 2.24, chandelierOrbMat, false, false);
      hl.rotation.z = dx > 0 ? 0.14 : -0.14;
      addBox(car, 0.36, 0.12, 0.07, dx, 0.34, 2.25, charcoalMat, false, false); // AMG lower intake
    }
    // Sleek Full-Width Mercedes OLED Red Taillight Bar + Quad Chrome AMG Exhaust Tips!
    addBox(car, 1.72, 0.09, 0.07, 0, 0.65, -2.26, carTailRed, false, false);
    for (const ex of [-0.66, -0.50, 0.50, 0.66]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), carChromeMat);
      tip.rotation.x = Math.PI / 2; tip.position.set(ex, 0.28, -2.26); car.add(tip);
    }
    for (const dx of [-0.93, 0.93]) for (const dz of [-1.30, 1.32]) addLuxuryWheel(car, dx, 0.33, dz, 0.33, true);
    return car;
  }

  gf.add(createRollsRoyce(-4.95, 2.42));
  gf.add(createMercedesBenz(-1.45, 2.42));

  /* Grand Curved Front Arrival Steps leading into the Glass Spiral Staircase Atrium */
  const stepsGroup = new THREE.Group();
  gf.add(stepsGroup);
  const CX = 4.65, CZ = 3.95, ATRIUM_R = 2.62;
  const stepCount = 8;
  for (let i = 0; i < stepCount; i++) {
    const t = i / (stepCount - 1);
    const w = 5.15 - t * 0.95; // Flared wider at bottom just like exterior-photo.webp!
    const y = 0.06 + i * 0.125;
    const z = 9.2 - i * 0.39;
    addBox(stepsGroup, w, 0.125, 0.42, CX, y, z, whiteMat);
    // Warm subtle under-tread LED strip
    addBox(stepsGroup, w - 0.16, 0.025, 0.04, CX, y - 0.04, z + 0.21, warmLedMat, false, false);
  }
  // Curved sculptural white cheek walls + champagne-gold curved handrails flanking steps
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const flare = Math.pow(1 - t, 1.8) * 0.55;
      const x = CX + side * (2.08 + flare);
      const y = 0.12 + t * 1.0;
      const z = 9.35 - t * 2.95;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const wallPts = pts.map(p => new THREE.Vector3(p.x, p.y + 0.22, p.z));
    stepsGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wallPts), 40, 0.16, 10, false), whiteMat));
    const railPts = pts.map(p => new THREE.Vector3(p.x, p.y + 0.62, p.z));
    stepsGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 40, 0.045, 8, false), goldMat));
    for (let i = 0; i <= 12; i += 4) {
      const p = pts[i];
      addBox(stepsGroup, 0.04, 0.42, 0.04, p.x, p.y + 0.42, p.z, goldMat);
    }
  }
  // Flanking tropical planters beside the entry steps
  addPlanterTree(gf, 2.02, 0.04, 7.65, 0.95, true);
  addPlanterTree(gf, 1.65, 0.04, 8.65, 0.65, false);
  addPlanterTree(gf, 7.45, 0.04, 7.75, 1.05, true);
  addPlanterTree(gf, 7.75, 0.04, 6.45, 0.95, false);

  /* === THREE SWEEPING CURVED CANTILEVERED BALCONIES + EXTENDED 1.9 m WRAPAROUND LEFT WING & CLOSED REAR END === */
  const floorHeights = [3.40, 6.65, 9.90]; // Decks 1 (top 3.74), 2 (top 6.99), 3 (top 10.24)
  const levelKeys = ['first', 'second', 'roof'];
  const LEFT_BALC_X = -9.35; // Extended usable 1.90 m deep wraparound left side balcony!
  const edgePts = sampleCurvedFrontEdge(LEFT_BALC_X, 1.92, 5.75, 2.55, 84, -5.10, -7.45);
  const slabShape = createCurvedWingShape(LEFT_BALC_X, 1.92, -5.1, 5.75, 2.55);
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
    depth: 0.42, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 28
  });

  floorHeights.forEach((y, idx) => {
    const owner = levels[levelKeys[idx]];
    // Sculptural curved white cantilevered balcony slab (extending cleanly out to x = -9.35!)
    const slab = new THREE.Mesh(slabGeo, whiteMat);
    slab.rotation.x = Math.PI / 2;
    slab.position.y = y + 0.34;
    slab.castShadow = true;
    slab.receiveShadow = true;
    owner.add(slab);

    // Warm glowing gold LED cove strip tucked neatly beneath the ENTIRE wraparound slab soffit (y-0.165, zero bevel clipping!)
    const ledCurve = new THREE.CatmullRomCurve3(edgePts.map(p => new THREE.Vector3(
      p.x + (p.x <= LEFT_BALC_X + 0.08 ? 0.12 : 0),
      y - 0.165,
      p.z - (p.z > 4.0 ? 0.10 : 0)
    )));
    owner.add(new THREE.Mesh(new THREE.TubeGeometry(ledCurve, 128, 0.034, 8, false), warmLedMat));

    // Recessed warm ceiling downlights under wraparound front & extended left balcony soffit
    for (let i = 6; i < edgePts.length - 6; i += 9) {
      const p = edgePts[i];
      const dl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), warmLedMat);
      const dxIn = p.x <= LEFT_BALC_X + 0.25 ? 0.85 : 0;
      const dzIn = p.z > 3.6 ? -0.65 : 0;
      dl.position.set(p.x + dxIn, y - 0.14, p.z + dzIn);
      owner.add(dl);
    }

    // Continuous Frameless Curved Glass Balustrade + Champagne-Gold Handrail wrapping ALL the way around the extended left balcony & closing the rear-left end!
    for (let i = 0; i < edgePts.length - 1; i++) {
      const p0 = edgePts[i], p1 = edgePts[i + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      const segW = Math.hypot(dx, dz);
      if (segW < 0.005) continue;
      const pane = addBox(owner, segW + 0.01, 0.88, 0.04, (p0.x + p1.x) / 2, y + 0.80, (p0.z + p1.z) / 2, railGlassMat, false, false);
      pane.rotation.y = -Math.atan2(dz, dx);
    }
    const topRailCurve = new THREE.CatmullRomCurve3(edgePts.map(p => new THREE.Vector3(p.x, y + 1.25, p.z)));
    owner.add(new THREE.Mesh(new THREE.TubeGeometry(topRailCurve, 130, 0.038, 8, false), goldMat));
    for (let i = 0; i < edgePts.length; i += 10) {
      const p = edgePts[i];
      addBox(owner, 0.036, 0.88, 0.036, p.x, y + 0.80, p.z, goldMat, false, false);
    }

    // ARCHITECTURAL CLOSED REAR-LEFT END PRIVACY LOUVER SCREEN & SLIM STRUCTURAL RETURN FIN (closes x=-9.35..-7.45 at z=-5.10 cleanly!)
    // EXACT ZERO-CLIPPING WALL HEIGHTS: 1F/2F wallTop = y+0.38+2.72 = y+3.10 (2 cm BELOW upper slab underside y+3.12!); Roof wallTop = 10.28+1.91 = 12.19 (2 cm BELOW roofCanopy bottom 12.21!)
    const wallH = idx < 2 ? 2.72 : 1.91;
    const wallY = y + 0.38 + wallH / 2;
    addBox(owner, 0.18, wallH, 0.24, LEFT_BALC_X + 0.10, wallY, -5.02, whiteMat, true, true); // Slim outer vertical end fin
    addBox(owner, 1.92, 0.10, 0.14, -8.38, y + 0.38 + wallH - 0.05, -5.06, darkBronzeMat, false, false); // Top louver frame
    addBox(owner, 1.92, 0.08, 0.14, -8.38, y + 0.42, -5.06, darkBronzeMat, false, false); // Bottom louver frame
    for (let lx = -9.16; lx <= -7.62; lx += 0.18) {
      addBox(owner, 0.042, wallH - 0.12, 0.14, lx, wallY, -5.06, idx === 2 ? darkBronzeMat : goldMat, false, false);
    }

    // Lush Front Balcony Landscaping (Olive trees, bonsai, lavender & cascading greenery!)
    const plantStops = idx === 0 ? [0.44, 0.62, 0.84] : idx === 1 ? [0.46, 0.68, 0.86] : [0.48, 0.72, 0.88];
    plantStops.forEach((t, j) => {
      const p = edgePts[Math.floor(t * (edgePts.length - 1))];
      const px = p.x + (p.x < -7.0 ? 0.55 : 0);
      const pz = p.z - 0.48;
      addPlanterTree(owner, px, y + 0.38, pz, 0.85 + (j % 2) * 0.22, j % 2 === 0);
    });

    // Recessed Floor-to-Ceiling Bronze Glazed Front Facade WITH REAL OPEN SLIDING BALCONY DOORS FOR EVERY FRONT ROOM (1F Lounge & Office, 2F Private Lounge, Roof Gaming Studio & Media Lounge!)
    const doorBaseY = y + 0.38;
    const doorH = idx < 2 ? 2.64 : 1.84;
    if (idx < 2) {
      // Fixed glass panes flanking TWO real open sliding doors onto the Front Curved Balcony (Left lounge door x=-4.55, Right office/gallery door x=-0.40)
      addBox(owner, 1.70, wallH, 0.12, -6.50, wallY, 3.65, atriumGlassMat, false, false); // x=-7.35..-5.65
      addBox(owner, 2.05, wallH, 0.12, -2.425, wallY, 3.65, atriumGlassMat, false, false); // x=-3.45..-1.40
      addBox(owner, 0.90, wallH, 0.12, 1.05, wallY, 3.65, atriumGlassMat, false, false);   // x=+0.60..+1.50
      addSlidingBalconyDoor(owner, -4.55, doorBaseY, 3.65, 2.20, doorH, 0, 1);  // Family Lounge / Private Lounge TV 2 -> Front Balcony!
      addSlidingBalconyDoor(owner, -0.40, doorBaseY, 3.65, 2.00, doorH, 0, -1); // Executive Office / 2F Gallery -> Front Balcony!
      // Flush top transom header strip above sliding doors
      addBox(owner, 8.85, wallH - doorH, 0.14, -2.92, doorBaseY + doorH + (wallH - doorH) / 2, 3.65, darkBronzeMat, false, false);
    } else {
      // Roof front facade: REAL OPEN sliding doors from Gaming Studio (x=-4.85) AND Media Lounge TV 3 (x=-0.55) directly onto Front Sky-Deck Balcony!
      addBox(owner, 1.50, wallH, 0.12, -6.60, wallY, 3.65, atriumGlassMat, false, false); // x=-7.35..-5.85
      addBox(owner, 2.30, wallH, 0.12, -2.70, wallY, 3.65, atriumGlassMat, false, false); // x=-3.85..-1.55
      addBox(owner, 1.05, wallH, 0.12, 0.975, wallY, 3.65, atriumGlassMat, false, false); // x=+0.45..+1.50
      addSlidingBalconyDoor(owner, -4.85, doorBaseY, 3.65, 2.00, doorH, 0, 1);  // Gaming Studio -> Front Sky-Deck Balcony!
      addSlidingBalconyDoor(owner, -0.55, doorBaseY, 3.65, 2.00, doorH, 0, -1); // Media Lounge TV 3 -> Front Sky-Deck Balcony!
      addBox(owner, 8.85, wallH - doorH, 0.14, -2.92, doorBaseY + doorH + (wallH - doorH) / 2, 3.65, darkBronzeMat, false, false);
    }
    // ZERO-Z-FIGHTING RECESSED WARM CEILING GLOW PANEL (Ultra-thin 2 cm sheet seated strictly 2 cm BELOW the slab underside & 3 cm ABOVE all cove trays!)
    if (idx < 2) {
      addBox(owner, 8.6, 0.02, 7.8, -3.2, y + 3.09, -0.5, interiorGlowMat, false, false);
    } else {
      addBox(owner, 8.6, 0.02, 3.85, -3.2, 12.18, 1.62, interiorGlowMat, false, false);
    }
    // USABLE LEFT BALCONY ACCESS: REAL OPEN SLIDING GLASS BALCONY DOORS ALONG x = -7.45 FOR EVERY LEFT-SIDE ROOM (Bed 2, Master Suite, Family Lounge, Private Lounge & Gaming Studio!)
    const leftGlazeWall = new THREE.Group();
    if (idx < 2) {
      addBox(leftGlazeWall, 0.24, wallH, 1.05, -7.45, wallY, -4.55, whiteMat, true, true); // Rear corner pier (-5.07..-4.02)
      addBox(leftGlazeWall, 0.24, wallH, 1.05, -7.45, wallY, 3.15, whiteMat, true, true);  // Front corner pier (+2.62..+3.67)
      addBox(leftGlazeWall, 0.12, wallH, 0.37, -7.45, wallY, -3.84, atriumGlassMat, false, false); // Fixed narrow sidelight
      addBox(leftGlazeWall, 0.12, wallH, 1.80, -7.45, wallY, -0.55, atriumGlassMat, false, false); // Center fixed glass mullion pier between rooms (-1.45..+0.35)
      addBox(leftGlazeWall, 0.16, wallH, 0.10, -7.45, wallY, -0.35, darkBronzeMat, false, false);  // Partition divider mullion
      // TWO REAL OPEN SLIDING BALCONY DOORS directly onto the 1.9 m Extended Left Balcony:
      addSlidingBalconyDoor(leftGlazeWall, -7.45, doorBaseY, -2.55, 2.20, doorH, Math.PI / 2, 1); // Bed 2 (1F) / Grand Master Suite (2F) -> Left Balcony!
      addSlidingBalconyDoor(leftGlazeWall, -7.45, doorBaseY, 1.45, 2.20, doorH, Math.PI / 2, -1); // Family Lounge (1F) / Private Lounge (2F) -> Left Balcony!
      addBox(leftGlazeWall, 0.14, wallH - doorH, 6.70, -7.45, doorBaseY + doorH + (wallH - doorH) / 2, -0.70, darkBronzeMat, false, false);
    } else {
      // On Roof: REAL OPEN sliding balcony door from Gaming Studio (z=1.45, cleanly between Arcade & VR Car!) straight onto Roof Left Sunset Bar Terrace!
      addBox(leftGlazeWall, 0.22, wallH, 0.55, -7.45, wallY, -0.08, whiteMat, true, true); // Rear pier (-0.35..+0.20)
      addBox(leftGlazeWall, 0.22, wallH, 0.55, -7.45, wallY, 3.38, whiteMat, true, true);  // Front pier (+3.10..+3.65)
      addBox(leftGlazeWall, 0.12, wallH, 0.40, -7.45, wallY, 0.40, atriumGlassMat, false, false);
      addBox(leftGlazeWall, 0.12, wallH, 0.80, -7.45, wallY, 2.70, atriumGlassMat, false, false);
      addSlidingBalconyDoor(leftGlazeWall, -7.45, doorBaseY, 1.45, 1.70, doorH, Math.PI / 2, 1); // Gaming Studio -> Roof Sunset Bar Balcony!
      addBox(leftGlazeWall, 0.14, wallH - doorH, 3.00, -7.45, doorBaseY + doorH + (wallH - doorH) / 2, 1.65, darkBronzeMat, false, false);
    }
    owner.add(leftGlazeWall);
    cutawayShells.push(leftGlazeWall);

    // USABLE EXTENDED LEFT BALCONY DECK FURNISHINGS (1.90 m deep usable outdoor terrace on every single level!)
    const byTop = y + 0.35;
    if (idx === 0) {
      // 1F EXTENDED LEFT BALCONY: Bistro Coffee & Reading Terrace (serves Family Lounge & Bed 2!)
      addBox(owner, 1.55, 0.03, 7.8, -8.40, byTop + 0.015, -0.85, woodMat, false, true); // Warm slatted teak deck inlay
      const bTable = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.04, 18), marbleMat);
      bTable.position.set(-8.42, byTop + 0.68, 0.95); owner.add(bTable);
      const bPed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.66, 12), darkBronzeMat);
      bPed.position.set(-8.42, byTop + 0.34, 0.95); owner.add(bPed);
      for (const cz of [0.18, 1.72]) {
        addBox(owner, 0.56, 0.38, 0.54, -8.42, byTop + 0.22, cz, woodMat, true, false);
        addBox(owner, 0.50, 0.10, 0.48, -8.42, byTop + 0.45, cz, upholsteryMat, false, false);
        addBox(owner, 0.52, 0.44, 0.09, -8.42, byTop + 0.64, cz + (cz > 0.95 ? 0.24 : -0.24), woodMat, false, false);
      }
      // Reading bench + throw cushion outside Bedroom 2
      addBox(owner, 0.54, 0.42, 1.75, -8.52, byTop + 0.22, -2.65, woodMat, true, true);
      addBox(owner, 0.48, 0.10, 1.66, -8.52, byTop + 0.47, -2.65, upholsteryMat, false, false);
      addPlanterTree(owner, -8.55, byTop, -4.35, 0.72, true);
      addPlanterTree(owner, -8.55, byTop, 2.75, 0.74, false);
    } else if (idx === 1) {
      // 2F EXTENDED LEFT BALCONY: Master Sunset Sun-Lounger Terrace (serves Master Suite & Private Lounge!)
      addBox(owner, 1.55, 0.03, 7.8, -8.40, byTop + 0.015, -0.85, woodMat, false, true);
      for (const lz of [-3.05, -1.55]) {
        // Slatted teak sun lounger with inclined backrest & ivory cushion
        addBox(owner, 1.25, 0.28, 0.66, -8.42, byTop + 0.16, lz, woodMat, true, true);
        addBox(owner, 1.18, 0.09, 0.60, -8.42, byTop + 0.34, lz, upholsteryMat, false, false);
        const back = addBox(owner, 0.52, 0.09, 0.60, -8.02, byTop + 0.52, lz, upholsteryMat, false, false);
        back.rotation.z = 0.56;
      }
      // Low travertine cocktail table between sun loungers + cozy front lounge armchair
      addBox(owner, 0.44, 0.36, 0.44, -8.45, byTop + 0.19, -2.30, marbleMat, false, true);
      addBox(owner, 0.66, 0.36, 0.66, -8.45, byTop + 0.20, 1.25, woodMat, true, false);
      addBox(owner, 0.58, 0.12, 0.58, -8.45, byTop + 0.43, 1.25, upholsteryMat, false, false);
      addBox(owner, 0.10, 0.46, 0.58, -8.14, byTop + 0.62, 1.25, woodMat, false, false);
      addPlanterTree(owner, -8.55, byTop, -4.38, 0.76, false);
      addPlanterTree(owner, -8.55, byTop, 2.75, 0.78, true);
    } else {
      // ROOFTOP EXTENDED LEFT BALCONY: Sunset Viewing Bar-Rail + 3 Barstools + BBQ Herb Lounge!
      addBox(owner, 1.55, 0.03, 7.8, -8.40, byTop + 0.015, -0.85, woodMat, false, true);
      // Cantilevered teak sunset viewing bar counter mounted flush along left glass railing (x=-8.98)
      addBox(owner, 0.44, 0.07, 3.15, -8.98, byTop + 1.04, 0.95, marbleMat, true, true);
      addBox(owner, 0.42, 0.06, 3.10, -8.98, byTop + 0.98, 0.95, walnutMat, false, false);
      for (const sz of [-0.15, 0.95, 2.05]) {
        addBox(owner, 0.06, 0.98, 0.06, -9.14, byTop + 0.49, sz, darkBronzeMat, false, false);
        // High barstool facing Chitwan sunset
        addBox(owner, 0.34, 0.72, 0.34, -8.42, byTop + 0.36, sz, darkBronzeMat, false, false);
        addBox(owner, 0.38, 0.09, 0.38, -8.42, byTop + 0.75, sz, upholsteryMat, false, false);
      }
      // BBQ Chef side herb planter bench near rear BBQ pergola
      addBox(owner, 0.56, 0.48, 1.95, -8.55, byTop + 0.25, -3.15, woodMat, true, true);
      addPlanterTree(owner, -8.58, byTop, -4.42, 0.74, true);
    }
    // Right wing wall (x=1.55) precision-cut at z=0.98..2.30 (center z=1.64) matching the left spiral safety door flush with ZERO overlap!
    if (idx < 2) {
      addBox(owner, 0.26, wallH, 5.98, 1.55, wallY, -2.01, whiteMat); // Rear section (-5.0..+0.98)
      addBox(owner, 0.26, wallH, 1.30, 1.55, wallY, 2.95, whiteMat);  // Front section (+2.30..+3.60)
      const lintelH = Math.max(0.24, wallH - 2.24);
      addBox(owner, 0.26, lintelH, 1.32, 1.55, doorBaseY + wallH - lintelH / 2, 1.64, whiteMat); // Flush doorway lintel header!
      addBox(owner, 8.8, wallH, 0.16, -3.0, wallY, -4.95, atriumGlassMat, false, false);
      for (let mx = -7.0; mx <= 1.0; mx += 2.0) addBox(owner, 0.09, wallH, 0.18, mx, wallY, -4.95, darkBronzeMat);
      // Interior partitions on 1F & 2F (visible in Cutaway / Walls mode)
      const p1 = addBox(owner, 0.14, wallH - 0.15, 4.3, -3.15, wallY, -2.6, partitionMat, false, false);
      const p2 = addBox(owner, 8.5, wallH - 0.15, 0.14, -3.0, wallY, -0.35, partitionMat, false, false);
      interiorWalls.push(p1, p2);
    } else {
      // ROOF (idx===2): Right wall & rear acoustic divider enclose ONLY the Gaming Studio & Media Lounge (z=-0.35..+3.60), keeping the BBQ Pergola completely open-air!
      addBox(owner, 0.26, wallH, 1.33, 1.55, wallY, 0.315, whiteMat); // Rear studio section (-0.35..+0.98)
      addBox(owner, 0.26, wallH, 1.30, 1.55, wallY, 2.95, whiteMat);  // Front studio section (+2.30..+3.60)
      addBox(owner, 0.26, 0.15, 1.32, 1.55, doorBaseY + wallH - 0.075, 1.64, whiteMat); // Flush rooftop studio doorway header!
      const p2 = addBox(owner, 8.8, wallH - 0.06, 0.16, -2.95, wallY, -0.35, whiteMat, true, true); // Solid weather-sealed rear wall separating BBQ from AC Gaming Studio!
      interiorWalls.push(p2);
    }

    // RICH FLOOR-SPECIFIC 3D INTERIORS (Matching First, Second & Rooftop CAD Plans!)
    const floorFurn = new THREE.Group();
    const fy = y + 0.36;
    if (idx === 0) {
      // FIRST FLOOR: Family Lounge (front-left), Executive Home Office (front-right), Bedrooms 2 & 3 + Twin Ensuites (rear)
      addBox(floorFurn, 3.8, 0.03, 2.7, -4.5, fy + 0.015, 1.75, rugMat, false, true);
      addSofaUnit(floorFurn, -4.5, fy, 1.35, 0, 2.7);
      addSofaUnit(floorFurn, -6.1, fy, 2.05, Math.PI / 2, 1.65);
      addBox(floorFurn, 1.25, 0.30, 0.72, -4.5, fy + 0.15, 2.35, walnutMat, false, false);
      // Slatted acoustic walnut TV wall + warm vertical LED strips + Live 4K TV + Wall Art + Drapes + Cove Ceiling Fan
      for (let fx = -5.75; fx <= -3.25; fx += 0.22) addBox(floorFurn, 0.07, 2.45, 0.06, fx, fy + 1.24, -0.24, walnutMat, false, false);
      addBox(floorFurn, 0.05, 2.35, 0.05, -5.88, fy + 1.22, -0.22, warmLedMat, false, false);
      addBox(floorFurn, 0.05, 2.35, 0.05, -3.12, fy + 1.22, -0.22, warmLedMat, false, false);
      addFlatScreen(floorFurn, 2.08, 0.98, -4.5, fy + 1.35, -0.14, 0, liveScreens.cinema.mat, warmLedMat);
      addBox(floorFurn, 2.2, 0.34, 0.42, -4.5, fy + 0.22, -0.02, walnutMat, false, false);
      addWallArt(floorFurn, -7.22, fy + 1.48, 1.75, 1.25, 0.85, Math.PI / 2, 2);
      addACUnit(floorFurn, -4.50, fy + 2.46, -0.22, 0, 1.02); // 1F Family TV Lounge Split-Inverter AC
      addCurtainPair(floorFurn, -4.5, fy, 3.48, 4.2, 2.66, Math.PI);
      addCurtainPair(floorFurn, -7.28, fy, 1.45, 2.35, 2.66, Math.PI / 2); // 1F Family Lounge Left Balcony Curtain!
      addCeilingDecor(floorFurn, -4.5, fy + 2.64, 1.65, 4.2, 3.2, { fan: true, fanSpeed: 2.2 });
      const flPole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 1.78, 8), goldMat);
      flPole.position.set(-6.78, fy + 0.89, 0.82); floorFurn.add(flPole);
      const flOrb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), chandelierOrbMat);
      flOrb.position.set(-6.78, fy + 1.82, 0.82); floorFurn.add(flOrb);
      addPlanterTree(floorFurn, -6.82, fy, 3.05, 0.64, false);
      // Executive Family Home Office (walnut desk, LIVE CAD dual monitors, Executive Swivel Chair + 2 Family/Client Chairs, AC, motorized front curtain & backlit shelves!)
      addBox(floorFurn, 1.75, 0.74, 0.80, -0.35, fy + 0.37, 1.75, walnutMat, false, false);
      addOfficeChair(floorFurn, -0.35, fy, 1.02, 0, charcoalMat, true);         // Executive leather swivel chair behind desk
      addOfficeChair(floorFurn, -0.82, fy, 2.66, Math.PI, upholsteryMat, false); // Family / client office chair 1
      addOfficeChair(floorFurn, 0.12, fy, 2.66, Math.PI, upholsteryMat, false);  // Family / client office chair 2
      addCurtainPair(floorFurn, -0.35, fy, 3.48, 3.2, 2.72, Math.PI);            // Motorized Office balcony curtain!
      addBox(floorFurn, 0.52, 0.32, 0.04, -0.64, fy + 0.96, 1.84, liveScreens.officeCad.mat, false, false);
      addBox(floorFurn, 0.52, 0.32, 0.04, -0.06, fy + 0.96, 1.84, liveScreens.officeCad.mat, false, false);
      addWallArt(floorFurn, -0.35, fy + 1.56, -0.22, 1.22, 0.82, 0, 1);
      addACUnit(floorFurn, -0.35, fy + 2.46, -0.22, 0, 0.90); // 1F Executive Family Office Split-Inverter AC
      addBox(floorFurn, 0.04, 0.38, 0.04, 0.36, fy + 0.93, 1.82, goldMat, false, false);
      addBox(floorFurn, 0.14, 0.05, 0.14, 0.36, fy + 1.13, 1.82, warmLedMat, false, false);
      addBox(floorFurn, 0.36, 2.45, 2.65, 1.26, fy + 1.24, 1.65, walnutMat, false, false);
      for (let sy = 0.5; sy <= 2.1; sy += 0.52) {
        addBox(floorFurn, 0.06, 0.04, 2.45, 1.07, fy + sy, 1.65, warmLedMat, false, false);
        addBox(floorFurn, 0.22, 0.24, 0.42, 1.18, fy + sy + 0.16, 1.15, upholsteryMat, false, false);
        addBox(floorFurn, 0.22, 0.22, 0.38, 1.18, fy + sy + 0.15, 2.12, goldMat, false, false);
      }
      // Bedroom 2 & Bedroom 3 (Rear Private Suites) + Suite Entry & Frosted Bathroom Sliding Doors + Left & Rear Privacy Curtains!
      addBedSuite(floorFurn, -5.96, fy, -2.65, 0, 0.80);
      addACUnit(floorFurn, -5.96, fy + 2.46, -0.44, Math.PI, 0.90); // 1F Bedroom 2 Split-Inverter AC
      addCurtainPair(floorFurn, -5.55, fy, -4.78, 3.2, 2.66, 0);
      addCurtainPair(floorFurn, -7.28, fy, -2.55, 2.35, 2.66, Math.PI / 2); // 1F Bedroom 2 Left Balcony Privacy Curtain!
      addWallArt(floorFurn, -5.96, fy + 1.65, -3.72, 1.10, 0.72, 0, 0);
      // Suite Entry Privacy Sliding Doors entering Bed 2 & Bed 3 from Family Lounge/Hallway
      addPrivacySlidingDoor(floorFurn, -5.15, fy, -0.35, 1.06, 2.30, 0, true, 0.92); // Bed 2 Suite Entry Sliding Door!
      addPrivacySlidingDoor(floorFurn, -0.75, fy, -0.35, 1.06, 2.30, 0, true, 0.92); // Bed 3 Suite Entry Sliding Door!
      // Full Privacy Walls + Frosted-Glass Bathroom Sliding Doors enclosing Twin Ensuites 2 & 3 (zero toilet/shower sightline from beds!)
      addBox(floorFurn, 0.12, 2.64, 2.45, -4.68, fy + 1.32, -3.68, whiteMat, false, false); // Bed 2 -> Ensuite 2 privacy divider
      addBox(floorFurn, 0.12, 2.64, 2.45, -1.62, fy + 1.32, -3.68, whiteMat, false, false); // Bed 3 -> Ensuite 3 privacy divider
      addPrivacySlidingDoor(floorFurn, -3.95, fy, -2.50, 0.94, 2.22, 0, true, 0.90); // Ensuite 2 Frosted Bathroom Sliding Door!
      addPrivacySlidingDoor(floorFurn, -2.35, fy, -2.50, 0.94, 2.22, 0, true, 0.90); // Ensuite 3 Frosted Bathroom Sliding Door!
      addEnsuiteBath(floorFurn, -3.95, fy, -3.55, Math.PI, 0.66);
      addEnsuiteBath(floorFurn, -2.35, fy, -3.55, Math.PI, 0.66);
      addBathCurtain(floorFurn, -3.15, fy, -4.78, 2.75, 2.66, 0, false); // Exterior rear window curtains for 1F Ensuites 2 & 3!
      addBedSuite(floorFurn, -0.22, fy, -2.65, 0, 0.80);
      addACUnit(floorFurn, -0.22, fy + 2.46, -0.44, Math.PI, 0.90); // 1F Bedroom 3 Split-Inverter AC
      addCurtainPair(floorFurn, -0.35, fy, -4.78, 3.2, 2.66, 0);
      addWallArt(floorFurn, -0.22, fy + 1.65, -3.72, 1.10, 0.72, 0, 2);
      // REAR-RIGHT BEHIND-SPIRAL FIRST-FLOOR WING: Private Ensuite Bathroom 4 (for Bed 4) + Quiet Study + Frosted Privacy Sliding Doors!
      addBox(owner, 6.2, 0.32, 4.45, 4.85, y + 0.18, -2.65, whiteMat, true, true);
      addBox(owner, 1.44, 0.24, 1.35, 2.32, y + 0.23, 0.18, whiteMat, true, true); // Flush corridor deck joining spiral landing (z=0.78) to rear-right study/Bath 4!
      addBox(owner, 5.4, wallH, 0.14, 4.95, wallY, -4.82, atriumGlassMat, false, false);
      for (const bx of [2.3, 4.0, 5.7, 7.4]) addBox(owner, 0.08, wallH, 0.16, bx, wallY, -4.82, darkBronzeMat);
      cutawayShells.push(addBox(owner, 0.20, wallH, 2.45, 7.85, wallY, -3.62, whiteMat));
      addBox(owner, 0.14, wallH, 4.35, 4.45, wallY, -2.65, whiteMat, false, false); // Full privacy partition separating Study from Ensuite 4!
      addPrivacySlidingDoor(floorFurn, 6.15, fy, -2.35, 0.98, 2.24, 0, true, 0.90); // 1F Ensuite 4 Frosted Bathroom Sliding Door!
      addPrivacySlidingDoor(floorFurn, 2.45, fy, -0.46, 1.06, 2.28, 0, true, 0.88); // 1F Behind-Spiral Study Sliding Privacy Door!
      addEnsuiteBath(floorFurn, 6.15, fy, -3.45, Math.PI, 0.94);
      addBathCurtain(floorFurn, 6.15, fy, -4.68, 2.20, 2.66, 0, false); // Exterior rear window curtain for 1F Ensuite 4!
      addBox(floorFurn, 1.35, 0.74, 0.68, 3.05, fy + 0.37, -3.45, walnutMat, false, false);
      addOfficeChair(floorFurn, 3.05, fy, -2.72, Math.PI, charcoalMat, false);
    } else if (idx === 1) {
      // SECOND FLOOR: Private Lounge TV 2 (front), Grand Master Private Suite + WIR + Frosted-Door Master Spa + Private Bedroom 6 Suite!
      addBox(floorFurn, 3.8, 0.03, 2.7, -4.2, fy + 0.015, 1.75, rugMat, false, true);
      addSofaUnit(floorFurn, -5.35, fy, 1.8, Math.PI / 2, 2.25);
      addSofaUnit(floorFurn, -2.95, fy, 1.8, -Math.PI / 2, 2.25);
      addBox(floorFurn, 1.15, 0.32, 0.85, -4.15, fy + 0.16, 1.8, marbleMat, false, false);
      addBox(floorFurn, 2.35, 0.36, 0.42, -4.15, fy + 0.18, -0.02, walnutMat, false, false);
      addFlatScreen(floorFurn, 2.18, 1.04, -4.15, fy + 1.38, -0.14, 0, liveScreens.cinema.mat, warmLedMat);
      addACUnit(floorFurn, -4.15, fy + 2.46, -0.22, 0, 1.02); // 2F Private Lounge TV 2 Split-Inverter AC
      addCurtainPair(floorFurn, -4.15, fy, 3.48, 4.4, 2.66, Math.PI);
      addCurtainPair(floorFurn, -7.28, fy, 1.45, 2.35, 2.66, Math.PI / 2); // 2F Private Lounge Left Balcony Curtain!
      addCeilingDecor(floorFurn, -4.15, fy + 2.64, 1.75, 4.2, 3.0, { ringChandelier: true });
      const plPole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 1.75, 8), goldMat);
      plPole.position.set(-6.45, fy + 0.88, 0.72); floorFurn.add(plPole);
      const plOrb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), chandelierOrbMat);
      plOrb.position.set(-6.45, fy + 1.78, 0.72); floorFurn.add(plOrb);
      // Grand Master Private Suite (rear-left) + Suite Entry Sliding Door + Left & Rear Privacy Curtains + Frosted-Door Master Spa Enclosure!
      addBedSuite(floorFurn, -5.35, fy, -2.65, 0, 1.02);
      addWallArt(floorFurn, -5.35, fy + 1.88, -3.86, 1.55, 0.85, 0, 1);
      addFlatScreen(floorFurn, 1.65, 0.86, -5.35, fy + 1.38, -0.49, Math.PI, liveScreens.cinema.mat, warmLedMat);
      addACUnit(floorFurn, -5.35, fy + 2.46, -0.44, Math.PI, 1.04); // 2F Grand Master Suite Split-Inverter AC
      addCurtainPair(floorFurn, -5.35, fy, -4.78, 3.8, 2.66, 0);
      addCurtainPair(floorFurn, -7.28, fy, -2.55, 2.35, 2.66, Math.PI / 2); // 2F Grand Master Suite Left Balcony Privacy Curtain!
      addPrivacySlidingDoor(floorFurn, -3.65, fy, -0.35, 1.18, 2.34, 0, true, 0.92); // Grand Master Suite Entry Sliding Privacy Door!
      addCeilingDecor(floorFurn, -5.35, fy + 2.64, -2.55, 3.8, 3.6, { fan: true, fanSpeed: 1.9 });
      addBox(floorFurn, 1.55, 0.42, 0.46, -5.35, fy + 0.21, -1.16, upholsteryMat, false, false);
      for (const px of [-6.68, -4.02]) {
        addBox(floorFurn, 0.016, 1.06, 0.016, px, fy + 2.15, -3.58, goldMat, false, false);
        const po = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), chandelierOrbMat);
        po.position.set(px, fy + 1.62, -3.58); floorFurn.add(po);
      }
      // Walk-in Robe (WIR: illuminated shelving + gold garment rail + glass jewelry island + backlit dressing mirror)
      addBox(floorFurn, 1.45, 2.35, 0.38, -2.25, fy + 1.18, -4.55, walnutMat, false, false);
      addBox(floorFurn, 1.35, 0.05, 0.05, -2.25, fy + 2.15, -4.34, warmLedMat, false, false);
      addBox(floorFurn, 1.28, 0.03, 0.03, -2.25, fy + 1.72, -4.34, goldMat, false, false);
      addBox(floorFurn, 0.85, 0.84, 0.56, -2.25, fy + 0.42, -2.45, marbleMat, false, false);
      addBox(floorFurn, 0.04, 1.88, 0.78, -3.02, fy + 1.06, -3.25, warmLedMat, false, false);
      addBox(floorFurn, 0.05, 1.78, 0.68, -3.00, fy + 1.06, -3.25, atriumGlassMat, false, false);
      // Full-Height Master Spa Ensuite Privacy Partition & Satin Frosted-Glass Sliding Spa Door (x=-1.52) shielding tub/toilet from WIR & Master Bed!
      addBox(floorFurn, 0.14, 2.66, 2.55, -1.52, fy + 1.33, -3.58, whiteMat, false, false); // Rear solid spa privacy wall (-4.85..-2.30)
      addBox(floorFurn, 0.14, 2.66, 0.72, -1.52, fy + 1.33, -0.78, whiteMat, false, false); // Front spa privacy pier (-1.14..-0.42)
      addBox(floorFurn, 0.14, 0.36, 1.18, -1.52, fy + 2.48, -1.72, whiteMat, false, false); // Flush spa doorway lintel
      addPrivacySlidingDoor(floorFurn, -1.52, fy, -1.72, 1.08, 2.28, Math.PI / 2, true, 0.90); // Master Spa Frosted Privacy Sliding Door!
      // Master Spa Ensuite (BOTH freestanding soaking tub AND full frosted-glass walk-in rain/handheld shower + full spa & toilet curtains!)
      addSpaBath(floorFurn, -0.05, fy, -2.75);
      addBathCurtain(floorFurn, -0.05, fy, -4.78, 2.75, 2.66, 0, false); // Full-height Master Spa exterior rear glass privacy curtain!

      // BEDROOM 6 PRIVATE SUITE + ENCLOSED ENSUITE 6 (Always-visible Terrace Sliding Door + Privacy Curtains + Front Hallway Privacy Wall + Frosted Ensuite Sliding Door!)
      addBox(owner, 6.2, 0.34, 4.45, 4.85, y + 0.18, -2.65, whiteMat, true, true);
      addBox(owner, 1.44, 0.24, 1.35, 2.32, y + 0.23, 0.18, whiteMat, true, true); // Flush corridor deck joining spiral landing (z=0.78) to Bedroom 6!
      addBox(owner, 5.4, wallH, 0.14, 4.95, wallY, -4.82, atriumGlassMat, false, false);
      for (const bx of [2.3, 4.0, 5.7, 7.4]) addBox(owner, 0.08, wallH, 0.16, bx, wallY, -4.82, darkBronzeMat);
      // Bedroom 6 Right Exterior Wall ALWAYS VISIBLE with REAL Sliding Glass Door onto 2F Curved Right Sun Terrace + Full-Height Interior Privacy Curtain!
      const bed6RightWall = new THREE.Group();
      addBox(bed6RightWall, 0.22, wallH, 2.75, 7.85, wallY, -3.475, whiteMat); // Rear section (-4.85..-2.10)
      addBox(bed6RightWall, 0.22, wallH, 0.22, 7.85, wallY, -0.49, whiteMat);  // Front pier (-0.60..-0.38)
      addBox(bed6RightWall, 0.22, wallH - 2.64, 1.52, 7.85, doorBaseY + 2.64 + (wallH - 2.64) / 2, -1.35, whiteMat); // Flush lintel header
      addSlidingBalconyDoor(bed6RightWall, 7.85, doorBaseY, -1.35, 1.50, 2.64, -Math.PI / 2, 1); // Bedroom 6 -> 2F Curved Right Sun Terrace!
      owner.add(bed6RightWall);
      // Full Front Privacy Wall along z=-0.45 shielding Bedroom 6 & Ensuite 6 from the 2F spiral landing + Walnut & Frosted-Glass Suite Entry Sliding Door!
      addBox(owner, 2.50, wallH, 0.16, 3.00, wallY, -0.45, whiteMat, false, false);  // Ensuite 6 front privacy wall (x=1.75..4.25)
      addBox(owner, 2.40, wallH, 0.16, 6.65, wallY, -0.45, whiteMat, false, false);  // Bed 6 right-front privacy wall (x=5.45..7.85)
      addBox(owner, 1.24, wallH - 2.34, 0.16, 4.85, doorBaseY + 2.34 + (wallH - 2.34) / 2, -0.45, whiteMat, false, false); // Suite doorway lintel
      addPrivacySlidingDoor(floorFurn, 4.85, fy, -0.45, 1.12, 2.30, 0, true, 0.90);  // Bedroom 6 Private Suite Entry Sliding Door!
      // Full-Depth Privacy Wall + Satin Frosted-Glass Bathroom Sliding Door at x=4.18 enclosing Ensuite 6 completely (ZERO toilet sightline from Bed 6 or Sun Terrace!)
      addBox(owner, 0.14, wallH, 2.95, 4.18, wallY, -3.35, whiteMat, false, false);  // Rear solid bathroom enclosure (-4.82..-1.88)
      addBox(owner, 0.14, wallH, 0.44, 4.18, wallY, -0.66, whiteMat, false, false);  // Front bathroom pier (-0.88..-0.44)
      addBox(owner, 0.14, wallH - 2.28, 1.04, 4.18, doorBaseY + 2.28 + (wallH - 2.28) / 2, -1.38, whiteMat, false, false); // Ensuite doorway header
      addPrivacySlidingDoor(floorFurn, 4.18, fy, -1.38, 0.96, 2.24, Math.PI / 2, true, 0.92); // Ensuite 6 Frosted Privacy Sliding Door!
      addBedSuite(floorFurn, 5.85, fy, -2.55, Math.PI, 0.88);
      addCurtainPair(floorFurn, 5.85, fy, -4.68, 3.2, 2.66, 0);
      addCurtainPair(floorFurn, 7.64, fy, -1.35, 1.65, 2.64, -Math.PI / 2); // Bedroom 6 Terrace Sliding Door Privacy Curtain!
      addWallArt(floorFurn, 5.85, fy + 1.72, -1.48, 1.25, 0.78, Math.PI, 0);
      addACUnit(floorFurn, 5.85, fy + 2.46, -1.44, Math.PI, 0.90); // 2F Bedroom 6 Behind Spiral Split-Inverter AC
      addCeilingDecor(floorFurn, 5.85, fy + 2.64, -2.65, 3.0, 3.2, { fan: true, fanSpeed: 2.1 });
      addBox(floorFurn, 0.48, 2.35, 1.85, 7.50, fy + 1.18, -3.62, walnutMat, false, false); // Wardrobe cleanly clear of Bed 6 sliding balcony door!
      addBox(floorFurn, 0.05, 2.20, 0.05, 7.24, fy + 1.18, -2.72, warmLedMat, false, false);
      addEnsuiteBath(floorFurn, 2.98, fy, -2.75, Math.PI, 0.92);
      addBathCurtain(floorFurn, 2.98, fy, -4.68, 2.05, 2.66, 0, false); // Exterior rear window curtain for 2F Ensuite 6!
    } else {
      // ROOFTOP LEVEL 3: Redesigned L-Shaped BBQ Chef Kitchen (rear), Enclosed RGB Gaming Studio (mid-left), Party Bar & Buffet (mid-right), Lounge TV 3 (front)
      // 1. L-Shaped Outdoor Chef's BBQ Kitchen (travertine wrap bar + 4-burner grill with glowing embers + sink + beverage fridge + 3 bar stools)
      addBox(floorFurn, 0.78, 0.94, 3.15, -6.78, fy + 0.47, -2.95, marbleMat, false, true);
      addBox(floorFurn, 0.72, 0.78, 3.05, -6.78, fy + 0.39, -2.95, walnutMat, false, false);
      // L-return serving bar + 3 bar stools
      addBox(floorFurn, 2.35, 0.98, 0.68, -5.65, fy + 0.49, -1.48, marbleMat, false, true);
      addBox(floorFurn, 2.28, 0.80, 0.60, -5.65, fy + 0.40, -1.48, walnutMat, false, false);
      for (const bx of [-6.15, -5.45, -4.75]) {
        addBox(floorFurn, 0.36, 0.64, 0.36, bx, fy + 0.32, -0.92, darkBronzeMat, false, false);
        addBox(floorFurn, 0.38, 0.10, 0.38, bx, fy + 0.68, -0.92, upholsteryMat, false, false);
      }
      // 4-burner Piped Gas Brushed Steel BBQ Grill + Canopy Exhaust Hood + Gas Valve + Glowing Embers & Blue Flames!
      addBox(floorFurn, 0.66, 0.44, 1.05, -6.74, fy + 1.14, -3.55, steelMat, false, false);
      addBox(floorFurn, 0.48, 0.08, 0.86, -6.72, fy + 0.97, -3.55, fireEmberMat, false, false);
      for (const bz of [-3.82, -3.55, -3.28]) {
        const gf = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 12), gasFlameMat);
        gf.rotation.x = Math.PI / 2; gf.position.set(-6.70, fy + 1.02, bz); floorFurn.add(gf);
        gasFlameMeshes.push(gf);
      }
      // Commercial Brushed-Steel Outdoor BBQ Exhaust Canopy Hood + Rain-Capped Roof Flue!
      addBox(floorFurn, 0.84, 0.24, 1.24, -6.74, fy + 2.02, -3.55, steelMat, false, false);
      addBox(floorFurn, 0.34, 0.86, 0.34, -6.74, fy + 2.54, -3.55, steelMat, false, false);
      addBox(floorFurn, 0.50, 0.06, 0.50, -6.74, fy + 2.98, -3.55, darkBronzeMat, false, false); // Rain cowl cap
      addBox(floorFurn, 0.72, 0.025, 0.05, -6.74, fy + 1.89, -3.55, warmLedMat, false, false);
      // Rooftop BBQ Gas Isolation Valve + Weatherproof Leak Sensor
      addBox(floorFurn, 0.10, 0.10, 0.10, -7.12, fy + 0.68, -4.12, brassMat, false, false);
      addBox(floorFurn, 0.14, 0.03, 0.03, -7.12, fy + 0.74, -4.12, lpgRedMat, false, false);
      addBox(floorFurn, 0.10, 0.14, 0.06, -7.10, fy + 1.48, -4.15, whiteMat, false, false);
      addBox(floorFurn, 0.035, 0.035, 0.02, -7.06, fy + 1.50, -4.12, gasSensorLedMat, false, false);
      // Prep sink + gold gooseneck tap + under-counter stainless beverage cooler
      addBox(floorFurn, 0.48, 0.06, 0.56, -6.74, fy + 0.95, -2.28, darkBronzeMat, false, false);
      addBox(floorFurn, 0.05, 0.36, 0.05, -6.96, fy + 1.12, -2.28, goldMat, false, false);
      addBox(floorFurn, 0.62, 0.72, 0.62, -6.72, fy + 0.38, -2.28, steelMat, false, false);
      addBox(floorFurn, 0.05, 0.05, 2.95, -6.36, fy + 0.86, -2.95, warmLedMat, false, false);
      // 8-seat Teak Outdoor Dining Table + Glowing Candle Centerpiece
      addDiningSet(floorFurn, -3.25, fy, -3.15, 0);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), chandelierOrbMat);
      candle.position.set(-3.25, fy + 0.88, -3.15); floorFurn.add(candle);

      // 2. ZERO-GLITCH ENCLOSED LIVE ANIMATED PC / VR MOTION SIM-RACING / ARCADE / CONSOLE GAMING STUDIO (x: -7.25..-2.55, z: -0.25..+3.50, ceiling y=12.22!)
      for (let gx = -7.05; gx <= -2.75; gx += 0.24) {
        addBox(floorFurn, 0.08, 1.76, 0.06, gx, fy + 0.88, -0.23, walnutMat, false, false);
      }
      // Hexagonal Nanoleaf RGB Acoustic Wall Panels + Dedicated Gaming Studio Split-Inverter AC!
      [[-5.85, 1.44], [-5.58, 1.56], [-5.31, 1.44], [-4.15, 1.44], [-3.88, 1.56], [-3.61, 1.44]].forEach(([hx, hy], hi) => {
        const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 6), hi % 2 ? rgbCyanMat : rgbPurpleMat);
        hex.rotation.x = Math.PI / 2; hex.position.set(hx, fy + hy, -0.17);
        floorFurn.add(hex); nanoLeafPanels.push(hex);
      });
      addACUnit(floorFurn, -4.75, fy + 1.72, -0.20, 0, 0.94); // Dedicated Gaming Studio Split-Inverter AC (safely below 12.16 ceiling!)
      interiorWalls.push(addBox(owner, 0.14, wallH - 0.08, 3.78, -2.46, wallY, 1.62, partitionMat, false, false));
      // Pro L-shaped Obsidian & Walnut Battlestation Desk + Streaming Mic Boom + Ring Light (centered cleanly at x=-4.75, clear of Arcade!)
      addBox(floorFurn, 2.75, 0.74, 0.74, -4.75, fy + 0.37, 0.22, charcoalMat, false, true);
      addBox(floorFurn, 2.78, 0.05, 0.76, -4.75, fy + 0.75, 0.22, walnutMat, false, false);
      addBox(floorFurn, 0.64, 0.74, 0.62, -3.12, fy + 0.37, 0.84, charcoalMat, false, true);
      addBox(floorFurn, 0.66, 0.05, 0.64, -3.12, fy + 0.75, 0.84, walnutMat, false, false);
      addBox(floorFurn, 2.68, 0.04, 0.04, -4.75, fy + 0.71, -0.14, rgbPurpleMat, false, false);
      // Triple Curved Zero-Z-Fighting LIVE ANIMATED Gaming Monitors (240 FPS Synthwave Cyber-Racing HUD!)
      [[-5.58, 0.20, 0.20], [-4.75, 0.13, 0], [-3.92, 0.20, -0.20]].forEach(([mx, mz, ry]) => {
        addFlatScreen(floorFurn, 0.78, 0.40, mx, fy + 1.04, mz, ry, liveScreens.pcGame.mat, rgbCyanMat);
        addBox(floorFurn, 0.07, 0.20, 0.07, mx, fy + 0.85, mz - 0.03, darkBronzeMat, false, false);
      });
      // Streaming Key Ring Light & Broadcast Mic Boom Arm + RGB Mousepad & Keyboard
      const ringL = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.015, 8, 18), chandelierOrbMat);
      ringL.position.set(-4.75, fy + 1.40, 0.09); floorFurn.add(ringL);
      addBox(floorFurn, 0.022, 0.44, 0.022, -5.42, fy + 0.98, 0.36, darkBronzeMat, false, false);
      addBox(floorFurn, 0.30, 0.022, 0.022, -5.27, fy + 1.18, 0.42, darkBronzeMat, false, false);
      addBox(floorFurn, 0.07, 0.10, 0.07, -5.12, fy + 1.16, 0.44, charcoalMat, false, false);
      addBox(floorFurn, 1.24, 0.02, 0.32, -4.75, fy + 0.78, 0.42, rgbCyanMat, false, false);
      addBox(floorFurn, 0.42, 0.03, 0.14, -4.80, fy + 0.80, 0.42, charcoalMat, false, false);
      // Tempered-Glass RGB Gaming PC Tower with SPINNING glowing cyan & purple fans!
      addBox(floorFurn, 0.24, 0.54, 0.48, -3.48, fy + 1.04, 0.24, charcoalMat, false, false);
      addBox(floorFurn, 0.03, 0.46, 0.40, -3.61, fy + 1.04, 0.24, atriumGlassMat, false, false);
      for (const fz of [0.10, 0.24, 0.38]) {
        const fanGrp = new THREE.Group();
        fanGrp.position.set(-3.59, fy + 1.04, fz);
        const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.013, 6, 12), fz === 0.24 ? rgbPurpleMat : rgbCyanMat);
        fanRing.rotation.y = Math.PI / 2; fanGrp.add(fanRing);
        const fanBlade = new THREE.Mesh(UNIT_BOX, fz === 0.24 ? rgbPurpleMat : rgbCyanMat);
        fanBlade.scale.set(0.01, 0.085, 0.02); fanGrp.add(fanBlade);
        floorFurn.add(fanGrp);
        spinningFans.push({ obj: fanGrp, axis: 'x', speed: 8.5 });
      }
      // Ergonomic Racing Gaming Chair + Mini Beverage Fridge + Standalone VR Headset
      addBox(floorFurn, 0.54, 0.12, 0.52, -4.75, fy + 0.45, 0.98, charcoalMat, false, false);
      addBox(floorFurn, 0.52, 0.74, 0.12, -4.75, fy + 0.85, 1.19, charcoalMat, false, false);
      addBox(floorFurn, 0.07, 0.64, 0.13, -4.96, fy + 0.85, 1.18, rgbCyanMat, false, false);
      addBox(floorFurn, 0.07, 0.64, 0.13, -4.54, fy + 0.85, 1.18, rgbCyanMat, false, false);
      addBox(floorFurn, 0.10, 0.40, 0.10, -4.75, fy + 0.20, 0.98, darkBronzeMat, false, false);
      addBox(floorFurn, 0.50, 0.05, 0.50, -4.75, fy + 0.04, 0.98, darkBronzeMat, false, false);
      addBox(floorFurn, 0.46, 0.68, 0.42, -3.16, fy + 0.34, 1.40, charcoalMat, false, false); // Mini beverage fridge tucked cleanly clear of return desk & OLED TV!
      addBox(floorFurn, 0.38, 0.56, 0.04, -3.16, fy + 0.35, 1.62, atriumGlassMat, false, false);
      addBox(floorFurn, 0.30, 0.035, 0.035, -3.16, fy + 0.58, 1.56, rgbCyanMat, false, false);
      addBox(floorFurn, 0.18, 0.12, 0.14, -3.12, fy + 0.88, 0.86, porcelainMat, false, false);

      // FULL-SIZE RETRO NEON ARCADE CABINET (Cleanly against rear wall x=-6.72, z=0.14, facing +Z — ZERO left sliding-door collision!)
      const arcG = new THREE.Group();
      arcG.position.set(-6.72, fy, 0.14); arcG.rotation.y = 0;
      addBox(arcG, 0.64, 1.56, 0.54, 0, 0.78, 0, charcoalMat, false, false);
      addBox(arcG, 0.66, 0.15, 0.56, 0, 1.50, 0.03, rgbPurpleMat, false, false); // Glowing neon marquee
      addBox(arcG, 0.64, 0.11, 0.34, 0, 0.84, 0.30, darkBronzeMat, false, false); // Joystick deck
      addBox(arcG, 0.025, 0.09, 0.025, -0.14, 0.94, 0.36, lpgRedMat, false, false);
      const joyBall = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 8), lpgRedMat);
      joyBall.position.set(-0.14, 0.99, 0.36); arcG.add(joyBall);
      for (const bx of [0.06, 0.14, 0.22]) addBox(arcG, 0.04, 0.024, 0.04, bx, 0.91, 0.36, bx === 0.14 ? rgbCyanMat : pipeGasMat, false, false);
      const arcScr = addFlatScreen(arcG, 0.52, 0.40, 0, 1.16, 0.26, 0, liveScreens.consoleGame.mat, null);
      arcScr.rotation.x = -0.18;
      floorFurn.add(arcG);

      // FULL MOTION-RIG VR SIM-RACING CAR COCKPIT (Zero collisions, 0.60 m aisle clearance on every side!)
      const vrBase = new THREE.Group();
      vrBase.position.set(-5.85, fy, 2.48); vrBase.rotation.y = Math.PI / 2;
      addBox(vrBase, 1.00, 0.03, 1.76, 0, 0.015, 0, charcoalMat, false, true);
      for (const [ax, az] of [[-0.36, -0.68], [0.36, -0.68], [-0.36, 0.68], [0.36, 0.68]]) {
        const act = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.22, 10), steelMat);
        act.position.set(ax, 0.12, az); vrBase.add(act);
      }
      vrCarMotionPivot = new THREE.Group();
      vrCarMotionPivot.position.set(0, 0.22, 0);
      vrBase.add(vrCarMotionPivot);
      addBox(vrCarMotionPivot, 0.74, 0.08, 1.58, 0, 0.04, 0, darkBronzeMat, false, false);
      addBox(vrCarMotionPivot, 0.76, 0.03, 1.56, 0, 0.09, 0, lpgRedMat, false, false);
      addBox(vrCarMotionPivot, 0.50, 0.13, 0.54, 0, 0.17, -0.40, charcoalMat, false, false);
      const seatBack = addBox(vrCarMotionPivot, 0.48, 0.72, 0.12, 0, 0.52, -0.64, charcoalMat, false, false);
      seatBack.rotation.x = -0.22;
      for (const sx of [-0.22, 0.22]) {
        const bol = addBox(vrCarMotionPivot, 0.08, 0.62, 0.14, sx, 0.50, -0.60, lpgRedMat, false, false);
        bol.rotation.x = -0.22;
      }
      addBox(vrCarMotionPivot, 0.06, 0.58, 0.06, -0.30, 0.34, 0.20, darkBronzeMat, false, false);
      addBox(vrCarMotionPivot, 0.06, 0.58, 0.06, 0.30, 0.34, 0.20, darkBronzeMat, false, false);
      addBox(vrCarMotionPivot, 0.66, 0.06, 0.18, 0, 0.60, 0.20, charcoalMat, false, false);
      addBox(vrCarMotionPivot, 0.15, 0.15, 0.22, 0, 0.68, 0.20, darkBronzeMat, false, false);
      vrSteeringWheel = new THREE.Group();
      vrSteeringWheel.position.set(0, 0.68, 0.05);
      const wRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.023, 8, 20), charcoalMat);
      vrSteeringWheel.add(wRim);
      addBox(vrSteeringWheel, 0.26, 0.05, 0.03, 0, 0, 0, lpgRedMat, false, false);
      addBox(vrSteeringWheel, 0.09, 0.02, 0.035, 0, 0.14, 0.01, rgbCyanMat, false, false);
      vrCarMotionPivot.add(vrSteeringWheel);
      for (const px of [-0.13, 0, 0.13]) {
        const ped = addBox(vrCarMotionPivot, 0.07, 0.20, 0.024, px, 0.20, 0.62, steelMat, false, false);
        ped.rotation.x = -0.35;
      }
      addBox(vrCarMotionPivot, 0.08, 0.32, 0.17, 0.34, 0.34, -0.05, charcoalMat, false, false);
      addBox(vrCarMotionPivot, 0.02, 0.20, 0.02, 0.34, 0.54, -0.04, steelMat, false, false);
      const sKnob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), lpgRedMat);
      sKnob.position.set(0.34, 0.66, -0.04); vrCarMotionPivot.add(sKnob);
      addFlatScreen(vrCarMotionPivot, 0.90, 0.42, 0, 0.92, 0.54, Math.PI, liveScreens.pcGame.mat, rgbCyanMat);
      addBox(vrCarMotionPivot, 0.15, 0.09, 0.11, -0.32, 0.68, 0.16, porcelainMat, false, false);
      floorFurn.add(vrBase);

      // Glowing Neon VR Standing Play-Boundary Ring (35 cm clear of VR car & TV!) + 75" Esports Console OLED TV + Next-Gen Console!
      const vrRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.022, 6, 28), rgbCyanMat);
      vrRing.rotation.x = Math.PI / 2; vrRing.position.set(-3.92, fy + 0.03, 2.52); floorFurn.add(vrRing);
      addFlatScreen(floorFurn, 1.64, 0.90, -2.66, fy + 1.06, 2.54, -Math.PI / 2, liveScreens.consoleGame.mat, rgbPurpleMat);
      addBox(floorFurn, 0.32, 0.28, 1.48, -2.76, fy + 0.24, 2.54, walnutMat, false, false);
      addBox(floorFurn, 0.14, 0.32, 0.22, -2.76, fy + 0.54, 2.94, porcelainMat, false, false);
      addBox(floorFurn, 0.26, 0.30, 0.26, -2.76, fy + 0.16, 3.38, charcoalMat, false, false);
      // Overhead Twin Purple & Cyan RGB Ceiling Light Bars cleanly seated at y=11.99 BELOW cove baffles (12.04..12.14) & roof canopy (12.21) — ZERO Z-fighting or clipping!
      addBox(floorFurn, 3.85, 0.04, 0.05, -4.95, 11.99, 0.45, rgbPurpleMat, false, false);
      addBox(floorFurn, 3.85, 0.04, 0.05, -4.95, 11.99, 2.45, rgbCyanMat, false, false);
      addCeilingDecor(floorFurn, -4.95, 12.09, 1.65, 3.8, 3.0, { baffles: true });

      // 3. Entertainment Media Lounge (Zero-Z-Fighting Live Animated TV 3 + Dedicated Split-Inverter AC!) front-right
      addBox(floorFurn, 3.05, 0.03, 2.45, -0.55, fy + 0.015, 1.65, rugMat, false, true);
      addSofaUnit(floorFurn, -0.55, fy, 2.45, Math.PI, 2.45);
      const rTable = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.34, 20), marbleMat);
      rTable.position.set(-0.55, fy + 0.17, 1.35); floorFurn.add(rTable);
      addBox(floorFurn, 2.15, 0.30, 0.40, -0.55, fy + 0.15, -0.02, walnutMat, false, false);
      addFlatScreen(floorFurn, 1.88, 0.88, -0.55, fy + 1.02, -0.08, 0, liveScreens.cinema.mat, warmLedMat);
      addACUnit(floorFurn, -0.55, fy + 1.70, -0.20, 0, 0.94); // Rooftop Media Lounge Split-Inverter AC!
      addCurtainPair(floorFurn, -0.55, fy, 3.48, 3.6, 1.84, Math.PI);
      addWallArt(floorFurn, 1.36, fy + 1.04, 1.65, 1.08, 0.64, -Math.PI / 2, 2);
      addCeilingDecor(floorFurn, -0.55, 12.09, 1.65, 2.8, 2.4, { ringChandelier: false });
      for (const sx of [-1.85, 0.75]) addBox(floorFurn, 0.26, 1.02, 0.28, sx, fy + 0.51, -0.02, charcoalMat, false, false);
      // Twin Multi-Split VRF Outdoor AC Condenser Units with Spinning Fans on Rear-Right Roof Utility Pad!
      for (const cx of [5.85, 6.95]) {
        const cond = new THREE.Group();
        cond.position.set(cx, 12.78, -4.15);
        addBox(cond, 0.88, 0.96, 0.42, 0, 0.48, 0, acBodyMat, true, true);
        addBox(cond, 0.52, 0.52, 0.04, -0.10, 0.52, 0.21, charcoalMat, false, false);
        const cFan = new THREE.Group();
        cFan.position.set(-0.10, 0.52, 0.225);
        for (let k = 0; k < 4; k++) {
          const b = new THREE.Mesh(UNIT_BOX, darkBronzeMat);
          b.scale.set(0.38, 0.06, 0.015); b.rotation.z = k * Math.PI / 4; cFan.add(b);
        }
        cond.add(cFan); spinningFans.push({ obj: cFan, axis: 'z', speed: 7.2 });
        levels.roof.add(cond);
      }
    }
    owner.add(floorFurn);
    interiorDecor.push(floorFurn);
  });
  if (statusEl) statusEl.textContent = 'Building rooftop party shed, laundry & water system…';
  await yieldMain();

  // 4th Top Curved White Roof Canopy Cornice framing the front 3rd-floor facade & Extended Left Sky-Deck (Open sky over rear BBQ pergola!)
  const frontCanopyShape = createCurvedWingShape(LEFT_BALC_X, 1.92, -1.25, 5.75, 2.55);
  const skyEdgePts = sampleCurvedFrontEdge(LEFT_BALC_X, 1.92, 5.75, 2.55, 76, -1.25, -7.45);
  const frontCanopyGeo = new THREE.ExtrudeGeometry(frontCanopyShape, {
    depth: 0.42, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 28
  });
  const roofCanopy = new THREE.Mesh(frontCanopyGeo, whiteMat);
  roofCanopy.rotation.x = Math.PI / 2;
  roofCanopy.position.y = 12.68;
  roofCanopy.castShadow = true;
  roofCanopy.receiveShadow = true;
  levels.roof.add(roofCanopy);
  cutawayShells.push(roofCanopy);
  const topLedCurve = new THREE.CatmullRomCurve3(skyEdgePts.map(p => new THREE.Vector3(
    p.x + (p.x <= LEFT_BALC_X + 0.08 ? 0.12 : 0),
    12.165,
    p.z - (p.z > 4.0 ? 0.10 : 0)
  )));
  const topLedMesh = new THREE.Mesh(new THREE.TubeGeometry(topLedCurve, 110, 0.04, 8, false), warmLedMat);
  levels.roof.add(topLedMesh);
  cutawayShells.push(topLedMesh);

  // Rear Roof BBQ Slatted Timber Pergola + Clear Glass Rain Shield + Warm LED Strips & Hanging Pendants
  for (const px of [-7.1, -3.9, -0.7]) {
    addBox(levels.roof, 0.16, 2.55, 0.16, px, 11.52, -4.65, darkBronzeMat);
    addBox(levels.roof, 0.16, 2.55, 0.16, px, 11.52, -1.35, darkBronzeMat);
  }
  addBox(levels.roof, 6.7, 0.18, 0.16, -3.9, 12.78, -4.65, darkBronzeMat);
  addBox(levels.roof, 6.7, 0.18, 0.16, -3.9, 12.78, -1.35, darkBronzeMat);
  for (let sx = -7.1; sx <= -0.7; sx += 0.46) {
    addBox(levels.roof, 0.11, 0.12, 3.45, sx, 12.82, -3.0, woodMat);
  }
  // Translucent monsoon glass rain shield over BBQ pergola slats
  addBox(levels.roof, 6.75, 0.04, 3.55, -3.9, 12.92, -3.0, railGlassMat, false, false);
  for (const lz of [-3.85, -3.0, -2.15]) {
    addBox(levels.roof, 5.8, 0.04, 0.06, -3.9, 12.72, lz, warmLedMat, false, false);
  }
  // 2 Hanging warm gold globe pendant lamps over BBQ dining table
  for (const px of [-3.75, -2.75]) {
    addBox(levels.roof, 0.02, 0.88, 0.02, px, 12.30, -3.15, goldMat, false, false);
    const pend = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), chandelierOrbMat);
    pend.position.set(px, 11.82, -3.15); levels.roof.add(pend);
  }

  /* === UPPER SKY-DECK: ALL-WEATHER ROOM PARTY SHED PAVILION, COCKTAIL BAR, KARAOKE AV & EXTENDED LEFT YOGA DECK (y = 12.74) === */
  const partyShedGroup = new THREE.Group();
  levels.roof.add(partyShedGroup);
  cutawayShells.push(partyShedGroup);
  const py = 12.74;
  // Continuous curved glass safety rail wrapping around the entire Upper Sky-Deck & Extended Left Yoga Terrace (closed cleanly at z=-1.25!)
  for (let i = 0; i < skyEdgePts.length - 1; i++) {
    const p0 = skyEdgePts[i], p1 = skyEdgePts[i + 1];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const segW = Math.hypot(dx, dz);
    if (segW < 0.005) continue;
    const pane = addBox(partyShedGroup, segW + 0.01, 0.85, 0.035, (p0.x + p1.x) / 2, py + 0.44, (p0.z + p1.z) / 2, railGlassMat, false, false);
    pane.rotation.y = -Math.atan2(dz, dx);
  }
  const skyRailCurve = new THREE.CatmullRomCurve3(skyEdgePts.map(p => new THREE.Vector3(p.x, py + 0.88, p.z)));
  partyShedGroup.add(new THREE.Mesh(new THREE.TubeGeometry(skyRailCurve, 110, 0.036, 8, false), goldMat));
  // Extended Left Sky-Deck Morning Yoga & Sunset Stargazing Teak Terrace (x=-9.05..-7.55, z=-0.6..+3.2)
  addBox(partyShedGroup, 1.45, 0.04, 3.85, -8.35, py + 0.02, 1.25, woodMat, false, true);
  addBox(partyShedGroup, 0.68, 0.03, 1.82, -8.38, py + 0.05, 1.15, new THREE.MeshStandardMaterial({ color: 0x2d6a62, roughness: 0.92 }), false, false);
  for (const lz of [-0.35, 2.75]) {
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 10), warmLedMat);
    lan.position.set(-8.62, py + 0.21, lz); partyShedGroup.add(lan);
  }
  addPlanterTree(partyShedGroup, -8.65, py, -0.82, 0.66, true);

  // Sloped Monsoon-Proof Steel & Warm Timber Party Shed Roof (x: -7.5..-0.4, z: -0.9..+4.2)
  for (const sx of [-7.35, -3.9, -0.55]) {
    addBox(partyShedGroup, 0.16, 2.45, 0.16, sx, py + 1.22, -0.75, darkBronzeMat);
    addBox(partyShedGroup, 0.16, 2.85, 0.16, sx, py + 1.42, 4.05, darkBronzeMat);
  }
  // Zero-Z-Fighting Layered Sloped Party Shed Roof (strictly separated timber ceiling 2.61, steel roof 2.73, gold fascia trim 2.83!)
  const shedRoof = addBox(partyShedGroup, 7.35, 0.12, 5.45, -3.95, py + 2.73, 1.65, darkBronzeMat);
  shedRoof.rotation.x = -0.082; // Sloped monsoon runoff toward rear gutter!
  const shedTimber = addBox(partyShedGroup, 7.15, 0.06, 5.25, -3.95, py + 2.61, 1.65, woodMat, false, false);
  shedTimber.rotation.x = -0.082;
  const shedTrim = addBox(partyShedGroup, 7.42, 0.04, 5.52, -3.95, py + 2.83, 1.65, goldMat, false, false);
  shedTrim.rotation.x = -0.082;

  // Festive Warm Draped Festoon Party String Lights beneath the shed!
  for (const fz of [0.25, 1.75, 3.25]) {
    const fPts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const fx = -7.25 + t * 6.6;
      const fyBulb = py + 2.42 + (fz - 1.65) * 0.082 - Math.sin(t * Math.PI) * 0.28;
      fPts.push(new THREE.Vector3(fx, fyBulb, fz));
      if (k > 0 && k < 10) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), chandelierOrbMat);
        bulb.position.set(fx, fyBulb - 0.05, fz);
        partyShedGroup.add(bulb);
      }
    }
    partyShedGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fPts), 24, 0.012, 5, false), darkBronzeMat));
  }

  // Party Shed Hosting Interior: L-Shaped Party Sectional, Buffet Table, Backlit Cocktail Mini-Bar, Karaoke TV & Dual Party Speakers!
  addBox(partyShedGroup, 3.8, 0.03, 3.0, -5.2, py + 0.02, 2.0, rugMat, false, true);
  addSofaUnit(partyShedGroup, -5.2, py, 3.25, Math.PI, 2.9);
  addSofaUnit(partyShedGroup, -6.75, py, 1.75, Math.PI / 2, 2.2);
  addBox(partyShedGroup, 1.55, 0.42, 0.85, -5.05, py + 0.21, 1.75, marbleMat, false, true);
  // Party Media / Karaoke LIVE Audio Equalizer OLED Wall (zero-Z-fighting!) + Spinning Outdoor Ceiling Fan + Twin RGB Floor Speakers
  addBox(partyShedGroup, 3.1, 2.15, 0.14, -5.15, py + 1.12, -0.68, walnutMat, false, false);
  addFlatScreen(partyShedGroup, 2.08, 1.06, -5.15, py + 1.32, -0.56, 0, liveScreens.partyTv.mat, rgbPurpleMat);
  // Suspended Outdoor Ceiling Fan hung cleanly from sloped timber beam (ZERO flat gypsum box stabbing through the sloped roof!)
  {
    const pFanGrp = new THREE.Group();
    pFanGrp.position.set(-4.65, py + 2.57, 1.75);
    addBox(pFanGrp, 0.24, 0.05, 0.24, 0, -0.02, 0, darkBronzeMat, false, false);
    addBox(pFanGrp, 0.045, 0.30, 0.045, 0, -0.17, 0, darkBronzeMat, false, false);
    const pRotor = new THREE.Group();
    pRotor.position.set(0, -0.33, 0);
    pRotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), darkBronzeMat));
    const pLed = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), chandelierOrbMat);
    pLed.position.y = -0.036; pRotor.add(pLed);
    for (let k = 0; k < 3; k++) {
      const bl = new THREE.Mesh(UNIT_BOX, walnutMat);
      bl.scale.set(0.72, 0.02, 0.15);
      const a = k * (Math.PI * 2 / 3);
      bl.position.set(Math.cos(a) * 0.40, 0, Math.sin(a) * 0.40);
      bl.rotation.y = -a;
      pRotor.add(bl);
    }
    pFanGrp.add(pRotor);
    spinningFans.push({ obj: pRotor, axis: 'y', speed: 2.0 });
    partyShedGroup.add(pFanGrp);
  }
  for (const spx of [-6.55, -3.75]) {
    addBox(partyShedGroup, 0.34, 1.15, 0.34, spx, py + 0.58, -0.45, charcoalMat, false, false);
    addBox(partyShedGroup, 0.22, 0.22, 0.04, spx, py + 0.85, -0.27, rgbPurpleMat, false, false);
    addBox(partyShedGroup, 0.22, 0.22, 0.04, spx, py + 0.48, -0.27, rgbCyanMat, false, false);
  }
  // Backlit Rooftop Cocktail Mini-Bar Counter + Bottle Display + 3 Bar Stools
  addBox(partyShedGroup, 0.72, 1.04, 2.55, -1.55, py + 0.52, 1.65, marbleMat, false, true);
  addBox(partyShedGroup, 0.66, 0.92, 2.48, -1.55, py + 0.46, 1.65, charcoalMat, false, false);
  addBox(partyShedGroup, 0.05, 0.05, 2.40, -1.91, py + 0.94, 1.65, warmLedMat, false, false);
  for (const bz of [0.85, 1.65, 2.45]) {
    addBox(partyShedGroup, 0.34, 0.68, 0.34, -2.35, py + 0.34, bz, darkBronzeMat, false, false);
    addBox(partyShedGroup, 0.38, 0.10, 0.38, -2.35, py + 0.72, bz, upholsteryMat, false, false);
  }
  // Quiet Morning Yoga & Stargazing Teak Deck Corner (front-right of sky-deck, x: -0.2..+1.5, z: 1.8..4.6)
  addBox(partyShedGroup, 1.65, 0.06, 2.45, 0.68, py + 0.03, 3.25, woodMat, false, true);
  addBox(partyShedGroup, 0.68, 0.03, 1.75, 0.68, py + 0.075, 3.25, new THREE.MeshStandardMaterial({ color: 0x5c8578, roughness: 0.9 }), false, false);
  addPlanterTree(partyShedGroup, 1.25, py + 0.04, 4.75, 0.75, true);

  /* === DEDICATED ROOFTOP LAUNDRY ROOM, COVERED MONSOON DRYING SHED & GUEST WC (Rear-Right Wing, y = 10.26!) === */
  const laundryWing = new THREE.Group();
  levels.roof.add(laundryWing);
  const ly = 10.26;
  // Extended Rear-Right Rooftop Service Slab tucked cleanly behind the spiral staircase & right pavilion (hidden from hero front!)
  addBox(laundryWing, 6.2, 0.36, 4.5, 4.75, 10.08, -2.65, whiteMat, true, true);
  // 1. Enclosed Laundry Room (x: 1.8..4.6, z: -4.7..-2.2) — Glass front doors, Washer + Dryer, Marble Counter, Utility Sink & Linen Cabinets!
  addBox(laundryWing, 2.85, 2.42, 0.18, 3.22, ly + 1.21, -4.72, whiteMat);
  addBox(laundryWing, 0.18, 2.42, 2.55, 1.82, ly + 1.21, -3.45, whiteMat);
  addBox(laundryWing, 0.16, 2.42, 2.55, 4.62, ly + 1.21, -3.45, whiteMat);
  addBox(laundryWing, 2.85, 2.42, 0.12, 3.22, ly + 1.21, -2.18, atriumGlassMat, false, false);
  addBox(laundryWing, 3.05, 0.22, 2.75, 3.22, ly + 2.54, -3.45, whiteMat, true, true); // Laundry roof deck cleanly above walls (ly+2.43..2.65, zero wall overlap!)
  // Marble folding counter + overhead oak linen cabinets + warm LED task light
  addBox(laundryWing, 2.55, 0.08, 0.72, 3.22, ly + 0.94, -4.22, marbleMat, false, true);
  addBox(laundryWing, 2.55, 0.74, 0.42, 3.22, ly + 1.98, -4.38, walnutMat, false, false);
  addBox(laundryWing, 2.40, 0.04, 0.05, 3.22, ly + 1.59, -4.22, warmLedMat, false, false);
  // Front-Load Washing Machine & Heat-Pump Dryer (matte white bodies + dark circular glass drum doors!)
  for (const [idx, wx] of [2.35, 3.12].entries()) {
    addBox(laundryWing, 0.66, 0.88, 0.64, wx, ly + 0.44, -4.22, whiteMat, false, false);
    addBox(laundryWing, 0.62, 0.14, 0.04, wx, ly + 0.76, -3.89, charcoalMat, false, false);
    const drumRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.028, 8, 18), idx === 0 ? pipeColdMat : goldMat);
    drumRing.position.set(wx, ly + 0.40, -3.89); laundryWing.add(drumRing);
    const drumGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 16), charcoalMat);
    drumGlass.rotation.x = Math.PI / 2; drumGlass.position.set(wx, ly + 0.40, -3.90); laundryWing.add(drumGlass);
  }
  // Utility Wash Sink + Brushed Gold Faucet + Woven Laundry Basket
  addBox(laundryWing, 0.72, 0.88, 0.64, 3.98, ly + 0.44, -4.22, charcoalMat, false, false);
  addBox(laundryWing, 0.04, 0.30, 0.04, 3.98, ly + 1.12, -4.42, goldMat, false, false);
  addBox(laundryWing, 0.48, 0.52, 0.44, 2.45, ly + 0.26, -2.85, woodMat, false, false);

  // 2. Covered Monsoon Drying Shed (x: 4.7..7.7, z: -4.7..-1.8) — Translucent UV Polycarbonate Sloped Roof + Breeze Louvers + 3 Drying Rails!
  for (const [dx, dz] of [[4.75, -4.65], [7.65, -4.65], [4.75, -1.95], [7.65, -1.95]]) {
    addBox(laundryWing, 0.12, 2.48, 0.12, dx, ly + 1.24, dz, darkBronzeMat);
  }
  const dryRoof = addBox(laundryWing, 3.25, 0.06, 3.05, 6.20, ly + 2.56, -3.30, atriumGlassMat, false, false);
  dryRoof.rotation.z = -0.10; // Sloped rain shedding outward!
  const dryFrame = addBox(laundryWing, 3.28, 0.07, 0.07, 6.20, ly + 2.56, -1.74, darkBronzeMat);
  dryFrame.rotation.z = -0.10;
  // Side ventilated monsoon breeze louvers on outer right edge (x=7.65)
  for (let lySl = 0.45; lySl <= 2.15; lySl += 0.24) {
    const lv = addBox(laundryWing, 0.04, 0.12, 2.65, 7.65, ly + lySl, -3.30, darkBronzeMat, false, false);
    lv.rotation.z = 0.38;
  }
  // 3 Brushed Stainless Steel Drying Rails + Hanging Clean Linens!
  for (const rz of [-4.0, -3.3, -2.6]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.68, 8), steelMat);
    rail.rotation.z = Math.PI / 2; rail.position.set(6.2, ly + 1.98, rz); laundryWing.add(rail);
  }
  const linenCols = [0xf4f1ea, 0x7ec0df, 0xe8c78a, 0xa8cbb4];
  linenCols.forEach((hex, li) => {
    addBox(laundryWing, 0.42, 0.82, 0.04, 5.25 + li * 0.62, ly + 1.56, -3.3, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 }), false, false);
  });
  addBox(laundryWing, 1.15, 0.42, 0.55, 6.15, ly + 0.21, -2.55, woodMat, false, false);

  // 3. Rooftop Guest WC (x: 1.8..3.6, z: -2.0..-0.6) right beside the Spiral Staircase Rooftop Lobby — fully furnished with ceramic toilet & basin!
  addBox(laundryWing, 1.85, 2.38, 0.14, 2.72, ly + 1.19, -2.02, warmWallMat);
  addBox(laundryWing, 0.14, 2.38, 1.45, 1.82, ly + 1.19, -1.32, warmWallMat);
  cutawayShells.push(addBox(laundryWing, 1.85, 2.38, 0.14, 2.72, ly + 1.19, -0.62, warmWallMat));
  addBox(laundryWing, 0.08, 2.38, 1.38, 3.64, ly + 1.19, -1.32, atriumGlassMat, false, false);
  addBathCurtain(laundryWing, 3.55, ly + 0.04, -1.32, 1.28, 2.26, -Math.PI / 2, false); // Full-height privacy curtain on Rooftop Guest WC glazed wall!
  addBox(laundryWing, 1.88, 0.06, 1.48, 2.72, ly + 2.41, -1.32, railGlassMat, false, false);
  addGuestWC(laundryWing, 2.75, ly, -1.32, 0);

  // Rooftop Solar PV Array (Neatly elevated on rear-left structural rack behind the BBQ pergola, y = 13.08, ZERO clash with Party Shed!)
  for (let i = 0; i < 6; i++) {
    const px = -6.6 + (i % 3) * 1.55, pz = -2.2 - Math.floor(i / 3) * 1.25;
    addBox(levels.roof, 0.06, 0.24, 0.06, px - 0.45, 13.00, pz - 0.25, darkBronzeMat);
    addBox(levels.roof, 0.06, 0.24, 0.06, px + 0.45, 13.00, pz - 0.25, darkBronzeMat);
    const panel = addBox(levels.roof, 1.38, 0.06, 0.95, px, 13.16, pz, solarMat);
    panel.rotation.x = 0.24;
  }

  /* === COMPLETE 3D WATER & SOLAR THERMAL SYSTEM (3,000 L Roof + 500 L Solar Heater + Risers + 15,000 L UG Vault!) === */
  const waterSystemGroup = new THREE.Group();
  scene.add(waterSystemGroup);
  const waterXrayOnly = []; // Subterranean cutaway & vertical riser highlights

  // 1. Rooftop 3,000 L Insulated Stainless Steel Tanks (3 x 1,000 L seated cleanly on Laundry Wing Roof Slab y=12.90!) + 300-500 L Solar Heater
  const roofWater = new THREE.Group();
  levels.roof.add(roofWater);
  // Structural steel tank plinth on top of Laundry Room roof (x: 1.8..4.6, z: -4.4..-2.8)
  addBox(roofWater, 2.95, 0.14, 1.28, 3.22, 12.96, -3.75, darkBronzeMat);
  for (const tx of [2.32, 3.22, 4.12]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 1.12, 20), steelMat);
    tank.position.set(tx, 13.58, -3.75); tank.castShadow = true; roofWater.add(tank);
    for (const ry of [13.28, 13.58, 13.88]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.018, 6, 20), darkBronzeMat);
      rib.rotation.x = Math.PI / 2; rib.position.set(tx, ry, -3.75); roofWater.add(rib);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.10, 12), goldMat);
    lid.position.set(tx, 14.17, -3.75); roofWater.add(lid);
  }
  const roofManifold = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.05, 10), pipeColdMat);
  roofManifold.rotation.z = Math.PI / 2; roofManifold.position.set(3.22, 14.10, -3.45); roofWater.add(roofManifold);

  // 300–500 L Evacuated-Tube Solar Water Heater (seated right beside the PV array & tanks at x = -1.2, z = -2.85, y = 12.92!)
  const solarHeater = new THREE.Group();
  solarHeater.position.set(-1.35, 12.94, -2.85);
  const sDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.1, 20), steelMat);
  sDrum.rotation.z = Math.PI / 2; sDrum.position.set(0, 0.88, -0.45); sDrum.castShadow = true; solarHeater.add(sDrum);
  addBox(solarHeater, 2.15, 0.06, 0.06, 0, 0.88, -0.15, pipeHotMat, false, false);
  for (let ti = -8; ti <= 8; ti++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.38, 8), solarMat);
    tube.position.set(ti * 0.11, 0.48, 0.06);
    tube.rotation.x = 0.62;
    solarHeater.add(tube);
  }
  addBox(solarHeater, 0.07, 0.90, 0.07, -0.88, 0.45, -0.45, darkBronzeMat);
  addBox(solarHeater, 0.07, 0.90, 0.07, 0.88, 0.45, -0.45, darkBronzeMat);
  roofWater.add(solarHeater);

  // 2. Underground 15,000 L Water Storage Vault + 5-STAGE LIVE WATER FILTRATION PLANT & PURIFICATION SIMULATION (Front-Left Service Court!)
  const ugX = -10.85, ugZ = 10.2;
  // Flush ground-level glass-and-steel inspection hatch (cleanly elevated at y=0.052 above driveway 0.040 — zero Z-fighting!)
  addBox(waterSystemGroup, 4.35, 0.08, 3.10, ugX, 0.052, ugZ, darkBronzeMat, false, true);
  addBox(waterSystemGroup, 4.02, 0.05, 2.78, ugX, 0.072, ugZ, atriumGlassMat, false, false);
  addBox(waterSystemGroup, 4.40, 0.03, 3.15, ugX, 0.092, ugZ, goldMat, false, false);

  // Subterranean Concrete Chamber, 15,000 L Pure Tank, 5-Stage Purification Plant & Live SCADA Telemetry Screen!
  const ugChamber = new THREE.Group();
  ugChamber.position.set(ugX, -1.25, ugZ);
  addBox(ugChamber, 4.30, 0.14, 3.05, 0, -0.95, 0, concreteMat, false, true);
  addBox(ugChamber, 4.30, 1.95, 0.14, 0, 0, -1.46, concreteMat, false, false);
  addBox(ugChamber, 0.14, 1.95, 3.05, -2.08, 0, 0, concreteMat, false, false);
  addBox(ugChamber, 0.14, 1.95, 3.05, 2.08, 0, 0, concreteMat, false, false);
  // 15,000 L Crystal-Pure Translucent Water Storage Tank (left bay of vault)
  addBox(ugChamber, 1.72, 1.48, 2.30, -1.08, -0.14, 0, concreteMat, false, false);
  const ugWaterFill = addBox(ugChamber, 1.58, 1.24, 2.16, -1.08, -0.18, 0, waterGlowMat, false, false);
  // 5-Stage Whole-House Water Filtration Skid (1: Vortex Silt, 2: Sand FRP, 3: Activated Carbon, 4: Softener + Brine, 5: UV-C Quartz + RO!)
  const uvQuartzMat = new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x9333ea, emissiveIntensity: 2.2, roughness: 0.15 });
  const rawWaterMat = new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0x92400e, emissiveIntensity: 0.45, transparent: true, opacity: 0.85, roughness: 0.2 });
  const stageSpecs = [
    { x: 0.06, mat: rawWaterMat, r: 0.16, h: 0.96, glass: true },     // Stage 1: Transparent Vortex Silt Strainer
    { x: 0.48, mat: pipeColdMat, r: 0.18, h: 1.20, glass: false },    // Stage 2: Multi-Media Sand Vessel
    { x: 0.90, mat: charcoalMat, r: 0.18, h: 1.20, glass: false },    // Stage 3: Activated Carbon Vessel
    { x: 1.32, mat: steelMat, r: 0.18, h: 1.20, glass: false },       // Stage 4: Hard-Water Ion-Exchange Softener
    { x: 1.74, mat: uvQuartzMat, r: 0.11, h: 1.05, glass: true }      // Stage 5: UV-C 254nm Quartz Sterilizer + RO
  ];
  stageSpecs.forEach((st, idx) => {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(st.r, st.r, st.h, 14), st.mat);
    cyl.position.set(st.x, -0.28, -0.62); ugChamber.add(cyl);
    if (st.glass) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(st.r + 0.04, st.r + 0.04, st.h + 0.06, 14), atriumGlassMat);
      shell.position.set(st.x, -0.28, -0.62); ugChamber.add(shell);
    }
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.15, 10), idx === 4 ? goldMat : darkBronzeMat);
    valve.position.set(st.x, 0.36, -0.62); ugChamber.add(valve);
    if (idx < 4) {
      addBox(ugChamber, 0.38, 0.055, 0.055, st.x + 0.21, 0.36, -0.62, idx === 0 ? pipeRainMat : pipeColdMat, false, false);
    }
  });
  // Brine Salt Tank + Twin Variable-Speed Booster Pumps + Hydropneumatic Pressure Vessel
  const brine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 0.72, 14), whiteMat);
  brine.position.set(1.58, -0.52, 0.56); ugChamber.add(brine);
  for (const px of [0.35, 0.88]) {
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 12), darkBronzeMat);
    pump.rotation.x = Math.PI / 2; pump.position.set(px, -0.66, 0.62); ugChamber.add(pump);
  }
  const pressureSph = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), pipeColdMat);
  pressureSph.position.set(1.24, -0.56, 0.72); ugChamber.add(pressureSph);
  // Mounted Live Digital SCADA Water Quality Control Screen tilted slightly up so it's legible both through glass hatch & X-Ray!
  const scadaScr = addFlatScreen(ugChamber, 1.38, 0.78, 0.88, 0.44, -1.28, 0, liveScreens.waterHud.mat, pipeColdMat);
  scadaScr.rotation.x = -0.35;

  // LIVE 5-STAGE WATER PURIFICATION FLOW SIMULATION (Droplets visibly turn Amber Raw -> Teal -> Cyan -> Violet UV -> Crystal Pure Blue!)
  const filterCurve = new THREE.CurvePath();
  const fPts = [
    new THREE.Vector3(0.06, -0.70, -0.62), new THREE.Vector3(0.06, 0.36, -0.62),
    new THREE.Vector3(0.48, 0.36, -0.62), new THREE.Vector3(0.48, -0.70, -0.62),
    new THREE.Vector3(0.90, -0.70, -0.62), new THREE.Vector3(0.90, 0.36, -0.62),
    new THREE.Vector3(1.32, 0.36, -0.62), new THREE.Vector3(1.32, -0.70, -0.62),
    new THREE.Vector3(1.74, -0.70, -0.62), new THREE.Vector3(1.74, 0.36, -0.62),
    new THREE.Vector3(-0.35, 0.36, -0.62), new THREE.Vector3(-0.85, 0.18, -0.15)
  ];
  for (let i = 0; i < fPts.length - 1; i++) filterCurve.add(new THREE.LineCurve3(fPts[i], fPts[i + 1]));
  const dropGeo = new THREE.SphereGeometry(0.072, 8, 8);
  for (let i = 0; i < 14; i++) {
    const dMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.4, roughness: 0.15 });
    const dm = new THREE.Mesh(dropGeo, dMat);
    ugChamber.add(dm);
    filterSimDrops.push({ mesh: dm, mat: dMat, curve: filterCurve, phase: i / 14 });
  }
  waterSystemGroup.add(ugChamber);

  // 3. COMPLETE WALL-ALIGNED ORTHOGONAL MEP PIPING & VENTILATION SHOWCASE (100% Concealed/Invisible in Standard View; Crisp 90° Wall Elbows in X-Ray!)
  const riserGroup = new THREE.Group();
  const flowBeadGeo = new THREE.SphereGeometry(0.082, 8, 8);
  function addPipePath(pts, mat, rad = 0.056, flowSpeed = 0, targetGrp = riserGroup) {
    // Strict orthogonal wall-aligned CurvePath with tight 0.11m filleted 90° elbows — ZERO curved spline overshoot through walls!
    const vecs = pts.map(p => new THREE.Vector3(...p));
    const path = new THREE.CurvePath();
    const fillet = 0.11;
    let prevEnd = vecs[0];
    for (let i = 1; i < vecs.length - 1; i++) {
      const a = vecs[i - 1], b = vecs[i], c = vecs[i + 1];
      const vIn = new THREE.Vector3().subVectors(a, b);
      const vOut = new THREE.Vector3().subVectors(c, b);
      const lenIn = vIn.length(), lenOut = vOut.length();
      const r = Math.min(fillet, lenIn * 0.35, lenOut * 0.35);
      if (r > 0.005) {
        const p1 = b.clone().addScaledVector(vIn.normalize(), r);
        const p2 = b.clone().addScaledVector(vOut.normalize(), r);
        if (prevEnd.distanceTo(p1) > 0.002) path.add(new THREE.LineCurve3(prevEnd, p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, b, p2));
        prevEnd = p2;
      } else {
        if (prevEnd.distanceTo(b) > 0.002) path.add(new THREE.LineCurve3(prevEnd, b));
        prevEnd = b;
      }
    }
    const last = vecs[vecs.length - 1];
    if (prevEnd.distanceTo(last) > 0.002) path.add(new THREE.LineCurve3(prevEnd, last));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, vecs.length * 14), rad, 10, false), mat);
    targetGrp.add(mesh);
    if (flowSpeed > 0) {
      for (let k = 0; k < 3; k++) {
        const bead = new THREE.Mesh(flowBeadGeo, mat);
        bead.scale.setScalar(rad / 0.054);
        targetGrp.add(bead);
        mepFlowBeads.push({ mesh: bead, curve: path, phase: k / 3, speed: flowSpeed, grp: targetGrp });
      }
    }
    return mesh;
  }

  // A. COLD PRESSURIZED WATER SUPPLY (Blue #32b8f5): UG Pump -> Spiral Chase -> 3,000 L Roof Tanks -> Branches to ALL 8 Baths, Both Kitchens & Laundry!
  addPipePath([
    [ugX + 1.0, -0.78, ugZ - 0.45],
    [ugX + 1.0, -0.78, 0.72],
    [4.35, -0.78, 0.72],
    [4.35, 13.75, 0.72],
    [4.35, 14.08, -3.45],
    [3.22, 14.10, -3.45]
  ], pipeColdMat, 0.068, 0.24);
  // Gravity Cold Down-Header -> Rear Wet Spine -> All Floors (Rooftop Laundry/WC/BBQ, 2F Master/Bath 6, 1F Baths 2/3/4, GF Kitchen/WC/Bath 1)
  addPipePath([[3.22, 13.05, -3.45], [3.22, 10.65, -4.45], [3.22, 0.65, -4.45]], pipeColdMat, 0.054, 0.28);
  addPipePath([[3.22, 10.65, -4.45], [-6.74, 10.65, -4.45], [-6.74, 10.95, -2.28]], pipeColdMat, 0.044, 0.22); // Roof BBQ Sink + Laundry
  addPipePath([[3.22, 7.35, -4.45], [-0.05, 7.35, -4.45], [-0.05, 7.75, -3.75]], pipeColdMat, 0.046, 0.25); // 2F Master Spa + Bath 6
  addPipePath([[6.15, 4.15, -4.45], [-3.95, 4.15, -4.45], [-3.95, 4.55, -3.75]], pipeColdMat, 0.046, 0.25); // 1F Ensuites 2, 3 & 4
  addPipePath([[6.15, 0.78, -4.45], [-0.53, 0.78, -4.45], [-0.53, 0.85, -1.60]], pipeColdMat, 0.046, 0.26); // GF Bath 1, Guest WC & Kitchen Sink

  // B. SOLAR HOT WATER DISTRIBUTION (Copper-Orange #f58842): 500 L Solar Drum -> Spiral Chase -> All 6 Ensuites, Master Tub, GF Kitchen & Laundry!
  addPipePath([
    [-1.35, 13.80, -3.0],
    [4.65, 13.80, -3.0],
    [4.65, 13.45, 0.72],
    [4.65, 1.05, 0.72],
    [3.42, 1.05, -4.25]
  ], pipeHotMat, 0.060, 0.22);
  addPipePath([[4.65, 10.95, -4.25], [3.12, 10.95, -4.25]], pipeHotMat, 0.042, 0.24); // Roof Laundry Washer Hot
  addPipePath([[3.42, 7.62, -4.25], [-0.05, 7.62, -4.25], [-0.05, 7.85, -3.65]], pipeHotMat, 0.044, 0.24); // 2F Master Spa + Bath 6 Hot
  addPipePath([[6.15, 4.35, -4.25], [-3.95, 4.35, -4.25]], pipeHotMat, 0.044, 0.24); // 1F Ensuites 2, 3 & 4 Hot
  addPipePath([[6.15, 1.05, -4.25], [-0.53, 1.05, -4.25], [-0.53, 1.05, -1.60]], pipeHotMat, 0.044, 0.24); // GF Bath 1 & Kitchen Hot

  // C. SANITARY DWV DRAINAGE SOIL STACKS (Violet #9c7cff) -> REAR-LEFT UNDERGROUND BIO-SEPTIC & MUNICIPAL OUTFALL CHAMBER!
  const sepX = -10.25, sepZ = -6.85;
  // Flush inspection manhole cover at rear-left service yard + subterranean bio-septic vault
  addBox(waterSystemGroup, 2.35, 0.08, 1.85, sepX, 0.04, sepZ, darkBronzeMat, false, true);
  addBox(waterSystemGroup, 2.05, 0.05, 1.55, sepX, 0.065, sepZ, steelMat, false, false);
  const septicVault = new THREE.Group();
  septicVault.position.set(sepX, -1.25, sepZ);
  addBox(septicVault, 2.25, 1.75, 1.75, 0, 0, 0, concreteMat, false, false);
  addBox(septicVault, 1.95, 1.12, 1.45, 0, -0.22, 0, pipeDrainMat, false, false);
  waterSystemGroup.add(septicVault);
  waterXrayOnly.push(septicVault);
  // 3 Vertical DWV Soil Stacks (Right Bath 1/4, Central Spiral WC/Bath 6/Laundry, Main Wing Kitchen/Baths 2-3/Master/BBQ) + Roof Vent Cowl!
  addPipePath([[6.15, 6.20, -4.70], [6.15, -0.92, -4.70], [sepX, -0.92, -4.70], [sepX, -0.92, sepZ]], pipeDrainMat, 0.072, 0.20);
  addPipePath([[3.02, 12.95, -4.70], [3.02, -0.92, -4.70]], pipeDrainMat, 0.074, 0.20);
  addPipePath([[-3.15, 11.45, -4.72], [-3.15, -0.92, -4.72]], pipeDrainMat, 0.074, 0.20);
  addPipePath([[-0.05, 7.15, -3.45], [-0.05, 7.15, -4.72], [-3.15, 7.15, -4.72]], pipeDrainMat, 0.052, 0.22); // Master Spa Drain
  addPipePath([[-0.53, 0.35, -1.60], [-0.53, -0.65, -4.72], [-3.15, -0.92, -4.72]], pipeDrainMat, 0.052, 0.22); // GF Kitchen Drain

  // D. RAINWATER HARVESTING & FIRST-FLUSH LEAF FILTER (Emerald Teal #38cc9b): Parapet Scuppers -> First-Flush Diverter -> 15,000 L UG Vault!
  addPipePath([
    [-7.55, 12.68, -4.82],
    [4.95, 12.68, -4.82],
    [4.95, 12.68, 0.72],
    [4.95, -1.05, 0.72],
    [ugX - 0.68, -1.05, 0.72],
    [ugX - 0.68, -1.05, ugZ]
  ], pipeRainMat, 0.060, 0.26);
  addPipePath([[-7.55, 12.68, -4.82], [-7.55, -0.85, -4.82], [ugX - 0.68, -0.85, -4.82], [ugX - 0.68, -1.05, ugZ]], pipeRainMat, 0.054, 0.24);
  const ffDiverter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.35, 14), pipeRainMat);
  ffDiverter.position.set(-7.55, 1.25, -4.82); riserGroup.add(ffDiverter);

  // E. COMPLETE HVAC & MECHANICAL VENTILATION SHOWCASE (Rooftop ERV Unit + Spinning Turbo-Vent + Kitchen Flues + Bath Exhaust Ducts!)
  const ventRoofGroup = new THREE.Group();
  levels.roof.add(ventRoofGroup);
  // 1. Rooftop Fresh-Air ERV / Heat-Recovery HVAC Condenser Unit (seated neatly beside tanks at x=0.65, y=13.05, z=-3.85!)
  addBox(ventRoofGroup, 1.48, 0.86, 0.92, 0.65, 13.38, -3.85, steelMat, true, true);
  addBox(ventRoofGroup, 1.54, 0.08, 0.98, 0.65, 13.84, -3.85, darkBronzeMat, false, false);
  for (const fx of [0.28, 1.02]) {
    const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 18), darkBronzeMat);
    shroud.position.set(fx, 13.38, -3.37); ventRoofGroup.add(shroud);
    const hFan = new THREE.Group();
    hFan.position.set(fx, 13.38, -3.38);
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Mesh(UNIT_BOX, steelMat);
      bl.scale.set(0.38, 0.06, 0.02); bl.rotation.z = k * (Math.PI / 4);
      hFan.add(bl);
    }
    ventRoofGroup.add(hFan);
    spinningFans.push({ obj: hFan, axis: 'z', speed: 7.5 });
  }
  // 2. Spinning Stainless Rotary Roof Turbo-Ventilator (Whirlybird) crowning the Bathroom Exhaust Vent Stack!
  const turboBase = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.65, 14), steelMat);
  turboBase.position.set(4.55, 13.28, -2.25); ventRoofGroup.add(turboBase);
  const turboHead = new THREE.Group();
  turboHead.position.set(4.55, 13.78, -2.25);
  const turboDome = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), steelMat);
  turboDome.scale.set(1, 0.72, 1); turboHead.add(turboDome);
  for (let k = 0; k < 8; k++) {
    const fin = new THREE.Mesh(UNIT_BOX, darkBronzeMat);
    fin.scale.set(0.03, 0.32, 0.14);
    const a = k * Math.PI / 4;
    fin.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
    fin.rotation.y = -a + 0.35;
    turboHead.add(fin);
  }
  ventRoofGroup.add(turboHead);
  spinningFans.push({ obj: turboHead, axis: 'y', speed: 4.2 });
  // 3. Strictly Orthogonal Wall-Aligned Ductwork Trunks (Concealed in MEP Chase & Ceiling Plenums — ZERO naked-eye exposure!)
  addPipePath([[0.65, 13.10, -3.85], [0.65, 12.18, -3.85], [0.65, 12.18, -0.35], [-4.85, 12.18, -0.35], [-4.85, 12.18, 1.55]], ductVentMat, 0.095, 0.18); // Roof Game Room HVAC
  addPipePath([[0.65, 13.10, -3.85], [4.05, 13.10, -3.85], [4.05, 13.10, 0.45], [4.05, 3.16, 0.45], [1.72, 3.16, 0.45], [1.72, 3.16, -2.55], [-4.85, 3.16, -2.55]], ductVentMat, 0.090, 0.19); // Main Fresh-Air ERV Riser -> GF Living
  addPipePath([[4.05, 6.50, 0.45], [1.45, 6.50, 0.45], [1.45, 6.50, 1.65], [-4.50, 6.50, 1.65]], ductVentMat, 0.082, 0.18); // 1F Family/Office HVAC Branch
  addPipePath([[4.05, 9.78, 0.45], [1.45, 9.78, 0.45], [1.45, 9.78, -2.55], [-5.15, 9.78, -2.55]], ductVentMat, 0.082, 0.18); // 2F Master Suite HVAC Branch
  // Bathroom Exhaust Vent Collector -> Spinning Roof Whirlybird (strict 90° orthogonal wall runs!)
  addPipePath([[4.55, 13.28, -2.25], [4.55, 2.75, -2.25], [6.15, 2.75, -2.25], [6.15, 2.75, -3.45]], ductVentMat, 0.072, 0.25);
  addPipePath([[4.55, 6.18, -2.25], [4.55, 6.18, -3.55], [-3.95, 6.18, -3.55]], ductVentMat, 0.066, 0.25); // 1F Baths Exhaust
  addPipePath([[4.55, 9.52, -2.25], [4.55, 9.52, -2.85], [-0.15, 9.52, -2.85]], ductVentMat, 0.066, 0.25); // 2F Master Spa & Bath 6 Exhaust
  // Ground Kitchen Island Chimney Flue -> Wall-Aligned Vertical Stainless Exhaust to Rooftop Rain Cowl!
  addPipePath([[-1.35, 3.22, -1.60], [-1.35, 3.22, -0.45], [1.42, 3.22, -0.45], [1.42, 13.45, -0.45]], ductVentMat, 0.084, 0.26);
  const gfChimneyCap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.36, 12), steelMat);
  gfChimneyCap.position.set(1.42, 13.55, -0.45); ventRoofGroup.add(gfChimneyCap);

  // F. STORMWATER DRAINING & STRAINER LINES (Perimeter Trench Grates, 4 Silt Catch Basins, Kitchen Grease Trap, Rainwater Mesh Pre-Filter, Brass Y-Strainers & Non-Return Outfall!)
  const surfaceDrainsGroup = new THREE.Group();
  waterSystemGroup.add(surfaceDrainsGroup);

  // Helper: Recessed linear concrete drainage channel cleanly above driveway top (y=0.040 -> 0.050, ZERO Z-fighting!)
  function addTrenchDrain(x, z, length, alongZ = false) {
    const g = new THREE.Group();
    g.position.set(x, 0.048, z);
    if (alongZ) g.rotation.y = Math.PI / 2;
    addBox(g, length, 0.036, 0.34, 0, 0, 0, charcoalMat, false, true);
    addBox(g, length, 0.044, 0.04, 0, 0.008, -0.15, steelMat, false, false);
    addBox(g, length, 0.044, 0.04, 0, 0.008, 0.15, steelMat, false, false);
    const bars = Math.max(8, Math.floor(length / 0.24));
    for (let i = 0; i <= bars; i++) {
      const bx = -length / 2 + (i / bars) * length;
      addBox(g, 0.045, 0.022, 0.27, bx, 0.020, 0, steelMat, false, false);
    }
    surfaceDrainsGroup.add(g);
    return g;
  }

  // Helper: Corner Silt & Leaf Catch-Basin Strainer Trap (cleanly above grade at y=0.050 — zero Z-fighting!)
  function addCatchBasin(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.050, z);
    addBox(g, 0.62, 0.05, 0.62, 0, 0, 0, darkBronzeMat, false, true);
    for (let s = -0.22; s <= 0.22; s += 0.11) {
      addBox(g, 0.50, 0.022, 0.035, 0, 0.032, s, steelMat, false, false);
      addBox(g, 0.035, 0.022, 0.50, s, 0.032, 0, steelMat, false, false);
    }
    surfaceDrainsGroup.add(g);
    const pit = new THREE.Group();
    pit.position.set(x, -0.45, z);
    addBox(pit, 0.66, 0.88, 0.66, 0, 0, 0, concreteMat, false, false);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.36, 12), pipeStormMat);
    basket.position.set(0, 0.12, 0); pit.add(basket);
    riserGroup.add(pit);
  }

  // Helper: Inline Brass Y-Strainer Valve Assembly (mesh debris trap on supply/pump/solar/gas headers!)
  function addYStrainer(x, y, z, rotY = 0, parent = riserGroup) {
    const ys = new THREE.Group();
    ys.position.set(x, y, z); ys.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.32, 12), brassMat);
    body.rotation.z = Math.PI / 2; ys.add(body);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.065, 0.24, 12), brassMat);
    leg.position.set(0.04, -0.11, 0); leg.rotation.z = -0.68; ys.add(leg);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.04, 8), goldMat);
    cap.position.set(0.12, -0.20, 0); cap.rotation.z = -0.68; ys.add(cap);
    parent.add(ys); return ys;
  }

  // Helper: Brushed-Stainless Roof / Balcony Dome Leaf-Guard Strainer Scupper
  function addDomeStrainer(parent, x, y, z) {
    const ds = new THREE.Group();
    ds.position.set(x, y, z);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 14), steelMat);
    ds.add(flange);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steelMat);
    dome.position.y = 0.012; ds.add(dome);
    parent.add(ds); return ds;
  }

  // 1. Surface Monsoon Trench Drains (Gate Threshold, Garage Threshold & Full 3-Side Foundation Perimeter Ring cleanly outside extended x=-9.35 left balconies!)
  addTrenchDrain(-0.35, 13.85, 13.8, false); // Front sliding gate driveway threshold trench grate
  addTrenchDrain(-3.05, 5.46, 8.6, false);   // Garage portal threshold drain (keeps 2-car garage dry!)
  addTrenchDrain(-9.95, -0.10, 11.1, true);  // Left perimeter foundation trench drain (clear of extended veranda & balconies!)
  addTrenchDrain(0.15, -5.65, 20.2, false);  // Rear foundation trench drain (ties into Gas Vault curb drain!)
  addTrenchDrain(10.25, -0.10, 11.1, true);  // Right perimeter foundation trench drain
  // 4 Corner Silt & Leaf Catch-Basin Strainers
  [[-9.95, -5.65], [10.25, -5.65], [-9.95, 5.45], [10.25, 5.45]].forEach(([cx, cz]) => addCatchBasin(cx, cz));

  // 2. Rooftop & Balcony Stainless Dome Leaf-Guard Strainers
  addDomeStrainer(levels.roof, -8.85, 10.34, -4.65);  // BBQ & extended left terrace parapet leaf strainer
  addDomeStrainer(levels.roof, 7.45, 10.34, -4.55);   // Laundry monsoon drying deck strainer
  addDomeStrainer(levels.roof, -8.85, 12.80, -0.85);  // Party Shed & extended sky-deck rear dome strainer
  addDomeStrainer(levels.first, -8.85, 3.74, -4.45);  // 1F extended left balcony scupper strainer
  addDomeStrainer(levels.second, -8.85, 7.04, -4.45); // 2F extended left balcony scupper strainer

  // 3. Dedicated Kitchen & BBQ Baffled Stainless Grease Trap / Solids Strainer Chamber (x=-2.2, z=-6.25!)
  const gtX = -2.20, gtZ = -6.25;
  addBox(surfaceDrainsGroup, 1.38, 0.07, 0.96, gtX, 0.04, gtZ, darkBronzeMat, false, true);
  addBox(surfaceDrainsGroup, 1.24, 0.04, 0.82, gtX, 0.068, gtZ, steelMat, false, false);
  addBox(surfaceDrainsGroup, 0.24, 0.03, 0.05, gtX, 0.095, gtZ, goldMat, false, false); // Lift handle
  const greaseTrapBox = new THREE.Group();
  greaseTrapBox.position.set(gtX, -0.68, gtZ);
  addBox(greaseTrapBox, 1.32, 1.05, 0.90, 0, 0, 0, steelMat, false, false);
  addBox(greaseTrapBox, 0.05, 0.72, 0.78, -0.24, 0.06, 0, goldMat, false, false); // Strainer baffle plate 1
  addBox(greaseTrapBox, 0.05, 0.72, 0.78, 0.24, -0.06, 0, goldMat, false, false); // Strainer baffle plate 2
  addBox(greaseTrapBox, 1.12, 0.42, 0.76, 0, -0.22, 0, pipeStormMat, false, false); // Strained greywater chamber
  riserGroup.add(greaseTrapBox);
  // Kitchen Sink & Rooftop BBQ Sink -> Baffled Grease Trap Strainer -> Bio-Septic Outfall!
  addPipePath([[-0.53, 0.35, -1.60], [-0.53, -0.42, -5.15], [gtX + 0.55, -0.52, gtZ]], pipeStormMat, 0.050, 0.25);
  addPipePath([[-6.74, 10.95, -2.28], [-6.74, 10.45, -4.95], [-6.74, -0.45, -4.95], [gtX - 0.55, -0.52, gtZ]], pipeStormMat, 0.046, 0.22);
  addPipePath([[gtX - 0.62, -0.78, gtZ], [sepX + 1.0, -0.92, sepZ]], pipeDrainMat, 0.054, 0.22);

  // 4. Upgraded Rainwater Multi-Stage Vortex Mesh Strainer Pre-Filter (upstream of 15,000 L UG tank!)
  const rwFilter = new THREE.Group();
  rwFilter.position.set(ugX - 0.68, -0.42, ugZ - 1.95);
  const rwGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.92, 16), atriumGlassMat);
  rwFilter.add(rwGlass);
  const rwMeshCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 14, 1, true), steelMat);
  rwMeshCone.rotation.x = Math.PI; rwFilter.add(rwMeshCone);
  const rwCap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.08, 16), pipeRainMat);
  rwCap.position.y = 0.48; rwFilter.add(rwCap);
  riserGroup.add(rwFilter);

  // 5. Four Inline Brass Y-Strainers (Concealed in MEP layer so zero naked-eye clutter!)
  addYStrainer(ugX + 0.65, -0.68, ugZ + 0.35, 0);
  addYStrainer(3.22, 13.05, -3.45, Math.PI / 2, riserGroup);
  addYStrainer(-0.35, 13.65, -2.85, 0, riserGroup);
  addYStrainer(8.42, 1.46, -3.55, 0, riserGroup);

  // 6. Underground Sloped Stormwater Collector Piping Ring -> Front-Right Municipal Outfall & Non-Return Flap Valve!
  const outX = 12.85, outZ = 14.0;
  addBox(surfaceDrainsGroup, 1.35, 0.07, 1.15, outX, 0.04, outZ, darkBronzeMat, false, true);
  addBox(surfaceDrainsGroup, 1.15, 0.05, 0.95, outX, 0.068, outZ, steelMat, false, false);
  const outfallPit = new THREE.Group();
  outfallPit.position.set(outX, -0.95, outZ);
  addBox(outfallPit, 1.25, 1.35, 1.05, 0, 0, 0, concreteMat, false, false);
  addBox(outfallPit, 0.06, 0.34, 0.34, 0.42, -0.20, 0, brassMat, false, false); // Brass Non-Return Backflow Flap Valve!
  riserGroup.add(outfallPit);
  // Sloped Aqua-Cyan Storm Collector Network (Left + Rear + Right Catch Basins + Gas Vault Drain + Garage & Gate Trenches -> Outfall!)
  addPipePath([[-9.95, -0.56, -5.65], [-9.95, -0.68, 5.45], [-9.95, -0.78, 13.85], [outX, -0.98, outZ]], pipeStormMat, 0.078, 0.28);
  addPipePath([[-9.95, -0.56, -5.65], [10.25, -0.62, -5.65], [10.25, -0.74, 5.45], [10.25, -0.88, 13.85], [outX, -0.98, outZ]], pipeStormMat, 0.078, 0.28);
  addPipePath([[-3.05, -0.64, 5.46], [10.25, -0.74, 5.45]], pipeStormMat, 0.064, 0.26); // Garage Threshold Drain -> Right Main
  addPipePath([[8.95, -0.32, -3.25], [10.25, -0.62, -3.25]], pipeStormMat, 0.052, 0.24); // Gas Vault French-Drain -> Storm Ring!

  waterSystemGroup.add(riserGroup);
  waterXrayOnly.push(riserGroup);

  // 4. WATERPROOF LOCKABLE DUAL-LPG GAS CYLINDER VAULT + SAFETY-YELLOW PIPED CONNECTIONS TO ALL KITCHENS!
  const lpgBay = new THREE.Group();
  lpgBay.position.set(8.95, 0.0, -3.25);
  // Zero-Water-Damage Elevated 24 cm Concrete Plinth + Perimeter Drainage Gravel Apron + Perforated Steel Grate Floor!
  addBox(lpgBay, 2.05, 0.06, 1.48, 0, 0.03, 0, stoneWallMat, false, true); // Gravel French-drain surround
  addBox(lpgBay, 1.66, 0.24, 1.08, 0, 0.12, 0, concreteMat, true, true); // 24 cm raised monsoon-proof plinth!
  addBox(lpgBay, 1.44, 0.04, 0.88, 0, 0.26, 0, steelMat, false, true); // Perforated elevated drain grate
  // Sealed Back & Left/Right Galvanized Steel Cabinet Enclosure with EPDM Silicone Wall Flashing
  addBox(lpgBay, 1.56, 1.54, 0.08, 0, 1.01, -0.46, darkBronzeMat, true, true); // Sealed rear waterproof wall
  addBox(lpgBay, 1.62, 0.08, 0.10, 0, 1.80, -0.48, charcoalMat, false, false); // EPDM silicone rain flashing strip
  for (const sx of [-0.74, 0.74]) {
    addBox(lpgBay, 0.06, 1.54, 0.94, sx, 1.01, 0, darkBronzeMat, true, false);
    // Downward-angled 35° rain-baffle cross-ventilation louvers (air flows, monsoon rain bounces out!)
    for (const lyL of [0.46, 0.62, 1.38, 1.54]) {
      const lvr = addBox(lpgBay, 0.10, 0.04, 0.62, sx + (sx > 0 ? 0.02 : -0.02), lyL, 0, steelMat, false, false);
      lvr.rotation.z = sx > 0 ? -0.58 : 0.58;
    }
  }
  // Sloped Overhanging Monsoon Rain-Hood Roof (-12° outward shed + front gutter drip lip!)
  const gasRoof = addBox(lpgBay, 1.78, 0.09, 1.28, 0, 1.84, 0.06, darkBronzeMat, true, true);
  gasRoof.rotation.x = 0.14;
  addBox(lpgBay, 1.80, 0.06, 0.06, 0, 1.74, 0.68, goldMat, false, false); // Front rain drip-edge flashing
  // Security Header with Live Red (LOCKED) / Green (UNLOCKED) Status Indicator LED!
  addBox(lpgBay, 1.46, 0.14, 0.07, 0, 1.72, 0.46, charcoalMat, false, false);
  const gasStatusLed = addBox(lpgBay, 0.14, 0.06, 0.08, 0.54, 1.72, 0.48, gasLockLedMat, false, false);
  addBox(lpgBay, 0.42, 0.08, 0.03, -0.35, 1.72, 0.50, pipeGasMat, false, false); // Yellow LPG Safety Plaque

  // Twin 14.2 kg Red LPG Cylinders (Primary + Reserve) + Steel Restraint Bar + Auto-Changeover Dual Regulator + Gauge + Emergency Valve!
  for (const cx of [-0.34, 0.34]) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.78, 16), lpgRedMat);
    cyl.position.set(cx, 0.67, -0.04); cyl.castShadow = true; lpgBay.add(cyl);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lpgRedMat);
    dome.position.set(cx, 1.06, -0.04); lpgBay.add(dome);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 12), lpgRedMat);
    collar.position.set(cx, 1.24, -0.04); lpgBay.add(collar);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.10, 10), brassMat);
    valve.position.set(cx, 1.32, -0.04); lpgBay.add(valve);
  }
  addBox(lpgBay, 1.34, 0.04, 0.04, 0, 0.86, 0.18, steelMat, false, false); // Anti-tip safety restraint bar
  // Wall-mounted Auto-Changeover Manifold Regulator + Pressure Gauge + Braided Copper Pigtails + Yellow Shutoff Valve!
  addBox(lpgBay, 0.36, 0.22, 0.12, 0, 1.46, -0.36, brassMat, false, false);
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), whiteMat);
  gauge.rotation.x = Math.PI / 2; gauge.position.set(0, 1.56, -0.29); lpgBay.add(gauge);
  addBox(lpgBay, 0.72, 0.035, 0.035, 0, 1.42, -0.18, pipeGasMat, false, false); // Manifold header bar
  addBox(lpgBay, 0.14, 0.04, 0.04, -0.48, 1.46, -0.32, lpgRedMat, false, false); // Emergency shutoff handle

  // INTERACTIVE LOCKING HINGED VENTILATED STEEL SECURITY DOOR + ANIMATED BRASS PADLOCK & SLIDING DEADBOLT!
  const gasDoorPivot = new THREE.Group();
  gasDoorPivot.position.set(-0.71, 0.28, 0.46); // Hinged on left steel post
  lpgBay.add(gasDoorPivot);
  // Door frame + waterproof perimeter gasket + ventilated steel louver slats + viewing mesh window
  addBox(gasDoorPivot, 1.42, 0.07, 0.05, 0.71, 1.33, 0, darkBronzeMat, true, false);
  addBox(gasDoorPivot, 1.42, 0.07, 0.05, 0.71, 0.04, 0, darkBronzeMat, true, false);
  addBox(gasDoorPivot, 0.07, 1.36, 0.05, 0.035, 0.68, 0, darkBronzeMat, true, false);
  addBox(gasDoorPivot, 0.07, 1.36, 0.05, 1.385, 0.68, 0, darkBronzeMat, true, false);
  addBox(gasDoorPivot, 1.28, 0.62, 0.025, 0.71, 0.96, 0, railGlassMat, false, false); // Upper safety inspection window
  for (let slatY = 0.14; slatY <= 0.60; slatY += 0.11) {
    const ds = addBox(gasDoorPivot, 1.28, 0.055, 0.04, 0.71, slatY, 0.01, steelMat, false, false);
    ds.rotation.x = 0.48; // Rain-shedding lower ventilation slats!
  }
  addBox(gasDoorPivot, 0.04, 0.30, 0.07, 1.24, 0.72, 0.05, goldMat, false, false); // Door pull handle
  // Animated Sliding Deadbolt + Keyed Brass Padlock Assembly!
  const gasLockBolt = addBox(gasDoorPivot, 0.16, 0.05, 0.05, 1.36, 0.72, 0.04, steelMat, false, false);
  const gasPadlock = new THREE.Group();
  gasPadlock.position.set(1.36, 0.62, 0.07);
  addBox(gasPadlock, 0.11, 0.12, 0.055, 0, 0, 0, brassMat, false, false);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 6, 12, Math.PI), steelMat);
  shackle.position.set(0, 0.06, 0); gasPadlock.add(shackle);
  gasDoorPivot.add(gasPadlock);

  function updateGasVault(openFrac) {
    // 0..0.30: padlock drops & deadbolt retracts + LED flips Red -> Green; 0.30..1.0: door swings smoothly open 108°!
    const lockT = Math.min(1, openFrac / 0.30);
    const doorT = Math.max(0, (openFrac - 0.25) / 0.75);
    gasLockBolt.position.x = 1.36 - lockT * 0.12;
    gasPadlock.position.y = 0.62 - lockT * 0.09;
    gasPadlock.rotation.z = lockT * 0.45;
    gasDoorPivot.rotation.y = -doorT * (Math.PI * 0.60);
    const unlocked = openFrac > 0.18;
    gasLockLedMat.color.setHex(unlocked ? 0x10b981 : 0xef4444);
    gasLockLedMat.emissive.setHex(unlocked ? 0x10b981 : 0xef4444);
  }
  levels.ground.add(lpgBay);

  // SAFETY-YELLOW WALL-ALIGNED CONCEALED LPG SUPPLY LINES TO ALL KITCHENS (100% Invisible to Naked Eye in Standard View; Illuminated in MEP X-Ray & Gas Vault View!)
  const gasPipesGroup = new THREE.Group();
  waterSystemGroup.add(gasPipesGroup);
  waterXrayOnly.push(gasPipesGroup);
  // Waterproof Drip-Loop Exit from Gas Vault -> Concealed Inside Rear Structural Wall Chase (z = -4.88, strict 90° orthogonal runs!)
  addPipePath([
    [8.42, 1.46, -3.55],
    [8.12, 1.46, -3.55],
    [8.12, 1.20, -3.55], // Downward waterproof drip-loop prevents rainwater tracking into pipe sleeve!
    [7.78, 1.20, -3.55],
    [7.78, 1.20, -4.88],
    [1.76, 1.20, -4.88],
    [-7.42, 1.20, -4.88]
  ], pipeGasMat, 0.042, 0.26, gasPipesGroup);
  // Branch 1 -> Ground Floor Main Kitchen (strict 90° concealed wall chase -> under-slab copper sleeve -> 4-burner gas hob!)
  addPipePath([
    [1.76, 1.20, -4.88],
    [1.76, 0.84, -4.88],
    [1.76, 0.84, -0.46],
    [-0.25, 0.84, -0.46],
    [-0.25, 0.16, -0.46],
    [-1.35, 0.16, -0.46],
    [-1.35, 0.16, -1.60],
    [-1.35, 1.15, -1.60]
  ], pipeGasMat, 0.038, 0.28, gasPipesGroup);
  // Branch 2 -> Rooftop BBQ & Outdoor Chef Kitchen (concealed inside left rear corner wall column x=-7.42, z=-4.88 -> BBQ shutoff valve -> 4-burner grill!)
  addPipePath([
    [-7.42, 1.20, -4.88],
    [-7.42, 10.95, -4.88],
    [-7.12, 10.95, -4.88],
    [-7.12, 10.95, -4.12],
    [-7.12, 10.95, -3.55],
    [-6.74, 10.95, -3.55]
  ], pipeGasMat, 0.040, 0.26, gasPipesGroup);
  // Concealed Wall-Chase Steel Anchor Clamps (visible in X-Ray!)
  for (const rx of [6.2, 3.2, -0.5, -4.2, -7.0]) addBox(gasPipesGroup, 0.08, 0.10, 0.10, rx, 1.20, -4.88, steelMat, false, false);
  for (const ry of [2.8, 5.2, 7.6, 9.8]) addBox(gasPipesGroup, 0.10, 0.08, 0.10, -7.42, ry, -4.88, steelMat, false, false);
  // Automatic Seismic LPG Shutoff Accelerometer Valve mounted directly on Gas Vault manifold (cuts gas at >0.15g tremor!)
  addBox(lpgBay, 0.16, 0.16, 0.10, 0.42, 1.46, -0.34, new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x9a3412, emissiveIntensity: 0.45, roughness: 0.3 }), false, false);

  /* === DEEP RCC FOUNDATION + MULTI-HAZARD DISASTER SAFETY (EARTHQUAKE NBC-105 · MONSOON FLOOD · THUNDERSTORM IEC-62305) === */
  const safetySystemGroup = new THREE.Group();
  scene.add(safetySystemGroup);
  const structuralXrayOnly = [];
  const lightningFlowBeads = [];

  const rccFoundationMat = new THREE.MeshStandardMaterial({ color: 0x8b98a6, roughness: 0.84, metalness: 0.08 });
  const dpmWaterproofMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, emissive: 0x0c2440, emissiveIntensity: 0.35, roughness: 0.42, metalness: 0.15 });
  const seismicIsolatorMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xc2410c, emissiveIntensity: 0.72, roughness: 0.32, metalness: 0.25 });
  const rebarCoreMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.65, roughness: 0.34, metalness: 0.62 });
  const copperEarthMat = new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0x92400e, emissiveIntensity: 0.68, roughness: 0.26, metalness: 0.85 });
  const floodAlumMat = new THREE.MeshStandardMaterial({ color: 0xd5dee6, roughness: 0.24, metalness: 0.82 });
  const floodHazardMat = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x854d0e, emissiveIntensity: 0.45, roughness: 0.35 });
  const earthPitGreenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.52, metalness: 0.15 });

  // 1. DEEP RCC PILE-RAFT FOUNDATION, DPM WATERPROOF MEMBRANE & 16 LEAD-RUBBER SEISMIC BASE ISOLATORS (Subterranean X-Ray!)
  const foundationGrp = new THREE.Group();
  safetySystemGroup.add(foundationGrp);
  structuralXrayOnly.push(foundationGrp);

  // Continuous M30 Crystalline Waterproof RCC Raft / Mat Slab + Bituminous/HDPE Damp-Proof Membrane (DPM) extending beneath Left Veranda Colonnade!
  addBox(foundationGrp, 19.2, 0.50, 11.4, 0.05, -0.78, 0.25, rccFoundationMat, false, true);
  addBox(foundationGrp, 19.4, 0.08, 11.6, 0.05, -1.06, 0.25, dpmWaterproofMat, false, false);
  // Interconnected Seismic Plinth Tie-Beams locking every structural column base into a rigid horizontal diaphragm
  for (const bz of [-4.6, -0.4, 2.6, 4.8]) {
    addBox(foundationGrp, 17.8, 0.34, 0.34, -0.25, -0.16, bz, rccFoundationMat, false, false);
  }
  for (const bx of [-9.15, -7.4, -2.4, 2.0, 6.4, 8.4]) {
    addBox(foundationGrp, 0.34, 0.34, 9.8, bx, -0.16, 0.15, rccFoundationMat, false, false);
  }

  // 16 Deep Bored Cast-in-Situ RCC Friction Piles (Ø 0.56 m, 3.85 m deep) + 16 Lead-Rubber Seismic Base Isolator Bearings (NBC-105 Zone V)!
  const pileGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.95, 14);
  const pileCapGeo = new THREE.BoxGeometry(0.92, 0.34, 0.92);
  const isoCoreGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.26, 16);
  const isoShimGeo = new THREE.TorusGeometry(0.275, 0.018, 6, 16);
  const pileCoords = [
    [-7.4, -4.6], [-2.4, -4.6], [2.0, -4.6], [6.4, -4.6],
    [-7.4, -0.4], [-2.4, -0.4], [2.0, -0.4], [8.4, -0.4],
    [-7.4,  4.8], [-2.4,  4.8], [1.6,  4.8], [8.4,  2.2],
    [ 3.1,  2.4], [ 6.2,  2.4], [3.1,  5.4], [6.2,  5.4]
  ];
  pileCoords.forEach(([px, pz]) => {
    const pile = new THREE.Mesh(pileGeo, rccFoundationMat);
    pile.position.set(px, -2.52, pz);
    foundationGrp.add(pile);
    // Subtle helical ductile steel reinforcement ring bands along friction pile
    for (const ry of [-3.55, -2.85, -2.15, -1.45]) {
      const ring = new THREE.Mesh(isoShimGeo, rebarCoreMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, ry, pz);
      foundationGrp.add(ring);
    }
    const cap = new THREE.Mesh(pileCapGeo, rccFoundationMat);
    cap.position.set(px, -0.82, pz);
    foundationGrp.add(cap);
    // Lead-Rubber Seismic Base Isolator Bearing (top/bottom steel plates + safety-orange elastomeric shear core!)
    addBox(foundationGrp, 0.70, 0.05, 0.70, px, -0.49, pz, darkBronzeMat, false, false);
    const core = new THREE.Mesh(isoCoreGeo, seismicIsolatorMat);
    core.position.set(px, -0.34, pz);
    foundationGrp.add(core);
    for (const sy of [-0.40, -0.34, -0.28]) {
      const sh = new THREE.Mesh(isoShimGeo, steelMat);
      sh.rotation.x = Math.PI / 2;
      sh.position.set(px, sy, pz);
      foundationGrp.add(sh);
    }
    addBox(foundationGrp, 0.70, 0.05, 0.70, px, -0.19, pz, darkBronzeMat, false, false);
  });

  // 2. DUCTILE RCC SHEAR-WALL CORE, CORNER SEISMIC COLUMNS & X-BRACED VISCOUS DAMPERS (Structural X-Ray!)
  const shearCoreGrp = new THREE.Group();
  safetySystemGroup.add(shearCoreGrp);
  structuralXrayOnly.push(shearCoreGrp);
  // 4 Vertical ductile steel rebar shafts inside spiral MEP shear core (x=3.85..5.45, z=0.15..1.15, y=0..13.4)
  for (const [rx, rz] of [[3.85, 0.15], [5.45, 0.15], [3.85, 1.15], [5.45, 1.15]]) {
    addBox(shearCoreGrp, 0.09, 13.5, 0.09, rx, 6.75, rz, rebarCoreMat, false, false);
  }
  // Horizontal seismic confinement stirrup hoops every 1.1 m
  for (let sy = 0.55; sy <= 13.0; sy += 1.1) {
    addBox(shearCoreGrp, 1.66, 0.05, 0.05, 4.65, sy, 0.15, rebarCoreMat, false, false);
    addBox(shearCoreGrp, 1.66, 0.05, 0.05, 4.65, sy, 1.15, rebarCoreMat, false, false);
    addBox(shearCoreGrp, 0.05, 0.05, 1.06, 3.85, sy, 0.65, rebarCoreMat, false, false);
    addBox(shearCoreGrp, 0.05, 0.05, 1.06, 5.45, sy, 0.65, rebarCoreMat, false, false);
  }
  // X-Braced Hydraulic Viscous Seismic Dampers across all 4 floor heights inside shear core
  for (const by of [0.35, 3.65, 6.95, 10.20]) {
    const d1 = addBox(shearCoreGrp, 0.075, 3.45, 0.075, 4.65, by + 1.55, 0.65, seismicIsolatorMat, false, false);
    d1.rotation.z = 0.48;
    const d2 = addBox(shearCoreGrp, 0.075, 3.45, 0.075, 4.65, by + 1.55, 0.65, seismicIsolatorMat, false, false);
    d2.rotation.z = -0.48;
  }
  // Corner Ductile RCC Moment-Frame Column Cages (tying isolators to roof slab!)
  for (const [cx, cz, ch] of [[-7.4, -4.6, 10.3], [-7.4, 4.8, 10.3], [1.6, 4.8, 10.3], [6.4, -4.6, 10.3], [8.4, -0.4, 7.0]]) {
    addBox(shearCoreGrp, 0.16, ch, 0.16, cx, ch / 2, cz, rebarCoreMat, false, false);
  }
  // Twin Submersible Automatic Dewatering Sump Pumps + Float Alarm inside front-right storm outfall sump (x=12.85, z=14.0)
  for (const dx of [-0.26, 0.22]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.44, 12), seismicIsolatorMat);
    sp.position.set(12.85 + dx, -1.12, 14.0);
    shearCoreGrp.add(sp);
    addBox(shearCoreGrp, 0.06, 0.65, 0.06, 12.85 + dx, -0.62, 14.0, pipeStormMat, false, false);
  }

  // 3. MONSOON FLOOD SAFETY: INTERACTIVE DEPLOYABLE HYDRAULIC ALUMINUM FLOOD-GATE BARRIERS (Street Gate & 2-Car Garage!)
  const floodBarrierGroup = new THREE.Group();
  safetySystemGroup.add(floodBarrierGroup);
  function buildFloodBarrier(cx, cz, width, height) {
    const wrap = new THREE.Group();
    wrap.position.set(cx, 0, cz);
    // Permanent flush brushed-stainless floor slot + twin heavy EPDM side compression stanchions (clean architectural look when stowed!)
    addBox(wrap, width + 0.24, 0.045, 0.18, 0, 0.046, 0, steelMat, false, true);
    for (const sx of [-width / 2 - 0.08, width / 2 + 0.08]) {
      addBox(wrap, 0.12, height + 0.10, 0.18, sx, (height + 0.10) / 2, 0, darkBronzeMat, true, false);
      addBox(wrap, 0.05, height + 0.08, 0.05, sx, (height + 0.08) / 2, 0.08, floodHazardMat, false, false);
    }
    // Moving Extruded Marine-Aluminum Stop-Log Flood Wall with EPDM rubber seals & safety-yellow warning cap!
    const wall = new THREE.Group();
    const planks = Math.max(4, Math.round(height / 0.20));
    const plankH = height / planks;
    for (let i = 0; i < planks; i++) {
      const py = plankH * (i + 0.5);
      addBox(wall, width, plankH - 0.018, 0.09, 0, py, 0, floodAlumMat, true, true);
      addBox(wall, width, 0.018, 0.098, 0, py + plankH / 2 - 0.008, 0, charcoalMat, false, false);
    }
    // High-visibility safety-yellow hazard top rail + vertical reinforcement ribs
    addBox(wall, width + 0.04, 0.07, 0.11, 0, height + 0.03, 0, floodHazardMat, false, false);
    const ribs = Math.max(3, Math.floor(width / 2.6));
    for (let r = 1; r < ribs; r++) {
      const rx = -width / 2 + (r / ribs) * width;
      addBox(wall, 0.07, height, 0.13, rx, height / 2, 0, steelMat, false, false);
    }
    wrap.add(wall);
    floodBarrierGroup.add(wrap);
    return { wall, height };
  }
  const streetFloodBarrier = buildFloodBarrier(-0.50, 14.18, 16.50, 1.12); // Shields main street entrance cleanly behind sliding gate
  const garageFloodBarrier = buildFloodBarrier(-3.20, 5.26, 7.65, 0.92);   // Shields Rolls-Royce & Mercedes-Benz garage portal!

  function updateFloodBarriers(deployFrac) {
    [streetFloodBarrier, garageFloodBarrier].forEach(({ wall, height }) => {
      wall.visible = deployFrac > 0.015;
      wall.position.y = -height + deployFrac * (height + 0.045);
      wall.scale.y = Math.max(0.02, deployFrac);
    });
  }

  // 4. THUNDERSTORM & LIGHTNING PROTECTION (IEC 62305 LEVEL I): DISCREET REAR ESE MAST + COPPER FARADAY RING + 3 DEEP COPPER EARTH PITS!
  const lightningPermGrp = new THREE.Group();
  safetySystemGroup.add(lightningPermGrp);
  // Sleek Low-Profile Brushed-Stainless ESE (Early Streamer Emission) Lightning Mast tucked cleanly behind the crown on rear MEP parapet (x=4.65, z=0.55)!
  const eseX = 4.65, eseZ = 0.55;
  addBox(lightningPermGrp, 0.34, 0.14, 0.34, eseX, 13.84, eseZ, darkBronzeMat, false, false); // Anchor baseplate on rear MEP shaft top
  const eseMast = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.042, 3.15, 12), steelMat);
  eseMast.position.set(eseX, 15.46, eseZ); lightningPermGrp.add(eseMast);
  // Aerodynamic brushed-stainless ESE ionizer bell + slim tungsten finial tip (modern architectural profile, hidden behind crown from front hero view!)
  const eseBell = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.26, 16), steelMat);
  eseBell.position.set(eseX, 17.08, eseZ); lightningPermGrp.add(eseBell);
  const eseRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 20), copperEarthMat);
  eseRing.rotation.x = Math.PI / 2; eseRing.position.set(eseX, 17.02, eseZ); lightningPermGrp.add(eseRing);
  const eseTip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.28, 10), steelMat);
  eseTip.position.set(eseX, 17.34, eseZ); lightningPermGrp.add(eseTip);

  // Discreet Roof Perimeter Copper Faraday Air-Termination Ring (bonds Party Shed steel truss, Solar PV frames & 3,000 L tanks!)
  const faradayY = 12.88;
  addBox(lightningPermGrp, 15.1, 0.024, 0.024, 0.15, faradayY, -4.85, copperEarthMat, false, false);
  addBox(lightningPermGrp, 0.024, 0.024, 9.6, -7.40, faradayY, -0.05, copperEarthMat, false, false);
  addBox(lightningPermGrp, 0.024, 0.024, 5.4, 7.70, faradayY, -2.15, copperEarthMat, false, false);
  addBox(lightningPermGrp, 3.05, 0.024, 0.024, 6.18, faradayY, 0.55, copperEarthMat, false, false);

  // Three Flush Green Composite Earth-Pit Inspection Hatches cleanly at grade (y = 0.046)
  const earthPitCoords = [[-12.2, 8.2], [11.8, -6.4], [-11.8, -4.4]];
  earthPitCoords.forEach(([ex, ez]) => {
    addBox(lightningPermGrp, 0.44, 0.04, 0.44, ex, 0.046, ez, darkBronzeMat, false, true);
    addBox(lightningPermGrp, 0.36, 0.03, 0.36, ex, 0.058, ez, earthPitGreenMat, false, false);
    addBox(lightningPermGrp, 0.06, 0.04, 0.06, ex, 0.072, ez, copperEarthMat, false, false);
  });

  // Concealed Copper Down-Conductors, Whole-Home Type-1+2 SPD Surge Panel & 3 Deep Underground Copper Earth Electrodes (Structural X-Ray!)
  const lightningXrayGrp = new THREE.Group();
  safetySystemGroup.add(lightningXrayGrp);
  structuralXrayOnly.push(lightningXrayGrp);
  function addLightningPath(pts) {
    const vecs = pts.map(p => new THREE.Vector3(...p));
    const path = new THREE.CurvePath();
    for (let i = 0; i < vecs.length - 1; i++) path.add(new THREE.LineCurve3(vecs[i], vecs[i + 1]));
    lightningXrayGrp.add(new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(20, vecs.length * 10), 0.042, 8, false), copperEarthMat));
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(flowBeadGeo, copperEarthMat);
      b.scale.setScalar(0.92);
      lightningXrayGrp.add(b);
      lightningFlowBeads.push({ mesh: b, curve: path, phase: k / 3, speed: 0.34, grp: lightningXrayGrp });
    }
  }
  // Down-Conductor 1: ESE Mast -> Rear MEP Chase -> SPD Surge Panel -> Rear-Right Earth Pit [11.8, -6.4]
  addLightningPath([[eseX, 15.8, eseZ], [eseX, 12.88, eseZ], [eseX, -0.55, eseZ], [11.8, -0.55, eseZ], [11.8, -0.55, -6.4], [11.8, -3.25, -6.4]]);
  // Down-Conductor 2: Roof Faraday Ring -> Rear-Left Corner -> Rear-Left Earth Pit [-11.8, -4.4]
  addLightningPath([[-7.40, faradayY, -4.85], [-7.40, -0.55, -4.85], [-11.8, -0.55, -4.4], [-11.8, -3.25, -4.4]]);
  // Down-Conductor 3: Roof Faraday Ring -> Front-Left Corner -> Front-Left Earth Pit [-12.2, 8.2] + Interconnecting Grounding Ring!
  addLightningPath([[-7.40, faradayY, 4.75], [-7.40, -0.55, 4.75], [-12.2, -0.55, 8.2], [-12.2, -3.25, 8.2]]);
  addLightningPath([[-12.2, -0.65, 8.2], [-11.8, -0.65, -4.4], [11.8, -0.65, -6.4]]); // Buried Copper Equipotential Grounding Ring!
  // Deep 3.2 m Copper Grounding Rods + Charcoal/Bentonite Earth Pit Cylinders
  const rodGeo = new THREE.CylinderGeometry(0.048, 0.036, 3.25, 10);
  const pitGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.65, 12);
  earthPitCoords.forEach(([ex, ez]) => {
    const ePit = new THREE.Mesh(pitGeo, earthPitGreenMat);
    ePit.position.set(ex, -0.35, ez); lightningXrayGrp.add(ePit);
    const eRod = new THREE.Mesh(rodGeo, copperEarthMat);
    eRod.position.set(ex, -1.68, ez); lightningXrayGrp.add(eRod);
  });
  // Whole-Home Type-1+2 SPD Surge Protection Panel inside Ground MEP Chase
  addBox(lightningXrayGrp, 0.54, 0.68, 0.16, 3.85, 1.68, 0.55, darkBronzeMat, false, false);
  addBox(lightningXrayGrp, 0.42, 0.14, 0.18, 3.85, 1.84, 0.55, copperEarthMat, false, false);
  addBox(lightningXrayGrp, 0.10, 0.08, 0.19, 3.98, 1.56, 0.55, gasSensorLedMat, false, false);

  /* === CENTERPIECE: MONUMENTAL GLASS SPIRAL STAIRCASE ATRIUM + DETAILED BACK CORE & LANDINGS === */
  const tower = new THREE.Group();
  villaRoot.add(tower);

  // Atrium circular base landing slab (connects smoothly to arrival stairs)
  const atriumBase = new THREE.Mesh(new THREE.CylinderGeometry(ATRIUM_R + 0.18, ATRIUM_R + 0.22, 1.04, 48), whiteMat);
  atriumBase.position.set(CX, 0.52, CZ);
  atriumBase.receiveShadow = true;
  tower.add(atriumBase);

  // Sculptural Twin Solid White Curved Framing Piers (left & right vertical columns framing the glass cylinder!)
  const rightPier = new THREE.Mesh(
    new THREE.CylinderGeometry(ATRIUM_R + 0.24, ATRIUM_R + 0.24, 14.3, 28, 1, false, Math.PI * 0.29, Math.PI * 0.32),
    whiteMat
  );
  rightPier.position.set(CX, 7.15, CZ);
  rightPier.castShadow = true;
  tower.add(rightPier);
  // Left sleek white vertical pier separating balconies from glass atrium
  addBox(tower, 0.50, 14.3, 1.25, CX - ATRIUM_R - 0.02, 7.15, CZ + 0.35, whiteMat);

  /* === BACK SIDE OF THE SPIRAL STAIRCASE: MULTI-LEVEL CIRCULATION BRIDGES, PORTAL DOORWAYS & MEP SERVICE SPINE === */
  const spiralBackCore = new THREE.Group();
  tower.add(spiralBackCore);

  // 1. Backlit Fluted Walnut & Travertine Architectural Spine cleanly BEHIND the rear circulation walkway (z = 0.86, x = 3.02..6.28 — ZERO overlap with left x=1.55 or right x=6.45 doorways!)
  addBox(spiralBackCore, 3.26, 13.4, 0.20, CX, 7.15, 0.86, warmWallMat, false, true);
  for (let fx = CX - 1.44; fx <= CX + 1.44; fx += 0.24) {
    addBox(spiralBackCore, 0.085, 13.1, 0.09, fx, 7.15, 0.98, walnutMat, false, false);
  }
  // Twin vertical warm golden recessed cove light grooves framing the fluted back spine
  for (const gx of [CX - 1.56, CX + 1.56]) {
    addBox(spiralBackCore, 0.055, 12.9, 0.055, gx, 7.15, 0.99, warmLedMat, false, false);
  }

  // 2. Four Floor-Flush Cantilevered Circulation Bridges + Precision-Cut Curved Atrium Balcony Landings + PROPERLY FRAMED DOORWAYS & SAFETY DOORS!
  // Every floor deck top matches the main wing & right pavilion slabs to the millimeter (GF 1.04, 1F 3.74, 2F 6.99, Roof 10.24)!
  const stairInnerR = 1.02, stairOuterR = 2.42;
  const deckTops = [1.04, 3.74, 6.99, 10.24];

  // Helper: Extruded Curved Annular Mezzanine Balcony Deck + Smoothly Fitted Curved Glass & Champagne-Gold Atrium Balustrade!
  function addCurvedBalconySector(parent, topY, aStart, aEnd, thick = 0.24, rIn = stairInnerR, rOut = ATRIUM_R - 0.04, withRail = true, withLed = true) {
    const segs = 28;
    const sh = new THREE.Shape();
    for (let i = 0; i <= segs; i++) {
      const a = aStart + (i / segs) * (aEnd - aStart);
      const x = CX + Math.cos(a) * rOut, z = CZ + Math.sin(a) * rOut;
      if (i === 0) sh.moveTo(x, z); else sh.lineTo(x, z);
    }
    for (let i = segs; i >= 0; i--) {
      const a = aStart + (i / segs) * (aEnd - aStart);
      sh.lineTo(CX + Math.cos(a) * rIn, CZ + Math.sin(a) * rIn);
    }
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 24 });
    const mesh = new THREE.Mesh(geo, whiteMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = topY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    // Sleek inlaid marble walking surface flush on top of the curved balcony deck
    const topGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: false, curveSegments: 24 });
    const topMesh = new THREE.Mesh(topGeo, marbleMat);
    topMesh.rotation.x = Math.PI / 2;
    topMesh.position.y = topY + 0.012;
    topMesh.receiveShadow = true;
    parent.add(topMesh);

    // Warm recessed golden LED cove tucked beneath the inner curved balcony edge overlooking the chandelier void!
    if (withLed) {
      const ledPts = [];
      for (let i = 0; i <= 20; i++) {
        const a = aStart + (i / 20) * (aEnd - aStart);
        ledPts.push(new THREE.Vector3(CX + Math.cos(a) * (rIn + 0.05), topY - thick - 0.02, CZ + Math.sin(a) * (rIn + 0.05)));
      }
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ledPts), 28, 0.026, 8, false), warmLedMat));
    }

    // Curved Frameless Tempered-Glass Balcony Guardrail + Smoothly Fitted Champagne-Gold Top/Mid Rails & Inner Posts (ZERO outer walkway posts!)
    if (withRail) {
      const railSegs = 14;
      const rPts = [];
      const midPts = [];
      for (let i = 0; i <= railSegs; i++) {
        const a = aStart + (i / railSegs) * (aEnd - aStart);
        const px = CX + Math.cos(a) * rIn, pz = CZ + Math.sin(a) * rIn;
        rPts.push(new THREE.Vector3(px, topY + 0.94, pz));
        midPts.push(new THREE.Vector3(px, topY + 0.47, pz));
        if (i < railSegs) {
          const aNext = aStart + ((i + 1) / railSegs) * (aEnd - aStart);
          const nx = CX + Math.cos(aNext) * rIn, nz = CZ + Math.sin(aNext) * rIn;
          const dx = nx - px, dz = nz - pz;
          const pane = addBox(parent, Math.hypot(dx, dz) + 0.010, 0.88, 0.034, (px + nx) / 2, topY + 0.48, (pz + nz) / 2, railGlassMat, false, false);
          pane.rotation.y = -Math.atan2(dz, dx);
        }
        // Single clean post at corner junctions & intermediate spacing (strictly seated flush between deck top & handrail!)
        if (i === 0 || i === railSegs || i % 4 === 0) {
          const isEnd = (i === 0 || i === railSegs);
          addBox(parent, isEnd ? 0.044 : 0.022, 0.92, isEnd ? 0.044 : 0.022, px, topY + 0.47, pz, goldMat, false, false);
        }
      }
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rPts), 36, 0.042, 8, false), goldMat));
      parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midPts), 32, 0.018, 6, false), goldMat));
    }
  }

  // Precision-Cut Smooth Rear Circulation Deck (Unified across GF, 1F, 2F & Roof — flush inside the new glass curtain coverup!)
  const bridgeShape = new THREE.Shape();
  bridgeShape.moveTo(1.54, 0.78);
  bridgeShape.lineTo(6.74, 0.78);
  bridgeShape.lineTo(6.74, 1.56);
  bridgeShape.lineTo(5.68, 1.36);
  bridgeShape.lineTo(3.11, 1.69);
  bridgeShape.lineTo(2.30, 2.38);
  bridgeShape.lineTo(1.54, 2.38);
  bridgeShape.closePath();
  const bridgeSlabGeo = new THREE.ExtrudeGeometry(bridgeShape, { depth: 0.24, bevelEnabled: false });
  const bridgeTopGeo = new THREE.ExtrudeGeometry(bridgeShape, { depth: 0.022, bevelEnabled: false });

  // Flush architectural white rear return wall (x=6.28..6.72, z=0.86, GF..2F top) closing the rear gap cleanly beside the fluted walnut spine (ZERO rail clipping slats!)
  addBox(spiralBackCore, 0.46, 10.24, 0.20, 6.50, 5.12, 0.86, whiteMat, true, true);

  // Helper: Clean Frameless Tempered-Glass Safety Barrier + Dual Champagne-Gold Handrails (used ONLY where genuine open drop exists!)
  function addGlassBarrierPolyline(parent, baseY, pts, h = 0.94, withMid = true) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, segLen = Math.hypot(dx, dz);
      if (segLen < 0.03) continue;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rotY = -Math.atan2(dz, dx);
      const pane = addBox(parent, segLen, h - 0.06, 0.034, mx, baseY + (h - 0.02) / 2, mz, railGlassMat, false, false);
      pane.rotation.y = rotY;
      const topR = addBox(parent, segLen + 0.02, 0.040, 0.046, mx, baseY + h, mz, goldMat, false, false);
      topR.rotation.y = rotY;
      if (withMid) {
        const midR = addBox(parent, segLen, 0.016, 0.022, mx, baseY + h * 0.50, mz, goldMat, false, false);
        midR.rotation.y = rotY;
      }
      if (segLen > 1.05) {
        addBox(parent, 0.020, h, 0.020, mx, baseY + h / 2, mz, goldMat, false, false);
      }
    }
    pts.forEach(([px, pz], idx) => {
      const isEnd = (idx === 0 || idx === pts.length - 1);
      addBox(parent, isEnd ? 0.036 : 0.030, h, isEnd ? 0.036 : 0.030, px, baseY + h / 2, pz, goldMat, false, false);
    });
  }

  // WALKABLE LAMINATED STRUCTURAL GLASS FLOOR POCKETS + CURVED SAFETY GLASS GUARDRAIL OVER THE OPEN RIGHT CORRIDOR SECTION (100% Fall-Free, Zero Doorway Drop-Off, Zero Stair Clash!)
  const rGlassArc = 2.45; // +6 cm radially outside outer stair balustrade (2.39) — ZERO stair overlap!
  const rightGlassFloorShape = new THREE.Shape();
  rightGlassFloorShape.moveTo(5.68, 1.36);
  rightGlassFloorShape.lineTo(6.74, 1.56);
  rightGlassFloorShape.lineTo(6.74, 1.98);
  rightGlassFloorShape.lineTo(6.54, 1.99);
  for (let i = 8; i >= 0; i--) {
    const a = -Math.PI * 0.36 + (i / 8) * (Math.PI * 0.14); // -0.22π back to -0.36π along r=2.45
    rightGlassFloorShape.lineTo(CX + Math.cos(a) * rGlassArc, CZ + Math.sin(a) * rGlassArc);
  }
  rightGlassFloorShape.closePath();
  const rightGlassFloorGeo = new THREE.ExtrudeGeometry(rightGlassFloorShape, { depth: 0.055, bevelEnabled: false });

  // Symmetric Left Walkable Laminated Glass Floor Pocket filling the curved crescent beside the left corridor
  const leftGlassFloorShape = new THREE.Shape();
  leftGlassFloorShape.moveTo(3.11, 1.69);
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI * 0.72 - (i / 8) * (Math.PI * 0.13); // -0.72π to -0.85π along r=2.45
    leftGlassFloorShape.lineTo(CX + Math.cos(a) * rGlassArc, CZ + Math.sin(a) * rGlassArc);
  }
  leftGlassFloorShape.lineTo(2.30, 2.38);
  leftGlassFloorShape.closePath();
  const leftGlassFloorGeo = new THREE.ExtrudeGeometry(leftGlassFloorShape, { depth: 0.055, bevelEnabled: false });

  deckTops.forEach((topY, bi) => {
    // Precision-cut rear circulation landing deck — smooth bevels, ZERO step overlap, unified through Roof glass gallery!
    const bDeck = new THREE.Mesh(bridgeSlabGeo, whiteMat);
    bDeck.rotation.x = Math.PI / 2; bDeck.position.y = topY; bDeck.castShadow = true; bDeck.receiveShadow = true;
    spiralBackCore.add(bDeck);
    const bTop = new THREE.Mesh(bridgeTopGeo, marbleMat);
    bTop.rotation.x = Math.PI / 2; bTop.position.y = topY + 0.011; bTop.receiveShadow = true;
    spiralBackCore.add(bTop);

    // Flush Walkable Laminated Glass Floor Panels covering BOTH right & left open corridor pockets across all 4 levels!
    const lGlassDeck = new THREE.Mesh(leftGlassFloorGeo, frostedGlassMat);
    lGlassDeck.rotation.x = Math.PI / 2; lGlassDeck.position.y = topY + 0.008;
    spiralBackCore.add(lGlassDeck);
    const rGlassDeck = new THREE.Mesh(rightGlassFloorGeo, frostedGlassMat);
    rGlassDeck.rotation.x = Math.PI / 2; rGlassDeck.position.y = topY + 0.008;
    spiralBackCore.add(rGlassDeck);
    // Sleek Curved Frameless Tempered-Glass Safety Guardrail strictly hugging r=2.45 rim on 1F, 2F & Roof (seals open well cleanly with ZERO doorway or step overlap!)
    if (bi > 0) {
      const arcPts = [];
      for (let i = 0; i <= 8; i++) {
        const a = -Math.PI * 0.36 + (i / 8) * (Math.PI * 0.14);
        arcPts.push([CX + Math.cos(a) * rGlassArc, CZ + Math.sin(a) * rGlassArc]);
      }
      arcPts.push([6.66, 1.94]); // Terminates cleanly into right doorway front jamb / upper glass wall!
      const gTopPts = [], gMidPts = [];
      for (let i = 0; i < arcPts.length; i++) {
        const [px, pz] = arcPts[i];
        gTopPts.push(new THREE.Vector3(px, topY + 0.94, pz));
        gMidPts.push(new THREE.Vector3(px, topY + 0.47, pz));
        if (i < arcPts.length - 1) {
          const [nx, nz] = arcPts[i + 1];
          const dx = nx - px, dz = nz - pz;
          const p = addBox(spiralBackCore, Math.hypot(dx, dz) + 0.008, 0.88, 0.032, (px + nx) / 2, topY + 0.46, (pz + nz) / 2, railGlassMat, false, false);
          p.rotation.y = -Math.atan2(dz, dx);
        }
        if (i === 0 || i === 4 || i === arcPts.length - 1) {
          addBox(spiralBackCore, 0.030, 0.92, 0.030, px, topY + 0.47, pz, goldMat, false, false);
        }
      }
      spiralBackCore.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gTopPts), 24, 0.034, 8, false), goldMat));
      spiralBackCore.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gMidPts), 20, 0.016, 6, false), goldMat));
    }

    // Precision-Cut Curved Indoor Mezzanine Balcony Landing (1F, 2F, Roof) projecting out over the chandelier void with clean open stair throats!
    if (bi > 0) {
      addCurvedBalconySector(spiralBackCore, topY, -Math.PI * 0.72, -Math.PI * 0.36, 0.24, stairInnerR, ATRIUM_R - 0.04, true, true);
    }

    // ONE Clean Straight Left Side-Bridge Glass Guardrail (x=1.66..2.30 at z=2.38, joining solid left wall flush to rearLeftGlass — ZERO diagonal excess or walkway obstruction!)
    addGlassBarrierPolyline(spiralBackCore, topY, [[1.66, 2.38], [2.30, 2.38]], 0.94, true);

    // REAL OPEN Left Main-Wing Doorway + Interactive Hinged Armored Safety Door seated 100% FLUSH inside x=1.55 wall cutout (z=1.64)!
    addSafetyDoor(spiralBackCore, 1.55, topY, 1.64, 1.16, bi === 3 ? 1.80 : 2.18, Math.PI / 2, 1);
    // Ground Floor Marble Transition Steps descending cleanly from atrium floor (y=1.04) to Living/Dining floor (y=0.27)!
    if (bi === 0) {
      for (let st = 0; st < 4; st++) {
        const sy = 0.27 + (3 - st) * 0.19;
        addBox(spiralBackCore, 0.34, 0.17, 1.32, 1.38 - st * 0.32, sy, 1.64, marbleMat, true, true);
        addBox(spiralBackCore, 0.03, 0.02, 1.26, 1.21 - st * 0.32, sy + 0.065, 1.64, warmLedMat, false, false);
      }
    }
    // REAL SOLID ARCHITECTURAL WALL + FLUSH RIGHT DOORWAY AT x = 6.72 (z=1.32 — Exact floor-to-underside height, ZERO slab ceiling clipping!)
    if (bi < 3) {
      const rWallH = bi === 0 ? 2.34 : bi === 1 ? 2.88 : 2.98;
      const rDoorH = 2.12;
      const rLintelH = Math.max(0.24, rWallH - rDoorH - 0.06);
      addBox(spiralBackCore, 0.22, rWallH, 0.16, 6.72, topY + rWallH / 2, 0.72, whiteMat, true, true);  // Rear jamb wall (z=0.64..0.80)
      addBox(spiralBackCore, 0.22, rWallH, 0.16, 6.72, topY + rWallH / 2, 1.92, whiteMat, true, true);  // Front jamb wall (z=1.84..2.00)
      addBox(spiralBackCore, 0.22, rLintelH, 1.08, 6.72, topY + rWallH - rLintelH / 2, 1.32, whiteMat, true, true); // Flush top lintel header!
      addSafetyDoor(spiralBackCore, 6.72, topY, 1.32, 1.04, rDoorH, -Math.PI / 2, -1);
      // Ground Floor Right Marble Transition Steps descending smoothly from atrium (1.04) onto sideWing GF Bed 1 floor (0.34)!
      if (bi === 0) {
        for (let st = 0; st < 3; st++) {
          const sy = 0.36 + (2 - st) * 0.22;
          addBox(spiralBackCore, 0.30, 0.19, 1.12, 6.96 + st * 0.28, sy, 1.32, marbleMat, true, true);
          addBox(spiralBackCore, 0.03, 0.02, 1.04, 7.11 + st * 0.28, sy + 0.075, 1.32, warmLedMat, false, false);
        }
      }
    }
    // Warm architectural wall sconces mounted cleanly on the backlit rear fluted spine (z = 1.05, completely clear of both doorways!)
    for (const sx of [3.35, 5.95]) {
      addBox(spiralBackCore, 0.10, 0.28, 0.10, sx, topY + 1.66, 1.05, darkBronzeMat, false, false);
      addBox(spiralBackCore, 0.08, 0.06, 0.08, sx, topY + 1.82, 1.05, warmLedMat, false, false);
    }
  });

  // GROUND FLOOR SCULPTURAL UNDER-STAIR CURVED BALCONY BARRIER & ILLUMINATED PLANTER GALLERY (y = 1.04!)
  // Frames the central chandelier atrium like an indoor balcony & joins Flight 1 seamlessly at +0.34π with ZERO gap or duplicate post!
  const gfBarrierGrp = new THREE.Group();
  tower.add(gfBarrierGrp);
  const gfArcSegs = 22;
  const gfArcStart = Math.PI * 0.34, gfArcEnd = -Math.PI * 0.72;
  const gfTopRailPts = [], gfMidRailPts = [], gfLedPts = [];
  for (let i = 0; i <= gfArcSegs; i++) {
    const a = gfArcStart + (i / gfArcSegs) * (gfArcEnd - gfArcStart);
    const px = CX + Math.cos(a) * stairInnerR, pz = CZ + Math.sin(a) * stairInnerR;
    gfTopRailPts.push(new THREE.Vector3(px, 1.04 + 0.94, pz));
    gfMidRailPts.push(new THREE.Vector3(px, 1.04 + 0.48, pz));
    gfLedPts.push(new THREE.Vector3(px, 1.04 + 0.05, pz));
    if (i < gfArcSegs) {
      const aN = gfArcStart + ((i + 1) / gfArcSegs) * (gfArcEnd - gfArcStart);
      const nx = CX + Math.cos(aN) * stairInnerR, nz = CZ + Math.sin(aN) * stairInnerR;
      const dx = nx - px, dz = nz - pz, sw = Math.hypot(dx, dz);
      const curb = addBox(gfBarrierGrp, sw + 0.015, 0.14, 0.12, (px + nx) / 2, 1.04 + 0.07, (pz + nz) / 2, marbleMat, false, true);
      curb.rotation.y = -Math.atan2(dz, dx);
      const gPane = addBox(gfBarrierGrp, sw + 0.012, 0.80, 0.034, (px + nx) / 2, 1.04 + 0.54, (pz + nz) / 2, railGlassMat, false, false);
      gPane.rotation.y = -Math.atan2(dz, dx);
    }
    if (i % 3 === 0 || i === gfArcSegs) {
      const isEnd = (i === 0 || i === gfArcSegs);
      addBox(gfBarrierGrp, isEnd ? 0.044 : 0.022, 0.92, isEnd ? 0.044 : 0.022, px, 1.04 + 0.47, pz, goldMat, false, false);
    }
  }
  gfBarrierGrp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gfTopRailPts), 48, 0.042, 8, false), goldMat));
  gfBarrierGrp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gfMidRailPts), 44, 0.018, 6, false), goldMat));
  gfBarrierGrp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gfLedPts), 44, 0.022, 6, false), warmLedMat));
  // Radial Glass & Gold Under-Stair Safety Divider beneath Flight 1's low-headroom zone (ang = -0.06π, r = 1.02..2.38) + Decorative Indoor Bonsai Bed!
  const underAng = -Math.PI * 0.06;
  const ux0 = CX + Math.cos(underAng) * stairInnerR, uz0 = CZ + Math.sin(underAng) * stairInnerR;
  const ux1 = CX + Math.cos(underAng) * (stairOuterR - 0.06), uz1 = CZ + Math.sin(underAng) * (stairOuterR - 0.06);
  const udx = ux1 - ux0, udz = uz1 - uz0, uLen = Math.hypot(udx, udz);
  const underGlass = addBox(gfBarrierGrp, uLen, 0.88, 0.034, (ux0 + ux1) / 2, 1.04 + 0.46, (uz0 + uz1) / 2, railGlassMat, false, false);
  underGlass.rotation.y = -Math.atan2(udz, udx);
  const underRail = addBox(gfBarrierGrp, uLen + 0.04, 0.042, 0.048, (ux0 + ux1) / 2, 1.04 + 0.92, (uz0 + uz1) / 2, goldMat, false, false);
  underRail.rotation.y = -Math.atan2(udz, udx);
  addBox(gfBarrierGrp, 0.044, 0.92, 0.044, ux1, 1.04 + 0.47, uz1, goldMat, false, false);
  addPlanterTree(gfBarrierGrp, CX + Math.cos(Math.PI * 0.10) * 1.72, 1.04, CZ + Math.sin(Math.PI * 0.10) * 1.72, 0.62, true);
  // Main Entrance Armored Biometric Safety Door right behind the bi-parting glass atrium sliding door!
  addSafetyDoor(tower, CX, 1.04, CZ + ATRIUM_R - 0.36, 1.24, 2.28, 0, -1);

  // 3. Concealed Vertical MEP Service Chase & Optional Compact Home-Lift Shaft (Seated cleanly behind fluted walnut spine at z=0.22!)
  const serviceShaft = addBox(spiralBackCore, 1.85, 13.45, 1.08, CX, 7.15, 0.22, serviceShaftMat, true, true);
  for (const sy of [1.5, 4.8, 8.0, 11.2]) {
    addBox(spiralBackCore, 0.88, 1.65, 0.06, CX, sy, -0.34, darkBronzeMat, false, false);
    addBox(spiralBackCore, 0.94, 0.04, 0.07, CX, sy + 0.86, -0.34, goldMat, false, false);
  }

  // Panoramic Full-Height Curved Glass Cylinder (clean front sweep between left and right piers)
  const glassCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(ATRIUM_R, ATRIUM_R, 12.95, 64, 1, true, -Math.PI * 0.36, Math.PI * 0.68),
    atriumGlassMat
  );
  glassCyl.position.set(CX, 7.35, CZ);
  tower.add(glassCyl);

  // BALANCED FULL-HEIGHT CURVED & FLAT STRUCTURAL GLASS ATRIUM COVERUPS ON BOTH REAR-RIGHT & REAR-LEFT FLANKS (100% Sealed, Zero Open Vertical Slots!)
  // 1. Rear-Right Curved Glass Facade: sweeps cleanly from inside rightPier (0.58π) to Right Doorway front jamb (0.725π -> 6.71, 1.84)
  const rearRightGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(ATRIUM_R, ATRIUM_R, 12.74, 24, 1, true, Math.PI * 0.58, Math.PI * 0.145),
    atriumGlassMat
  );
  rearRightGlass.position.set(CX, 7.41, CZ);
  tower.add(rearRightGlass);
  // 2. SEAMLESS UPPER RIGHT GLASS CURTAIN COVERUP DIRECTLY ABOVE 2F RIGHT DOORWAY (y=9.97..13.78, x=6.72, z=0.82..1.90 + Rear Corner Glass Return x=6.28..6.72, z=0.82!)
  const upperRightCoverup = new THREE.Group();
  tower.add(upperRightCoverup);
  // Right side structural glass curtain wall seated 100% FLUSH on top of the 2F white doorway wall (y=9.97..13.78)
  addBox(upperRightCoverup, 0.06, 3.81, 1.12, 6.72, 11.875, 1.36, atriumGlassMat, false, false);
  // Rear corner structural glass return panel closing (6.28..6.72, z=0.82) flush from Roof return wall (10.24) up to Drum Crown (13.78)!
  addBox(upperRightCoverup, 0.46, 3.54, 0.06, 6.50, 12.01, 0.82, atriumGlassMat, false, false);
  // Flush laminated glass skylight roof cap sealing the top of the right coverup cleanly into the drum crown underside (y=13.78)!
  addBox(upperRightCoverup, 0.56, 0.05, 1.14, 6.46, 13.76, 1.36, frostedGlassMat, false, false);
  // Brushed champagne-gold vertical mullions & horizontal transoms matching the curved atrium cylinder!
  for (const [mx, mz, mh, my] of [[6.72, 1.90, 3.81, 11.875], [6.72, 1.36, 3.81, 11.875], [6.72, 0.82, 3.81, 11.875], [6.28, 0.82, 3.54, 12.01]]) {
    addBox(upperRightCoverup, 0.055, mh, 0.055, mx, my, mz, goldMat, false, false);
  }
  for (const ty of [9.99, 10.24, 11.50, 12.74, 13.76]) {
    addBox(upperRightCoverup, 0.06, 0.048, 1.12, 6.72, ty, 1.36, goldMat, false, false);
    if (ty >= 10.24) addBox(upperRightCoverup, 0.46, 0.048, 0.06, 6.50, ty, 0.82, goldMat, false, false);
  }
  // 3. Mirror Rear-Left Curved Glass Facade + Full-Height Flat Glass Coverup (x=1.55..2.30, z=2.38, y=1.04..13.78) sealing the left side symmetrically!
  const rearLeftGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(ATRIUM_R, ATRIUM_R, 12.74, 24, 1, true, -Math.PI * 0.66, Math.PI * 0.16),
    atriumGlassMat
  );
  rearLeftGlass.position.set(CX, 7.41, CZ);
  tower.add(rearLeftGlass);
  addBox(tower, 0.78, 12.74, 0.055, 1.93, 7.41, 2.38, atriumGlassMat, false, false); // Left side full-height glass coverup!
  addBox(tower, 0.052, 12.74, 0.062, 1.93, 7.41, 2.38, goldMat, false, false);       // Center champagne-gold mullion
  for (const ty of [3.74, 6.99, 10.24, 12.74, 13.76]) {
    addBox(tower, 0.78, 0.046, 0.062, 1.93, ty, 2.38, goldMat, false, false);
  }

  // Slim Vertical Champagne-Gold Mullions & Curved Floor-Level Architectural Transom Bars framing BOTH rear curved glass flanks!
  for (const th of [Math.PI * 0.64, Math.PI * 0.72, -Math.PI * 0.58, -Math.PI * 0.66]) {
    const mx = CX + Math.sin(th) * (ATRIUM_R + 0.015), mz = CZ + Math.cos(th) * (ATRIUM_R + 0.015);
    const mul = addBox(tower, 0.052, 12.74, 0.068, mx, 7.41, mz, goldMat, false, false);
    mul.rotation.y = th;
  }
  for (const ty of [3.74, 6.99, 10.24, 12.74]) {
    // Curved champagne-gold structural transom bands on Rear-Right & Rear-Left glass walls
    for (const [t0, t1] of [[Math.PI * 0.58, Math.PI * 0.725], [-Math.PI * 0.66, -Math.PI * 0.50]]) {
      const tPts = [];
      for (let i = 0; i <= 10; i++) {
        const th = t0 + (i / 10) * (t1 - t0);
        tPts.push(new THREE.Vector3(CX + Math.sin(th) * (ATRIUM_R + 0.015), ty, CZ + Math.cos(th) * (ATRIUM_R + 0.015)));
      }
      tower.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tPts), 16, 0.032, 6, false), goldMat));
    }
  }

  // Only 4 Ultra-Clean Slim Vertical Champagne-Gold Mullions across the front panoramic curve (matching home photo!)
  for (const angleDeg of [-38, -12, 14, 40]) {
    const a = THREE.MathUtils.degToRad(angleDeg);
    addBox(tower, 0.055, 12.95, 0.075, CX + Math.sin(a) * (ATRIUM_R + 0.02), 7.35, CZ + Math.cos(a) * (ATRIUM_R + 0.02), goldMat, false, false);
  }
  // Top & bottom champagne-gold curved glazing rings
  for (const ry of [1.04, 13.78]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ATRIUM_R + 0.02, 0.065, 10, 64), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(CX, ry, CZ);
    tower.add(ring);
  }

  /* === MAIN VILLA ENTRY: BI-PARTING GLASS & CHAMPAGNE-GOLD SLIDING DOOR (Top of Arrival Steps!) === */
  const mainEntryZ = CZ + ATRIUM_R + 0.04;
  const entryDoorFrame = new THREE.Group();
  tower.add(entryDoorFrame);
  // Overhead dark-bronze sliding track + welcome warm LED soffit strip + vertical framing jambs
  addBox(entryDoorFrame, 4.15, 0.12, 0.16, CX, 3.56, mainEntryZ, darkBronzeMat, false, false);
  addBox(entryDoorFrame, 2.40, 0.04, 0.06, CX, 3.49, mainEntryZ + 0.05, warmLedMat, false, false);
  addBox(entryDoorFrame, 0.09, 2.52, 0.14, CX - 1.18, 2.30, mainEntryZ, darkBronzeMat, false, false);
  addBox(entryDoorFrame, 0.09, 2.52, 0.14, CX + 1.18, 2.30, mainEntryZ, darkBronzeMat, false, false);
  function buildEntrySlidingLeaf(side) {
    const leaf = new THREE.Group();
    leaf.position.set(CX + side * 0.56, 2.28, mainEntryZ + 0.03);
    addBox(leaf, 1.08, 2.40, 0.05, 0, 0, 0, atriumGlassMat, false, false);
    addBox(leaf, 1.10, 0.07, 0.07, 0, 1.20, 0, darkBronzeMat, false, false);
    addBox(leaf, 1.10, 0.08, 0.07, 0, -1.20, 0, darkBronzeMat, false, false);
    addBox(leaf, 0.07, 2.44, 0.07, -0.53, 0, 0, darkBronzeMat, false, false);
    addBox(leaf, 0.07, 2.44, 0.07, 0.53, 0, 0, darkBronzeMat, false, false);
    // Tall brushed champagne-gold designer vertical pull handle near center meeting edge
    const hx = -side * 0.40;
    addBox(leaf, 0.04, 1.18, 0.08, hx, -0.05, 0.06, goldMat, false, false);
    addBox(leaf, 0.035, 1.18, 0.06, hx, -0.05, -0.05, goldMat, false, false);
    entryDoorFrame.add(leaf);
    return leaf;
  }
  const entryLeafLeft = buildEntrySlidingLeaf(-1);
  const entryLeafRight = buildEntrySlidingLeaf(1);

  // ICONIC THICK SCULPTURAL WHITE CROWN DRUM WITH TWO DARK HORIZONTAL REVEAL GROOVES!
  const crownGroup = new THREE.Group();
  tower.add(crownGroup);
  const crownR = ATRIUM_R + 0.34;
  const crownBody = new THREE.Mesh(new THREE.CylinderGeometry(crownR, crownR, 1.72, 72), whiteMat);
  crownBody.position.set(CX, 14.66, CZ);
  crownBody.castShadow = true;
  crownGroup.add(crownBody);
  // Two crisp horizontal dark-bronze recessed reveal bands + passive stack-ventilation crown louvers!
  for (const gy of [14.35, 14.88]) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(crownR - 0.01, 0.048, 8, 72), darkBronzeMat);
    groove.rotation.x = Math.PI / 2;
    groove.position.set(CX, gy, CZ);
    crownGroup.add(groove);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const lv = addBox(crownGroup, 0.34, 0.14, 0.05, CX + Math.cos(a) * (crownR + 0.01), 14.62, CZ + Math.sin(a) * (crownR + 0.01), steelMat, false, false);
    lv.rotation.y = -a + Math.PI / 2;
  }
  // Warm interior ambient practical lights for crisp Real-Home Walkthrough lighting!
  const livingWarmLight = new THREE.PointLight(0xffd79e, 9, 13, 1.8);
  livingWarmLight.position.set(-4.2, 2.55, -2.5); scene.add(livingWarmLight);
  const masterWarmLight = new THREE.PointLight(0xffdca8, 9, 13, 1.8);
  masterWarmLight.position.set(-3.4, 9.15, -2.6); scene.add(masterWarmLight);
  const gameRgbLight = new THREE.PointLight(0x88b4ff, 8, 11, 1.8);
  gameRgbLight.position.set(-4.8, 11.88, 1.35); scene.add(gameRgbLight);
  // Warm golden inner crown LED halo & ceiling medallion
  const halo = new THREE.Mesh(new THREE.TorusGeometry(ATRIUM_R - 0.05, 0.055, 10, 64), warmLedMat);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(CX, 13.76, CZ);
  crownGroup.add(halo);
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.08, 36), goldMat);
  medallion.position.set(CX, 13.76, CZ);
  crownGroup.add(medallion);

  /* === STAIR-TOP SLEEK FLUSH ARCHITECTURAL SKYLIGHT OCULUS & DIRECT PARTY SHED SKY-BRIDGE (Clean Flat Modernist Silhouette!) === */
  const crownTopY = 15.52;
  // Flush low-profile dark-bronze & champagne-gold oculus framing ring tucked neatly inside the flat white crown parapet lip!
  const oculusCurb = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.075, 10, 64), darkBronzeMat);
  oculusCurb.rotation.x = Math.PI / 2; oculusCurb.position.set(CX, crownTopY + 0.02, CZ); crownGroup.add(oculusCurb);
  const oculusGoldLip = new THREE.Mesh(new THREE.TorusGeometry(2.44, 0.032, 8, 64), goldMat);
  oculusGoldLip.rotation.x = Math.PI / 2; oculusGoldLip.position.set(CX, crownTopY + 0.04, CZ); crownGroup.add(oculusGoldLip);
  const oculusLedRim = new THREE.Mesh(new THREE.TorusGeometry(2.30, 0.026, 8, 48), warmLedMat);
  oculusLedRim.rotation.x = Math.PI / 2; oculusLedRim.position.set(CX, crownTopY + 0.015, CZ); crownGroup.add(oculusLedRim);
  // Recessed Low-Iron Architectural Circular Glass Skylight Disc + Slim Flush Radial Gold Mullions (zero protruding dome!)
  const oculusGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.34, 2.34, 0.04, 48), atriumGlassMat);
  oculusGlass.position.set(CX, crownTopY + 0.01, CZ); crownGroup.add(oculusGlass);
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI;
    const bar = addBox(crownGroup, 4.64, 0.035, 0.04, CX, crownTopY + 0.032, CZ, goldMat, false, false);
    bar.rotation.y = ang;
  }
  const oculusHub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.055, 24), goldMat);
  oculusHub.position.set(CX, crownTopY + 0.035, CZ); crownGroup.add(oculusHub);
  // Direct Stair-Top Glass Sky-Bridge + Precision-Cut Top Curved Atrium Balcony Landing (y = 12.74, FLUSH join from Flight 4 to Party Shed + Outer Safety Glass Guardrail!)
  addCurvedBalconySector(crownGroup, 12.74, -Math.PI * 0.96, -Math.PI * 0.58, 0.22, stairInnerR, ATRIUM_R - 0.04, true, true);
  // Outer curved tempered-glass safety guardrail enclosing the Sky-Bridge top landing rim (r = stairOuterR, -0.96π .. -0.58π)
  {
    const sbSegs = 12, sbA0 = -Math.PI * 0.96, sbA1 = -Math.PI * 0.58;
    const sbTop = [], sbMid = [];
    for (let i = 0; i <= sbSegs; i++) {
      const a = sbA0 + (i / sbSegs) * (sbA1 - sbA0);
      const px = CX + Math.cos(a) * stairOuterR, pz = CZ + Math.sin(a) * stairOuterR;
      sbTop.push(new THREE.Vector3(px, 12.74 + 0.94, pz));
      sbMid.push(new THREE.Vector3(px, 12.74 + 0.47, pz));
      if (i < sbSegs) {
        const aN = sbA0 + ((i + 1) / sbSegs) * (sbA1 - sbA0);
        const nx = CX + Math.cos(aN) * stairOuterR, nz = CZ + Math.sin(aN) * stairOuterR;
        const dx = nx - px, dz = nz - pz;
        const p = addBox(crownGroup, Math.hypot(dx, dz) + 0.012, 0.88, 0.034, (px + nx) / 2, 12.74 + 0.46, (pz + nz) / 2, railGlassMat, false, false);
        p.rotation.y = -Math.atan2(dz, dx);
      }
      if (i === 0 || i === sbSegs || i % 4 === 0) {
        addBox(crownGroup, 0.034, 0.92, 0.034, px, 12.74 + 0.47, pz, goldMat, false, false);
      }
    }
    crownGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sbTop), 28, 0.038, 8, false), goldMat));
    crownGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sbMid), 24, 0.018, 6, false), goldMat));
  }
  addBox(crownGroup, 1.65, 0.22, 1.65, 2.15, 12.63, 2.95, whiteMat, true, true);
  addBox(crownGroup, 1.60, 0.025, 1.56, 2.15, 12.745, 2.95, marbleMat, false, true);
  addBox(crownGroup, 1.55, 0.90, 0.04, 2.08, 13.20, 3.74, railGlassMat, false, false);
  addBox(crownGroup, 1.58, 0.044, 0.05, 2.08, 13.68, 3.74, goldMat, false, false);
  addBox(crownGroup, 1.55, 0.90, 0.04, 2.08, 13.20, 2.16, railGlassMat, false, false);
  addBox(crownGroup, 1.58, 0.044, 0.05, 2.08, 13.68, 2.16, goldMat, false, false);

  /* PRECISION-CUT 4-FLIGHT SCULPTURAL SPIRAL STAIRCASE (66 STEPS) + CURVED HELICAL GLASS BALCONY BARRIERS JOINING FLUSH TO EVERY FLOOR! */
  const stairGroup = new THREE.Group();
  tower.add(stairGroup);
  const midR = (stairInnerR + stairOuterR) * 0.5;
  const treadW = stairOuterR - stairInnerR - 0.04;
  const ribbonThick = 0.24;

  // 4 Distinct Architectural Flights with EXACT Floor-Level Cuts & Flush Joins into Every Curved Mezzanine Balcony Landing:
  // Flight 1 (GF 1.04 -> 1F 3.74): Starts right of front entry (+0.34π) leaving full 2-story open arrival foyer, arrives flush at 1F right throat (-0.36π)
  // Flight 2 (1F 3.74 -> 2F 6.99): Departs flush from 1F left throat (-0.72π), sweeps 295° across panoramic front glass to 2F right throat (-0.36π)
  // Flight 3 (2F 6.99 -> Roof 10.24): Departs flush from 2F left throat (-0.72π), sweeps 295° across panoramic front glass to Roof right throat (-0.36π)
  // Flight 4 (Roof 10.24 -> Sky-Bridge 12.74): Departs flush from Roof left throat (-0.72π), sweeps 335° directly onto Party Shed Sky-Bridge landing (-0.58π)!
  const spiralFlights = [
    { y0: 1.04,  y1: 3.74,  a0:  Math.PI * 0.34, a1: -Math.PI * 0.36, steps: 14, segs: 28 },
    { y0: 3.74,  y1: 6.99,  a0: -Math.PI * 0.72, a1: -Math.PI * 2.36, steps: 18, segs: 52 },
    { y0: 6.99,  y1: 10.24, a0: -Math.PI * 0.72, a1: -Math.PI * 2.36, steps: 18, segs: 52 },
    { y0: 10.24, y1: 12.74, a0: -Math.PI * 0.72, a1: -Math.PI * 2.58, steps: 16, segs: 56 }
  ];

  spiralFlights.forEach((fl, fIdx) => {
    const { y0, y1, a0, a1, steps, segs } = fl;
    const dy = y1 - y0, da = a1 - a0;

    // 1. Watertight Sculptural White Helical Soffit Ribbon with Flat Cut End-Caps joining flush into Floor Balcony Slabs!
    const rPos = [], rIdx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ang = a0 + t * da;
      const y = y0 + t * dy;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      rPos.push(
        CX + ca * stairInnerR, y, CZ + sa * stairInnerR,
        CX + ca * stairOuterR, y, CZ + sa * stairOuterR,
        CX + ca * stairOuterR, y - ribbonThick, CZ + sa * stairOuterR,
        CX + ca * stairInnerR, y - ribbonThick, CZ + sa * stairInnerR
      );
      if (i < segs) {
        const a = i * 4, b = (i + 1) * 4;
        rIdx.push(a, a + 1, b, a + 1, b + 1, b);
        rIdx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        rIdx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
        rIdx.push(a + 3, a, b + 3, a, b, b + 3);
      }
    }
    // Clean cut end-caps at flight start (0) & flight arrival (segs)
    rIdx.push(0, 3, 2, 0, 2, 1);
    const endB = segs * 4;
    rIdx.push(endB, endB + 1, endB + 2, endB, endB + 2, endB + 3);
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    rGeo.setIndex(rIdx);
    rGeo.computeVertexNormals();
    const rMesh = new THREE.Mesh(rGeo, whiteMat);
    rMesh.castShadow = true;
    rMesh.receiveShadow = true;
    stairGroup.add(rMesh);

    // 2. Sculpted Marble & Walnut Steps cleanly spaced strictly between lower floor & upper balcony landing (ZERO slab overlap!)
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const ang = a0 + t * da;
      const y = y0 + t * dy + 0.032;
      const stepG = new THREE.Group();
      stepG.position.set(CX + Math.cos(ang) * midR, y, CZ + Math.sin(ang) * midR);
      stepG.rotation.y = -ang;
      addBox(stepG, treadW, 0.055, 0.34, 0, 0, 0, (s + fIdx) % 2 === 0 ? marbleMat : walnutMat, true, true);
      addBox(stepG, treadW, 0.145, 0.03, 0, -0.095, -0.15, whiteMat, false, false);
      addBox(stepG, treadW, 0.018, 0.024, 0, 0.028, 0.165, goldMat, false, false);
      if (s % 2 === 0) addBox(stepG, treadW - 0.12, 0.014, 0.018, 0, -0.026, 0.16, warmLedMat, false, false);
      stairGroup.add(stepG);
    }

    // 3. Continuous Smoothly-Fitted Curved Helical Glass Balcony Skirt + Inner Champagne-Gold Handrails (ZERO overlapping posts or doorway-crossing rods!)
    const glassSteps = Math.max(16, Math.round(segs * 0.72));
    for (let i = 0; i < glassSteps; i++) {
      const t0 = i / glassSteps, t1 = (i + 1) / glassSteps;
      const aS = a0 + t0 * da, aE = a0 + t1 * da;
      const p0x = CX + Math.cos(aS) * stairInnerR, p0z = CZ + Math.sin(aS) * stairInnerR, p0y = y0 + t0 * dy;
      const p1x = CX + Math.cos(aE) * stairInnerR, p1z = CZ + Math.sin(aE) * stairInnerR, p1y = y0 + t1 * dy;
      const dx = p1x - p0x, dz = p1z - p0z;
      const gPanel = addBox(stairGroup, Math.hypot(dx, dz) + 0.012, 0.88, 0.032, (p0x + p1x) / 2, (p0y + p1y) / 2 + 0.46, (p0z + p1z) / 2, railGlassMat, false, false);
      gPanel.rotation.y = -Math.atan2(dz, dx);
    }
    // Inner Helical Top Handrail, Mid-Rod & Curb Trim (meets every floor's curved balcony rail cleanly at r = stairInnerR!)
    for (const [rad, yOff, thick] of [
      [stairInnerR, 0.94, 0.042],
      [stairInnerR, 0.47, 0.018],
      [stairInnerR, -0.02, 0.028]
    ]) {
      const hPts = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const ang = a0 + t * da;
        hPts.push(new THREE.Vector3(CX + Math.cos(ang) * rad, y0 + t * dy + yOff, CZ + Math.sin(ang) * rad));
      }
      stairGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hPts), segs * 2, thick, 8, false), goldMat));
    }
    // 4. FULL-LENGTH OUTER TEMPERED-GLASS SAFETY BALUSTRADE + DUAL CHAMPAGNE-GOLD HANDRAILS (Seated strictly on the stair ribbon r=2.39, t=0.02..0.98 — ZERO hanging posts or doorway overlap!)
    const outerBalR = stairOuterR - 0.03;
    const tStart = 0.02, tEnd = 0.98;
    for (let i = 0; i < glassSteps; i++) {
      const t0 = tStart + (i / glassSteps) * (tEnd - tStart);
      const t1 = tStart + ((i + 1) / glassSteps) * (tEnd - tStart);
      const aS = a0 + t0 * da, aE = a0 + t1 * da;
      const p0x = CX + Math.cos(aS) * outerBalR, p0z = CZ + Math.sin(aS) * outerBalR, p0y = y0 + t0 * dy;
      const p1x = CX + Math.cos(aE) * outerBalR, p1z = CZ + Math.sin(aE) * outerBalR, p1y = y0 + t1 * dy;
      const dx = p1x - p0x, dz = p1z - p0z;
      const oPanel = addBox(stairGroup, Math.hypot(dx, dz) + 0.012, 0.88, 0.032, (p0x + p1x) / 2, (p0y + p1y) / 2 + 0.46, (p0z + p1z) / 2, railGlassMat, false, false);
      oPanel.rotation.y = -Math.atan2(dz, dx);
    }
    for (const [rad, yOff, thick] of [
      [outerBalR, 0.94, 0.036],
      [outerBalR, 0.47, 0.017],
      [outerBalR, -0.01, 0.024]
    ]) {
      const oPts = [];
      for (let i = 0; i <= segs; i++) {
        const t = tStart + (i / segs) * (tEnd - tStart);
        const ang = a0 + t * da;
        oPts.push(new THREE.Vector3(CX + Math.cos(ang) * rad, y0 + t * dy + yOff, CZ + Math.sin(ang) * rad));
      }
      stairGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(oPts), segs * 2, thick, 8, false), goldMat));
    }
    // Cleanly Seated Vertical Inner & Outer Balusters (seated squarely ON the helical stair ribbon — ZERO hanging/floating corner posts!)
    const balCount = Math.max(8, Math.round(steps * 0.85));
    for (let i = 0; i <= balCount; i++) {
      const isEnd = (i === 0 || i === balCount);
      const tIn = i / balCount;
      const angIn = a0 + tIn * da, yIn = y0 + tIn * dy;
      if (!isEnd) {
        addBox(stairGroup, 0.022, 0.92, 0.022, CX + Math.cos(angIn) * stairInnerR, yIn + 0.47, CZ + Math.sin(angIn) * stairInnerR, goldMat, false, false);
      }
      const tOut = tStart + (i / balCount) * (tEnd - tStart);
      const angOut = a0 + tOut * da, yOut = y0 + tOut * dy;
      addBox(stairGroup, isEnd ? 0.034 : 0.020, 0.92, isEnd ? 0.034 : 0.020, CX + Math.cos(angOut) * outerBalR, yOut + 0.47, CZ + Math.sin(angOut) * outerBalR, goldMat, false, false);
      // Structural brushed-gold tie-brackets bracing outer handrail directly to the curved glass cylinder facade (strictly where outer glass exists!)
      if (!isEnd && i % 3 === 0 && Math.sin(angOut) > -0.45) {
        const brk = addBox(stairGroup, 0.27, 0.028, 0.028, CX + Math.cos(angOut) * (outerBalR + 0.14), yOut + 0.93, CZ + Math.sin(angOut) * (outerBalR + 0.14), goldMat, false, false);
        brk.rotation.y = -angOut;
      }
    }
  });

  /* BREATHTAKING CASCADING CRYSTAL-GLOBE CHANDELIER (Suspended down open center of spiral!) */
  const chandelier = new THREE.Group();
  tower.add(chandelier);
  const orbGeo = new THREE.SphereGeometry(0.145, 14, 12);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xe2c082, transparent: true, opacity: 0.45 });
  for (let i = 0; i < 42; i++) {
    const t = i / 41;
    const ang = i * 2.39996; // Golden angle spiral distribution!
    const rad = 0.14 + Math.sin(t * Math.PI) * 0.56 + (i % 3) * 0.07;
    const oy = 12.95 - t * 8.95;
    const ox = CX + Math.cos(ang) * rad;
    const oz = CZ + Math.sin(ang) * rad;
    const orb = new THREE.Mesh(orbGeo, chandelierOrbMat);
    const s = 0.72 + (1 - Math.abs(t - 0.35)) * 0.52;
    orb.scale.setScalar(s);
    orb.position.set(ox, oy, oz);
    chandelier.add(orb);
    const wireLen = 13.74 - oy;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, wireLen, 4), wireMat);
    wire.position.set(ox, oy + wireLen / 2, oz);
    chandelier.add(wire);
  }

  /* === RIGHT SECONDARY 2-STORY CURVED GLASS PAVILION (Seen behind/right of tower in home photo!) === */
  const sideWing = new THREE.Group();
  levels.ground.add(sideWing);
  const swShape = new THREE.Shape();
  swShape.moveTo(6.1, -2.4);
  swShape.lineTo(8.5, -2.4);
  swShape.quadraticCurveTo(9.85, -2.4, 9.85, -0.7);
  swShape.lineTo(9.85, 1.3);
  swShape.quadraticCurveTo(9.85, 2.55, 8.4, 2.55);
  swShape.lineTo(6.1, 2.55);
  swShape.closePath();
  const swGeo = new THREE.ExtrudeGeometry(swShape, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  for (const sy of [0.34, 3.74, 6.99]) {
    const sMesh = new THREE.Mesh(swGeo, whiteMat);
    sMesh.rotation.x = Math.PI / 2;
    sMesh.position.y = sy;
    sMesh.castShadow = true;
    sideWing.add(sMesh);
  }
  // Warm lit glazed walls & PRIVATE furnished bedroom suites (Bed 1 GF & Bed 4 1F) with FULL Wraparound Privacy Curtains & Private Frosted Sliding Ensuite Doors!
  addBox(sideWing, 2.6, 6.2, 4.1, 8.0, 3.55, 0.05, atriumGlassMat, false, false);
  for (const mz of [-1.4, 0.05, 1.5]) addBox(sideWing, 0.07, 6.2, 0.07, 9.32, 3.55, mz, goldMat);
  addBedSuite(sideWing, 7.95, 0.36, 0.05, -Math.PI / 2, 0.76);
  addACUnit(sideWing, 7.95, 2.84, -1.94, 0, 0.86); // GF Right Pavilion Bed 1 Split-Inverter AC
  addCurtainPair(sideWing, 9.18, 0.36, 0.05, 3.70, 2.92, -Math.PI / 2); // GF Bed 1 Right Panoramic Privacy Curtain!
  addCurtainPair(sideWing, 7.95, 0.36, 1.96, 2.30, 2.92, Math.PI);      // GF Bed 1 Front Glass Privacy Curtain!
  addPrivacySlidingDoor(sideWing, 7.25, 0.36, -1.96, 0.96, 2.24, 0, true, 0.90); // GF Bed 1 -> Private Ensuite 1 Frosted Sliding Door!
  addBedSuite(sideWing, 7.95, 3.75, 0.05, -Math.PI / 2, 0.76);
  addACUnit(sideWing, 7.95, 6.22, -1.94, 0, 0.86); // 1F Right Pavilion Bed 4 Split-Inverter AC
  addCurtainPair(sideWing, 9.18, 3.75, 0.05, 3.70, 2.80, -Math.PI / 2); // 1F Bed 4 Right Panoramic Privacy Curtain!
  addCurtainPair(sideWing, 7.95, 3.75, 1.96, 2.30, 2.80, Math.PI);      // 1F Bed 4 Front Glass Privacy Curtain!
  addPrivacySlidingDoor(sideWing, 7.25, 3.75, -1.96, 0.96, 2.24, 0, true, 0.90); // 1F Bed 4 -> Private Ensuite 4 Frosted Sliding Door!
  // 2ND FLOOR CURVED RIGHT SUN TERRACE ON sideWing TOP SLAB (y = 6.99 — Joins curved atrium glass wall flush at (7.10, 2.46) + full rear safety barrier!)
  const swTerraceY = 6.99;
  const swRailCurve2D = new THREE.Path();
  swRailCurve2D.moveTo(7.10, 2.46);
  swRailCurve2D.lineTo(8.38, 2.46);
  swRailCurve2D.quadraticCurveTo(9.74, 2.46, 9.74, 1.28);
  swRailCurve2D.lineTo(9.74, -0.70);
  swRailCurve2D.quadraticCurveTo(9.74, -2.30, 8.48, -2.30);
  swRailCurve2D.lineTo(7.85, -2.30);
  const swRailPts = swRailCurve2D.getPoints(36);
  for (let i = 0; i < swRailPts.length - 1; i++) {
    const a = swRailPts[i], b = swRailPts[i + 1];
    const dx = b.x - a.x, dz = b.y - a.y, segLen = Math.hypot(dx, dz);
    if (segLen < 0.02) continue;
    const pane = addBox(sideWing, segLen + 0.012, 0.90, 0.036, (a.x + b.x) / 2, swTerraceY + 0.46, (a.y + b.y) / 2, railGlassMat, false, false);
    pane.rotation.y = -Math.atan2(dz, dx);
  }
  const swTopRail3D = new THREE.CatmullRomCurve3(swRailPts.map(p => new THREE.Vector3(p.x, swTerraceY + 0.93, p.y)));
  sideWing.add(new THREE.Mesh(new THREE.TubeGeometry(swTopRail3D, 72, 0.036, 8, false), goldMat));
  for (let i = 0; i < swRailPts.length; i += 6) {
    const p = swRailPts[i];
    addBox(sideWing, 0.036, 0.91, 0.036, p.x, swTerraceY + 0.46, p.y, goldMat, false, false);
  }
  // Rear 2F Sun Terrace Glass Safety Return cleanly inset beside the doorway wall ((6.86, 0.66) -> (6.86, -0.45) -> (7.74, -0.45) — ZERO wall/rail crossing!)
  addGlassBarrierPolyline(sideWing, swTerraceY, [[6.86, 0.66], [6.86, -0.45], [7.74, -0.45]], 0.94, true);
  addBox(sideWing, 2.15, 0.03, 3.65, 8.22, swTerraceY + 0.015, 0.10, woodMat, false, true); // Warm slatted teak terrace pad
  addBox(sideWing, 0.68, 0.36, 0.68, 8.45, swTerraceY + 0.19, 0.72, woodMat, true, false); // Outdoor teak lounge chair
  addBox(sideWing, 0.60, 0.12, 0.60, 8.45, swTerraceY + 0.42, 0.72, upholsteryMat, false, false);
  addBox(sideWing, 0.60, 0.44, 0.10, 8.45, swTerraceY + 0.60, 0.40, woodMat, false, false);
  addPlanterTree(sideWing, 8.85, swTerraceY, -1.45, 0.72, true);

  /* === LANDSCAPED SITE, DRIVEWAY, PERIMETER WALL & TROPICAL TREES === */
  const landscape = new THREE.Group();
  scene.add(landscape);
  const gardenObjects = [];
  const addGarden = obj => { landscape.add(obj); gardenObjects.push(obj); return obj; };

  // Large emerald ground & travertine paved arrival court
  const earth = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), lawnMat);
  earth.rotation.x = -Math.PI / 2;
  earth.position.y = -0.04;
  earth.receiveShadow = true;
  landscape.add(earth);

  // Paved front arrival court & driveway (cleanly bounded between UG water vault x=-8.65 & circular fire-pit patio x=8.56 — zero overlap!)
  addBox(landscape, 16.8, 0.08, 10.6, -0.10, 0.0, 10.2, drivewayMat, false, true);
  // Subtle flush paving expansion joints (2 mm proud of driveway top y=0.040 — zero Z-fighting!)
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x99958c, roughness: 0.9 });
  for (let pz = 6.2; pz <= 14.8; pz += 1.7) addBox(landscape, 16.6, 0.004, 0.03, -0.10, 0.042, pz, jointMat, false, false);

  // Architectural Perimeter Boundary Wall + Full Metal Security Barriers on ALL Remaining Space + Gate Piers!
  const boundary = new THREE.Group();
  landscape.add(boundary);
  function addMetalBarrierRun(parent, x1, z1, x2, z2, baseY = 0.65, height = 1.24, hasGoldTop = true) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const g = new THREE.Group();
    g.position.set(mx, baseY, mz); g.rotation.y = ang;
    // Bottom & top heavy powder-coated metal barrier rails + gold security accent rail
    addBox(g, len, 0.055, 0.055, 0, 0.05, 0, darkBronzeMat, false, false);
    addBox(g, len, 0.06, 0.06, 0, height - 0.04, 0, darkBronzeMat, false, false);
    if (hasGoldTop) addBox(g, len, 0.035, 0.04, 0, height + 0.02, 0, goldMat, false, false);
    // Dense vertical steel security pickets closing every remaining open gap cleanly (0.28m spacing!)
    const pickets = Math.max(2, Math.floor(len / 0.28));
    for (let i = 0; i <= pickets; i++) {
      const px = -len / 2 + (i / pickets) * len;
      addBox(g, 0.028, height, 0.028, px, height / 2, 0, darkBronzeMat, false, false);
    }
    // Heavier vertical structural barrier posts every ~3.0m
    const posts = Math.max(1, Math.round(len / 3.0));
    for (let i = 0; i <= posts; i++) {
      const px = -len / 2 + (i / posts) * len;
      addBox(g, 0.075, height + 0.08, 0.075, px, height / 2 + 0.03, 0, darkBronzeMat, false, false);
    }
    parent.add(g); return g;
  }
  function addWallRun(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ang = -Math.atan2(dz, dx);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    // Stone masonry plinth wall + coping stone
    const base = addBox(boundary, len, 0.72, 0.26, mx, 0.36, mz, stoneWallMat);
    base.rotation.y = ang;
    const cap = addBox(boundary, len + 0.06, 0.06, 0.30, mx, 0.74, mz, darkBronzeMat);
    cap.rotation.y = ang;
    // Full vertical architectural metal barrier pickets + horizontal cross rails closing all remaining wall space!
    addMetalBarrierRun(boundary, x1, z1, x2, z2, 0.76, 1.24, true);
    const midRail = addBox(boundary, len, 0.045, 0.045, mx, 1.38, mz, darkBronzeMat, false, false);
    midRail.rotation.y = ang;
    const count = Math.max(1, Math.round(len / 3.2));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      addBox(boundary, 0.38, 2.02, 0.38, x1 + dx * t, 1.01, z1 + dz * t, stoneWallMat);
      addBox(boundary, 0.42, 0.05, 0.42, x1 + dx * t, 2.04, z1 + dz * t, goldMat, false, false);
    }
  }
  addWallRun(-14.5, -13.5, 14.5, -13.5);
  addWallRun(-14.5, -13.5, -14.5, 14.5);
  addWallRun(14.5, -13.5, 14.5, 14.5);
  addWallRun(-14.5, 14.5, -9.2, 14.5);
  addWallRun(8.2, 14.5, 14.5, 14.5);
  // Protective Architectural Metal Safety Barriers on Remaining Open Rooftop & Service Edges (aligned seamlessly with extended x=-9.35 left deck!)
  addMetalBarrierRun(levels.roof, -9.35, -5.06, 1.55, -5.06, 10.26, 1.02, true); // Rear BBQ + extended left rooftop safety barrier
  addMetalBarrierRun(levels.roof, 1.80, -4.85, 7.82, -4.85, 10.26, 1.02, true);  // Rear Laundry/Drying roof metal barrier
  addMetalBarrierRun(levels.roof, 7.82, -4.85, 7.82, -0.45, 10.26, 1.02, true);  // Right Laundry/Drying roof metal barrier
  addMetalBarrierRun(levels.roof, 3.65, -0.45, 7.82, -0.45, 10.26, 1.02, true);  // Front Laundry wing terrace metal barrier
  addMetalBarrierRun(boundary, 9.85, -5.65, 10.60, -5.65, -0.04, 1.52, true);   // Right side-yard divider (west of garden walkway gateway)
  addMetalBarrierRun(boundary, 12.20, -5.65, 14.35, -5.65, -0.04, 1.52, true);  // Right side-yard divider (east of garden walkway gateway)
  // Gate pillars with warm architectural lanterns
  for (const gx of [-9.2, 8.2]) {
    addBox(boundary, 0.65, 2.25, 0.65, gx, 1.12, 14.5, stoneWallMat);
    addBox(boundary, 0.26, 0.32, 0.26, gx, 2.38, 14.5, warmLedMat, false, false);
  }

  /* === MOTORIZED BI-PARTING TELESCOPING MAIN STREET SLIDING GATE (z = 14.5, tucks cleanly behind side walls!) === */
  const mainGateGroup = new THREE.Group();
  boundary.add(mainGateGroup);
  // Continuous brushed-steel ground sliding rail track across driveway opening & side pockets
  addBox(mainGateGroup, 28.2, 0.04, 0.28, 0, 0.045, 14.5, steelMat, false, true);
  function buildSlidingGatePanel(w, zPos) {
    const p = new THREE.Group();
    p.position.set(0, 0.96, zPos);
    // Heavy dark-bronze perimeter gate frame
    addBox(p, w, 0.11, 0.09, 0, 0.86, 0, darkBronzeMat, true, false);
    addBox(p, w, 0.12, 0.09, 0, -0.84, 0, darkBronzeMat, true, false);
    addBox(p, 0.11, 1.80, 0.09, -w / 2 + 0.055, 0, 0, darkBronzeMat, true, false);
    addBox(p, 0.11, 1.80, 0.09, w / 2 - 0.055, 0, 0, darkBronzeMat, true, false);
    // Sleek horizontal slatted walnut & bronze architectural louvers + champagne-gold centerpiece stripe
    for (let sy = -0.64; sy <= 0.68; sy += 0.19) {
      const isAccent = Math.abs(sy - 0.12) < 0.08;
      addBox(p, w - 0.18, isAccent ? 0.055 : 0.095, 0.05, 0, sy, 0, isAccent ? goldMat : walnutMat, true, false);
    }
    // Bottom rolling wheel bogies riding the steel rail
    for (const wx of [-w * 0.34, w * 0.34]) {
      addBox(p, 0.22, 0.10, 0.11, wx, -0.89, 0, steelMat, false, false);
    }
    mainGateGroup.add(p);
    return p;
  }
  const gateLeftOuter = buildSlidingGatePanel(4.42, 14.40);
  const gateLeftInner = buildSlidingGatePanel(4.42, 14.54);
  const gateRightInner = buildSlidingGatePanel(4.42, 14.54);
  const gateRightOuter = buildSlidingGatePanel(4.42, 14.40);

  function updateMainDoors(openRatio) {
    // 1. Bi-parting glass & gold sliding atrium entry door at top of arrival steps
    entryLeafLeft.position.x = CX - 0.56 - openRatio * 0.94;
    entryLeafRight.position.x = CX + 0.56 + openRatio * 0.94;
    // 2. Motorized 2-stage telescoping street sliding gate (tucks cleanly inside x=[-14.16, -9.44] & [+8.64, +13.66]!)
    gateLeftOuter.position.x = -6.78 + openRatio * (-11.95 - (-6.78));
    gateLeftInner.position.x = -2.42 + openRatio * (-11.65 - (-2.42));
    gateRightInner.position.x = 1.94 + openRatio * (10.85 - 1.94);
    gateRightOuter.position.x = 6.04 + openRatio * (11.45 - 6.04);
  }

  // Lush Organic Chitwan Tropical Trees & Garden Planters (rooted flush at earth y = -0.04, clear of veg farm, patios & paths!)
  function addGardenTree(x, z, scale = 1) {
    const tg = new THREE.Group();
    tg.position.set(x, -0.04, z);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.25 * scale, 2.6 * scale, 9), trunkMat);
    tr.position.y = 1.3 * scale;
    tr.castShadow = true;
    tg.add(tr);
    const puffs = [
      [0, 3.1, 0, 1.35], [-0.85, 2.6, 0.45, 0.95], [0.85, 2.75, -0.35, 1.05], [0.1, 3.7, -0.2, 0.92]
    ];
    puffs.forEach(([px, py, pz, pr], idx) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(pr * scale, 1), idx % 2 ? foliageLight : foliageDark);
      c.position.set(px * scale, py * scale, pz * scale);
      c.scale.y = 0.85;
      c.castShadow = true;
      tg.add(c);
    });
    addGarden(tg);
  }
  [
    [-12.4, 4.5, 1.35], [-13.1, -4.2, 1.35], [-13.4, -7.5, 1.25],
    [12.9, 3.8, 1.30], [13.1, -4.2, 1.35], [12.8, -10.8, 1.25],
    [-13.2, 13.1, 1.0], [13.2, 13.1, 1.0]
  ].forEach(([tx, tz, sc]) => addGardenTree(tx, tz, sc));

  // Flanking front driveway curb bollard lamps (grounded flush atop driveway curb y = 0.04, clear of UG vault & fire pit!)
  for (const bx of [-8.35, 8.15]) {
    for (const bz of [7.2, 10.0, 12.8]) {
      addGarden(addBox(landscape, 0.14, 0.56, 0.14, bx, 0.32, bz, darkBronzeMat));
      addGarden(addBox(landscape, 0.16, 0.14, 0.16, bx, 0.67, bz, warmLedMat, false, false));
    }
  }
  // Front lawn flowering planters (grounded flush on earth y = -0.04, clear of stepping path, UG vault, fire pit & corner trees!)
  for (const [px, pz, fl] of [
    [-12.6, 6.4, true], [-11.65, 6.4, true], [-10.7, 6.4, true],
    [-11.9, 13.2, true], [-10.95, 13.2, true], [-10.0, 13.2, true],
    [9.1, 6.6, true], [9.95, 6.6, false], [12.85, 6.6, true],
    [9.1, 13.45, false], [10.35, 13.45, true], [11.60, 13.45, false]
  ]) {
    addGarden(addPlanterTree(landscape, px, -0.04, pz, 0.65, fl));
  }

  /* === LANDSCAPED GARDEN WITH ZERO-GLITCH ARCHITECTURAL BENCHES, STEPPING PATHS & SUNKEN FIRE-PIT LOUNGE === */
  function addGardenBench(x, z, rotY = 0, baseY = -0.04, scaleW = 1.0) {
    const b = new THREE.Group();
    b.position.set(x, baseY, z); b.rotation.y = rotY;
    const W = 2.04 * scaleW;
    const hw = W / 2;
    const fx = hw - 0.035;         // Outer frame center X
    const innerW = W - 0.142;      // Clear inner slat span (stops 1 mm cleanly inside side frames — zero Z-fighting!)

    // Two solid powder-coated dark-bronze side frames with continuous front & rear armrest/backrest uprights
    for (const side of [-1, 1]) {
      const dx = side * fx;
      // Ground sled foot rail (y: 0.00..0.04)
      addBox(b, 0.06, 0.04, 0.56, dx, 0.02, 0, darkBronzeMat);
      // Front vertical leg + armrest post (y: 0.04..0.64 — supports front of armrest solidly!)
      addBox(b, 0.06, 0.60, 0.06, dx, 0.34, 0.23, darkBronzeMat);
      // Rear vertical leg + backrest post (y: 0.04..0.90 — single continuous post, zero coplanar overlap!)
      addBox(b, 0.06, 0.86, 0.06, dx, 0.47, -0.23, darkBronzeMat);
      // Horizontal side seat rail spanning strictly between front & rear posts (z: -0.20..+0.20)
      addBox(b, 0.06, 0.045, 0.40, dx, 0.40, 0, darkBronzeMat);
      // Teak armrest cap resting flush on front post (y: 0.64..0.685) & meeting rear post cleanly
      addBox(b, 0.08, 0.045, 0.47, dx, 0.6625, 0.035, woodMat);
    }
    // Center under-seat support leg + longitudinal cross-stretcher (strictly below seat slats!)
    addBox(b, 0.055, 0.40, 0.40, 0, 0.20, 0, darkBronzeMat);
    addBox(b, innerW, 0.04, 0.04, 0, 0.38, 0, darkBronzeMat);

    // 4 warm slatted teak seat planks inset cleanly between outer side frames (y: 0.4225..0.4675)
    for (let s = 0; s < 4; s++) {
      addBox(b, innerW, 0.045, 0.10, 0, 0.445, -0.155 + s * 0.11, woodMat);
    }
    // 3 angled slatted teak backrest planks cleanly mounted ahead of rear uprights
    for (let r = 0; r < 3; r++) {
      const slat = addBox(b, innerW, 0.092, 0.036, 0, 0.59 + r * 0.122, -0.186 - r * 0.011, woodMat);
      slat.rotation.x = -0.09;
    }
    // Weatherproof cream seat cushion resting cleanly atop seat slats (y: 0.470..0.532 — zero clipping!)
    addBox(b, innerW - 0.04, 0.062, 0.39, 0, 0.501, 0.02, upholsteryMat, false, false);
    // Warm recessed under-bench architectural LED accent bar
    addBox(b, innerW - 0.08, 0.024, 0.03, 0, 0.395, 0.21, warmLedMat, false, false);
    return addGarden(b);
  }

  // 1. Rear Garden Stone Patio, Stepping-Stone Lawn Walkways & 4 Architectural Park Benches
  // Patio grounded flush from earth (-0.04) up to topY = +0.05; gold border rim stepped 3 cm below top (zero Z-fighting!)
  addGarden(addBox(landscape, 7.6, 0.09, 3.8, -1.8, 0.005, -9.8, drivewayMat, false, true));
  addGarden(addBox(landscape, 7.74, 0.06, 3.94, -1.8, -0.01, -9.8, goldMat, false, false));
  // Stepping stones leading cleanly from rear terrace (clear of rear trench z=-5.65, grease trap x=-2.2 & rear patio z=-7.9!)
  for (let i = 0; i < 3; i++) {
    addGarden(addBox(landscape, 1.35, 0.07, 0.44, -0.45, -0.005, -6.15 - i * 0.60, stoneWallMat, false, true));
  }
  // Right-side garden stepping-stone path (passes cleanly through the 1.60 m right divider gateway at z=-5.65!)
  for (let sz = -9.50; sz <= 4.95; sz += 1.20) {
    addGarden(addBox(landscape, 1.05, 0.07, 0.54, 11.4, -0.005, sz, stoneWallMat, false, true));
  }
  // Four sculptural slatted-teak garden benches seated flush on their exact patio or lawn elevation
  addGardenBench(-2.1, -10.85, 0, 0.05, 1.0);          // Rear central patio bench facing villa (topY = 0.05)
  addGardenBench(0.85, -9.65, -Math.PI / 2, 0.05, 1.0); // Rear perpendicular conversation bench (topY = 0.05)
  addGardenBench(6.2, -9.8, -0.45, -0.04, 1.0);         // Rear-right garden lawn reading bench (earth = -0.04)
  addGardenBench(-11.6, -1.2, Math.PI / 2, -0.04, 1.0); // Left shaded garden walkway bench (earth = -0.04)
  // Low stone & walnut tea table seated flush atop rear stone patio (y: 0.05..0.48)
  addGarden(addBox(landscape, 1.15, 0.38, 0.68, -2.1, 0.24, -9.35, stoneWallMat));
  addGarden(addBox(landscape, 1.20, 0.05, 0.72, -2.1, 0.455, -9.35, walnutMat));

  // Rear garden bougainvillea & lavender flower beds (strictly on open grass — clear of patio, veg farm, septic & bollards!)
  for (const [fx, fz] of [[-6.55, -10.65], [3.05, -11.35], [8.85, -10.65], [-7.05, -7.45], [3.45, -7.45]]) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), foliageDark);
    bush.position.set(fx, 0.36, fz); addGarden(bush);
    for (let bi = 0; bi < 4; bi++) {
      const fl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), bi % 2 ? bougMat : lavenderMat);
      fl.position.set(fx + (bi - 1.5) * 0.23, 0.66 + (bi % 2) * 0.13, fz + (bi % 2 ? 0.20 : -0.16));
      addGarden(fl);
    }
  }
  // Warm garden pathway bollards (grounded flush at earth y = -0.04, clear of right trench drain x=10.25 & flower beds!)
  for (const [bx, bz] of [[-5.95, -7.55], [2.35, -7.55], [-5.95, -12.05], [2.35, -12.05], [12.35, -3.20], [12.35, 1.55]]) {
    addGarden(addBox(landscape, 0.13, 0.54, 0.13, bx, 0.23, bz, darkBronzeMat));
    addGarden(addBox(landscape, 0.15, 0.12, 0.15, bx, 0.56, bz, warmLedMat, false, false));
  }

  // 2. Front-Right Circular Sunken Fire-Pit Lounge with 3 Fitted Teak Benches (Matches Site Plan, Zero Driveway Overlap!)
  const fpX = 11.1, fpZ = 10.1;
  const fpPatio = new THREE.Mesh(new THREE.CylinderGeometry(2.48, 2.54, 0.12, 36), drivewayMat);
  fpPatio.position.set(fpX, 0.02, fpZ); fpPatio.receiveShadow = true; addGarden(fpPatio);
  const fpRim = new THREE.Mesh(new THREE.CylinderGeometry(2.58, 2.60, 0.06, 36), goldMat);
  fpRim.position.set(fpX, -0.01, fpZ); addGarden(fpRim);
  const fpBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.54, 0.42, 24), stoneWallMat);
  fpBowl.position.set(fpX, 0.29, fpZ); addGarden(fpBowl);
  const fpEmbers = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.10, 16), fireEmberMat);
  fpEmbers.position.set(fpX, 0.48, fpZ); addGarden(fpEmbers);
  const fireLight = new THREE.PointLight(0xff8432, 16, 11, 1.8);
  fireLight.position.set(fpX, 0.95, fpZ); addGarden(fireLight);
  // Three compact slatted-teak benches seated flush atop circular stone patio (topY = 0.08, all legs well inside R=2.48!)
  for (let bIdx = 0; bIdx < 3; bIdx++) {
    const ba = bIdx * (Math.PI * 2 / 3) + 0.5;
    addGardenBench(fpX + Math.cos(ba) * 1.76, fpZ + Math.sin(ba) * 1.76, -ba - Math.PI / 2, 0.08, 0.78);
  }

  // 3. ORGANIC KITCHEN VEGETABLE FARM & MINI GREENHOUSE PATCH (Sunlit Rear-Left Lawn: x: -12.7..-7.5, z: -13.0..-8.9!)
  const vegFarm = new THREE.Group();
  vegFarm.position.set(-10.1, 0.0, -10.95);
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b281c, roughness: 0.96 });
  const tomatoMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.35 });
  const carrotMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 });
  const vegBrightGreen = new THREE.MeshStandardMaterial({ color: 0x4ea832, roughness: 0.82 });
  const vegDarkGreen = new THREE.MeshStandardMaterial({ color: 0x266b28, roughness: 0.86 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1e5c45, roughness: 0.45 });
  // Gravel garden courtyard pad grounded solidly to earth (-0.04..+0.045) & low bamboo/teak garden border rails
  addBox(vegFarm, 5.2, 0.085, 4.1, 0, 0.0025, 0, stoneWallMat, false, true);
  for (const [fx, fz, fw, fd] of [[0, -2.02, 5.2, 0.06], [0, 2.02, 5.2, 0.06], [-2.58, 0, 0.06, 4.1]]) {
    addBox(vegFarm, fw, 0.42, fd, fx, 0.22, fz, woodMat, false, false);
  }
  // 3 Raised Cedar Timber Vegetable Beds with Rich Organic Soil + Micro-Drip Irrigation Tubing!
  const bedPositions = [-1.25, 0.0, 1.25];
  bedPositions.forEach((bz, bi) => {
    // Raised cedar plank frame + dark compost soil fill + black drip-line
    addBox(vegFarm, 2.75, 0.36, 0.88, -0.78, 0.19, bz, woodMat, true, true);
    addBox(vegFarm, 2.58, 0.32, 0.72, -0.78, 0.22, bz, soilMat, false, true);
    addBox(vegFarm, 2.48, 0.025, 0.025, -0.78, 0.40, bz, charcoalMat, false, false); // Micro-drip irrigation line
    if (bi === 0) {
      // Bed 1: Tomato & Chili Bamboo A-Frame Trellis + Leafy Vines & Red Tomatoes!
      for (const tx of [-1.75, -0.78, 0.18]) {
        addBox(vegFarm, 0.04, 1.15, 0.04, tx, 0.88, bz - 0.18, woodMat, false, false);
        addBox(vegFarm, 0.04, 1.15, 0.04, tx, 0.88, bz + 0.18, woodMat, false, false);
        const vine = new THREE.Mesh(UNIT_ICO, vegDarkGreen);
        vine.scale.set(0.28, 0.46, 0.24); vine.position.set(tx, 0.78, bz); vegFarm.add(vine);
        for (const [dx, dy, dz] of [[-0.14, 0.68, 0.16], [0.12, 0.86, -0.14], [0.05, 0.56, 0.18]]) {
          const tom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), tomatoMat);
          tom.position.set(tx + dx, dy, bz + dz); vegFarm.add(tom);
        }
      }
      addBox(vegFarm, 2.25, 0.035, 0.035, -0.78, 1.42, bz, woodMat, false, false); // Top trellis rail
    } else if (bi === 1) {
      // Bed 2: Crisp Emerald Cabbage Heads, Lettuce Rosettes & Spinach Rows!
      for (let ci = 0; ci < 5; ci++) {
        const cx = -1.78 + ci * 0.50;
        for (const dz of [-0.18, 0.18]) {
          const cab = new THREE.Mesh(UNIT_ICO, ci % 2 ? vegBrightGreen : vegDarkGreen);
          cab.scale.set(0.18, 0.14, 0.18); cab.position.set(cx, 0.46, bz + dz); vegFarm.add(cab);
        }
      }
    } else {
      // Bed 3: Organic Carrots (Orange Crowns + Feathery Green Tops), Radish & Kitchen Herbs!
      for (let ci = 0; ci < 6; ci++) {
        const cx = -1.85 + ci * 0.42;
        for (const dz of [-0.17, 0.17]) {
          const root = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.08, 8), carrotMat);
          root.position.set(cx, 0.40, bz + dz); vegFarm.add(root);
          const tuft = new THREE.Mesh(UNIT_ICO, vegBrightGreen);
          tuft.scale.set(0.11, 0.16, 0.11); tuft.position.set(cx, 0.52, bz + dz); vegFarm.add(tuft);
        }
      }
    }
  });
  // Compact Glass & Timber Seed-Starter Mini Greenhouse / Cold Frame (right side of veg farm!)
  addBox(vegFarm, 1.42, 0.44, 1.15, 1.55, 0.23, -0.92, woodMat, true, true);
  addBox(vegFarm, 1.28, 0.36, 1.00, 1.55, 0.26, -0.92, soilMat, false, true);
  for (const sx of [1.15, 1.55, 1.95]) {
    const sprout = new THREE.Mesh(UNIT_ICO, vegBrightGreen);
    sprout.scale.set(0.10, 0.12, 0.10); sprout.position.set(sx, 0.49, -0.92); vegFarm.add(sprout);
  }
  const ghGlass = addBox(vegFarm, 1.44, 0.04, 1.22, 1.55, 0.66, -0.92, atriumGlassMat, false, false);
  ghGlass.rotation.x = 0.24;
  addBox(vegFarm, 1.46, 0.05, 0.05, 1.55, 0.80, -1.50, darkBronzeMat, false, false);
  // Slatted Teak Dual-Chamber Compost Bin + Rainwater-Fed Irrigation Barrel with Brass Spigot + Watering Can!
  addBox(vegFarm, 1.15, 0.82, 0.72, 1.55, 0.43, 0.35, woodMat, true, true);
  addBox(vegFarm, 1.05, 0.06, 0.64, 1.55, 0.85, 0.35, darkBronzeMat, false, false);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.96, 16), barrelMat);
  rBarrel.position.set(1.62, 0.50, 1.38); rBarrel.castShadow = true; vegFarm.add(rBarrel);
  addBox(vegFarm, 0.04, 0.04, 0.14, 1.62, 0.28, 1.72, brassMat, false, false); // Brass irrigation spigot
  // Cute Brass/Green Garden Watering Can beside barrel
  const wCan = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), goldMat);
  wCan.position.set(0.95, 0.15, 1.42); vegFarm.add(wCan);
  addGarden(vegFarm);

  if (statusEl) statusEl.textContent = 'Calibrating golden-hour lighting & reflections…';
  await yieldMain();
  /* === LIGHTING MOODS === */
  const envCache = {};
  function applyMood(mood) {
    if (mood === 'day') {
      skyUniforms.cTop.value.setHex(0x3a7bd5);
      skyUniforms.cHorizon.value.setHex(0xd4e7f7);
      skyUniforms.cGround.value.setHex(0x20352a);
      scene.fog.color.setHex(0xc2d9ec);
      scene.fog.density = 0.0032;
      hemiLight.color.setHex(0xffffff);
      hemiLight.groundColor.setHex(0x4c6652);
      hemiLight.intensity = 1.45;
      sunLight.color.setHex(0xfff6e5);
      sunLight.intensity = 2.6;
      sunLight.position.set(-16, 28, 22);
      chandelierLight.intensity = 12;
      garageLight.intensity = 10;
      balconyGlowLight.intensity = 5;
      warmLedMat.emissiveIntensity = 0.9;
      chandelierOrbMat.emissiveIntensity = 1.1;
      interiorGlowMat.emissiveIntensity = 0.18;
      renderer.toneMappingExposure = 1.08;
      if (!envCache.day) envCache.day = buildEnvMap(0x5599e6, 0xd8ecfc, 0x3b5944, 0xfff8e6);
      scene.environment = envCache.day;
    } else if (mood === 'night') {
      skyUniforms.cTop.value.setHex(0x050b18);
      skyUniforms.cHorizon.value.setHex(0x162945);
      skyUniforms.cGround.value.setHex(0x040912);
      scene.fog.color.setHex(0x0a1626);
      scene.fog.density = 0.0068;
      hemiLight.color.setHex(0x4c6f9c);
      hemiLight.groundColor.setHex(0x121c27);
      hemiLight.intensity = 0.55;
      sunLight.color.setHex(0x7ca2d6);
      sunLight.intensity = 0.55;
      sunLight.position.set(16, 22, 16);
      chandelierLight.intensity = 56;
      garageLight.intensity = 34;
      balconyGlowLight.intensity = 28;
      warmLedMat.emissiveIntensity = 2.6;
      chandelierOrbMat.emissiveIntensity = 2.8;
      interiorGlowMat.emissiveIntensity = 0.85;
      renderer.toneMappingExposure = 1.18;
      if (!envCache.night) envCache.night = buildEnvMap(0x09162b, 0x1c3557, 0x09111c, 0x9fc2f0);
      scene.environment = envCache.night;
    } else {
      // Golden Hour (default — matches dream-home-refined-front.webp!)
      skyUniforms.cTop.value.setHex(0x1f3f72);
      skyUniforms.cHorizon.value.setHex(0xecab74);
      skyUniforms.cGround.value.setHex(0x101d2b);
      scene.fog.color.setHex(0x3a4a60);
      scene.fog.density = 0.0040;
      hemiLight.color.setHex(0xffe9cf);
      hemiLight.groundColor.setHex(0x2d4240);
      hemiLight.intensity = 1.15;
      sunLight.color.setHex(0xffd296);
      sunLight.intensity = 2.25;
      sunLight.position.set(-22, 17, 20);
      chandelierLight.intensity = 38;
      garageLight.intensity = 22;
      balconyGlowLight.intensity = 16;
      warmLedMat.emissiveIntensity = 1.95;
      chandelierOrbMat.emissiveIntensity = 2.2;
      interiorGlowMat.emissiveIntensity = 0.48;
      renderer.toneMappingExposure = 1.12;
      if (!envCache.golden) envCache.golden = buildEnvMap(0x274d82, 0xf2b57c, 0x20323c, 0xffd79b);
      scene.environment = envCache.golden;
    }
  }

  /* Camera Presets with Smooth Glide, Exact Unobstructed Room Framing & Floor/Mode Metadata */
  const CAM_PRESETS = {
    hero: { floor: 'all', mode: 'exterior', pos: [3.2, 11.4, 38.5], target: [0.4, 6.0, 2.0], badge: 'FULL VILLA NORMAL VIEW · FLOOR-CUT SPIRAL · EXTENDED LEFT BALCONIES', title: 'Normal Full-Estate Front View', desc: 'Complete normal view showing the entire villa, 2-car garage (Rolls-Royce & Mercedes-Benz), extended 1.9 m wraparound curved LED balconies with closed left privacy end, 4-flight floor-joined glass spiral atrium with curved indoor balconies & under-stair barrier, rooftop Party Shed, metal security barriers, garden fire pit & front gate.' },
    garageCars: { floor: 'ground', mode: 'exterior', pos: [-2.4, 2.25, 10.6], target: [-3.2, 0.92, 2.42], badge: '2-CAR LUXURY GARAGE · ROLLS-ROYCE PHANTOM & MERCEDES-BENZ AMG', title: 'Luxury 2-Car Garage — Rolls-Royce Phantom & Mercedes-Benz S-Class AMG', desc: 'Left bay: two-tone obsidian & pearl-silver Rolls-Royce Phantom with upright Parthenon chrome grille, golden Spirit of Ecstasy & coachline. Right bay: metallic selenite-silver Mercedes-Benz AMG with iconic 3-pointed star grille, Multibeam LEDs & red brake calipers.' },
    cutaway: { floor: 'all', mode: 'cutaway', pos: [-16.2, 9.4, 12.6], target: [-3.2, 5.8, -0.8], badge: '3D INTERIORS · WALL & CEILING DECOR · LIVE TVS · 8 BATHS', title: '3D Furnished Interior Cutaway', desc: 'Opens left glazed balcony doors & roof canopy to showcase wall art, LED cove ceilings, spinning ceiling fans, live animated 4K TVs, RGB gaming studio, 6 bedrooms & 8 spa bathrooms.' },
    livingKitchen: { floor: 'ground', mode: 'cutaway', pos: [-10.4, 2.6, -5.8], target: [-3.1, 1.45, -2.2], badge: 'GROUND FLOOR · LIVE 4K TV · COVE FAN · PIPED GAS KITCHEN', title: 'Main Living Room, Wall Decor & Piped Gas Kitchen', desc: 'Live animated 85" OLED TV on marble & fluted walnut wall, gallery art, drapes, spinning cove ceiling fan, 8-seat dining chandelier, plus 4-burner piped gas hob with stainless island chimney hood & gas leak sensor.' },
    familyOffice: { floor: 'first', mode: 'cutaway', pos: [-10.4, 5.8, 5.8], target: [-3.0, 4.8, 1.6], badge: 'FIRST FLOOR · FAMILY TV · LIVE CAD OFFICE · 3 ENSUITES', title: 'Family TV Lounge, Live CAD Office & 3 Ensuite Beds', desc: 'Slatted acoustic walnut Family Lounge with live animated TV, gallery art, drapes, sliding glass doors onto the 1.9 m Extended Left Coffee Terrace, dual-monitor Executive Office, plus Bedrooms 2, 3 & 4.' },
    masterSuite: { floor: 'second', mode: 'cutaway', pos: [-10.6, 8.8, -5.2], target: [-3.4, 8.0, -2.6], badge: 'SECOND FLOOR · MASTER SUITE · SUNSET BALCONY · WALK-IN ROBE', title: 'Grand Master Suite, Walk-in Robe & Sunset Balcony', desc: 'King master bed with gallery art, hanging gold pendants, ambient wall TV, velvet drapes, spinning cove ceiling fan, sliding doors onto the Extended Left Master Sun-Lounger Terrace, illuminated Walk-in Robe & Private Lounge TV 2.' },
    spaBaths: { floor: 'second', mode: 'cutaway', pos: [1.5, 8.85, -6.1], target: [-0.1, 7.85, -2.75], badge: 'SPA BATHS · FROSTED GLASS · RAIN & HANDHELD SHOWER · TUB · CURTAINS', title: 'Luxury Spa Bathrooms — Frosted Glass, Both Tub & Rain Shower + Toilet Curtains', desc: 'Inspect BOTH the freestanding egg soaking tub AND full satin frosted-glass walk-in rainfall + handheld shower cubicle, frosted privacy toilet divider, motorized waterproof toilet curtains, concealed-cistern bidet WCs & spinning exhaust fans across all 8 baths.' },
    gameRoom: { floor: 'roof', mode: 'cutaway', pos: [-9.8, 11.75, 4.35], target: [-4.8, 11.05, 1.45], badge: 'ROOFTOP STUDIO · ZERO-GLITCH VR CAR · ARCADE · 240Hz PC · AC', title: 'Live Animated PC, VR Motion Car, Arcade & AC Gaming Studio', desc: 'Clean zero-clipping enclosed studio with Split-Inverter AC, triple curved 240 FPS PC racing monitors, hydraulic VR motion sim-racing car cockpit, rear-wall retro neon arcade, 75" esports console OLED, spinning RGB PC fans & Media Lounge TV 3.' },
    bbqKitchen: { floor: 'roof', mode: 'exterior', pos: [-10.8, 12.8, -6.2], target: [-5.0, 11.3, -2.9], badge: 'ROOFTOP PERGOLA · GAS-PIPED 4-BURNER BBQ & CANOPY HOOD', title: 'Gas-Piped Outdoor BBQ Chef Kitchen & Canopy Exhaust Hood', desc: 'Travertine L-shaped BBQ bar fed by the dedicated safety-yellow gas riser with shutoff valve & leak sensor, commercial stainless canopy exhaust hood, glowing embers & blue flames, prep sink & 8-seat pergola dining.' },
    rooftopParty: { floor: 'roof', mode: 'exterior', pos: [-11.8, 16.6, 8.8], target: [-3.8, 13.7, 1.6], badge: 'ROOFTOP SKY-DECK · PARTY SHED · LIVE KARAOKE TV & FAN', title: 'All-Weather Room Party Shed, Mini-Bar & Karaoke Equalizer', desc: 'Elevated monsoon-proof steel & timber Party Shed featuring live animated karaoke audio-visualizer TV, spinning timber ceiling fan, draped festoon lights, backlit cocktail bar & extended left teak yoga terrace.' },
    laundry: { floor: 'roof', mode: 'exterior', pos: [10.4, 13.4, -8.4], target: [4.6, 11.4, -3.2], badge: 'ROOFTOP SERVICE WING · LAUNDRY · DRYING SHED · WC', title: 'Dedicated Laundry Room, Monsoon Drying Shed & Roof WC', desc: 'Enclosed laundry room (hot/cold piped washer & dryer, folding counter, sink), polycarbonate rain-safe drying shed with breeze louvers, stainless rails & Rooftop Guest WC with exhaust fan.' },
    spiralBalcony: { floor: 'all', mode: 'exterior', pos: [6.4, 7.6, 12.6], target: [4.65, 5.2, 3.65], badge: '4-FLIGHT FLOOR-CUT SPIRAL · INDOOR MEZZANINE BALCONIES · UNDER-STAIR BARRIER', title: 'Precision-Cut Spiral Staircase, Floor Joins & Curved Balcony Barriers', desc: 'Inspect all 4 floor-to-floor helical flights (66 marble/walnut steps) cleanly cut & joined flush onto every floor\'s curved indoor mezzanine balcony landing (GF 1.04 m, 1F 3.74 m, 2F 6.99 m, Roof 10.24 m, Sky-Bridge 12.74 m) with continuous curved helical glass balcony railings & a sculptural curved under-stair glass gallery barrier below!' },
    leftBalcony: { floor: 'all', mode: 'exterior', pos: [-17.8, 9.6, -4.6], target: [-8.2, 6.2, -0.4], badge: 'EXTENDED 1.9 m LEFT BALCONY WING · CLOSED LOUVER END · USABLE DECKS', title: 'Extended 1.9 m Wraparound Left Balconies & Closed Architectural Privacy End', desc: 'Transforms the entire left external floor into 5 usable resort decks — GF Covered Garden Veranda w/ colonnade, 1F Bistro Coffee Terrace, 2F Master Sunset Sun-Loungers, Roof Sunset View Bar-Rail & Sky-Deck Yoga Terrace — wrapped seamlessly by frameless glass rails, sliding balcony doors & closed at the rear-left end by a champagne-gold bronze louver screen!' },
    spiralBack: { floor: 'second', mode: 'exterior', pos: [5.2, 8.4, -10.8], target: [4.6, 6.2, -2.6], badge: 'BEHIND SPIRAL · BEDROOM 6 · 6 ENSUITES · 2 GUEST WCS', title: 'Behind the Spiral Staircase — Bedroom 6, Baths & Landings', desc: 'Looks straight into 2F Bedroom 6 (king bed, wall art, ceiling fan & wardrobe) & Ensuite 6, Ground Guest WC & Ensuite 1, 1F Ensuite 4 & Study, Rooftop Guest WC, plus the 4 floor-flush spiral mezzanine balcony landings & MEP shaft.' },
    stairTop: { floor: 'all', mode: 'exterior', pos: [11.8, 18.6, 11.8], target: [4.65, 15.2, 3.85], badge: 'STAIR-TOP FLUSH SKYLIGHT OCULUS · PARTY SKY-BRIDGE · REAR ESE MAST', title: 'Stair-Top Flush Architectural Skylight Oculus & Party Sky-Bridge', desc: 'Clean flat-topped sculptural white drum crown featuring a recessed low-iron circular glass skylight oculus, passive stack-ventilation louvers, direct Party Shed glass sky-bridge & discreet rear-mounted brushed-stainless ESE lightning mast.' },
    structuralSafety: { floor: 'all', mode: 'structural', pos: [-16.8, 5.2, 22.8], target: [0.8, 1.4, 1.8], badge: 'DEEP FOUNDATION · SEISMIC ISOLATORS · FLOOD BARRIERS · LIGHTNING', title: 'Deep RCC Pile-Raft Foundation, Seismic, Monsoon Flood & Lightning Protection', desc: 'Multi-hazard Chitwan resilience X-Ray: 16 deep bored RCC friction piles & waterproof raft with DPM liner, 16 safety-orange lead-rubber Seismic Base Isolators (NBC-105 Zone V), ductile shear-wall core with X-braced dampers, deployed hydraulic aluminum Flood Barriers & dewatering sump pumps, plus rear ESE Lightning Mast, roof Faraday copper ring & 3 deep copper Earth Pits.' },
    gasVault: { floor: 'all', mode: 'gas', pos: [12.3, 2.45, -0.25], target: [8.65, 1.05, -3.35], badge: 'WATERPROOF LOCKABLE LPG VAULT · CONCEALED WALL PIPING', title: 'Waterproof Lockable Dual-LPG Gas Cylinder Vault & Concealed Piping', desc: 'Elevated 24 cm rainproof concrete plinth, perforated steel drain grate, sloped monsoon hood, louvered vents, keyed padlock security door & twin cylinders piped via concealed wall-aligned safety-yellow lines to both GF Kitchen & Rooftop BBQ!' },
    waterFilter: { floor: 'all', mode: 'xray', pos: [-14.2, 3.2, 14.8], target: [-10.4, -0.6, 10.0], badge: '5-STAGE WATER PURIFICATION SIMULATION · LIVE TDS SCADA', title: 'Live 5-Stage Water Filtration Plant & Purification Simulation', desc: 'Watch raw water visibly transform from amber silt → Vortex Pre-Filter → Sand FRP → Activated Carbon → Hard-Water Softener → UV-C 254nm Quartz & RO Membrane into crystal-pure 28 ppm water with live digital SCADA telemetry.' },
    stormDrains: { floor: 'all', mode: 'xray', pos: [17.8, 11.4, 19.6], target: [0.4, 0.2, 2.5], badge: 'STORMWATER DRAINING & STRAINER LINES · TRENCHES · GREASE TRAP', title: 'Stormwater Draining & Strainer Line Network (X-Ray)', desc: 'Full monsoon protection: front gate & garage stainless trench grates, 3-side perimeter trench drains, 4 corner silt/leaf catch-basin strainers, baffled kitchen/BBQ grease trap, rainwater vortex mesh pre-filter, 4 inline brass Y-strainers & front-right non-return outfall valve.' },
    water: { floor: 'all', mode: 'xray', pos: [-13.8, 8.6, -14.8], target: [-0.4, 5.2, -2.0], badge: 'FULL 3D MEP SHOWCASE · CONCEALED WALL-ALIGNED PIPING', title: 'Complete 3D MEP Showcase: Wall-Aligned Water, Strainers, Vents & Gas', desc: 'All concealed 90° wall-aligned piping (100% invisible to naked eyes in Standard view) revealed in X-Ray: 18,000 L Cold Water (Blue), 500 L Solar Hot (Orange), Sanitary DWV (Violet), Rainwater + Mesh Filter (Teal), Storm Trenches & Grease Trap (Aqua), HVAC/Exhaust Vents (Silver-Cyan) & LPG Gas (Yellow).' },
    vegFarm: { floor: 'all', mode: 'exterior', pos: [-13.6, 3.8, -12.9], target: [-10.1, 0.55, -10.95], badge: 'ORGANIC KITCHEN VEGETABLE FARM · RAISED BEDS & GREENHOUSE', title: 'Organic Kitchen Vegetable Farm & Seed-Starter Greenhouse', desc: 'Sunlit rear-left vegetable garden with 3 raised cedar beds (tomatoes & chilies on bamboo trellises, cabbages & leafy greens, carrots & kitchen herbs), micro-drip irrigation fed by a rainwater barrel, mini glass cold-frame greenhouse & teak composter.' },
    garden: { floor: 'all', mode: 'exterior', pos: [-5.8, 3.6, -12.8], target: [-1.50, 0.65, -9.80], badge: 'REAR LANDSCAPED GARDEN · TEAK BENCHES & WALKWAY', title: 'Rear Garden Patio & Architectural Teak Benches', desc: 'Travertine stepping-stone garden walkway, four slatted-teak & dark-bronze benches with warm under-seat LED glow, low stone tea table & bougainvillea beds.' },
    firePit: { floor: 'all', mode: 'exterior', pos: [6.4, 3.7, 13.4], target: [11.1, 0.65, 10.1], badge: 'FRONT-RIGHT PATIO · SUNKEN FIRE-PIT LOUNGE', title: 'Circular Sunken Fire-Pit Lounge & Curved Benches', desc: 'Front-right circular stone patio featuring a glowing ember fire pit surrounded by three fitted teak-topped conversation benches and tropical palms.' },
    aerial: { floor: 'all', mode: 'exterior', pos: [-12.5, 27.5, 25.5], target: [-0.2, 5.2, 0.2], badge: 'AERIAL ESTATE · PARTY SHED · ERV HVAC · SOLAR · GARDEN', title: 'Aerial Property Overview', desc: 'Complete 16-aana estate showing the rooftop Party Shed, BBQ pergola with exhaust hood, Laundry Wing, 3,000 L tanks, ERV HVAC, spinning roof turbo-vent, Solar PV, gas vault, garden & perimeter wall.' }
  };
  let camGoalPos = null, camGoalTarget = null;
  let activeCamKey = 'hero', pinFloorLock = 'all', pinsVisible = true, walkMode = false;
  let rafId = 0, isSkipped = false, isHidden = document.hidden, lastScreenTick = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const liveStatusEl = document.getElementById('viewerLiveStatus');
  const mepLegendEl = document.getElementById('mepLiveLegend');
  const safetyLegendEl = document.getElementById('safetyLiveLegend');
  const captionTextEl = document.getElementById('viewerCaptionText');
  const announceStatus = msg => { if (liveStatusEl) liveStatusEl.textContent = msg; };

  /* Roving-tabindex keyboard fallback when native HTML focusgroup is unavailable (per modern-web-guidance toolbar guide) */
  if (!('focusGroup' in HTMLElement.prototype)) {
    document.querySelectorAll('[role="toolbar"][focusgroup]').forEach(bar => {
      const items = Array.from(bar.querySelectorAll('button'));
      if (!items.length) return;
      items.forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });
      bar.addEventListener('focusin', ({ target }) => {
        if (items.includes(target)) items.forEach(b => { b.tabIndex = b === target ? 0 : -1; });
      });
      bar.addEventListener('keydown', e => {
        const idx = items.indexOf(document.activeElement);
        if (idx < 0) return;
        const rtl = getComputedStyle(bar).direction === 'rtl';
        let next = -1;
        if (e.key === 'ArrowRight') next = (idx + (rtl ? -1 : 1) + items.length) % items.length;
        else if (e.key === 'ArrowLeft') next = (idx + (rtl ? 1 : -1) + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        if (next >= 0) {
          e.preventDefault();
          items[next].focus();
        }
      });
    });
  }

  /* 13 Exact 1-to-1 Interactive 3D Floating Room, Spa, Gas Vault & MEP Hover Pins */
  const pinLayer = document.getElementById('pinLayer');
  const PIN_SPECS = [
    { id: 'gameRoom', icon: '🎮', title: 'Game Room & VR Car', sub: 'VR Car · Arcade · 240Hz PC · AC', pos: new THREE.Vector3(-4.90, 11.40, 1.35), level: 'roof' },
    { id: 'rooftopParty', icon: '🎉', title: 'Party Shed & Bar', sub: 'Karaoke TV · Fan · Bar', pos: new THREE.Vector3(-3.80, 14.05, 1.70), level: 'roof' },
    { id: 'stairTop', icon: '✨', title: 'Stair-Top Skylight', sub: 'Flush Oculus · Sky-Bridge', pos: new THREE.Vector3(4.65, 15.75, 4.05), level: 'all' },
    { id: 'structuralSafety', icon: '🏗️', title: 'Foundation & Safety', sub: 'Piles · Seismic · Flood · ESE', pos: new THREE.Vector3(-4.20, 0.95, 6.20), level: 'all' },
    { id: 'bbqKitchen', icon: '🍖', title: 'BBQ Chef Kitchen', sub: 'Gas Grill · Canopy Hood', pos: new THREE.Vector3(-5.20, 11.45, -2.90), level: 'roof' },
    { id: 'laundry', icon: '🧺', title: 'Laundry & Drying', sub: 'Washer/Dryer · Rain Shed', pos: new THREE.Vector3(4.80, 11.55, -3.30), level: 'roof' },
    { id: 'spiralBalcony', icon: '🌀', title: 'Spiral Balconies', sub: '4 Floor Cuts · Under-Stair Barrier', pos: new THREE.Vector3(4.65, 5.45, 5.85), level: 'all' },
    { id: 'leftBalcony', icon: '🌅', title: 'Extended Left Wing', sub: '1.9 m Balconies · Closed Louver End', pos: new THREE.Vector3(-8.85, 7.65, -1.85), level: 'all' },
    { id: 'spiralBack', icon: '🛏️', title: 'Bedroom 6 & Bath 6', sub: 'Behind Spiral · Ensuite', pos: new THREE.Vector3(5.10, 8.15, -2.70), level: 'second' },
    { id: 'masterSuite', icon: '👑', title: 'Master Suite', sub: 'King Bed · Art · WIR', pos: new THREE.Vector3(-5.10, 8.20, -2.65), level: 'second' },
    { id: 'spaBaths', icon: '🛁', title: 'Spa Baths & WCs', sub: 'Tub & Rain Shower · Frosted · Curtains', pos: new THREE.Vector3(-0.05, 8.15, -2.75), level: 'second' },
    { id: 'familyOffice', icon: '💼', title: 'Family & Office', sub: 'Live TV · CAD Desk · 3 Beds', pos: new THREE.Vector3(-2.80, 4.90, 1.70), level: 'first' },
    { id: 'livingKitchen', icon: '🛋️', title: 'Living & Kitchen', sub: 'Live 4K TV · Gas Hob · RO Tap', pos: new THREE.Vector3(-3.20, 1.55, -2.50), level: 'ground' },
    { id: 'garageCars', icon: '🚘', title: 'Rolls-Royce & Benz', sub: 'Phantom · AMG · Inner Door', pos: new THREE.Vector3(-3.20, 1.45, 3.85), level: 'ground' },
    { id: 'gasVault', icon: '🔒', title: 'Lockable Gas Vault', sub: 'Waterproof LPG → Kitchens', pos: new THREE.Vector3(8.95, 1.65, -3.25), level: 'all' },
    { id: 'stormDrains', icon: '🌊', title: 'Storm & Strainers', sub: 'Trenches · Grease Trap · Y-Filter', pos: new THREE.Vector3(10.25, 0.55, 5.45), level: 'all' },
    { id: 'waterFilter', icon: '🧪', title: '5-Stage Water Filter', sub: 'Live UV/RO Sim · 28 ppm', pos: new THREE.Vector3(-10.85, 0.85, 10.20), level: 'all' },
    { id: 'vegFarm', icon: '🥬', title: 'Organic Veg Farm', sub: '3 Beds · Greenhouse · Drip', pos: new THREE.Vector3(-10.10, 1.25, -10.95), level: 'all' },
    { id: 'garden', icon: '🌿', title: 'Garden & Benches', sub: 'Rear Patio · 4 Teak Benches', pos: new THREE.Vector3(-1.50, 0.95, -9.80), level: 'all' },
    { id: 'firePit', icon: '🔥', title: 'Fire Pit Lounge', sub: 'Circular Patio · 3 Benches', pos: new THREE.Vector3(11.10, 0.90, 10.10), level: 'all' }
  ];
  const pinNodes = PIN_SPECS.map(spec => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin-3d';
    btn.dataset.pin = spec.id;
    btn.setAttribute('aria-label', `Fly camera to ${spec.title} — ${spec.sub}`);
    btn.innerHTML = `<span class="pin-dot" aria-hidden="true">${spec.icon}</span><span class="pin-label"><strong>${spec.title}</strong><span>${spec.sub}</span></span>`;
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('wheel', e => {
      e.preventDefault();
      e.stopPropagation();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
        deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
        bubbles: true, cancelable: true
      }));
    }, { passive: false });
    btn.addEventListener('click', e => { e.stopPropagation(); goPreset(spec.id, { userInitiated: true, fromPin: true }); });
    pinLayer.appendChild(btn);
    return { spec, btn, vec: new THREE.Vector3() };
  });
  /* Dirty-checked pin projection avoids unnecessary DOM style writes while camera is resting */
  let lastPinSig = '';
  function updatePins(force = false) {
    if (!pinsVisible || walkMode) { pinLayer.style.display = 'none'; lastPinSig = ''; return; }
    pinLayer.style.display = '';
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const curLevel = document.getElementById('modelLevel').value;
    const sig = `${w}|${h}|${curLevel}|${pinFloorLock}|${activeCamKey}|${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}|${controls.target.x.toFixed(2)},${controls.target.y.toFixed(2)},${controls.target.z.toFixed(2)}|${levels.roof.position.y.toFixed(2)}`;
    if (!force && sig === lastPinSig) return;
    lastPinSig = sig;
    pinNodes.forEach(({ spec, btn, vec }) => {
      // Hide unrelated other-floor pins only while locked onto a floor preset; orbiting/zooming unlocks all pins immediately!
      const levelOk = (curLevel === 'all' || spec.level === 'all' || spec.level === curLevel)
        && (pinFloorLock === 'all' || spec.level === pinFloorLock || spec.id === activeCamKey);
      if (!levelOk) { btn.style.display = 'none'; return; }
      vec.copy(spec.pos);
      if (spec.level !== 'all' && levels[spec.level]) vec.y += levels[spec.level].position.y;
      // Hide pins closer than 2.2 m to the camera lens so they never obscure close-up interior views
      if (vec.distanceTo(camera.position) < 2.2) { btn.style.display = 'none'; return; }
      vec.project(camera);
      if (vec.z > 1 || vec.x < -1.04 || vec.x > 1.04 || vec.y < -1.04 || vec.y > 1.04) {
        btn.style.display = 'none'; return;
      }
      const px = (vec.x * 0.5 + 0.5) * w;
      const py = (-vec.y * 0.5 + 0.5) * h;
      btn.style.display = '';
      btn.style.left = `${px}px`;
      btn.style.top = `${py}px`;
      btn.classList.toggle('pin-flip', px > w * 0.62);
      btn.classList.toggle('active', spec.id === activeCamKey && activeCamKey !== 'hero');
    });
  }

  let currentMepMode = 'standard';
  function applyWaterMode(mode) {
    currentMepMode = mode;
    const isStruct = mode === 'structural';
    const xray = mode === 'xray' || mode === 'mepIsolate';
    const isolate = mode === 'mepIsolate';
    const seeGround = xray || isStruct;
    waterXrayOnly.forEach(obj => { obj.visible = xray; });
    structuralXrayOnly.forEach(obj => { obj.visible = isStruct; });
    serviceShaftMat.opacity = isStruct ? 0.16 : isolate ? 0.14 : xray ? 0.22 : 1.0;
    serviceShaftMat.depthWrite = !seeGround;
    serviceShaftMat.needsUpdate = true;
    earth.material.transparent = seeGround;
    earth.material.opacity = isStruct ? 0.22 : isolate ? 0.24 : xray ? 0.34 : 1.0;
    earth.material.depthWrite = !seeGround;
    earth.material.needsUpdate = true;
    drivewayMat.transparent = seeGround;
    drivewayMat.opacity = isStruct ? 0.24 : isolate ? 0.26 : xray ? 0.36 : 1.0;
    drivewayMat.depthWrite = !seeGround;
    drivewayMat.needsUpdate = true;
    // In Piping Spotlight or Structural X-Ray mode, keep depthWrite:true to prevent transparent alpha-sorting flicker!
    [whiteMat, warmWallMat].forEach(m => {
      m.transparent = isolate || isStruct;
      m.opacity = isolate ? 0.28 : isStruct ? 0.42 : 1.0;
      m.depthWrite = true;
      m.needsUpdate = true;
    });
    [pipeColdMat, pipeHotMat, pipeDrainMat, pipeRainMat, pipeStormMat, pipeGasMat, ductVentMat].forEach(pm => {
      pm.emissiveIntensity = isolate ? 1.15 : xray ? 0.72 : 0.44;
    });
    ugChamber.visible = true;
    if (mepLegendEl) mepLegendEl.classList.toggle('is-visible', xray || activeCamKey === 'gasVault');
    if (safetyLegendEl) safetyLegendEl.classList.toggle('is-visible', isStruct);
  }
  function goPreset(name, opts = {}) {
    const p = CAM_PRESETS[name];
    if (!p) return;
    if (walkMode) exitWalkthrough(false);
    activeCamKey = name;
    pinFloorLock = p.floor || 'all';
    tour = false;
    spinning = false;
    document.getElementById('tourModel').setAttribute('aria-pressed', 'false');
    document.getElementById('rotateModel').setAttribute('aria-pressed', 'false');

    // Ensure the target room's floor is visible (never fly into a hidden floor!)
    const levelSel = document.getElementById('modelLevel');
    if (p.floor !== 'all' && levelSel.value !== 'all' && levelSel.value !== p.floor) {
      levelSel.value = 'all';
      Object.values(levels).forEach(g => { g.visible = true; });
      tower.visible = !exploded;
    }

    // Account for exploded floor vertical offset & aspect-aware framing on normal Hero view so nothing crops on any screen!
    const yOff = (exploded && p.floor !== 'all' && levels[p.floor]) ? (levels[p.floor].userData.targetY || 0) : 0;
    camGoalTarget = new THREE.Vector3(p.target[0], p.target[1] + yOff, p.target[2]);
    camGoalPos = new THREE.Vector3(p.pos[0], p.pos[1] + yOff, p.pos[2]);
    if (name === 'hero') {
      const aspect = Math.max(0.58, camera.aspect || 1.5);
      const distScale = aspect >= 1.38 ? 1.0 : Math.pow(1.38 / aspect, 0.80);
      camGoalPos.sub(camGoalTarget).multiplyScalar(distScale).add(camGoalTarget);
    }

    const presetsBar = document.getElementById('cameraPresets');
    let activePresetBtn = null;
    if (presetsBar) {
      presetsBar.querySelectorAll('button').forEach(b => {
        const isAct = b.dataset.cam === name;
        b.classList.toggle('active', isAct);
        b.setAttribute('aria-pressed', String(isAct));
        if (isAct) activePresetBtn = b;
      });
      // Smoothly scroll the horizontal preset bar so the selected pin/preset pill is always centered in view (zero page scroll jump!)
      if (activePresetBtn && presetsBar.scrollWidth > presetsBar.clientWidth) {
        const targetLeft = Math.max(0, activePresetBtn.offsetLeft - (presetsBar.clientWidth - activePresetBtn.clientWidth) / 2);
        if (typeof presetsBar.scrollTo === 'function') {
          presetsBar.scrollTo({ left: targetLeft, behavior: reduced ? 'auto' : 'smooth' });
        } else {
          presetsBar.scrollLeft = targetLeft;
        }
      }
    }
    document.getElementById('viewerBadge').textContent = p.badge;
    if (captionTextEl) captionTextEl.innerHTML = `<strong>${p.title}</strong>${p.desc}`;

    // Automatically apply the exact display / X-Ray / Gas Vault mode required by this view
    if (p.mode === 'cutaway') {
      document.getElementById('modelDisplay').value = 'cutaway';
      document.getElementById('waterSystemMode').value = 'standard';
      applyDisplay(); applyWaterMode('standard');
    } else if (p.mode === 'xray') {
      const mepMode = name === 'water' ? 'mepIsolate' : 'xray';
      document.getElementById('waterSystemMode').value = mepMode;
      document.getElementById('modelDisplay').value = 'exterior';
      applyDisplay(); applyWaterMode(mepMode);
    } else if (p.mode === 'structural') {
      document.getElementById('waterSystemMode').value = 'structural';
      document.getElementById('modelDisplay').value = 'exterior';
      applyDisplay(); applyWaterMode('structural');
      // Auto-deploy hydraulic monsoon flood barriers so the full disaster-safety suite is immediately showcased!
      floodGateTarget = 1;
      if (reduced) { floodGatePos = 1; updateFloodBarriers(1); }
      syncDoorButtons();
    } else if (p.mode === 'gas') {
      document.getElementById('waterSystemMode').value = 'xray';
      document.getElementById('modelDisplay').value = 'exterior';
      applyDisplay(); applyWaterMode('xray');
      // Auto-unlock & swing open the waterproof gas vault door for easy inspection!
      gasVaultTarget = 1;
      if (reduced) { gasVaultPos = 1; updateGasVault(1); }
      syncDoorButtons();
    } else {
      if (document.getElementById('modelDisplay').value === 'cutaway') {
        document.getElementById('modelDisplay').value = 'exterior';
        applyDisplay();
      }
      if (document.getElementById('waterSystemMode').value !== 'standard') {
        document.getElementById('waterSystemMode').value = 'standard';
        applyWaterMode('standard');
      }
    }
    if (mepLegendEl) mepLegendEl.classList.toggle('is-visible', (currentMepMode === 'xray' || currentMepMode === 'mepIsolate') || name === 'gasVault');
    if (safetyLegendEl) safetyLegendEl.classList.toggle('is-visible', currentMepMode === 'structural');

    // Bring 3D viewer smoothly into view when jumping from sections below or clicking a clipped pin/preset
    if (opts.scrollToViewer || opts.userInitiated) {
      const vc = document.getElementById('viewerContainer');
      if (vc && !isStageFullscreen()) {
        const rect = vc.getBoundingClientRect();
        const clipped = rect.top < 54 || rect.bottom > window.innerHeight + 24;
        if (opts.scrollToViewer || clipped) {
          vc.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        }
      }
      announceStatus(`Camera moved to ${p.title}`);
    }

    // Snap immediately if user prefers reduced motion, otherwise wake loop & glide smoothly straight to the pin point
    if (reduced && camGoalPos && camGoalTarget) {
      camera.position.copy(camGoalPos);
      controls.target.copy(camGoalTarget);
      camGoalPos = camGoalTarget = null;
      controls.update();
      renderer.render(scene, camera);
    } else {
      isSkipped = false;
      startLoop();
    }
    updatePins(true);
  }
  document.getElementById('cameraPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-cam]');
    if (b) goPreset(b.dataset.cam, { userInitiated: true });
  });
  document.getElementById('jumpGame3D')?.addEventListener('click', () => goPreset('gameRoom', { scrollToViewer: true, userInitiated: true }));
  document.getElementById('jumpParty3D')?.addEventListener('click', () => goPreset('rooftopParty', { scrollToViewer: true, userInitiated: true }));
  document.getElementById('jumpLaundry3D')?.addEventListener('click', () => goPreset('laundry', { scrollToViewer: true, userInitiated: true }));
  controls.addEventListener('start', () => {
    camGoalPos = camGoalTarget = null;
    if (pinFloorLock !== 'all') {
      pinFloorLock = 'all';
      updatePins(true);
    }
  });

  /* Resize */
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* Controls Wiring: Motorized Doors, Lockable Waterproof Gas Vault & Real-Home Walkthrough */
  let exploded = false, spinning = false, tour = false, tourStart = 0, lastTime = 0, lastTourStop = -1;
  let walkBobPhase = 0, walkFloorIdx = 0;
  const walkFloors = [1.88, 5.28, 8.56, 11.86, 14.35];
  const walkKeys = { fwd: false, back: false, left: false, right: false, fast: false };
  const WALK_STOPS = {
    entry: { pos: [4.4, 2.35, 9.6], look: [4.4, 2.4, 3.2], floorIdx: 0, mode: 'exterior', title: 'Walkthrough · Arrival Gate & Spiral Entry', desc: 'Walking through the front sliding gate toward the grand arrival steps & glass spiral chandelier atrium.' },
    living: { pos: [-2.8, 1.88, -1.6], look: [-6.8, 1.55, -2.55], floorIdx: 0, mode: 'walls', title: 'Walkthrough · Ground Living Room (Live 4K TV)', desc: 'Eye-level inside the Main Living Room facing the animated 85" OLED TV, fluted marble wall, gallery art & spinning ceiling fan.' },
    kitchen: { pos: [-3.1, 1.88, -2.6], look: [-0.95, 1.35, -1.25], floorIdx: 0, mode: 'walls', title: 'Walkthrough · Ground Floor Gas Kitchen & Dining', desc: 'Standing beside the marble dining table looking into the waterfall island, 4-burner piped gas hob, stainless chimney hood & gas leak sensor.' },
    family: { pos: [-2.2, 5.28, 2.5], look: [-4.8, 4.95, 0.2], floorIdx: 1, mode: 'walls', title: 'Walkthrough · 1F Family Lounge & Live CAD Office', desc: 'Eye-level inside the 1st Floor Family Lounge with live TV, acoustic walnut wall, drapes & dual-monitor Executive Office beside you.' },
    master: { pos: [-3.4, 8.56, -1.4], look: [-5.4, 8.15, -3.2], floorIdx: 2, mode: 'walls', title: 'Walkthrough · 2F Grand Master Suite', desc: 'Inside the Master Suite featuring the king bed, framed wall art, hanging gold pendants, spinning ceiling fan & ambient wall TV.' },
    spa: { pos: [0.3, 8.56, -1.3], look: [-0.15, 7.85, -3.15], floorIdx: 2, mode: 'walls', title: 'Walkthrough · 2F Master Spa Bath & WC', desc: 'Inside the Master Spa Ensuite: freestanding soaking tub with teak candle caddy, luxury WC with flush plate & bidet, double vanity, rain shower & exhaust fan.' },
    game: { pos: [-4.6, 11.86, 2.6], look: [-4.95, 11.35, 0.2], floorIdx: 3, mode: 'walls', title: 'Walkthrough · Rooftop Live Gaming Studio', desc: 'Inside the RGB Gaming Studio watching triple curved 240 FPS PC racing monitors, live esports console TV & spinning RGB tower fans.' },
    bbq: { pos: [-3.6, 11.86, -1.8], look: [-6.5, 11.45, -3.3], floorIdx: 3, mode: 'exterior', title: 'Walkthrough · Rooftop BBQ Chef Kitchen', desc: 'Standing under the slatted teak pergola facing the gas-piped 4-burner BBQ grill, stainless canopy exhaust hood & wrap serving bar.' },
    gas: { pos: [11.2, 1.72, -1.1], look: [8.85, 1.05, -3.25], floorIdx: 0, mode: 'exterior', title: 'Walkthrough · Waterproof Lockable Gas Cylinder Vault', desc: 'Inspecting the external elevated 24 cm rainproof LPG enclosure, keyed padlock door, twin cylinders & concealed wall-aligned gas piping to both kitchens.' },
    filter: { pos: [-13.4, 1.95, 13.4], look: [-10.85, -0.45, 10.2], floorIdx: 0, mode: 'exterior', title: 'Walkthrough · 5-Stage Water Filtration Simulation', desc: 'Standing at the glass inspection vault watching raw water purify live through Vortex Silt, Sand, Carbon, Softener & UV-C/RO stages with real-time TDS SCADA screen.' },
    veg: { pos: [-13.2, 1.85, -13.6], look: [-10.1, 0.65, -10.95], floorIdx: 0, mode: 'exterior', title: 'Walkthrough · Organic Kitchen Vegetable Farm', desc: 'Walking beside the 3 raised cedar beds (tomatoes, leafy greens, carrots & herbs), seed-starter greenhouse, rainwater drip barrel & organic composter.' }
  };

  // Motorized Door, Safety Doors, Sliding Doors (28), Garage, Motorized Curtains & Lockable Gas Vault States
  let mainDoorPos = 1, mainDoorTarget = 1;
  let safetyDoorPos = 1, safetyDoorTarget = 1;
  let slidingDoorMode = 'default'; // 'default' (balconies breezy, suites private) | 'open' (all 28 open) | 'closed' (all 28 sealed)
  let slidingDemo = false, slidingDemoStart = 0;
  let garageDoorPos = 1, garageDoorTarget = 1;
  let curtainPos = 0, curtainTarget = 0; // 0 = Folded/Open at sides, 1 = Unfolded/Closed across windows!
  let gasVaultPos = 0, gasVaultTarget = 0;
  let floodGatePos = 0, floodGateTarget = 0; // 0 = Retracted flush below grade, 1 = Deployed hydraulic aluminum flood wall!
  const btnMainDoor = document.getElementById('toggleMainDoor');
  const btnSafetyDoors = document.getElementById('toggleSafetyDoors');
  const btnSlidingDoors = document.getElementById('toggleSlidingDoors');
  const btnSlidingDemo = document.getElementById('toggleSlidingDemo');
  const btnGarageDoor = document.getElementById('toggleGarageDoor');
  const btnCurtains = document.getElementById('toggleCurtains');
  const btnGasLock = document.getElementById('toggleGasLock');
  const btnFloodGate = document.getElementById('toggleFloodGate');
  const btnWalk = document.getElementById('walkthroughBtn');
  const panelMainDoor = document.getElementById('panelMainDoor');
  const panelSafetyDoors = document.getElementById('panelSafetyDoors');
  const panelSlidingDoors = document.getElementById('panelSlidingDoors');
  const panelSlidingDemo = document.getElementById('panelSlidingDemo');
  const panelGarageDoor = document.getElementById('panelGarageDoor');
  const panelCurtains = document.getElementById('panelCurtains');
  const panelGasLock = document.getElementById('panelGasLock');
  const panelFloodGate = document.getElementById('panelFloodGate');
  const panelWalkBtn = document.getElementById('panelWalkBtn');
  const dotMainDoor = document.getElementById('dotMainDoor');
  const dotSafetyDoors = document.getElementById('dotSafetyDoors');
  const dotSlidingDoors = document.getElementById('dotSlidingDoors');
  const dotSlidingDemo = document.getElementById('dotSlidingDemo');
  const dotGarageDoor = document.getElementById('dotGarageDoor');
  const dotCurtains = document.getElementById('dotCurtains');
  const dotGasLock = document.getElementById('dotGasLock');
  const dotFloodGate = document.getElementById('dotFloodGate');
  const walkHud = document.getElementById('walkHud');

  function syncDoorButtons() {
    const mOpen = mainDoorTarget >= 0.5;
    const sOpen = safetyDoorTarget >= 0.5;
    const slOpen = slidingDoorMode === 'open';
    const gOpen = garageDoorTarget >= 0.5;
    const cUnfolded = curtainTarget >= 0.5;
    const gasOpen = gasVaultTarget >= 0.5;
    // Toolbar buttons keep constant label text (ZERO horizontal shift!) and update aria-pressed + LED dot color
    btnMainDoor.setAttribute('aria-pressed', String(mOpen));
    if (dotMainDoor) dotMainDoor.className = 'btn-dot ' + (mOpen ? 'is-open' : 'is-closed');
    panelMainDoor.setAttribute('aria-pressed', String(mOpen));
    panelMainDoor.classList.toggle('gold', mOpen);
    panelMainDoor.textContent = mOpen ? '🚪 Main Door & Gate: Open' : '🚪 Main Door & Gate: Closed';

    btnSafetyDoors.setAttribute('aria-pressed', String(sOpen));
    if (dotSafetyDoors) dotSafetyDoors.className = 'btn-dot ' + (sOpen ? 'is-open' : 'is-closed');
    panelSafetyDoors.setAttribute('aria-pressed', String(sOpen));
    panelSafetyDoors.classList.toggle('gold', sOpen);
    panelSafetyDoors.textContent = sOpen ? '🛡️ Floor Safety Doors: Open' : '🛡️ Floor Safety Doors: Closed';

    if (btnSlidingDoors) btnSlidingDoors.setAttribute('aria-pressed', String(slOpen));
    if (dotSlidingDoors) dotSlidingDoors.className = 'btn-dot ' + (slOpen ? 'is-open' : 'is-closed');
    if (panelSlidingDoors) {
      panelSlidingDoors.setAttribute('aria-pressed', String(slOpen));
      panelSlidingDoors.classList.toggle('gold', slOpen);
      panelSlidingDoors.textContent = slidingDoorMode === 'open'
        ? '↔ Suite & Balcony Sliders: All Open'
        : slidingDoorMode === 'closed'
          ? '↔ Suite & Balcony Sliders: All Closed'
          : '↔ Suite & Balcony Sliders: Private';
    }

    if (btnSlidingDemo) btnSlidingDemo.setAttribute('aria-pressed', String(slidingDemo));
    if (dotSlidingDemo) dotSlidingDemo.className = 'btn-dot ' + (slidingDemo ? 'is-open' : 'is-closed');
    if (panelSlidingDemo) {
      panelSlidingDemo.setAttribute('aria-pressed', String(slidingDemo));
      panelSlidingDemo.classList.toggle('gold', slidingDemo);
      panelSlidingDemo.textContent = slidingDemo ? '🔄 Sliding Door Simulation: Running' : '🔄 Sliding Door Simulation: Off';
    }

    btnGarageDoor.setAttribute('aria-pressed', String(gOpen));
    if (dotGarageDoor) dotGarageDoor.className = 'btn-dot ' + (gOpen ? 'is-open' : 'is-closed');
    panelGarageDoor.setAttribute('aria-pressed', String(gOpen));
    panelGarageDoor.classList.toggle('gold', gOpen);
    panelGarageDoor.textContent = gOpen ? '🚘 Garage Rolling Door: Open' : '🚘 Garage Rolling Door: Closed';

    btnCurtains.setAttribute('aria-pressed', String(cUnfolded));
    if (dotCurtains) dotCurtains.className = 'btn-dot ' + (cUnfolded ? 'is-open' : 'is-closed');
    panelCurtains.setAttribute('aria-pressed', String(cUnfolded));
    panelCurtains.classList.toggle('gold', cUnfolded);
    panelCurtains.textContent = cUnfolded ? '🪟 Motorized Curtains: Unfolded' : '🪟 Motorized Curtains: Folded';

    btnGasLock.setAttribute('aria-pressed', String(gasOpen));
    if (dotGasLock) dotGasLock.className = 'btn-dot ' + (gasOpen ? 'is-open' : 'is-locked');
    panelGasLock.setAttribute('aria-pressed', String(gasOpen));
    panelGasLock.classList.toggle('gold', gasOpen);
    panelGasLock.textContent = gasOpen ? '🔓 Gas Cylinder Vault: Unlocked' : '🔒 Gas Cylinder Vault: Locked';

    const floodUp = floodGateTarget >= 0.5;
    btnFloodGate.setAttribute('aria-pressed', String(floodUp));
    if (dotFloodGate) dotFloodGate.className = 'btn-dot ' + (floodUp ? 'is-open' : 'is-closed');
    panelFloodGate.setAttribute('aria-pressed', String(floodUp));
    panelFloodGate.classList.toggle('gold', floodUp);
    panelFloodGate.textContent = floodUp ? '🌊 Hydraulic Flood Barriers: Deployed' : '🌊 Hydraulic Flood Barriers: Stowed';
  }
  function toggleMainDoor() {
    mainDoorTarget = mainDoorTarget >= 0.5 ? 0 : 1;
    if (reduced) { mainDoorPos = mainDoorTarget; updateMainDoors(mainDoorPos); }
    syncDoorButtons();
    announceStatus(mainDoorTarget >= 0.5 ? 'Main sliding door and street gate opened' : 'Main sliding door and street gate closed');
    startLoop();
  }
  function toggleSafetyDoors() {
    safetyDoorTarget = safetyDoorTarget >= 0.5 ? 0 : 1;
    if (reduced) { safetyDoorPos = safetyDoorTarget; updateSafetyDoors(safetyDoorPos); }
    syncDoorButtons();
    announceStatus(safetyDoorTarget >= 0.5 ? 'All floor and entry safety doors opened' : 'All floor and entry safety doors closed');
    startLoop();
  }
  function toggleSlidingDoors() {
    if (slidingDemo) {
      slidingDemo = false;
      updateMainDoors(mainDoorPos);
    }
    slidingDoorMode = slidingDoorMode === 'open' ? 'closed' : 'open';
    setAllSlidingDoorTargets(slidingDoorMode);
    if (reduced) {
      for (let i = 0; i < slidingDoors.length; i++) {
        slidingDoors[i].pos = slidingDoors[i].target;
        applySlidingDoorPose(slidingDoors[i], slidingDoors[i].pos);
      }
    }
    syncDoorButtons();
    announceStatus(slidingDoorMode === 'open'
      ? `All ${slidingDoors.length} balcony and frosted suite sliding doors gliding open`
      : `All ${slidingDoors.length} balcony and frosted suite sliding doors sliding closed for full privacy`);
    startLoop();
  }
  function toggleSlidingDemo() {
    slidingDemo = !slidingDemo;
    if (slidingDemo) {
      slidingDemoStart = performance.now();
    } else {
      setAllSlidingDoorTargets(slidingDoorMode);
      updateMainDoors(mainDoorPos);
    }
    syncDoorButtons();
    announceStatus(slidingDemo
      ? `Live sliding door simulation started across all ${slidingDoors.length} balcony, suite and atrium sliders`
      : 'Live sliding door simulation stopped');
    startLoop();
  }
  function toggleGarageDoor() {
    garageDoorTarget = garageDoorTarget >= 0.5 ? 0 : 1;
    if (reduced) { garageDoorPos = garageDoorTarget; updateGarageDoor(garageDoorPos); }
    syncDoorButtons();
    announceStatus(garageDoorTarget >= 0.5 ? 'Garage rolling door opened' : 'Garage rolling door closed');
    startLoop();
  }
  function toggleCurtains() {
    curtainTarget = curtainTarget >= 0.5 ? 0 : 1;
    if (reduced) { curtainPos = curtainTarget; updateCurtains(curtainPos); }
    syncDoorButtons();
    announceStatus(curtainTarget >= 0.5 ? 'Motorized curtains unfolding across all windows' : 'Motorized curtains folding open to sides');
    startLoop();
  }
  function toggleGasLock() {
    gasVaultTarget = gasVaultTarget >= 0.5 ? 0 : 1;
    if (reduced) { gasVaultPos = gasVaultTarget; updateGasVault(gasVaultPos); }
    syncDoorButtons();
    announceStatus(gasVaultTarget >= 0.5 ? 'Gas cylinder vault unlocked and door opened' : 'Gas cylinder vault closed and padlocked');
    startLoop();
  }
  function toggleFloodGate() {
    floodGateTarget = floodGateTarget >= 0.5 ? 0 : 1;
    if (reduced) { floodGatePos = floodGateTarget; updateFloodBarriers(floodGatePos); }
    syncDoorButtons();
    announceStatus(floodGateTarget >= 0.5 ? 'Hydraulic aluminum flood barriers raised across gate and garage' : 'Hydraulic aluminum flood barriers retracted flush below grade');
    startLoop();
  }
  btnMainDoor.onclick = toggleMainDoor;
  panelMainDoor.onclick = toggleMainDoor;
  btnSafetyDoors.onclick = toggleSafetyDoors;
  panelSafetyDoors.onclick = toggleSafetyDoors;
  if (btnSlidingDoors) btnSlidingDoors.onclick = toggleSlidingDoors;
  if (panelSlidingDoors) panelSlidingDoors.onclick = toggleSlidingDoors;
  if (btnSlidingDemo) btnSlidingDemo.onclick = toggleSlidingDemo;
  if (panelSlidingDemo) panelSlidingDemo.onclick = toggleSlidingDemo;
  btnGarageDoor.onclick = toggleGarageDoor;
  panelGarageDoor.onclick = toggleGarageDoor;
  btnCurtains.onclick = toggleCurtains;
  panelCurtains.onclick = toggleCurtains;
  btnGasLock.onclick = toggleGasLock;
  panelGasLock.onclick = toggleGasLock;
  btnFloodGate.onclick = toggleFloodGate;
  panelFloodGate.onclick = toggleFloodGate;
  updateMainDoors(mainDoorPos);
  updateSafetyDoors(safetyDoorPos);
  for (let i = 0; i < slidingDoors.length; i++) applySlidingDoorPose(slidingDoors[i], slidingDoors[i].pos);
  updateGarageDoor(garageDoorPos);
  updateCurtains(curtainPos);
  updateGasVault(gasVaultPos);
  updateFloodBarriers(floodGatePos);
  syncDoorButtons();

  function jumpWalkStop(key) {
    const st = WALK_STOPS[key];
    if (!st) return;
    walkFloorIdx = st.floorIdx;
    if (exploded) { exploded = false; arrangeFloors(); document.getElementById('explodeModel').setAttribute('aria-pressed', 'false'); }
    document.getElementById('modelLevel').value = 'all';
    Object.values(levels).forEach(g => { g.visible = true; });
    tower.visible = true;
    document.getElementById('modelDisplay').value = st.mode || 'walls';
    applyDisplay();
    if (key === 'gas') { gasVaultTarget = 1; syncDoorButtons(); }
    if (key === 'entry') { mainDoorTarget = 1; syncDoorButtons(); }
    const p = new THREE.Vector3(...st.pos);
    const dir = new THREE.Vector3(...st.look).sub(p).normalize();
    camGoalPos = p.clone();
    camGoalTarget = p.clone().addScaledVector(dir, 0.35);
    document.getElementById('viewerBadge').textContent = 'REAL-HOME WALKTHROUGH · EYE-LEVEL VIRTUAL TOUR';
    if (captionTextEl) captionTextEl.innerHTML = `<strong>${st.title}</strong>${st.desc}`;
    startLoop();
  }
  function enterWalkthrough(startStop = 'entry') {
    walkMode = true;
    tour = false; spinning = false;
    document.getElementById('tourModel').setAttribute('aria-pressed', 'false');
    document.getElementById('rotateModel').setAttribute('aria-pressed', 'false');
    btnWalk.setAttribute('aria-pressed', 'true');
    btnWalk.querySelector('.btn-dot').className = 'btn-dot is-open';
    panelWalkBtn.setAttribute('aria-pressed', 'true');
    panelWalkBtn.classList.add('gold');
    panelWalkBtn.textContent = '✕ Exit Real-Home Walkthrough';
    walkHud.classList.add('is-active');
    camera.fov = 62;
    camera.updateProjectionMatrix();
    controls.minDistance = 0.08;
    controls.maxDistance = 2.5;
    controls.maxPolarAngle = Math.PI * 0.85;
    jumpWalkStop(startStop);
    updatePins(true);
    announceStatus('Entered real-home eye-level walkthrough mode');
  }
  function exitWalkthrough(restoreHero = true) {
    if (!walkMode) return;
    walkMode = false;
    Object.keys(walkKeys).forEach(k => { walkKeys[k] = false; });
    btnWalk.setAttribute('aria-pressed', 'false');
    btnWalk.querySelector('.btn-dot').className = 'btn-dot';
    panelWalkBtn.setAttribute('aria-pressed', 'false');
    panelWalkBtn.classList.remove('gold');
    panelWalkBtn.textContent = '🚶 Real-Home Walkthrough';
    walkHud.classList.remove('is-active');
    camera.fov = 40;
    camera.updateProjectionMatrix();
    controls.minDistance = 3.5;
    controls.maxDistance = 85;
    controls.maxPolarAngle = Math.PI * 0.495;
    if (restoreHero) goPreset('hero');
    updatePins(true);
    announceStatus('Exited walkthrough mode');
  }
  btnWalk.onclick = () => { if (walkMode) exitWalkthrough(true); else enterWalkthrough('entry'); };
  panelWalkBtn.onclick = () => { if (walkMode) exitWalkthrough(true); else enterWalkthrough('entry'); };
  document.getElementById('exitWalkBtn').onclick = () => exitWalkthrough(true);
  document.getElementById('walkRoomJumps').addEventListener('click', e => {
    const b = e.target.closest('[data-walk]');
    if (b) jumpWalkStop(b.dataset.walk);
  });
  document.getElementById('walkFloorUp').onclick = () => {
    walkFloorIdx = Math.min(walkFloors.length - 1, walkFloorIdx + 1);
    const dy = walkFloors[walkFloorIdx] - camera.position.y;
    camera.position.y += dy; controls.target.y += dy;
    announceStatus(`Moved up to floor level ${walkFloorIdx + 1}`);
  };
  document.getElementById('walkFloorDown').onclick = () => {
    walkFloorIdx = Math.max(0, walkFloorIdx - 1);
    const dy = walkFloors[walkFloorIdx] - camera.position.y;
    camera.position.y += dy; controls.target.y += dy;
    announceStatus(`Moved down to floor level ${walkFloorIdx + 1}`);
  };
  // Touch & Pointer Hold D-Pad inside Walkthrough HUD
  walkHud.querySelectorAll('[data-move]').forEach(btn => {
    const dir = btn.dataset.move;
    const on = e => { e.preventDefault(); walkKeys[dir] = true; startLoop(); };
    const off = () => { walkKeys[dir] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });
  document.addEventListener('keydown', e => {
    if (!walkMode) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') { walkKeys.fwd = true; e.preventDefault(); }
    else if (k === 's' || e.key === 'ArrowDown') { walkKeys.back = true; e.preventDefault(); }
    else if (k === 'a' || e.key === 'ArrowLeft') { walkKeys.left = true; e.preventDefault(); }
    else if (k === 'd' || e.key === 'ArrowRight') { walkKeys.right = true; e.preventDefault(); }
    else if (e.key === 'Shift') walkKeys.fast = true;
    else if (k === 'e') document.getElementById('walkFloorUp').click();
    else if (k === 'q') document.getElementById('walkFloorDown').click();
    else if (e.key === 'Escape') exitWalkthrough(true);
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') walkKeys.fwd = false;
    else if (k === 's' || e.key === 'ArrowDown') walkKeys.back = false;
    else if (k === 'a' || e.key === 'ArrowLeft') walkKeys.left = false;
    else if (k === 'd' || e.key === 'ArrowRight') walkKeys.right = false;
    else if (e.key === 'Shift') walkKeys.fast = false;
  });

  function arrangeFloors() {
    Object.values(levels).forEach((g, i) => { g.userData.targetY = exploded ? i * 2.7 : 0; });
    tower.visible = !exploded && document.getElementById('modelLevel').value === 'all';
  }
  function stepZoom(factor) {
    camGoalPos = camGoalTarget = null;
    const offset = camera.position.clone().sub(controls.target);
    const curDist = offset.length();
    const minD = controls.minDistance || 3.5;
    const maxD = controls.maxDistance || 85;
    const nextDist = THREE.MathUtils.clamp(curDist * factor, minD, maxD);
    if (curDist > 0.001) offset.multiplyScalar(nextDist / curDist);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    renderer.render(scene, camera);
    updatePins(true);
    startLoop();
  }
  document.getElementById('zoomIn').onclick = () => stepZoom(0.84);
  document.getElementById('zoomOut').onclick = () => stepZoom(1.19);
  document.getElementById('fitModel').onclick = () => goPreset('hero', { userInitiated: true });
  document.getElementById('explodeModel').onclick = () => {
    if (walkMode) exitWalkthrough(false);
    exploded = !exploded;
    arrangeFloors();
    document.getElementById('explodeModel').setAttribute('aria-pressed', String(exploded));
    announceStatus(exploded ? 'Floors exploded vertically' : 'Floors stacked back together');
    updatePins(true);
    startLoop();
  };
  document.getElementById('togglePins').onclick = () => {
    pinsVisible = !pinsVisible;
    document.getElementById('togglePins').setAttribute('aria-pressed', String(pinsVisible));
    updatePins(true);
    announceStatus(pinsVisible ? '3D room pins shown' : '3D room pins hidden');
  };
  document.getElementById('rotateModel').onclick = () => {
    if (walkMode) exitWalkthrough(false);
    spinning = !spinning; tour = false; camGoalPos = null;
    document.getElementById('rotateModel').setAttribute('aria-pressed', String(spinning));
    document.getElementById('tourModel').setAttribute('aria-pressed', 'false');
    announceStatus(spinning ? 'Auto-rotate enabled' : 'Auto-rotate paused');
    startLoop();
  };

  /* Multi-Stop Real-Home Cinematic Guided Tour (Walks exterior -> living/kitchen -> spa baths -> live game room -> gas vault -> full MEP X-Ray!) */
  const TOUR_STOPS = [
    { pos: [4.2, 4.2, 22.5], target: [2.2, 4.5, 3.8], mode: 'exterior', mep: 'standard', badge: 'GUIDED TOUR 1/8 · ARRIVAL GATE & SPIRAL ATRIUM', title: 'Grand Arrival — Sliding Gate, Portal & Spiral Chandelier', desc: 'Approaching the estate through the motorized sliding street gate toward the 2-car garage portal and glass chandelier atrium.' },
    { pos: [-10.4, 2.7, -5.8], target: [-3.1, 1.45, -2.2], mode: 'cutaway', mep: 'standard', badge: 'GUIDED TOUR 2/8 · LIVING TV 1 & PIPED GAS KITCHEN', title: 'Main Living Room, Wall Decor, Ceiling Fan & Gas Kitchen', desc: 'Live animated 85" OLED TV, fluted marble wall, framed gallery art, spinning cove ceiling fan, and 4-burner gas kitchen with island chimney hood.' },
    { pos: [-10.4, 5.8, 5.8], target: [-3.0, 4.8, 1.6], mode: 'cutaway', mep: 'standard', badge: 'GUIDED TOUR 3/8 · 1F FAMILY LOUNGE & LIVE CAD OFFICE', title: '1st Floor Family Lounge & Executive Home Office', desc: 'Acoustic walnut Family TV lounge opening onto the curved LED balcony beside the dual-monitor BIM/CAD office.' },
    { pos: [1.5, 8.9, -6.2], target: [-0.8, 7.8, -2.75], mode: 'cutaway', mep: 'standard', badge: 'GUIDED TOUR 4/8 · 2F MASTER SUITE & LUXURY SPA BATH', title: 'Master Suite & Spa Bathroom with Soaking Tub & Toilet', desc: 'Freestanding soaking tub with candle caddy, concealed-cistern WC with bidet & flush plate, double vanity, rain shower & spinning exhaust fan.' },
    { pos: [-10.4, 12.5, 4.7], target: [-4.8, 11.2, 1.3], mode: 'cutaway', mep: 'standard', badge: 'GUIDED TOUR 5/8 · LIVE ANIMATED PC & CONSOLE GAME ROOM', title: 'Rooftop RGB Gaming Studio (Live Playing Screens)', desc: 'Triple curved 240 FPS PC racing monitors, live esports console match OLED, spinning RGB PC tower fans & acoustic ceiling.' },
    { pos: [-11.5, 16.0, 8.2], target: [-4.4, 13.1, -0.4], mode: 'exterior', mep: 'standard', badge: 'GUIDED TOUR 6/8 · ROOFTOP PARTY SHED & BBQ CHEF KITCHEN', title: 'All-Weather Party Shed (Karaoke TV) & Gas BBQ Kitchen', desc: 'Monsoon-proof Party Shed with live audio-visualizer TV & ceiling fan above the gas-piped 4-burner outdoor BBQ kitchen & canopy hood.' },
    { pos: [12.3, 2.45, -0.25], target: [8.65, 1.05, -3.35], mode: 'exterior', mep: 'xray', gasOpen: true, badge: 'GUIDED TOUR 7/8 · WATERPROOF LOCKABLE GAS VAULT', title: 'Waterproof Lockable LPG Vault & Kitchen Gas Lines', desc: 'Padlock unlocks & door opens smoothly revealing the 24 cm rainproof plinth, twin cylinders, regulator & yellow gas piping to both kitchens.' },
    { pos: [-13.8, 8.6, -14.8], target: [-0.4, 5.2, -2.0], mode: 'exterior', mep: 'mepIsolate', badge: 'GUIDED TOUR 8/8 · FULL 3D MEP PIPING & VENTILATION', title: 'Complete 3D MEP Showcase: Water, Vents, Drainage & Gas', desc: 'Full translucent BIM view of 18,000 L Cold Water, Solar Hot Water, DWV Sanitary Stacks, Rainwater Harvest, HVAC/Exhaust Ducts & LPG Gas.' }
  ];
  document.getElementById('tourModel').onclick = () => {
    if (walkMode) exitWalkthrough(false);
    tour = !tour; spinning = false; camGoalPos = null; tourStart = performance.now(); lastTourStop = -1;
    document.getElementById('tourModel').setAttribute('aria-pressed', String(tour));
    document.getElementById('rotateModel').setAttribute('aria-pressed', 'false');
    announceStatus(tour ? 'Started real-home cinematic guided tour' : 'Stopped guided tour');
    startLoop();
  };
  /* Dual-Engine Fullscreen hook wired into top-level Invoker Commands (`#modelStage` `command` event) */
  onStageFullscreenSync = () => {
    if (isStageFullscreen()) {
      isSkipped = false;
      startLoop();
    }
    requestAnimationFrame(() => { resize(); updatePins(true); });
    setTimeout(() => { resize(); updatePins(true); }, 140);
  };
  document.getElementById('resetAnimation').onclick = () => {
    if (walkMode) exitWalkthrough(false);
    tour = false; spinning = false; exploded = false; pinsVisible = true; arrangeFloors();
    mainDoorTarget = 1; safetyDoorTarget = 1; garageDoorTarget = 1; curtainTarget = 0; gasVaultTarget = 0; floodGateTarget = 0;
    slidingDemo = false; slidingDoorMode = 'default'; setAllSlidingDoorTargets('default');
    if (reduced) {
      mainDoorPos = 1; safetyDoorPos = 1; garageDoorPos = 1; curtainPos = 0; gasVaultPos = 0; floodGatePos = 0;
      updateMainDoors(1); updateSafetyDoors(1); updateGarageDoor(1); updateCurtains(0); updateGasVault(0); updateFloodBarriers(0);
      for (let i = 0; i < slidingDoors.length; i++) {
        slidingDoors[i].pos = slidingDoors[i].defaultOpen;
        applySlidingDoorPose(slidingDoors[i], slidingDoors[i].pos);
      }
    }
    syncDoorButtons();
    Object.values(levels).forEach(g => { g.visible = true; });
    tower.visible = true;
    document.getElementById('modelLevel').value = 'all';
    document.getElementById('explodeModel').setAttribute('aria-pressed', 'false');
    document.getElementById('togglePins').setAttribute('aria-pressed', 'true');
    goPreset('hero');
  };
  document.getElementById('modelLevel').onchange = e => {
    const v = e.target.value;
    pinFloorLock = 'all';
    Object.entries(levels).forEach(([k, g]) => { g.visible = v === 'all' || v === k; });
    tower.visible = v === 'all' && !exploded;
    updatePins(true);
    startLoop();
  };

  const exteriorPalettes = {
    // [whiteMat stucco, warmWallMat accent, goldMat trim, darkBronzeMat mullions/barriers]
    ivory:      [0xf5f2eb, 0xebe2d4, 0xd4ad6a, 0x22262c],
    pearl:      [0xfcfdfb, 0xf1f3f5, 0xdfc084, 0x2b313a],
    sand:       [0xe2cfb2, 0xd3ba96, 0xb8864c, 0x30261e],
    graphite:   [0x48525e, 0x343c47, 0xd8a088, 0x161a20],
    sage:       [0xc7d1be, 0xb4c0ab, 0xc4b082, 0x243028],
    navy:       [0x243854, 0xeae5db, 0xdcb46e, 0x121d2c],
    terracotta: [0xd99b7c, 0xebe0cf, 0xcfa056, 0x3a251c],
    emerald:    [0x26463b, 0xdfe3dc, 0xd8b46a, 0x152620],
    champagne:  [0xe6dac4, 0xd7c6aa, 0xc79e58, 0x181a1f],
    arctic:     [0xf4f7fb, 0xdce5f0, 0xbecad6, 0x263445],
    espresso:   [0x5c4435, 0xeee5d8, 0xc88255, 0x221712],
    royal:      [0x433042, 0xf2ebe4, 0xdeb86e, 0x1c141d]
  };
  const interiorPalettes = {
    // [upholsteryMat, woodMat, bedMat, velvetDrapeMat]
    warm:        [0xc8bba8, 0x7b563c, 0xebe6dd, 0x3b4859],
    cool:        [0x97aebc, 0x566877, 0xe4eaed, 0x273a4e],
    earth:       [0xa39f7c, 0x6e503b, 0xdbc9ae, 0x4b4231],
    mono:        [0x8b9097, 0x323942, 0xe7e7e5, 0x1f242c],
    emeraldGold: [0x3d6658, 0x583c28, 0xf0ebe2, 0x1e473a],
    royalNavy:   [0x354b6e, 0x61412b, 0xf2eee7, 0x1c2c4a],
    blushMarble: [0xcfaea8, 0x9c7250, 0xf7f1ec, 0x6c4c4a],
    zenTeak:     [0xc9c2b2, 0x8f623e, 0xf4f0e8, 0x5a574b]
  };
  function applyColors() {
    const f = exteriorPalettes[document.getElementById('facadeColor').value] || exteriorPalettes.ivory;
    const i = interiorPalettes[document.getElementById('interiorColor').value] || interiorPalettes.warm;
    whiteMat.color.setHex(f[0]);
    warmWallMat.color.setHex(f[1]);
    goldMat.color.setHex(f[2]);
    darkBronzeMat.color.setHex(f[3]);
    upholsteryMat.color.setHex(i[0]);
    woodMat.color.setHex(i[1]);
    bedMat.color.setHex(i[2]);
    velvetDrapeMat.color.setHex(i[3]);
  }
  function applyDisplay() {
    const mode = document.getElementById('modelDisplay').value;
    const slider = Number(document.getElementById('modelOpacity').value) / 100;
    atriumGlassMat.opacity = mode === 'cutaway' ? 0.08 : mode === 'walls' ? 0.18 : Math.max(0.14, slider * 0.72);
    interiorWalls.forEach(w => { w.visible = mode !== 'exterior'; });
    cutawayShells.forEach(s => { s.visible = mode !== 'cutaway'; });
    interiorDecor.forEach(d => { d.visible = true; });
  }
  document.getElementById('lightingMood').addEventListener('change', e => { applyMood(e.target.value); startLoop(); });
  document.getElementById('facadeColor').addEventListener('change', () => { applyColors(); startLoop(); });
  document.getElementById('interiorColor').addEventListener('change', () => { applyColors(); startLoop(); });
  document.getElementById('modelDisplay').addEventListener('change', () => { applyDisplay(); startLoop(); });
  document.getElementById('waterSystemMode').addEventListener('change', e => { applyWaterMode(e.target.value); startLoop(); });
  document.getElementById('modelOpacity').addEventListener('input', () => { applyDisplay(); startLoop(); });
  document.getElementById('gardenVisibility').addEventListener('change', e => {
    const m = e.target.value;
    landscape.visible = m !== 'off';
    boundary.visible = m === 'all' || m === 'boundary';
    gardenObjects.forEach(o => { o.visible = m === 'all' || m === 'garden'; });
    startLoop();
  });
  document.getElementById('resetColors').onclick = () => {
    document.getElementById('lightingMood').value = 'golden';
    document.getElementById('facadeColor').value = 'ivory';
    document.getElementById('interiorColor').value = 'warm';
    document.getElementById('modelDisplay').value = 'exterior';
    document.getElementById('waterSystemMode').value = 'standard';
    document.getElementById('modelOpacity').value = '38';
    document.getElementById('gardenVisibility').value = 'all';
    landscape.visible = true; boundary.visible = true;
    gardenObjects.forEach(o => { o.visible = true; });
    applyMood('golden'); applyColors(); applyDisplay(); applyWaterMode('standard');
    announceStatus('Appearance reset to default golden hour');
    startLoop();
  };

  applyMood('golden');
  applyColors();
  applyDisplay();
  applyWaterMode('standard');

  /* Efficient Background Processing (per modern-web-guidance) */
  const modelSection = document.getElementById('model');
  const _walkFwd = new THREE.Vector3(), _walkRight = new THREE.Vector3(), _walkMove = new THREE.Vector3();
  const _tourPosA = new THREE.Vector3(), _tourPosB = new THREE.Vector3(), _tourTgtA = new THREE.Vector3(), _tourTgtB = new THREE.Vector3();
  const _doorPosMain = new THREE.Vector3(4.5, 1.8, 6.2), _doorPosGarage = new THREE.Vector3(-3.0, 1.8, 5.2), _doorPosGas = new THREE.Vector3(8.95, 1.8, -3.25), _sdWorldPos = new THREE.Vector3();

  function startLoop() {
    if (rafId || isSkipped || isHidden) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(animate);
  }
  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  if ('contentVisibility' in document.documentElement.style) {
    modelSection.addEventListener('contentvisibilityautostatechange', e => {
      isSkipped = e.skipped;
      if (isSkipped) stopLoop(); else { resize(); startLoop(); }
    });
  } else {
    const io = new IntersectionObserver(es => {
      isSkipped = !es[0].isIntersecting;
      if (isSkipped) stopLoop(); else { resize(); startLoop(); }
    }, { rootMargin: '200px' });
    io.observe(modelSection);
  }
  document.addEventListener('visibilitychange', () => {
    isHidden = document.hidden;
    if (isHidden) stopLoop(); else startLoop();
  });

  function animate(time = 0) {
    rafId = 0;
    if (isSkipped || isHidden) return;
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    const tSec = time * 0.001;

    Object.values(levels).forEach(g => {
      g.position.y += ((g.userData.targetY || 0) - g.position.y) * Math.min(1, dt * 5.5);
    });

    // Smooth motorized sliding main door/gate, overhead rolling garage door & lockable waterproof gas vault!
    if (Math.abs(mainDoorTarget - mainDoorPos) > 0.001) {
      const step = Math.min(Math.abs(mainDoorTarget - mainDoorPos), dt * 0.72);
      mainDoorPos += Math.sign(mainDoorTarget - mainDoorPos) * step;
      const eM = mainDoorPos < 0.5 ? 4 * mainDoorPos * mainDoorPos * mainDoorPos : 1 - Math.pow(-2 * mainDoorPos + 2, 3) / 2;
      updateMainDoors(eM);
    }
    if (Math.abs(garageDoorTarget - garageDoorPos) > 0.001) {
      const step = Math.min(Math.abs(garageDoorTarget - garageDoorPos), dt * 0.65);
      garageDoorPos += Math.sign(garageDoorTarget - garageDoorPos) * step;
      const eG = garageDoorPos < 0.5 ? 4 * garageDoorPos * garageDoorPos * garageDoorPos : 1 - Math.pow(-2 * garageDoorPos + 2, 3) / 2;
      updateGarageDoor(eG);
    }
    if (Math.abs(gasVaultTarget - gasVaultPos) > 0.001) {
      const step = Math.min(Math.abs(gasVaultTarget - gasVaultPos), dt * 0.85);
      gasVaultPos += Math.sign(gasVaultTarget - gasVaultPos) * step;
      const eV = gasVaultPos < 0.5 ? 4 * gasVaultPos * gasVaultPos * gasVaultPos : 1 - Math.pow(-2 * gasVaultPos + 2, 3) / 2;
      updateGasVault(eV);
    }
    if (Math.abs(safetyDoorTarget - safetyDoorPos) > 0.001) {
      const step = Math.min(Math.abs(safetyDoorTarget - safetyDoorPos), dt * 0.82);
      safetyDoorPos += Math.sign(safetyDoorTarget - safetyDoorPos) * step;
      const eS = safetyDoorPos < 0.5 ? 4 * safetyDoorPos * safetyDoorPos * safetyDoorPos : 1 - Math.pow(-2 * safetyDoorPos + 2, 3) / 2;
      updateSafetyDoors(eS);
    }
    if (Math.abs(curtainTarget - curtainPos) > 0.001) {
      const step = Math.min(Math.abs(curtainTarget - curtainPos), dt * 0.58);
      curtainPos += Math.sign(curtainTarget - curtainPos) * step;
      const eC = curtainPos < 0.5 ? 4 * curtainPos * curtainPos * curtainPos : 1 - Math.pow(-2 * curtainPos + 2, 3) / 2;
      updateCurtains(eC);
    }
    if (Math.abs(floodGateTarget - floodGatePos) > 0.001) {
      const step = Math.min(Math.abs(floodGateTarget - floodGatePos), dt * 0.72);
      floodGatePos += Math.sign(floodGateTarget - floodGatePos) * step;
      const eF = floodGatePos < 0.5 ? 4 * floodGatePos * floodGatePos * floodGatePos : 1 - Math.pow(-2 * floodGatePos + 2, 3) / 2;
      updateFloodBarriers(eF);
    }

    // Real-Time Sliding Door Simulation: Smooth soft-close glide for ALL 28 balcony & frosted suite sliding doors (+ choreographed Demo Wave & Walkthrough Proximity Sensor!)
    if (slidingDemo && !reduced) {
      const elapsed = (time - slidingDemoStart) * 0.001;
      const cycleDur = 5.6;
      const waveVal = (t) => {
        const u = ((t % cycleDur) + cycleDur) % cycleDur;
        if (u < 1.35) return u / 1.35;          // Smooth glide open
        if (u < 2.80) return 1;                 // Pause open
        if (u < 4.15) return 1 - (u - 2.80) / 1.35; // Soft-close glide shut
        return 0;                               // Pause sealed
      };
      // Sync bi-parting glass atrium entry door cleanly in the live sliding simulation!
      const atriumW = waveVal(elapsed);
      const atriumE = atriumW < 0.5 ? 4 * atriumW * atriumW * atriumW : 1 - Math.pow(-2 * atriumW + 2, 3) / 2;
      entryLeafLeft.position.x = CX - 0.56 - atriumE * 0.94;
      entryLeafRight.position.x = CX + 0.56 + atriumE * 0.94;
      for (let i = 0; i < slidingDoors.length; i++) {
        const sd = slidingDoors[i];
        sd.pos = waveVal(elapsed + sd.phase);
        applySlidingDoorPose(sd, sd.pos);
      }
    } else {
      for (let i = 0; i < slidingDoors.length; i++) {
        const sd = slidingDoors[i];
        if (walkMode) {
          sd.doorGroup.getWorldPosition(_sdWorldPos);
          const dx = camera.position.x - _sdWorldPos.x;
          const dz = camera.position.z - _sdWorldPos.z;
          const dy = Math.abs(camera.position.y - (_sdWorldPos.y + 1.2));
          const horizDist = Math.hypot(dx, dz);
          const baseT = slidingDoorMode === 'open' ? 1 : slidingDoorMode === 'closed' ? 0 : sd.defaultOpen;
          if (horizDist < 3.2 && dy < 2.2) sd.target = 1;
          else if (horizDist > 3.7 || dy >= 2.2) sd.target = baseT;
        }
        const diff = sd.target - sd.pos;
        if (Math.abs(diff) > 0.001) {
          const step = Math.min(Math.abs(diff), dt * 0.95);
          sd.pos += Math.sign(diff) * step;
          applySlidingDoorPose(sd, sd.pos);
        }
      }
    }

    // First-Person Real-Home Walkthrough Physics (WASD / Touch D-Pad + Head-Bob + Proximity Auto-Doors!)
    if (walkMode && !camGoalPos) {
      const fwdAmt = (walkKeys.fwd ? 1 : 0) - (walkKeys.back ? 1 : 0);
      const strafeAmt = (walkKeys.right ? 1 : 0) - (walkKeys.left ? 1 : 0);
      if (fwdAmt || strafeAmt) {
        camera.getWorldDirection(_walkFwd);
        _walkFwd.y = 0;
        if (_walkFwd.lengthSq() > 0.0001) _walkFwd.normalize();
        _walkRight.crossVectors(_walkFwd, camera.up).normalize();
        _walkMove.set(0, 0, 0).addScaledVector(_walkFwd, fwdAmt).addScaledVector(_walkRight, strafeAmt).normalize();
        const spd = (walkKeys.fast ? 5.6 : 3.2) * dt;
        _walkMove.multiplyScalar(spd);
        camera.position.add(_walkMove);
        controls.target.add(_walkMove);
        // Keep within estate grounds cleanly
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -15.5, 15.5);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -14.5, 15.5);
        if (!reduced) {
          walkBobPhase += dt * (walkKeys.fast ? 11.5 : 8.2);
          const targetY = walkFloors[walkFloorIdx] + Math.sin(walkBobPhase) * 0.032;
          const dy = (targetY - camera.position.y) * Math.min(1, dt * 10);
          camera.position.y += dy; controls.target.y += dy;
        }
      }
      // Proximity auto-opening doors when walking nearby!
      if (camera.position.distanceTo(_doorPosMain) < 4.5 && mainDoorTarget < 0.5) {
        mainDoorTarget = 1; syncDoorButtons();
      }
      if (camera.position.distanceTo(_doorPosGarage) < 4.5 && garageDoorTarget < 0.5) {
        garageDoorTarget = 1; syncDoorButtons();
      }
      if (camera.position.distanceTo(_doorPosGas) < 4.2 && gasVaultTarget < 0.5) {
        gasVaultTarget = 1; syncDoorButtons();
      }
    }

    // Disable OrbitControls damping during automated camera glides/tour so momentum NEVER fights or snaps the camera back!
    controls.enableDamping = !(tour || !!camGoalPos);

    if (camGoalPos && camGoalTarget) {
      const f = 1 - Math.exp(-dt * 7.5);
      camera.position.lerp(camGoalPos, f);
      controls.target.lerp(camGoalTarget, f);
      if (camera.position.distanceTo(camGoalPos) < 0.04 && controls.target.distanceTo(camGoalTarget) < 0.04) {
        camera.position.copy(camGoalPos);
        controls.target.copy(camGoalTarget);
        camGoalPos = camGoalTarget = null;
        controls.enableDamping = true;
      }
    }

    // Glitch-Free Multi-Stop Real-Home Cinematic Guided Tour
    if (tour && !reduced) {
      const dur = 6.2;
      const totalT = (time - tourStart) / 1000;
      const idx = Math.floor(totalT / dur) % TOUR_STOPS.length;
      const nextIdx = (idx + 1) % TOUR_STOPS.length;
      const u = (totalT % dur) / dur;
      const g = u < 0.48 ? 0 : (u - 0.48) / 0.52;
      const s = g < 0.5 ? 4 * g * g * g : 1 - Math.pow(-2 * g + 2, 3) / 2;
      const A = TOUR_STOPS[idx], B = TOUR_STOPS[nextIdx];
      if (idx !== lastTourStop) {
        lastTourStop = idx;
        document.getElementById('modelDisplay').value = A.mode;
        document.getElementById('waterSystemMode').value = A.mep;
        applyDisplay(); applyWaterMode(A.mep);
        if (A.gasOpen) { gasVaultTarget = 1; syncDoorButtons(); }
        document.getElementById('viewerBadge').textContent = A.badge;
        if (captionTextEl) captionTextEl.innerHTML = `<strong>${A.title}</strong>${A.desc}`;
      }
      _tourPosA.set(...A.pos); _tourPosB.set(...B.pos);
      _tourTgtA.set(...A.target); _tourTgtB.set(...B.target);
      camera.position.lerpVectors(_tourPosA, _tourPosB, s);
      controls.target.lerpVectors(_tourTgtA, _tourTgtB, s);
    }

    controls.autoRotate = spinning && !tour && !walkMode && !reduced;
    controls.autoRotateSpeed = 0.72;

    // Smooth Live Simulation: TVs/Gaming/Water SCADA (~16 FPS), VR Motion Racing Car Wheel/Rig, 5-Stage Color-Shifting Water Drops, Fans & MEP Flow!
    if (!reduced) {
      if (time - lastScreenTick > 62) {
        lastScreenTick = time;
        updateLiveScreens(tSec);
      }
      for (let i = 0; i < spinningFans.length; i++) {
        const f = spinningFans[i];
        f.obj.rotation[f.axis] += dt * f.speed;
      }
      // Active VR Sim-Racing Steering Wheel + Smooth Hydraulic Motion Cockpit Tilt!
      if (vrSteeringWheel && vrCarMotionPivot) {
        const steer = Math.sin(tSec * 2.1) * 0.58 + Math.cos(tSec * 0.95) * 0.24;
        vrSteeringWheel.rotation.z = steer;
        vrCarMotionPivot.rotation.z = -steer * 0.075;
        vrCarMotionPivot.rotation.x = Math.sin(tSec * 3.2) * 0.028;
      }
      // Dynamic RGB pulse inside Game Room
      const hueP = (0.76 + 0.06 * Math.sin(tSec * 1.3)) % 1;
      const hueC = (0.52 + 0.06 * Math.cos(tSec * 1.1)) % 1;
      rgbPurpleMat.emissive.setHSL(hueP, 0.9, 0.52);
      rgbCyanMat.emissive.setHSL(hueC, 0.9, 0.50);
      gameRgbLight.color.setHSL(hueP, 0.7, 0.65);

      // Live 5-Stage Water Purification Color-Shifting Simulation (Amber Raw -> Teal -> Cyan -> UV-C Violet -> Crystal Pure Blue!)
      for (let i = 0; i < filterSimDrops.length; i++) {
        const d = filterSimDrops[i];
        const p = (tSec * 0.14 + d.phase) % 1;
        d.curve.getPointAt(p, d.mesh.position);
        if (p < 0.20) d.mat.color.setHex(0xd97706);      // Stage 1: Raw amber water
        else if (p < 0.42) d.mat.color.setHex(0x14b8a6); // Stage 2: Sand & carbon filtered
        else if (p < 0.65) d.mat.color.setHex(0x38bdf8); // Stage 3-4: Softened cyan
        else if (p < 0.84) d.mat.color.setHex(0xa855f7); // Stage 5: UV-C 254nm sterilization
        else d.mat.color.setHex(0x7dd3fc);               // Output: Sparkling crystal pure water!
        d.mat.emissive.copy(d.mat.color);
      }

      // Organic fire pit flicker, blue gas hob flame shimmer & underground water glow
      fireLight.intensity = 14 + 3.2 * Math.sin(time * 0.0065) + 1.6 * Math.cos(time * 0.011);
      waterGlowMat.emissiveIntensity = 0.50 + 0.12 * Math.sin(time * 0.0025);
      const fPulse = 0.94 + 0.08 * Math.sin(tSec * 10);
      for (let i = 0; i < gasFlameMeshes.length; i++) gasFlameMeshes[i].scale.setScalar(fPulse);

      // Animated directional flow pulses along visible concealed MEP pipes & ventilation ducts (ONLY when X-Ray/Spotlight active!)
      for (let i = 0; i < mepFlowBeads.length; i++) {
        const b = mepFlowBeads[i];
        if (!b.grp.visible) continue;
        const pT = (tSec * b.speed + b.phase) % 1;
        b.curve.getPointAt(pT, b.mesh.position);
      }
      // Animated amber lightning-grounding pulses along copper down-conductors in Structural Safety X-Ray mode!
      for (let i = 0; i < lightningFlowBeads.length; i++) {
        const b = lightningFlowBeads[i];
        if (!b.grp.visible) continue;
        const pT = (tSec * b.speed + b.phase) % 1;
        b.curve.getPointAt(pT, b.mesh.position);
      }
    }
    controls.update();
    renderer.render(scene, camera);
    updatePins();
    rafId = requestAnimationFrame(animate);
  }

  /* Initial crisp paint at exact aspect-fitted normal zoom + hide loader */
  window.clearTimeout(loadTimeoutId);
  resize();
  if (pendingPreset) {
    goPreset(pendingPreset, { scrollToViewer: true, userInitiated: true });
    pendingPreset = null;
  } else {
    goPreset('hero');
    if (camGoalPos && camGoalTarget) {
      camera.position.copy(camGoalPos);
      controls.target.copy(camGoalTarget);
      camGoalPos = camGoalTarget = null;
    }
  }
  controls.update();
  renderer.render(scene, camera);
  updatePins(true);
  bootSucceeded = true;
  document.getElementById('viewerLoading').style.display = 'none';
  document.getElementById('viewerFallback').style.display = 'none';
  startLoop();
} catch (err) {
  window.clearTimeout(loadTimeoutId);
  bootStarted = false;
  console.error('3D model unavailable:', err);
  document.getElementById('viewerLoading').style.display = 'none';
  document.getElementById('viewerFallback').style.display = 'flex';
  document.getElementById('viewerErrorMessage').textContent = 'The interactive 3D model could not start.';
  document.getElementById('viewerErrorDetail').textContent = (err?.message || 'The 3D library may be blocked or WebGL may be unavailable.') + ' Click Retry 3D viewer or serve via python3 -m http.server 8000 for local viewing.';
}
}

window.__start3DViewer = init3DViewer;
window.__retry3DViewer = () => {
  if (bootSucceeded) return;
  bootStarted = false;
  init3DViewer();
};

/* Always-Ready Dual-Engine 3D Fullscreen wired declaratively via Invoker Commands (`commandfor`/`command`) + CommandEvent Fallback */
const modelStage = document.getElementById('modelStage');
const fsToggleButtons = Array.from(document.querySelectorAll('button[commandfor="modelStage"][command="--toggle-fullscreen"]'));
const toggleFsCtrlBtn = document.getElementById('toggleFsControls');
let onStageFullscreenSync = null;

const getNativeFsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const isStageFullscreen = () => Boolean(modelStage) && (getNativeFsEl() === modelStage || modelStage.classList.contains('is-fullscreen'));

function setFsControlsOpen(open) {
  if (!modelStage || !toggleFsCtrlBtn) return;
  modelStage.classList.toggle('fs-controls-hidden', !open);
  toggleFsCtrlBtn.setAttribute('aria-pressed', String(open));
  toggleFsCtrlBtn.textContent = open ? '⚙ Hide Controls' : '⚙ Model Controls';
  if (onStageFullscreenSync) onStageFullscreenSync();
}
function syncFullscreenUI() {
  const active = isStageFullscreen();
  document.body.classList.toggle('fs-lock', active);
  fsToggleButtons.forEach(btn => btn.setAttribute('aria-pressed', String(active)));
  if (active) {
    setFsControlsOpen(window.innerWidth > 1050);
  } else if (modelStage) {
    modelStage.classList.remove('fs-controls-hidden');
  }
  if (onStageFullscreenSync) onStageFullscreenSync();
}
async function enterFullscreen() {
  if (!modelStage) return;
  init3DViewer();
  const req = modelStage.requestFullscreen || modelStage.webkitRequestFullscreen;
  if (req) {
    try {
      await req.call(modelStage);
      syncFullscreenUI();
      return;
    } catch {
      // Fallback to CSS Fullscreen Theatre Mode if browser/iframe blocks native Fullscreen API
    }
  }
  modelStage.classList.add('is-fullscreen');
  syncFullscreenUI();
}
async function exitFullscreen() {
  if (!modelStage) return;
  modelStage.classList.remove('is-fullscreen');
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (getNativeFsEl() && exit) {
    try { await exit.call(document); } catch { }
  }
  syncFullscreenUI();
}
const stageCommands = {
  '--toggle-fullscreen': () => { if (isStageFullscreen()) exitFullscreen(); else enterFullscreen(); },
  '--exit-fullscreen': () => exitFullscreen(),
  '--toggle-controls': () => setFsControlsOpen(modelStage.classList.contains('fs-controls-hidden')),
  '--hide-controls': () => setFsControlsOpen(false)
};
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  if (!globalThis.CommandEvent) {
    globalThis.CommandEvent = class CommandEvent extends Event {
      constructor(type, { source, command, ...options } = {}) {
        super(type, options);
        this.source = source;
        this.command = command;
      }
    };
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.composedPath().find(el => el.matches?.('button[commandfor]'));
    if (!button) return;
    const target = button.getRootNode().getElementById(button.getAttribute('commandfor'));
    const command = button.getAttribute('command');
    if (target && command) {
      target.dispatchEvent(new CommandEvent('command', { command, source: button }));
    }
  });
}
if (modelStage) {
  modelStage.addEventListener('command', event => {
    const action = stageCommands[event.command];
    if (action) action(event.target, event.source);
  });
}
document.addEventListener('fullscreenchange', syncFullscreenUI);
document.addEventListener('webkitfullscreenchange', syncFullscreenUI);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isStageFullscreen()) exitFullscreen();
});

/* Trigger 3D boot smoothly on viewport proximity, explicit user click, or browser idle after preloader */
const modelSec = document.getElementById('model');
if (modelSec) {
  const modelIO = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      modelIO.disconnect();
      init3DViewer();
    }
  }, { rootMargin: '500px 0px' });
  modelIO.observe(modelSec);
}
document.querySelectorAll('a[href="#model"]').forEach(link => {
  link.addEventListener('click', () => init3DViewer());
});
document.getElementById('jumpGame3D')?.addEventListener('click', () => { if (!bootSucceeded) { pendingPreset = 'gameRoom'; init3DViewer(); } });
document.getElementById('jumpParty3D')?.addEventListener('click', () => { if (!bootSucceeded) { pendingPreset = 'rooftopParty'; init3DViewer(); } });
document.getElementById('jumpLaundry3D')?.addEventListener('click', () => { if (!bootSucceeded) { pendingPreset = 'laundry'; init3DViewer(); } });
window.addEventListener('studio:prewarm', () => {
  setTimeout(() => init3DViewer(), 120);
}, { once: true });
window.addEventListener('studio:ready', () => {
  init3DViewer();
}, { once: true });
// Eliminate classic-script vs deferred-script race: start pre-warming immediately so Three.js builds cleanly during the 5s preloader!
if (window.__studioReady || window.__studioPrewarmed) {
  setTimeout(() => init3DViewer(), 0);
} else {
  setTimeout(() => init3DViewer(), 120);
}
})();
