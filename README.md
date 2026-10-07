# Kier — Portfolio (WebGL scroll edition)

This is a full architecture replacement, not an update to the previous version.
Built on a scroll-driven WebGL particle template, rebranded with Kier's palette,
fonts, and content.

## Run it

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## What this actually is

Scrolling drives a three-act procedural point-cloud animation — no 3D models,
no textures, everything generated from math in `scene.js`:

1. **The Field** — a rippling plane of points that reacts to your cursor
2. **The Vortex** — a twisting funnel the camera falls into
3. **A loaded 3D model (Sony PSP)** — replaces what was a crystalline
   point-cloud sphere. It fades in, rotates with your cursor, and shrinks
   slightly during the same "fly apart" moment the old lattice had.

Below that: a loader, a project spotlight (Chrome Vault), an About section
with a rotating dot-sphere, an FAQ, and a contact footer.

## Be honest with yourself about this trade-off

This is a genuinely different site than the component-based version from
earlier in this conversation, not an incremental change:

1. **It's not React components anymore.** `App.jsx` injects one big HTML
   string via `dangerouslySetInnerHTML`, and `scene.js` drives everything
   imperatively — no state, no props, no re-renders. That's intentional
   (it's how the scroll-clock/reveal system works), but it means this
   isn't the "clean component architecture, easy to extend" setup from
   before. Adding content means editing the `MARKUP` string directly.

2. **Only one project gets real depth** (Chrome Vault, in the project
   spotlight card) — BarangayConnect and EcoTrade are mentioned in the
   footer but don't have their own detail view. The previous version had a
   modal for all three. This template's structure doesn't have a slot for
   a project grid — it has one spotlight card.

3. **The dedicated Photography gallery, Credentials section, VibeCode
   terminal easter egg, and the spotlight-glow skill cards are gone.**
   Their content got folded into the "What I Do" panels and the About
   section instead. If you want any of those back as their own sections,
   that's more building on top of this foundation, not a small tweak.

4. **Three.js is back** (bundle is ~730KB minified vs. ~430KB for the
   pure-CSS-shader version two iterations ago). That's the cost of genuine
   3D particle systems — there's no way around it while keeping this
   engine.

5. **The contact email is still a placeholder**
   (`hello@kiersuministrado.com` in the footer) — same as every version
   before this, still needs a real address.

6. **Performance auto-scales by device** (see `CONFIG.tiers` in
   `scene.js`) — point counts, pixel ratio, and bloom step down on
   smaller screens. Test on an actual phone before calling this done;
   point-cloud rendering is fill-rate heavy in a way that's hard to
   predict from a desktop preview.

## Tuning

Almost everything lives in the `CONFIG` object at the top of `scene.js` —
palette, timing, particle counts, performance tiers. You shouldn't need to
touch the shader code itself to adjust colors or pacing.

## About the PSP model — things I couldn't verify visually

**Update: found and fixed the actual "whole site is black" bug, confirmed
by actually running the code** (in a Node.js test harness with a stubbed
WebGL context — not guesswork this time). The real cause: my drag/click
interaction code referenced `POINTER_ON`, a `const` declared later in the
same file. Referencing a `const`/`let` before its declaration line executes
throws a `ReferenceError` immediately in JavaScript — and since this
happened synchronously during the initial scene setup, it killed
*everything* after it: the backdrop, field, vortex, text reveal system, and
the render loop itself never ran. That's exactly "whole page is black."
Moved the interaction code to after `POINTER_ON` is actually declared.

My first two "fixes" (placeholder texture brightness, then the environment
map) were solving a different, real problem I'd misdiagnosed from your
description — both are still worth keeping, but neither was the cause of
the page going fully black.

Everything below this point is still unverified visually — I still have no
way to render WebGL in this sandbox, so once the page itself loads, these
are the things to actually check on screen.


Still true: I have no way to render WebGL in this sandbox, so none of this
has actually been seen on screen. Check these once you run it locally.

**What changed from the last version:**

1. **Found a likely cause of the off-center/tiny bug.** The glTF had a
   `ground` mesh — almost certainly a Sketchfab turntable shadow-catcher,
   not part of the actual device. It was skewing both the recentering and
   scale math. It's now stripped out on load (`model.getObjectByName('ground')`
   → removed). The model is bigger now too (`targetSize = 8.5`, up from
   ~5.25), fixed at world origin, and no longer does the old scroll-linked
   "rush toward camera + shrink" — that motion is very likely what actually
   caused it to swing into the corner, since a rigid object doing that
   looks like it's flying off-frame, where the old point-cloud doing the
   same motion just read as ambient particles.

2. **Drag to inspect, spring back on release** — click-drag anywhere on the
   model body to rotate it; release and it eases back to its ambient resting
   rotation. Desktop/fine-pointer only (same tier gate as the rest of the
   pointer-driven effects) — touch devices need drag gestures for scrolling,
   so this doesn't activate there.

3. **All 15 buttons are clickable, and all of them currently do the same
   thing** (advance to the next screen photo + trigger the flash). The glTF
   only labels them `button1_low` through `button15_low` — no indication of
   which is the D-pad, which is triangle/circle/etc. Once you actually see
   it rendered, tell me which specific button (by position/appearance)
   should do what, and I'll map individual mesh indices to different
   actions instead of all of them doing the same thing.

4. **The screen shows a placeholder until you add real photos.** Add files
   to `public/images/psp/` (see the README in that folder), then list their
   filenames in the `PSP_PHOTOS` array near the top of the PSP section in
   `scene.js`. Any path that fails to load falls back to a labeled
   placeholder automatically rather than showing a broken texture.

5. **Camera flash is a full-screen white CSS pulse** (`#camera-flash` in
   `App.jsx`, styled in `index.css`), not a Three.js effect — simpler and
   guaranteed to work regardless of the 3D scene state. Respects
   `prefers-reduced-motion` (shows nothing rather than a jarring flash).

6. **Screen "glow"**: I set the screen mesh's material to emissive with the
   photo texture as the emissive map, so it should look faintly lit/backlit
   rather than needing external light to read. Screen also has its base
   color forced to white — the original material likely had a dark base
   color (a reasonable way to model a screen that's "off"), which would
   otherwise multiply any texture down toward black.

7. **Two rounds of "black" bugs already fixed, in case a third shows up:**
   first, my placeholder texture used a near-black background — fine for
   dark UI, wrong for something lit via `emissive`, which emits almost no
   light from dark pixels regardless of intensity (now a bright background
   with dark text). Second, and more fundamental: the original material is
   `metalness: 1, roughness: 1`. Fully metallic surfaces have zero diffuse
   reflectance in PBR — without something to reflect, they render
   essentially black no matter how many direct lights hit them, which is
   the more likely explanation if the *whole* model looked black rather
   than just the screen. Fixed by adding a synthetic room environment
   (`RoomEnvironment` + `PMREMGenerator`, right after the renderer/scene
   setup in `scene.js`) so the metal has something to actually reflect. If
   it's still dark after this, that `0.04` argument (roughness/blur of the
   generated room) and the three lights are the next things to try.

## About the "Emerge" model swap (About section)

Replaced the old 2D-canvas dot-sphere with your uploaded
`futuristic_screen.glb`, rendered via its own dedicated Three.js instance
targeting the existing `#emerge-canvas` element (that canvas was already
separate from the main scene, so this doesn't touch the Act 1-3 WebGL
setup at all).

Applied the same lighting/material fixes from the start this time, since
the source file has the identical pattern the PSP model had
(`metalness: 1`, `emissive: [1,1,1]` baked in) — confirmed by actually
inspecting the file rather than guessing this time.

**Known limitation:** this file is a single mesh ("Stand Screen Mesh")
sharing one material between the stand *and* the screen area, with UVs
spanning the full texture — unlike the PSP, there's no separate screen
sub-mesh to target. If you want custom content inserted into just the
display area later, that needs the exact UV region for that part of the
texture identified first, or the model split into stand/screen as separate
meshes in whatever 3D tool it came from.

**Bundle weight:** this file is 16.6MB, larger than the PSP's 12.3MB — the
project now ships ~29MB of 3D assets total. Worth knowing if load time on
slower connections matters; Draco/meshopt compression on either file would
meaningfully shrink this if needed.

## About the japroom loading screen

The loading screen now shows `japroom_14_otaku.glb` (a detailed anime-room
scene, 22 meshes) via its own dedicated Three.js instance targeting a new
`#loader-3d-canvas`, layered behind the existing progress bar/percentage
text.

**Grayscale** is done via a CSS `filter: grayscale(100%)` on the canvas
itself, not by touching the model's 5 different materials individually —
much simpler, and correct regardless of what textures are underneath.

**Verified by actually running the code** (same Node.js + jsdom + stubbed
WebGL test harness used to catch the earlier `POINTER_ON` bug): the full
setup — loading three separate models, wiring the Enter button, all the new
event listeners — executes with zero exceptions. That's real evidence this
part works, not a guess.

**What's still unverified visually** (I have no way to render WebGL in this
sandbox):

1. **Hover tilt** — the model rotates gently to follow the cursor
   (`loaderPointer.x/y` in `scene.js`, search "Hover tilt"). Whether the
   sensitivity/range actually feels good is something only you can judge.
2. **Framing/scale** — `targetSize = 14` for this model is a first guess,
   same as every other model's first pass has needed adjustment.
3. **The Enter button flow**: progress bar fills automatically as before:
   once it hits 100%, status text changes to "Ready" and the button fades
   in (`loader-enter` class `is-ready`). Clicking it plays the *same* exit
   animation the loader always had (warp acceleration, fade, scale) — I
   didn't rebuild that part, just gated when it starts. If the button
   never appears or clicking it does nothing, check the browser console.
4. **Third WebGL context**: the site now runs three simultaneous Three.js
   instances during the loading phase (main scene + emerge + this one) —
   the loader one is explicitly disposed (`disposeLoader3D()`) once
   dismissed, but worth knowing if performance feels different on lower-end
   devices during that initial load.
5. **Emissive strength**: one of this model's materials uses
   `KHR_materials_emissive_strength` at ~1.58x (GLTFLoader applies this
   automatically) — I overrode it to 0 like the other emissive resets, so
   brightness stays predictable rather than trusting the baked value.
