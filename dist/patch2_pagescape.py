#!/usr/bin/env python3
"""PageScape patch 2: closing book -> hover reveals the pop-up scene -> click -> cloud curtain -> world.
Put this file in your dist folder (next to app.js and index.html) and run:  python patch2_pagescape.py
All-or-nothing: if any anchor is missing, nothing is changed. Backups: app.js.bak2 and index.html.bak2."""
import os, re, sys, shutil

here = os.path.dirname(os.path.abspath(__file__))
base = here if os.path.exists(os.path.join(here, "app.js")) else ("dist" if os.path.exists(os.path.join("dist", "app.js")) else ".")
js_path, html_path = os.path.join(base, "app.js"), os.path.join(base, "index.html")

def read(p):
    with open(p, "r", encoding="utf-8", newline="") as f:
        raw = f.read()
    return raw, raw.replace("\r\n", "\n")

js_raw, js = read(js_path)
html_raw, html = read(html_path)
problems = []

CLOUD_JS = r'''function buildCloudCurtain() {
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

// Closing book -> clouds sweep in from both sides -> the world loads behind them -> clouds part.
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
  } finally {
    diveStart = 0;
    hoverTarget = 0;
    const openTiming = { duration: 1300, easing: "cubic-bezier(.6,0,.3,1)", fill: "forwards" };
    const openLeft = leftSide.animate([{ transform: "translateX(0)" }, { transform: "translateX(-125%)" }], openTiming);
    const openRight = rightSide.animate([{ transform: "translateX(0)" }, { transform: "translateX(125%)" }], openTiming);
    await Promise.all([openLeft.finished, openRight.finished]).catch(() => {});
    curtain.remove();
    diving = false;
  }
}
'''

GATE_JS = r'''// ---- closing-book gate: hover re-opens the book and raises the pop-up scene; click enters the world ----
const bookGate = document.querySelector("#bookGate");
if (bookGate) {
  bookGate.addEventListener("pointerenter", () => { hoverTarget = 1; });
  bookGate.addEventListener("pointerleave", () => { hoverTarget = 0; });
  bookGate.addEventListener("focus", () => { hoverTarget = 1; });
  bookGate.addEventListener("blur", () => { hoverTarget = 0; });
  bookGate.addEventListener("click", () => diveIn());
}

'''

CSS = '''<style>
/* A2: closing-book gate and cloud curtain */
.chapter-world { position: relative; }
#bookGate { position: absolute; left: 3vw; top: 18vh; width: 62vw; height: 58vh; background: transparent; border: 0; border-radius: 32px; cursor: pointer; z-index: 4; outline: none; transition: box-shadow .3s ease; }
#bookGate:hover, #bookGate:focus-visible { box-shadow: 0 0 0 2px rgba(217,164,65,.55), 0 0 60px rgba(217,164,65,.18); }
.gate-label { position: absolute; left: 3vw; top: calc(18vh + 58vh + 14px); width: 62vw; margin: 0; text-align: center; z-index: 4; pointer-events: none; color: #f6f0e3; font: 600 13px/1.2 ui-monospace, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; text-shadow: 0 2px 10px rgba(0,0,0,.65); }
.cloud-curtain { position: fixed; inset: 0; z-index: 95; pointer-events: none; overflow: hidden; }
.cloud-side { position: absolute; top: -6vh; bottom: -6vh; width: 60%; will-change: transform; }
.cloud-side.left { left: 0; }
.cloud-side.right { right: 0; }
.cloud-base { position: absolute; inset: 0; background: linear-gradient(#bfdcf2, #eef6ff 55%, #ffffff); }
.cloud-puff { position: absolute; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff 0, #ffffff 55%, #e3eefb 100%); box-shadow: inset -10px -14px 26px rgba(140,170,205,.5), 0 0 34px rgba(255,255,255,.85); }
</style>
</head>'''

def sub_once(text, old, new, name):
    if text.count(old) != 1:
        problems.append(name)
        return text
    return text.replace(old, new)

def regex_once(text, pattern, repl, name):
    found = re.findall(pattern, text, flags=re.S)
    if len(found) != 1:
        problems.append(name)
        return text
    return re.sub(pattern, lambda m: repl, text, flags=re.S)

# ---------- app.js ----------
js = sub_once(js, "let diving = false;\n", "let diving = false;\nlet hoverOpen = 0;\nlet hoverTarget = 0;\n", "state variables")
js = sub_once(js, "function overRevealedBook(event) {", "function overRevealedBook(event) {\n  return false; // superseded by the closing-book gate button\n", "old 3D click test")
js = regex_once(js, r"async function diveIn\(\) \{.*?\n\}\n", CLOUD_JS, "diveIn function")
js = sub_once(js, "  const pageTurn = THREE.MathUtils.smoothstep(progress, 0.055, 0.22);\n  const worldRise = THREE.MathUtils.smoothstep(progress, 0.16, 0.49);\n",
"""  const closing = THREE.MathUtils.smoothstep(progress, 0.80, 0.96);   // the book closes again at the end of the story
  const openness = hoverOpen * closing;                                 // hovering the closed book re-opens it
  const pageTurn = Math.max(THREE.MathUtils.smoothstep(progress, 0.055, 0.22) * (1 - closing), openness);
  const worldRise = Math.max(THREE.MathUtils.smoothstep(progress, 0.16, 0.49) * (1 - closing), openness);
""", "book closing")
js = regex_once(js, r'diveHint\.style\.opacity = \(!diving && scrollCurrent > [-0-9.]+\) \? "1" : "0";',
                'hoverOpen = THREE.MathUtils.lerp(hoverOpen, hoverTarget, 0.09);\n    diveHint.style.opacity = "0";', "hint line")
js = sub_once(js, 'enterWorld.addEventListener("click", async () => {', GATE_JS + 'enterWorld.addEventListener("click", async () => {', "gate wiring")

# ---------- index.html ----------
html = sub_once(html, "</head>", CSS, "head")
html = sub_once(html, '<section class="chapter chapter-world" id="world" data-chapter="4" data-label="Enter the world">',
 '<section class="chapter chapter-world" id="world" data-chapter="4" data-label="Enter the world">\n        <button id="bookGate" type="button" aria-label="Open the book and step into the world"></button>\n        <p class="gate-label">Hover the book to open it · click to step inside</p>', "world section")
html = regex_once(html, r'<button class="enter-button" id="enterWorld" type="button">.*?<small>Web prototype · no generated scene imagery</small>',
 '<button class="enter-button" id="enterWorld" type="button" hidden tabindex="-1" aria-hidden="true"><span>Enter the 3D world</span></button>', "old enter button block")
html = sub_once(html, '<p class="disclosure">',
 '<figure class="dialog-evidence"><video controls preload="metadata" aria-label="PageScape cinematic preview"><source src="media/PageScape_Cinematic_Preview.webm" type="video/webm" /></video><figcaption>Cinematic preview: camera path, character and synthesised sound (about 64 s).</figcaption></figure>\n      <p class="disclosure">', "trailer into dialog")

if problems:
    print("NOTHING CHANGED. These anchors were not found exactly once:", ", ".join(problems))
    print("Your files differ from the versions I patched. Send the message to me and I will adjust.")
    sys.exit(1)

def write(path, raw, text):
    shutil.copyfile(path, path + ".bak2")
    out = text.replace("\n", "\r\n") if "\r\n" in raw else text
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(out)

write(js_path, js_raw, js)
write(html_path, html_raw, html)
print("OK: patched %s and %s (backups: .bak2)." % (js_path, html_path))