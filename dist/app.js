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
let keyLight;
let rimLight;
let scrollTarget = 0;
let scrollCurrent = 0;
let exploring = false;
let pointerX = 0;
let pointerY = 0;

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

  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 80);
  camera.position.set(...cameraKeys[0].position);

  const hemisphere = new THREE.HemisphereLight(0xd9e7e1, 0x2b231d, 2.2);
  scene.add(hemisphere);

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

function loadModel(url, targetSize, onProgress, prepareModel) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        prepareModel?.(model);
        const bounds = normaliseModel(model, targetSize);
        resolve({ model, bounds });
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
    const result = await loadModel("models/pagescape-world.glb", 12.2, undefined, expandPopUp);
    worldModel = result.model;
    worldModel.visible = false;
    scene.add(worldModel);
    worldModel.userData.bounds = result.bounds;
    return worldModel;
  } finally {
    enterWorld.querySelector("span").textContent = originalText;
    enterWorld.disabled = false;
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
  updateContactPlane(worldModel.userData.bounds);
  camera.position.set(8.8, 5.6, 10.4);
  controls.target.set(0, 0.55, 0);
  controls.enabled = true;
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
  worldModel.visible = false;
  bookModel.visible = true;
  activeModel = bookModel;
  const bounds = new THREE.Box3().setFromObject(bookModel);
  updateContactPlane(bounds);
  updateScroll();
}

function setAtmosphere(value) {
  const states = {
    sunset: { fog: 0x0c1010, key: 0xffae64, rim: 0x6eaeb7, exposure: 1.18, label: "Warm sunset lighting applied to the live model." },
    day: { fog: 0x182126, key: 0xfff1d1, rim: 0x9dd8ff, exposure: 1.35, label: "Clear daylight lighting applied to the live model." },
    night: { fog: 0x050817, key: 0x789dff, rim: 0xff9f52, exposure: 0.82, label: "Moonlit lighting applied to the live model." }
  };
  const state = states[value];
  scene.fog.color.setHex(state.fog);
  keyLight.color.setHex(state.key);
  rimLight.color.setHex(state.rim);
  renderer.toneMappingExposure = state.exposure;
  controlNote.textContent = state.label;
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;

  if (exploring) {
    controls.update();
    if (worldModel) worldModel.rotation.y += 0.00035;
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
  controls.target.set(0, 0.55, 0);
  controls.update();
});

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
