import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#sceneCanvas");
const sceneShell = document.querySelector("#sceneShell");
const fallback = document.querySelector("#sceneFallback");
const loadScreen = document.querySelector("#loadScreen");
const loadBar = document.querySelector("#loadBar");
const loadValue = document.querySelector("#loadValue");
const progressLine = document.querySelector("#progressLine");
const chapterNumber = document.querySelector("#chapterNumber");
const chapterName = document.querySelector("#chapterName");
const railLinks = [...document.querySelectorAll("[data-rail]")];
const chapters = [...document.querySelectorAll("[data-chapter]")];
const enterWorld = document.querySelector("#enterWorld");
const exitWorld = document.querySelector("#exitWorld");
const exploreUI = document.querySelector("#exploreUI");
const dragHint = document.querySelector("#dragHint");
const processDialog = document.querySelector("#processDialog");
const openProcess = document.querySelector("#openProcess");
const closeProcess = document.querySelector("#closeProcess");
const upload = document.querySelector("#characterUpload");
const characterThumb = document.querySelector("#characterThumb");
const characterImage = document.querySelector("#characterImage");
const atmosphere = document.querySelector("#atmosphereSelect");
const controlNote = document.querySelector("#controlNote");
const worldEyebrow = document.querySelector("#worldEyebrow");
const worldTitle = document.querySelector("#worldTitle");
const cinematicButton = document.querySelector("#playCinematic");
const cinemaCaption = document.querySelector("#cinemaCaption");
const cinemaKicker = document.querySelector("#cinemaKicker");
const cinemaTitle = document.querySelector("#cinemaTitle");

let renderer;
let scene;
let camera;
let controls;
let bookModel;
let worldModel;
let activeModel;
let popRoot;
let popScaleAxis = "y";
let flipPage;
let contactPlane;
let hemisphereLight;
let keyLight;
let rimLight;
let worldMixer;
let playerRoot;
let playerSpawn = new THREE.Vector3();
let playerParts = {};
let groundMeshes = [];
let worldWalkBounds = null;
let obstacleVolumes = [];
let waterMeshes = [];
let cinematicMaterialRecords = [];
let verticalVelocity = 0;
let grounded = false;
let jumpQueued = false;
let walkCycle = 0;
let scrollTarget = 0;
let scrollCurrent = 0;
let exploring = false;
let pointerX = 0;
let pointerY = 0;
let cinematic = null;
let cinematicAudio = null;
let cinematicRecorder = null;
let cinemaOriginalPixelRatio = null;
let cinemaOriginalFov = null;
let exploreOriginalFov = null;

// ---- A2 additions: state for click-to-dive and the paper-cutout avatar ----
let diving = false;
let diveStart = 0;
let lastHoverCheck = 0;
let avatarCard = null;
let avatarBlob = null;
let avatarTexture = null;
let avatarHeight = 2.2;
let cardSquash = 0;
const diveFocus = new THREE.Vector3();
const diveRay = new THREE.Raycaster();
const diveNdc = new THREE.Vector2();
const diveHint = document.createElement("p");

const clock = new THREE.Clock();
const pressedKeys = new Set();
const groundRay = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const up = new THREE.Vector3(0, 1, 0);
const playerWorldPosition = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const movement = new THREE.Vector3();

const cameraKeys = [
  { at: 0.00, position: [8.4, 5.8, 11.8], target: [0.0, 0.25, 0.0], rotation: -0.10 },
  { at: 0.23, position: [-7.2, 4.4, 9.4], target: [0.0, 0.25, 0.0], rotation: 0.22 },
  { at: 0.48, position: [6.8, 3.4, 7.5], target: [-0.55, 0.65, 0.0], rotation: -0.48 },
  { at: 0.73, position: [0.8, 7.7, 8.2], target: [0.2, 0.0, 0.0], rotation: 0.16 },
  { at: 1.00, position: [-4.8, 3.1, 6.3], target: [0.55, 0.8, 0.0], rotation: 0.58 }
];

function setLoading(percent) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  loadBar.style.width = `${safePercent}%`;
  loadValue.textContent = `${safePercent}%`;
}

function showFallback(message) {
  console.error(message);
  sceneShell.classList.add("failed");
  fallback.style.display = "block";
  setLoading(100);
  window.setTimeout(() => loadScreen.classList.add("done"), 300);
}

function initialiseThree() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    showFallback(error);
    return false;
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1010, 13, 29);

  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 140);
  camera.position.set(...cameraKeys[0].position);

  hemisphereLight = new THREE.HemisphereLight(0xd9e7e1, 0x2b231d, 2.2);
  scene.add(hemisphereLight);

  keyLight = new THREE.DirectionalLight(0xffb368, 4.2);
  keyLight.position.set(-7, 10, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 35;
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 9;
  keyLight.shadow.camera.bottom = -9;
  scene.add(keyLight);

  rimLight = new THREE.PointLight(0x6eaeb7, 28, 30, 1.7);
  rimLight.position.set(7, 5, -5);
  scene.add(rimLight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 4.2;
  controls.maxDistance = 19;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.5, 0);
  return true;
}

function prepareMaterial(material) {
  if (!material) return;
  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  material.needsUpdate = true;
}

function normaliseModel(model, targetSize) {
  const startBox = new THREE.Box3().setFromObject(model);
  const size = startBox.getSize(new THREE.Vector3());
  const center = startBox.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / largest;
  model.scale.setScalar(scale);
  model.position.copy(center).multiplyScalar(-scale);
  model.updateMatrixWorld(true);

  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (Array.isArray(child.material)) child.material.forEach(prepareMaterial);
    else prepareMaterial(child.material);
  });

  return new THREE.Box3().setFromObject(model);
}

function updateContactPlane(bounds) {
  if (contactPlane) scene.remove(contactPlane);
  const material = new THREE.ShadowMaterial({ color: 0x000000, opacity: exploring ? 0.18 : 0.42 });
  contactPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
  contactPlane.rotation.x = -Math.PI / 2;
  contactPlane.position.y = bounds.min.y - 0.035;
  contactPlane.receiveShadow = true;
  scene.add(contactPlane);
}

function smallestScaleAxis(object) {
  return ["x", "y", "z"].reduce((smallest, axis) => (
    Math.abs(object.scale[axis]) < Math.abs(object.scale[smallest]) ? axis : smallest
  ), "x");
}

function expandPopUp(model) {
  const root = model.getObjectByName("World_Root_Animated");
  if (!root) return;
  root.scale[smallestScaleAxis(root)] = 1;
  root.updateMatrixWorld(true);
}

function loadModel(url, targetSize, onProgress, prepareModel, shouldNormalise = true) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        prepareModel?.(model);
        let bounds;
        if (shouldNormalise) {
          bounds = normaliseModel(model, targetSize);
        } else {
          model.updateMatrixWorld(true);
          model.traverse((child) => {
            if (!child.isMesh) return;
            child.receiveShadow = true;
            child.castShadow = !/Terrain|River|Mountain_Ring/.test(child.name);
            if (Array.isArray(child.material)) child.material.forEach(prepareMaterial);
            else prepareMaterial(child.material);
          });
          bounds = new THREE.Box3().setFromObject(model);
        }
        resolve({ model, bounds, animations: gltf.animations });
      },
      (event) => {
        if (event.total > 0) onProgress?.((event.loaded / event.total) * 100);
      },
      reject
    );
  });
}

async function loadBook() {
  try {
    const result = await loadModel("models/pagescape-book.glb", 11.4, setLoading);
    bookModel = result.model;
    activeModel = bookModel;
    popRoot = bookModel.getObjectByName("World_Root_Animated");
    flipPage = bookModel.getObjectByName("Animated_Flip_Page");
    if (popRoot) popScaleAxis = smallestScaleAxis(popRoot);
    scene.add(bookModel);
    updateContactPlane(result.bounds);
    setLoading(100);
    window.setTimeout(() => loadScreen.classList.add("done"), 420);
  } catch (error) {
    showFallback(error);
  }
}

async function loadWorld() {
  if (worldModel) return worldModel;
  const originalText = enterWorld.querySelector("span").textContent;
  enterWorld.querySelector("span").textContent = "Loading landscape…";
  enterWorld.disabled = true;
  try {
    const result = await loadModel("models/pagescape-assignment2-world.glb", 1, undefined, undefined, false);
    worldModel = result.model;
    worldModel.visible = false;
    scene.add(worldModel);
    worldModel.userData.bounds = result.bounds;
    preparePlayableWorld(result.animations);
    return worldModel;
  } finally {
    enterWorld.querySelector("span").textContent = originalText;
    enterWorld.disabled = false;
  }
}

function preparePlayableWorld(animations) {
  playerRoot = worldModel.getObjectByName("Player_Root");
  if (!playerRoot) throw new Error("The playable GLB does not contain Player_Root.");

  playerSpawn.copy(playerRoot.position);
  playerParts = {
    torso: worldModel.getObjectByName("Player_Torso"),
    head: worldModel.getObjectByName("Player_Head"),
    armL: worldModel.getObjectByName("Player_Arm_L"),
    armR: worldModel.getObjectByName("Player_Arm_R"),
    legL: worldModel.getObjectByName("Player_Leg_L"),
    legR: worldModel.getObjectByName("Player_Leg_R")
  };
  // A2: measure the block avatar so a paper-cutout avatar can match its height
  {
    const heightBox = new THREE.Box3();
    Object.values(playerParts).filter(Boolean).forEach((part) => heightBox.expandByObject(part));
    const measured = heightBox.max.y - heightBox.min.y;
    if (Number.isFinite(measured)) avatarHeight = THREE.MathUtils.clamp(measured, 1.2, 3.5);
  }

  groundMeshes = [];
  worldWalkBounds = null;
  obstacleVolumes = [];
  waterMeshes = [];
  cinematicMaterialRecords = [];
  const seenCinematicMaterials = new Set();
  const obstacleObjects = [];

  worldModel.traverse((child) => {
    if (child.name.startsWith("COLLIDER_")) child.visible = false;
    if (!child.isMesh) return;

    child.userData.cinematicFoliage = /Tree|Pine|Foliage/i.test(child.name);
    child.userData.cinematicGround = /Terrain|Grass|Ground|Path/i.test(child.name);
    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    meshMaterials.filter((material) => material?.color?.isColor).forEach((material) => {
      material.userData.cinematicBaseColor ??= material.color.clone();
      const group = child.userData.cinematicFoliage ? "foliage" : child.userData.cinematicGround ? "ground" : null;
      if (group && !seenCinematicMaterials.has(material)) {
        seenCinematicMaterials.add(material);
        cinematicMaterialRecords.push({ material, base: material.userData.cinematicBaseColor, group });
      }
    });

    if (/Terrain_|Cottage_Path|Stone_Bridge_Deck/.test(child.name)) groundMeshes.push(child);
    if (/Tree_Web_|Pine_.*Trunk|Cottage_Body_HD|Cottage_Body$/.test(child.name)) obstacleObjects.push(child);

    if (/River_Extended|Winding_Stream/.test(child.name)) {
      const position = child.geometry?.attributes?.position;
      if (position) {
        child.geometry = child.geometry.clone();
        waterMeshes.push({ mesh: child, base: Float32Array.from(child.geometry.attributes.position.array) });
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        material.transparent = true;
        material.opacity = 0.88;
        material.roughness = 0.16;
        material.metalness = 0.08;
      });
    }
  });

  worldModel.updateMatrixWorld(true);
  const outerTerrain = worldModel.getObjectByName("Terrain_Outer_Visual");
  if (outerTerrain) {
    worldWalkBounds = new THREE.Box3().setFromObject(outerTerrain);
    worldWalkBounds.min.x += 1.1;
    worldWalkBounds.max.x -= 1.1;
    worldWalkBounds.min.z += 1.1;
    worldWalkBounds.max.z -= 1.1;
  }
  obstacleObjects.forEach((object) => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (object.name.startsWith("Tree_Web_") || /Pine_.*Trunk/.test(object.name)) {
      obstacleVolumes.push({ type: "circle", x: center.x, z: center.z, radius: Math.min(1.05, Math.max(0.34, Math.max(size.x, size.z) * 0.28)) });
    } else {
      obstacleVolumes.push({ type: "box", minX: box.min.x - 0.28, maxX: box.max.x + 0.28, minZ: box.min.z - 0.28, maxZ: box.max.z + 0.28 });
    }
  });

  worldMixer = new THREE.AnimationMixer(worldModel);
  animations.forEach((clip) => worldMixer.clipAction(clip).play());

  const startY = groundHeightAt(playerRoot.position.x, playerRoot.position.z);
  if (Number.isFinite(startY)) playerRoot.position.y = startY + 0.02;
  grounded = true;
}

function groundHeightAt(x, z) {
  if (!groundMeshes.length) return -0.4;
  groundRay.set(new THREE.Vector3(x, 25, z), down);
  groundRay.far = 40;
  const intersections = groundRay.intersectObjects(groundMeshes, false);
  return intersections.length ? intersections[0].point.y : -0.4;
}

function isBlocked(x, z) {
  if (worldWalkBounds) {
    if (x < worldWalkBounds.min.x || x > worldWalkBounds.max.x || z < worldWalkBounds.min.z || z > worldWalkBounds.max.z) return true;
  } else if (Math.hypot(x, z) > 24.2) return true;
  return obstacleVolumes.some((volume) => {
    if (volume.type === "circle") return Math.hypot(x - volume.x, z - volume.z) < volume.radius + 0.28;
    return x > volume.minX && x < volume.maxX && z > volume.minZ && z < volume.maxZ;
  });
}

function updateWater(time) {
  waterMeshes.forEach(({ mesh, base }) => {
    const position = mesh.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const wave = Math.sin(base[offset] * 1.15 + base[offset + 2] * 0.72 + time * 1.9) * 0.025;
      position.array[offset + 1] = base[offset + 1] + wave;
    }
    position.needsUpdate = true;
  });
}

function updatePlayer(delta, elapsed) {
  if (!playerRoot) return;

  const forwardInput = Number(pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp")) - Number(pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown"));
  const sideInput = Number(pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight")) - Number(pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft"));
  const moving = forwardInput !== 0 || sideInput !== 0;
  const running = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight");
  const speed = running ? 6.2 : 3.35;
  const wasGrounded = grounded;

  if (moving) {
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, up).normalize();
    movement.copy(cameraForward).multiplyScalar(forwardInput).addScaledVector(cameraRight, sideInput).normalize();

    const nextX = playerRoot.position.x + movement.x * speed * delta;
    const nextZ = playerRoot.position.z + movement.z * speed * delta;
    if (!isBlocked(nextX, nextZ)) {
      playerRoot.position.x = nextX;
      playerRoot.position.z = nextZ;
    }

    const desiredHeading = Math.atan2(movement.x, movement.z);
    let headingDifference = desiredHeading - playerRoot.rotation.y;
    headingDifference = Math.atan2(Math.sin(headingDifference), Math.cos(headingDifference));
    playerRoot.rotation.y += headingDifference * Math.min(1, delta * 11);
  }

  if (jumpQueued && grounded) {
    verticalVelocity = 6.4;
    grounded = false;
  }
  jumpQueued = false;

  const groundY = groundHeightAt(playerRoot.position.x, playerRoot.position.z) + 0.02;
  verticalVelocity -= 17.5 * delta;
  playerRoot.position.y += verticalVelocity * delta;
  if (playerRoot.position.y <= groundY) {
    playerRoot.position.y = groundY;
    verticalVelocity = 0;
    grounded = true;
  }

  const stride = moving && grounded ? (running ? 9.5 : 6.4) : 0;
  if (stride) walkCycle += delta * stride;
  const swing = stride ? Math.sin(walkCycle) * (running ? 0.72 : 0.48) : 0;
  if (playerParts.armL) playerParts.armL.rotation.x = THREE.MathUtils.lerp(playerParts.armL.rotation.x, swing, 0.22);
  if (playerParts.armR) playerParts.armR.rotation.x = THREE.MathUtils.lerp(playerParts.armR.rotation.x, -swing, 0.22);
  if (playerParts.legL) playerParts.legL.rotation.x = THREE.MathUtils.lerp(playerParts.legL.rotation.x, -swing, 0.22);
  if (playerParts.legR) playerParts.legR.rotation.x = THREE.MathUtils.lerp(playerParts.legR.rotation.x, swing, 0.22);
  if (playerParts.torso) playerParts.torso.position.y = 1.18 + (stride ? Math.abs(Math.sin(walkCycle * 2)) * 0.035 : 0);

  playerRoot.getWorldPosition(playerWorldPosition);
  updateAvatarCard(delta, moving, stride, wasGrounded);
  const desiredTarget = playerWorldPosition.clone().add(new THREE.Vector3(0, 1.32, 0));
  const previousTarget = controls.target.clone();
  controls.target.lerp(desiredTarget, 1 - Math.exp(-delta * 10));
  camera.position.add(controls.target.clone().sub(previousTarget));
  updateWater(elapsed);
}

async function makeCinematicAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const ctx = new AudioContextClass();
  const out = ctx.createMediaStreamDestination();
  const master = ctx.createGain(); master.gain.value = 0.82;
  master.connect(ctx.destination); master.connect(out);
  const response = await fetch("./media/PageScape_Trailer_Audio.wav");
  if (!response.ok) throw new Error("Trailer soundtrack could not be loaded.");
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(master);
  return { ctx, out, source, master };
}

async function playCinematic() {
  if (cinematic) return;
  try {
    await loadWorld();
    enterExploreMode();
    document.body.classList.add("cinematic");
    controls.enabled = false;
    setAtmosphere("sunset");
    cinematicAudio = await makeCinematicAudio();
    await cinematicAudio?.ctx.resume();
    // Record at the actual 720p viewport instead of rendering a Retina-sized
    // buffer; this reduces frame drops on laptops while keeping the trailer HD.
    cinemaOriginalPixelRatio = renderer.getPixelRatio();
    cinemaOriginalFov = camera.fov;
    camera.fov = 48;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    const stream = renderer.domElement.captureStream(24);
    cinematicAudio?.out.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    cinematicRecorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4200000 });
    const chunks = [];
    cinematicRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    cinematicRecorder.onstop = () => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob(chunks, { type }));
      link.download = "PageScape_Cinematic_Preview.webm";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      cinematicAudio?.ctx.close(); cinematicAudio = null;
      if (cinemaOriginalPixelRatio !== null) {
        renderer.setPixelRatio(cinemaOriginalPixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        cinemaOriginalPixelRatio = null;
      }
      if (cinemaOriginalFov !== null) {
        camera.fov = cinemaOriginalFov;
        camera.updateProjectionMatrix();
        cinemaOriginalFov = null;
      }
    };
    const path = [
      { t: 0, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [-2, 15, 31], target: [0, 7, 0], title: "Spring wakes the valley", kicker: "PAGESCAPE · A living sketchbook" },
      { t: 7, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [4, 12, 25], target: [0, 4, 0], title: "A valley, revealed from above", kicker: "A handcrafted Blender world" },
      { t: 14, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [7, 9, 1], target: [8.5, 8, -2], title: "Small wings over the canopy", kicker: "Five animated birds cross the sky" },
      { t: 21, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [-5, 4.5, 4.5], target: [-2.4, 2.4, -0.9], title: "Autumn gold through the canopy", kicker: "Follow the trail between the trees" },
      { t: 28, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [3.4, 4.8, 6.5], target: [0, 2.2, -1.5], title: "The mountains hold the horizon", kicker: "A layered miniature landscape" },
      { t: 35, p: [playerSpawn.x + 1.7, playerSpawn.y, playerSpawn.z - 0.7], camera: [2.8, 3.2, 9.5], target: [0.1, 1.3, 0.2], title: "Winter light on the crossing", kicker: "River · stone · timber" },
      { t: 43, p: [playerSpawn.x + 4.4, playerSpawn.y, playerSpawn.z - 1.8], camera: [1.3, 3, 8.8], target: [playerSpawn.x + 3.2, 1.2, playerSpawn.z - 1.1], title: "A traveller finds the crossing", kicker: "Walk · run · explore" },
      { t: 49, p: [playerSpawn.x + 5.1, playerSpawn.y, playerSpawn.z + 0.1], camera: [2.2, 3.2, 7], target: [playerSpawn.x + 4.7, 1.2, playerSpawn.z], title: "One small leap into a bigger story", kicker: "A student-built 3D prototype" },
      { t: 55, p: [playerSpawn.x + 2.8, playerSpawn.y, playerSpawn.z + 2.8], camera: [0, 8, 16], target: [0, 4, 0], title: "The seasons turn; the story stays", kicker: "Back to the open sky" },
      { t: 60, p: [playerSpawn.x, playerSpawn.y, playerSpawn.z], camera: [-2, 16, 29], target: [0, 7, 0], title: "PageScape", kicker: "A living sketchbook" }
    ];
    const seconds = 60;
    const start = performance.now();
    cinematic = { path, seconds, start, lastStep: -1, lastBird: -1, startPos: playerRoot.position.clone() };
    // Begin on the intended distant crane shot. This avoids a visible snap
    // from the interactive camera and lets the opening feel composed.
    camera.position.set(...path[0].camera);
    controls.target.set(...path[0].target);
    camera.lookAt(controls.target);
    if (cinematicAudio?.source) cinematicAudio.source.loop = true;
    cinematicAudio?.source.start();
    cinematicRecorder.start(300);
  } catch (error) {
    console.error(error);
    document.body.classList.remove("cinematic");
    restoreCinematicPalette();
    if (cinemaOriginalPixelRatio !== null) {
      renderer.setPixelRatio(cinemaOriginalPixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      cinemaOriginalPixelRatio = null;
    }
    if (cinemaOriginalFov !== null) {
      camera.fov = cinemaOriginalFov;
      camera.updateProjectionMatrix();
      cinemaOriginalFov = null;
    }
    controlNote.textContent = "Cinematic preview could not start. Use the normal arrow-key controls.";
  }
}

function updateCinematic(now, delta) {
  if (!cinematic) return;
  const elapsed = (now - cinematic.start) / 1000;
  const { path, seconds } = cinematic;
  if (elapsed >= seconds) {
    cinematic = null;
    cinemaCaption.classList.remove("visible");
    document.body.classList.remove("cinematic");
    cinematicRecorder?.stop(); cinematicRecorder = null;
    controls.enabled = true;
    controls.target.copy(playerRoot.position).add(new THREE.Vector3(0, 1.3, 0));
    controls.update();
    restoreCinematicPalette();
    return;
  }
  let i = 0;
  while (i < path.length - 2 && elapsed > path[i + 1].t) i++;
  const a = path[i], b = path[i + 1];
  const local = THREE.MathUtils.smoothstep((elapsed - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
  const targetPos = new THREE.Vector3(...a.p).lerp(new THREE.Vector3(...b.p), local);
  const jumpPulse = Math.max(0, Math.sin((elapsed - 48) * Math.PI / 1.25)) * (elapsed > 48 && elapsed < 50.5 ? 1.15 : 0);
  targetPos.y += jumpPulse;
  playerRoot.position.lerp(targetPos, 0.1);
  const dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2];
  if (Math.hypot(dx, dz) > 0.01) playerRoot.rotation.y = THREE.MathUtils.lerp(playerRoot.rotation.y, Math.atan2(dx, dz), 0.08);
  const walking = THREE.MathUtils.smoothstep(elapsed, 34.5, 37) * (1 - THREE.MathUtils.smoothstep(elapsed, 49, 51));
  if (walking > 0 && playerParts.armL && playerParts.legL) {
    const gait = Math.sin((elapsed - 35) * 8.2) * 0.62 * walking;
    playerParts.armL.rotation.x = gait;
    playerParts.armR.rotation.x = -gait;
    playerParts.legL.rotation.x = -gait;
    playerParts.legR.rotation.x = gait;
    if (playerParts.torso) playerParts.torso.position.y = 1.18 + Math.abs(Math.sin((elapsed - 35) * 16.4)) * 0.055 * walking;
  } else {
    Object.values(playerParts).forEach((part) => {
      if (part && /arm|leg/i.test(part.name)) part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, 0, 0.14);
    });
    if (playerParts.torso) playerParts.torso.position.y = THREE.MathUtils.lerp(playerParts.torso.position.y, 1.18, 0.14);
  }
  const cameraPosition = new THREE.Vector3(...a.camera).lerp(new THREE.Vector3(...b.camera), local);
  const orbit = Math.sin(elapsed * 0.12) * (elapsed > 34 && elapsed < 53 ? 0.32 : 0.12);
  cameraPosition.x += orbit;
  const target = new THREE.Vector3(...a.target).lerp(new THREE.Vector3(...b.target), local);
  if (elapsed >= 34 && elapsed <= 56) {
    const followIn = THREE.MathUtils.smoothstep(elapsed, 34, 43);
    const followOut = 1 - THREE.MathUtils.smoothstep(elapsed, 50.5, 55.5);
    target.lerp(playerRoot.position.clone().add(new THREE.Vector3(0, 1.25 + jumpPulse * 0.25, 0)), followIn * followOut);
  }
  applyCinematicSeason(elapsed);
  // The path is already eased; use frame-rate-independent damping only for
  // tiny residual motion, avoiding the sluggish 0:52–0:53 camera handoff.
  const cameraBlend = 1 - Math.exp(-Math.min(delta, 0.05) * 9);
  camera.position.lerp(cameraPosition, cameraBlend);
  camera.lookAt(target);
  controls.target.copy(target);
  const active = path[i];
  if (cinemaTitle.textContent !== active.title) {
    cinemaKicker.textContent = active.kicker; cinemaTitle.textContent = active.title;
    cinemaCaption.classList.add("visible");
    window.setTimeout(() => cinemaCaption.classList.remove("visible"), 4600);
  }
}

function cameraState(progress) {
  let from = cameraKeys[0];
  let to = cameraKeys[cameraKeys.length - 1];
  for (let index = 0; index < cameraKeys.length - 1; index += 1) {
    if (progress >= cameraKeys[index].at && progress <= cameraKeys[index + 1].at) {
      from = cameraKeys[index];
      to = cameraKeys[index + 1];
      break;
    }
  }
  const range = Math.max(0.001, to.at - from.at);
  const local = THREE.MathUtils.smootherstep((progress - from.at) / range, 0, 1);
  const position = new THREE.Vector3(...from.position).lerp(new THREE.Vector3(...to.position), local);
  const target = new THREE.Vector3(...from.target).lerp(new THREE.Vector3(...to.target), local);
  const rotation = THREE.MathUtils.lerp(from.rotation, to.rotation, local);
  return { position, target, rotation };
}

function updateBookReveal(progress) {
  if (!popRoot || !flipPage) return;

  // Scroll chapter 01 turns the loose page; chapter 02 raises the full miniature.
  const pageTurn = THREE.MathUtils.smoothstep(progress, 0.055, 0.22);
  const worldRise = THREE.MathUtils.smoothstep(progress, 0.16, 0.49);
  const settle = Math.sin(worldRise * Math.PI) * 0.035;

  flipPage.rotation.z = -Math.PI * pageTurn;
  popRoot.scale[popScaleAxis] = THREE.MathUtils.lerp(0.015, 1 + settle, worldRise);
  popRoot.updateMatrixWorld();
}

function updateScroll() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollTarget = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  progressLine.style.height = `${scrollTarget * 100}%`;
}

function updateChapter(chapter) {
  const index = Number(chapter.dataset.chapter);
  chapterNumber.textContent = String(index).padStart(2, "0");
  chapterName.textContent = chapter.dataset.label;
  railLinks.forEach((link) => link.classList.toggle("active", Number(link.dataset.rail) === index));
}

function enterExploreMode() {
  exploring = true;
  document.body.classList.add("exploring");
  exploreUI.classList.add("active");
  exploreUI.setAttribute("aria-hidden", "false");
  bookModel.visible = false;
  worldModel.visible = true;
  activeModel = worldModel;
  if (avatarCard) avatarCard.visible = true;
  if (avatarBlob) avatarBlob.visible = true;
  document.body.style.cursor = "";
  if (contactPlane) contactPlane.visible = false;
  playerRoot.position.copy(playerSpawn);
  playerRoot.position.y = groundHeightAt(playerSpawn.x, playerSpawn.z) + 0.02;
  verticalVelocity = 0;
  grounded = true;
  playerRoot.getWorldPosition(playerWorldPosition);
  controls.target.copy(playerWorldPosition).add(new THREE.Vector3(0, 1.32, 0));
  exploreOriginalFov = camera.fov;
  camera.fov = 54;
  camera.updateProjectionMatrix();
  camera.position.copy(controls.target).add(new THREE.Vector3(21, 16, 30));
  controls.enabled = true;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 54;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = Math.PI * 0.47;
  scene.fog.near = 38;
  scene.fog.far = 130;
  setAtmosphere(atmosphere.value);
  controls.update();
  dragHint.classList.add("visible");
  window.setTimeout(() => dragHint.classList.remove("visible"), 3600);
}

function exitExploreMode() {
  exploring = false;
  document.body.classList.remove("exploring");
  exploreUI.classList.remove("active");
  exploreUI.setAttribute("aria-hidden", "true");
  controls.enabled = false;
  if (exploreOriginalFov !== null) {
    camera.fov = exploreOriginalFov;
    camera.updateProjectionMatrix();
    exploreOriginalFov = null;
  }
  pressedKeys.clear();
  worldModel.visible = false;
  bookModel.visible = true;
  activeModel = bookModel;
  if (avatarCard) avatarCard.visible = false;
  if (avatarBlob) avatarBlob.visible = false;
  const bounds = new THREE.Box3().setFromObject(bookModel);
  updateContactPlane(bounds);
  scene.fog.near = 13;
  scene.fog.far = 29;
  keyLight.intensity = 4.2;
  hemisphereLight.intensity = 2.2;
  rimLight.intensity = 28;
  updateScroll();
}

function setAtmosphere(value) {
  const states = {
    sunset: { title: "Forest at sunset", fog: 0x121816, key: 0xff9b55, rim: 0x76afbd, exposure: 1.02, keyPower: 2.7, skyPower: 1.18, rimPower: 18, label: "Warm sunset lighting applied to the live model." },
    day: { title: "Valley in daylight", fog: 0x94a9aa, key: 0xfff1d1, rim: 0x9dd8ff, exposure: 1.18, keyPower: 2.3, skyPower: 1.55, rimPower: 12, label: "Clear daylight lighting applied to the live model." },
    night: { title: "Forest under moonlight", fog: 0x050817, key: 0x789dff, rim: 0xff9f52, exposure: 0.72, keyPower: 1.3, skyPower: 0.48, rimPower: 24, label: "Moonlit lighting applied to the live model." },
    winter: { title: "Winter light over the valley", fog: 0x77899f, key: 0xc8dcff, rim: 0xa9d6ff, exposure: 0.94, keyPower: 1.8, skyPower: 0.88, rimPower: 21, label: "Cool winter lighting palette applied to the live model." }
  };
  const state = states[value] || states.sunset;
  scene.fog.color.setHex(state.fog);
  keyLight.color.setHex(state.key);
  rimLight.color.setHex(state.rim);
  keyLight.intensity = state.keyPower;
  hemisphereLight.intensity = state.skyPower;
  rimLight.intensity = state.rimPower;
  renderer.toneMappingExposure = state.exposure;
  worldEyebrow.textContent = `Interactive scene · ${atmosphere.options[atmosphere.selectedIndex].text}`;
  worldTitle.textContent = state.title;
  controlNote.textContent = state.label;
}

function restoreCinematicPalette() {
  cinematicMaterialRecords.forEach(({ material, base }) => material.color.copy(base));
  if (atmosphere.value) setAtmosphere(atmosphere.value);
}

function applyCinematicSeason(elapsed) {
  const palettes = [
    { start: 0, end: 18, key: 0xffefd0, fog: 0x9eb6a9, rim: 0x8bd0d4, exposure: 1.16, foliage: 0x76965d, ground: 0x9ead81, foliageMix: 0.22, groundMix: 0.09 },
    { start: 18, end: 35, key: 0xffad69, fog: 0x9b7861, rim: 0xf2ba79, exposure: 1.06, foliage: 0xb87738, ground: 0xc39354, foliageMix: 0.42, groundMix: 0.18 },
    { start: 35, end: 53, key: 0xb8d1f4, fog: 0x76869f, rim: 0xc3dcff, exposure: 1.0, foliage: 0x85999b, ground: 0xa7b5be, foliageMix: 0.4, groundMix: 0.22 },
    { start: 53, end: 60, key: 0xffefd0, fog: 0x9eb6a9, rim: 0x8bd0d4, exposure: 1.16, foliage: 0x76965d, ground: 0x9ead81, foliageMix: 0.22, groundMix: 0.09 }
  ];
  const index = palettes.findIndex((palette) => elapsed >= palette.start && elapsed <= palette.end);
  const current = palettes[Math.max(0, index)];
  const next = palettes[Math.min(palettes.length - 1, Math.max(0, index) + 1)];
  const blend = index >= 0 ? THREE.MathUtils.smoothstep(elapsed, current.end - 2.5, current.end) : 0;
  const color = (field) => new THREE.Color(current[field]).lerp(new THREE.Color(next[field]), blend);
  keyLight.color.copy(color("key"));
  rimLight.color.copy(color("rim"));
  scene.fog.color.copy(color("fog"));
  renderer.toneMappingExposure = THREE.MathUtils.lerp(current.exposure, next.exposure, blend);
  keyLight.intensity = 2.65;
  hemisphereLight.intensity = 1.3;
  rimLight.intensity = 18;
  const foliageTint = color("foliage");
  const groundTint = color("ground");
  cinematicMaterialRecords.forEach(({ material, base, group }) => {
    const foliage = group === "foliage";
    const strength = foliage ? THREE.MathUtils.lerp(current.foliageMix, next.foliageMix, blend) : THREE.MathUtils.lerp(current.groundMix, next.groundMix, blend);
    material.color.copy(base).lerp(foliage ? foliageTint : groundTint, strength);
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (exploring) {
    diveHint.style.opacity = "0";
    worldMixer?.update(delta);
    if (cinematic) { updateCinematic(performance.now(), delta); updateAvatarCard(delta, false, 0, true); }
    else { updatePlayer(delta, elapsed); controls.update(); }
  } else {
    scrollCurrent = THREE.MathUtils.lerp(scrollCurrent, scrollTarget, 0.055);
    const state = cameraState(scrollCurrent);
    if (diveStart) {
      const diveT = Math.min(1, (performance.now() - diveStart) / 850);
      const diveE = diveT * diveT * (3 - 2 * diveT);
      state.position.lerp(diveFocus, 0.62 * diveE);
      state.target.lerp(diveFocus, 0.5 * diveE);
    }
    diveHint.style.opacity = (!diving && scrollCurrent > -1) ? "1" : "0";
    camera.position.lerp(state.position, 0.085);
    camera.lookAt(state.target);
    if (bookModel) {
      updateBookReveal(scrollCurrent);
      const pointerRotation = pointerX * 0.045;
      bookModel.rotation.y = THREE.MathUtils.lerp(bookModel.rotation.y, state.rotation + pointerRotation, 0.05);
      bookModel.rotation.x = THREE.MathUtils.lerp(bookModel.rotation.x, pointerY * 0.018, 0.05);
    }
  }
  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

if (initialiseThree()) {
  loadBook();
  animate();
}

const chapterObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) updateChapter(visible.target);
  },
  { threshold: [0.25, 0.45, 0.65] }
);
chapters.forEach((chapter) => chapterObserver.observe(chapter));

window.addEventListener("scroll", updateScroll, { passive: true });
window.addEventListener("resize", onResize);
window.addEventListener("pointermove", (event) => {
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });
window.addEventListener("dblclick", () => {
  if (!exploring) return;
  playerRoot?.getWorldPosition(playerWorldPosition);
  controls.target.copy(playerWorldPosition).add(new THREE.Vector3(0, 1.32, 0));
  controls.update();
});

window.addEventListener("keydown", (event) => {
  if (!exploring) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  pressedKeys.add(event.code);
  if (event.code === "Space" && !event.repeat) jumpQueued = true;
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
});

window.addEventListener("blur", () => pressedKeys.clear());

// ===== A2 additions: click-to-dive + paper-cutout avatar =====
const DIVE_IGNORE = "button,a,summary,details,video,dialog,input,select,label,.chapter-copy,.evidence,.frame-sequence,.motion-intro,.topbar,.progress-rail,.explore-ui,.load-screen";

diveHint.textContent = "Click the book to open it and step inside";
diveHint.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);margin:0;padding:9px 18px;border-radius:999px;background:rgba(6,47,54,.82);color:#f6f0e3;font:600 13px/1 system-ui,sans-serif;letter-spacing:.06em;z-index:30;pointer-events:none;opacity:0;transition:opacity .4s";
document.body.append(diveHint);

function overRevealedBook(event) {
  if (exploring || diving || !bookModel || !bookModel.visible || scrollCurrent < -1) return false;
  if (event.target.closest && event.target.closest(DIVE_IGNORE)) return false;
  diveNdc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  diveRay.setFromCamera(diveNdc, camera);
  return diveRay.intersectObject(bookModel, true).length > 0;
}

function buildCloudCurtain() {
  if (!document.getElementById("a2-cloud-styles")) {
    const style = document.createElement("style");
    style.id = "a2-cloud-styles";
    style.textContent = `
      .cloud-curtain { position: fixed; inset: 0; z-index: 95; pointer-events: none; overflow: hidden; }
      .cloud-side { position: absolute; top: -6vh; bottom: -6vh; width: 60%; will-change: transform; }
      .cloud-side.left { left: 0; }
      .cloud-side.right { right: 0; }
      .cloud-base { position: absolute; inset: 0; background: linear-gradient(#bfdcf2, #eef6ff 55%, #ffffff); }
      .cloud-puff { position: absolute; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff 0, #ffffff 55%, #e3eefb 100%); box-shadow: inset -10px -14px 26px rgba(140,170,205,.5), 0 0 34px rgba(255,255,255,.85); }
    `;
    document.head.append(style);
  }
  const curtain = document.createElement("div");
  curtain.className = "cloud-curtain";
  const rnd = (a, b) => a + Math.random() * (b - a);
  ["left", "right"].forEach((side) => {
    const el = document.createElement("div");
    el.className = "cloud-side " + side;
    const base = document.createElement("div");
    base.className = "cloud-base";
    el.append(base);
    for (let i = 0; i < 18; i += 1) {
      const puff = document.createElement("div");
      puff.className = "cloud-puff";
      const size = rnd(16, 34);
      puff.style.width = size + "vh";
      puff.style.height = size + "vh";
      puff.style.top = (rnd(-8, 98) - size / 2) + "vh";
      puff.style[side === "left" ? "right" : "left"] = rnd(-size * 0.55, size * 0.3) + "vh";
      el.append(puff);
    }
    curtain.append(el);
  });
  return curtain;
}

async function diveIn() {
  if (diving || exploring) return;
  diving = true;
  diveStart = performance.now();
  diveFocus.copy(new THREE.Box3().setFromObject(bookModel).getCenter(new THREE.Vector3()));
  const curtain = buildCloudCurtain();
  document.body.append(curtain);
  const [leftSide, rightSide] = curtain.querySelectorAll(".cloud-side");
  const closeTiming = { duration: 1100, easing: "cubic-bezier(.7,0,.25,1)", fill: "forwards" };
  const closeLeft = leftSide.animate([{ transform: "translateX(-125%)" }, { transform: "translateX(0)" }], closeTiming);
  const closeRight = rightSide.animate([{ transform: "translateX(125%)" }, { transform: "translateX(0)" }], closeTiming);
  try {
    await Promise.all([loadWorld(), closeLeft.finished, closeRight.finished]);
    enterExploreMode();
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  } catch (error) {
    console.error(error);
    enterWorld.querySelector("span").textContent = "Could not load scene";
  } finally {
    diveStart = 0;
    diving = false;
    const openTiming = { duration: 1300, easing: "cubic-bezier(.6,0,.3,1)", fill: "forwards" };
    const openLeft = leftSide.animate([{ transform: "translateX(0)" }, { transform: "translateX(-125%)" }], openTiming);
    const openRight = rightSide.animate([{ transform: "translateX(0)" }, { transform: "translateX(125%)" }], openTiming);
    await Promise.all([openLeft.finished, openRight.finished]).catch(() => {});
    curtain.remove();
    document.body.style.cursor = "";
  }
}

window.addEventListener("click", (event) => { if (overRevealedBook(event)) diveIn(); });
window.addEventListener("pointermove", (event) => {
  const now = performance.now();
  if (exploring || diving || now - lastHoverCheck < 120) return;
  lastHoverCheck = now;
  document.body.style.cursor = overRevealedBook(event) ? "pointer" : "";
}, { passive: true });

// ---- paper-cutout avatar ----
function dilateMask(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pre = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y += 1) {
    pre[0] = 0;
    for (let x = 0; x < w; x += 1) pre[x + 1] = pre[x] + mask[y * w + x];
    for (let x = 0; x < w; x += 1) tmp[y * w + x] = pre[Math.min(w, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x += 1) {
    pre[0] = 0;
    for (let y = 0; y < h; y += 1) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y += 1) out[y * w + x] = pre[Math.min(h, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

// Flood-fills the paper background from the image border, keeps everything inside the drawing
// (so a figure keeps its white interior), then adds a white "sticker" outline.
function cutoutPixels(px, w, h) {
  const n = w * h;
  let br = 0, bg = 0, bb = 0, count = 0;
  const patch = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  for (const [cx, cy] of [[0, 0], [w - patch, 0], [0, h - patch], [w - patch, h - patch]]) {
    for (let y = cy; y < cy + patch; y += 1) {
      for (let x = cx; x < cx + patch; x += 1) {
        const i = (y * w + x) * 4;
        if (px[i + 3] > 200) { br += px[i]; bg += px[i + 1]; bb += px[i + 2]; count += 1; }
      }
    }
  }
  if (count) { br /= count; bg /= count; bb /= count; } else { br = 255; bg = 255; bb = 255; }
  const tol2 = 46 * 46;
  const isBackdrop = (p) => {
    const i = p * 4;
    if (px[i + 3] < 16) return true;
    const dr = px[i] - br, dg = px[i + 1] - bg, db = px[i + 2] - bb;
    return dr * dr + dg * dg + db * db < tol2;
  };
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (p) => { if (!outside[p] && isBackdrop(p)) { outside[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < w; x += 1) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < n - w) push(p + w);
  }
  const foreground = n - tail;
  if (tail === 0 || foreground < n * 0.015) return null;   // nothing sensible to cut out
  const fgMask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) fgMask[i] = outside[i] ? 0 : 1;
  const grown = dilateMask(fgMask, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.012)));
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!grown[y * w + x]) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const rgba = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const sp = (y + minY) * w + (x + minX);
      if (!grown[sp]) continue;
      const di = (y * cw + x) * 4;
      if (fgMask[sp]) { const si = sp * 4; rgba[di] = px[si]; rgba[di + 1] = px[si + 1]; rgba[di + 2] = px[si + 2]; }
      else { rgba[di] = 255; rgba[di + 1] = 255; rgba[di + 2] = 255; }
      rgba[di + 3] = 255;
    }
  }
  return { rgba, width: cw, height: ch };
}

function cutoutCanvas(img) {
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const source = document.createElement("canvas");
  source.width = w; source.height = h;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const result = cutoutPixels(sctx.getImageData(0, 0, w, h).data, w, h);
  if (!result) return source;                                  // fall back to the whole picture as a card
  const out = document.createElement("canvas");
  out.width = result.width; out.height = result.height;
  const octx = out.getContext("2d");
  octx.putImageData(new ImageData(result.rgba, result.width, result.height), 0, 0);
  return out;
}

function setBlockAvatarVisible(visible) {
  playerRoot?.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.a2Visible === undefined) object.userData.a2Visible = object.visible;
    object.visible = visible ? object.userData.a2Visible : false;
  });
}

let revertButton = null;
function removeCutoutAvatar(restoreBlock = true) {
  if (avatarCard) { scene.remove(avatarCard); avatarCard.geometry.dispose(); avatarCard.material.dispose(); avatarCard = null; }
  if (avatarBlob) { scene.remove(avatarBlob); avatarBlob.geometry.dispose(); avatarBlob.material.dispose(); avatarBlob = null; }
  if (avatarTexture) { avatarTexture.dispose(); avatarTexture = null; }
  if (restoreBlock) {
    setBlockAvatarVisible(true);
    if (revertButton) revertButton.hidden = true;
    controlNote.textContent = "Block character restored. Choose an image to turn your sketch into the explorer.";
  }
}

function applyCutoutAvatar(dataUrl, fileName) {
  const img = new Image();
  img.onload = () => {
    try {
      const art = cutoutCanvas(img);
      removeCutoutAvatar(false);
      avatarTexture = new THREE.CanvasTexture(art);
      avatarTexture.colorSpace = THREE.SRGBColorSpace;
      avatarTexture.anisotropy = 4;
      const aspect = art.width / art.height;
      let cardHeight = avatarHeight;
      let cardWidth = cardHeight * aspect;
      if (cardWidth > cardHeight * 1.05) { cardWidth = cardHeight * 1.05; cardHeight = cardWidth / aspect; }
      const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);
      geometry.translate(0, cardHeight / 2, 0);                  // pivot at the feet
      avatarCard = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: avatarTexture, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false }));
      avatarCard.renderOrder = 5;
      avatarCard.frustumCulled = false;
      avatarCard.visible = exploring;
      scene.add(avatarCard);
      avatarBlob = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.35, cardWidth * 0.3), 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      avatarBlob.rotation.x = -Math.PI / 2;
      avatarBlob.renderOrder = 4;
      avatarBlob.visible = exploring;
      scene.add(avatarBlob);
      setBlockAvatarVisible(false);
      if (!revertButton) {
        revertButton = document.createElement("button");
        revertButton.type = "button";
        revertButton.className = "plain-button";
        revertButton.textContent = "Use block character";
        revertButton.style.marginTop = "8px";
        revertButton.addEventListener("click", () => removeCutoutAvatar(true));
        characterThumb.after(revertButton);
      }
      revertButton.hidden = false;
      controlNote.textContent = `${fileName} is now your playable paper-cutout character. Move with WASD or the arrow keys; Space jumps.`;
    } catch (error) {
      console.error(error);
      controlNote.textContent = "That image could not be used as a character. Try a PNG or JPG with a plain background.";
    }
  };
  img.onerror = () => { controlNote.textContent = "That image could not be read. Try a PNG or JPG."; };
  img.src = dataUrl;
}

// Called every frame while exploring: follows the player, faces the camera, bobs, tilts, squashes and stretches.
function updateAvatarCard(delta, moving, stride, wasGrounded) {
  if (!avatarCard || !playerRoot) return;
  playerRoot.getWorldPosition(playerWorldPosition);
  if (!wasGrounded && grounded) cardSquash = 1;
  cardSquash = Math.max(0, cardSquash - delta * 4.5);
  const stretch = grounded ? 0 : THREE.MathUtils.clamp(verticalVelocity * 0.018, -0.08, 0.14);
  const sy = 1 - 0.18 * cardSquash + stretch;
  const sx = 1 / Math.max(0.7, sy);
  const bob = stride && grounded ? Math.abs(Math.sin(walkCycle * 2)) * 0.07 : 0;
  const tilt = stride ? Math.sin(walkCycle) * 0.06 : 0;
  const { x, y, z } = playerWorldPosition;
  avatarCard.position.set(x, y + bob, z);
  avatarCard.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), tilt);
  avatarCard.scale.set(sx, sy, 1);
  if (avatarBlob) {
    const floor = groundHeightAt(x, z);
    avatarBlob.position.set(x, floor + 0.04, z);
    avatarBlob.scale.setScalar(1 - Math.min(0.5, Math.max(0, y - floor) * 0.18));
  }
}
// ===== end A2 additions =====

enterWorld.addEventListener("click", diveIn);
cinematicButton.addEventListener("click", playCinematic);
exitWorld.addEventListener("click", exitExploreMode);

openProcess.addEventListener("click", () => processDialog.showModal());
closeProcess.addEventListener("click", () => processDialog.close());
processDialog.addEventListener("click", (event) => {
  if (event.target === processDialog) processDialog.close();
});

upload.addEventListener("change", () => {
  const file = upload.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    characterImage.src = reader.result;
    characterThumb.classList.add("has-image");
    applyCutoutAvatar(reader.result, file.name);
  });
  reader.readAsDataURL(file);
});
atmosphere.addEventListener("change", () => setAtmosphere(atmosphere.value));

updateScroll();
