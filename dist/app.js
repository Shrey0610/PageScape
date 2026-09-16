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
let obstacleVolumes = [];
let waterMeshes = [];
let verticalVelocity = 0;
let grounded = false;
let jumpQueued = false;
let walkCycle = 0;
let scrollTarget = 0;
let scrollCurrent = 0;
let exploring = false;
let pointerX = 0;
let pointerY = 0;

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
    const result = await loadModel("models/pagescape-explorable-world.glb", 1, undefined, undefined, false);
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

  groundMeshes = [];
  obstacleVolumes = [];
  waterMeshes = [];
  const obstacleObjects = [];

  worldModel.traverse((child) => {
    if (child.name.startsWith("COLLIDER_")) child.visible = false;
    if (!child.isMesh) return;

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
  if (Math.hypot(x, z) > 24.2) return true;
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
  const desiredTarget = playerWorldPosition.clone().add(new THREE.Vector3(0, 1.32, 0));
  const previousTarget = controls.target.clone();
  controls.target.lerp(desiredTarget, 1 - Math.exp(-delta * 10));
  camera.position.add(controls.target.clone().sub(previousTarget));
  updateWater(elapsed);
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
  if (contactPlane) contactPlane.visible = false;
  playerRoot.position.copy(playerSpawn);
  playerRoot.position.y = groundHeightAt(playerSpawn.x, playerSpawn.z) + 0.02;
  verticalVelocity = 0;
  grounded = true;
  playerRoot.getWorldPosition(playerWorldPosition);
  controls.target.copy(playerWorldPosition).add(new THREE.Vector3(0, 1.32, 0));
  camera.position.copy(controls.target).add(new THREE.Vector3(5.2, 3.25, 6.4));
  controls.enabled = true;
  controls.enablePan = false;
  controls.minDistance = 3.4;
  controls.maxDistance = 12.5;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = Math.PI * 0.47;
  scene.fog.near = 16;
  scene.fog.far = 70;
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
  pressedKeys.clear();
  worldModel.visible = false;
  bookModel.visible = true;
  activeModel = bookModel;
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
    sunset: { fog: 0x121816, key: 0xff9b55, rim: 0x76afbd, exposure: 1.02, keyPower: 2.7, skyPower: 1.18, rimPower: 18, label: "Warm sunset lighting applied to the live model." },
    day: { fog: 0x94a9aa, key: 0xfff1d1, rim: 0x9dd8ff, exposure: 1.18, keyPower: 2.3, skyPower: 1.55, rimPower: 12, label: "Clear daylight lighting applied to the live model." },
    night: { fog: 0x050817, key: 0x789dff, rim: 0xff9f52, exposure: 0.72, keyPower: 1.3, skyPower: 0.48, rimPower: 24, label: "Moonlit lighting applied to the live model." }
  };
  const state = states[value];
  scene.fog.color.setHex(state.fog);
  keyLight.color.setHex(state.key);
  rimLight.color.setHex(state.rim);
  keyLight.intensity = state.keyPower;
  hemisphereLight.intensity = state.skyPower;
  rimLight.intensity = state.rimPower;
  renderer.toneMappingExposure = state.exposure;
  controlNote.textContent = state.label;
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (exploring) {
    worldMixer?.update(delta);
    updatePlayer(delta, elapsed);
    controls.update();
  } else {
    scrollCurrent = THREE.MathUtils.lerp(scrollCurrent, scrollTarget, 0.055);
    const state = cameraState(scrollCurrent);
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

enterWorld.addEventListener("click", async () => {
  try {
    await loadWorld();
    enterExploreMode();
  } catch (error) {
    console.error(error);
    enterWorld.querySelector("span").textContent = "Could not load scene";
  }
});
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
    controlNote.textContent = `${file.name} is ready as the character input prototype.`;
  });
  reader.readAsDataURL(file);
});
atmosphere.addEventListener("change", () => setAtmosphere(atmosphere.value));

updateScroll();
