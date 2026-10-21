#!/usr/bin/env python3
"""PageScape patch: click-the-scene-to-dive-in + paper-cutout avatar.
Usage:  python3 patch_app.py            (run inside the dist folder, next to app.js)
        python3 patch_app.py path/to/app.js
Makes app.js.bak first. All-or-nothing: if any anchor is not found, nothing is changed."""
import sys, shutil, os

path = sys.argv[1] if len(sys.argv) > 1 else "app.js"
with open(path, "r", encoding="utf-8", newline="") as f:
    raw = f.read()
text = raw.replace("\r\n", "\n")

DECLS = r'''let exploreOriginalFov = null;

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
'''
BLOCK = r'''// ===== A2 additions: click-to-dive + paper-cutout avatar =====
const DIVE_IGNORE = "button,a,summary,details,video,dialog,input,select,label,.chapter-copy,.evidence,.frame-sequence,.motion-intro,.topbar,.progress-rail,.explore-ui,.load-screen";

diveHint.textContent = "Click the book to open it and step inside";
diveHint.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);margin:0;padding:9px 18px;border-radius:999px;background:rgba(6,47,54,.82);color:#f6f0e3;font:600 13px/1 system-ui,sans-serif;letter-spacing:.06em;z-index:30;pointer-events:none;opacity:0;transition:opacity .4s";
document.body.append(diveHint);

function overRevealedBook(event) {
  if (exploring || diving || !bookModel || !bookModel.visible || scrollCurrent < 0.04) return false;
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

'''

R = []
R.append(("state variables", "let exploreOriginalFov = null;\n", DECLS))
R.append(("player height", '    legR: worldModel.getObjectByName("Player_Leg_R")\n  };\n',
'''    legR: worldModel.getObjectByName("Player_Leg_R")
  };
  // A2: measure the block avatar so a paper-cutout avatar can match its height
  {
    const heightBox = new THREE.Box3();
    Object.values(playerParts).filter(Boolean).forEach((part) => heightBox.expandByObject(part));
    const measured = heightBox.max.y - heightBox.min.y;
    if (Number.isFinite(measured)) avatarHeight = THREE.MathUtils.clamp(measured, 1.2, 3.5);
  }
'''))
R.append(("wasGrounded", "  const speed = running ? 6.2 : 3.35;\n", "  const speed = running ? 6.2 : 3.35;\n  const wasGrounded = grounded;\n"))
R.append(("card update", "  playerRoot.getWorldPosition(playerWorldPosition);\n  const desiredTarget",
          "  playerRoot.getWorldPosition(playerWorldPosition);\n  updateAvatarCard(delta, moving, stride, wasGrounded);\n  const desiredTarget"))
R.append(("cinematic card", "    if (cinematic) updateCinematic(performance.now(), delta);\n    else { updatePlayer(delta, elapsed); controls.update(); }",
          "    if (cinematic) { updateCinematic(performance.now(), delta); updateAvatarCard(delta, false, 0, true); }\n    else { updatePlayer(delta, elapsed); controls.update(); }"))
R.append(("dive camera", "    const state = cameraState(scrollCurrent);\n    camera.position.lerp(state.position, 0.085);",
'''    const state = cameraState(scrollCurrent);
    if (diveStart) {
      const diveT = Math.min(1, (performance.now() - diveStart) / 850);
      const diveE = diveT * diveT * (3 - 2 * diveT);
      state.position.lerp(diveFocus, 0.62 * diveE);
      state.target.lerp(diveFocus, 0.5 * diveE);
    }
    diveHint.style.opacity = (!diving && scrollCurrent > 0.02) ? "1" : "0";
    camera.position.lerp(state.position, 0.085);'''))
R.append(("hide hint in world", "  if (exploring) {\n    worldMixer?.update(delta);", "  if (exploring) {\n    diveHint.style.opacity = \"0\";\n    worldMixer?.update(delta);"))
R.append(("show card on enter", "  bookModel.visible = false;\n  worldModel.visible = true;\n  activeModel = worldModel;",
          "  bookModel.visible = false;\n  worldModel.visible = true;\n  activeModel = worldModel;\n  if (avatarCard) avatarCard.visible = true;\n  if (avatarBlob) avatarBlob.visible = true;\n  document.body.style.cursor = \"\";"))
R.append(("hide card on exit", "  worldModel.visible = false;\n  bookModel.visible = true;\n  activeModel = bookModel;",
          "  worldModel.visible = false;\n  bookModel.visible = true;\n  activeModel = bookModel;\n  if (avatarCard) avatarCard.visible = false;\n  if (avatarBlob) avatarBlob.visible = false;"))
R.append(("upload hook", "    controlNote.textContent = `${file.name} is ready as the character input prototype.`;",
          "    applyCutoutAvatar(reader.result, file.name);"))
R.append(("functions and listeners", 'enterWorld.addEventListener("click", async () => {', BLOCK + 'enterWorld.addEventListener("click", async () => {'))

bad = [name for name, old, new in R if text.count(old) != 1]
if bad:
    print("NOTHING CHANGED. These anchors were not found exactly once:", ", ".join(bad))
    print("Your app.js differs from the version I patched. Send it again and I will adjust.")
    sys.exit(1)
for name, old, new in R:
    text = text.replace(old, new)
if "\r\n" in raw:
    text = text.replace("\n", "\r\n")
shutil.copyfile(path, path + ".bak")
with open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)
print("OK: patched %s (%d edits). Backup: %s.bak" % (path, len(R), os.path.basename(path)))