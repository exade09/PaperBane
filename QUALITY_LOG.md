# PaperBane Quality Log

## Iteration 1 — 2026-07-13

### Weakest areas found

1. The Holder's normal rear view still read as a procedural mannequin: rounded shoulder caps, a flat jacket back, a broad simple hair cap, block-like boots, and an awkward high weapon carriage.
2. Heavy attack, dodge, medkit, and Wick Surge visuals were not all driven by the same event timeline as their gameplay effects.
3. Paper Hands had a weaker silhouette than the references, shirt graphics were separate planes, and attack/chase logic lacked a complete readable state machine.
4. The nearby street used flat facade slabs, regular mirror-like puddles, weak curb/road damage, and under-described Pump Station and Solana landmarks.
5. The camera framed the character too tightly and the large always-visible tutorial signs competed with enemies and the route.

### Improvements selected and completed

- Rebuilt the player's articulated action poses around one normalized timing configuration.
- Added five authored key-pose phases for `OVERHEAD_STRIKE` and five for `DODGE_ROLL`.
- Added animated `MEDKIT_USE` and `WICK_SURGE` states with gameplay effects at explicit commit markers.
- Reconstructed the rear jacket, shoulder, hair, trouser, hand, boot, and idle weapon silhouettes.
- Raised useful player geometry from 6,200 rendered triangles at the start of the pass to 15,244 including the weapon/held utility geometry.
- Rebuilt Paper Hand surface construction and deterministic variants; raised each regular enemy from 3,377 to 9,613 rendered triangles.
- Added a complete enemy FSM: `IDLE`, `PATROL`, `DETECT`, `CHASE`, `ATTACK`, `RECOVER`, `STAGGER`, `DEAD`.
- Added facade depth, shopfronts, awnings, fire escapes, rough asphalt, irregular puddles, instanced curbs/cracks, station details, and a stronger Solana gate silhouette.
- Moved the camera farther back and slightly higher so the route and rear jacket remain readable together.
- Replaced five dominant world-space control signs with small progression- and distance-aware prompts.
- Expanded automated checks for animation windows, utility commit timing, responsive layout, model metrics, checkpoint persistence, and the complete route.
- Made the Vercel Vite build/output settings explicit while retaining the SPA deep-link rewrite.

### Models and materials changed

- **The Holder:** layered back panel, yoke, side panels, construction darts, center seam, lower vent, sloped shoulder caps, adult rear skull/jaw ratio, layered hair/nape locks, trouser folds, multi-part worn boots, and gripping fingers/thumb.
- **Candlestick:** retained thick beveled candle body and both wicks; added grip stop, clearer rear face, lower idle carriage, centralized active trail window, and controlled surge emission.
- **Paper Hands:** wrapped front/rear shirt texture, anchored ragged hem and knee tears, undershirt/collar/yoke, cheek planes, ears, brows, damaged jaw/mouth/teeth, scars, layered hair, trouser seams, and multi-part shoes.
- **Environment:** rough concrete/asphalt separation, lower-gloss broken puddles, dirty facade layers, restrained station emission, moon/warm-lamp color separation, and thicker fog depth without hiding the route.

No GLB was created because Blender is not available in the development environment. The models remain local custom faceted geometry in articulated transform hierarchies.

### Animations improved

- `IDLE`
- `WALK`
- `RUN`
- `ATTACK_1`
- `ATTACK_2`
- `ATTACK_3`
- `OVERHEAD_STRIKE` — 1.00 s, damage at 0.54–0.68 s
- `DODGE_ROLL` — 0.75 s, invulnerability at 0.18–0.48 s
- `HIT`
- `MEDKIT_USE` — 1.20 s
- `WICK_SURGE` — 0.90 s
- `DEATH`
- `VICTORY`
- Enemy detection, patrol, walk/run, attack, miss recovery, stagger, and terminal death behavior

### Bugs and regressions fixed or protected

- Player utility effects no longer apply instantly on key press; animation commit events trigger them.
- Weapon trails and attack damage share normalized active windows.
- Dodge no longer grants invulnerability for its entire duration.
- Enemy damage is limited to visible attack-active frames and misses have explicit recovery.
- Dead enemies stop decisions, movement, and attacks.
- Automated progression now verifies intro gate removal, terminal checkpoint storage, boss access, boss death, and the victory screen.
- Responsive modal tests verify no Tokenomics text/card/button overlap at 320, 375, 768, 1024, 1440, and 1920 px.

### Files changed

- `.gitignore`
- `scripts/browser-smoke.mjs`
- `scripts/full-route-smoke.mjs`
- `scripts/gameplay-regression.mjs`
- `src/game/CityEnvironment.tsx`
- `src/game/Enemy.tsx`
- `src/game/EnemyAI.ts`
- `src/game/GameConfig.ts`
- `src/game/GameWorld.tsx`
- `src/game/Player.tsx`
- `src/game/PlayerAnimationConfig.ts`
- `src/game/PlayerModel.tsx`
- `src/game/ThirdPersonCamera.tsx`
- `src/game/TutorialPrompts.tsx`
- `src/game/Weapon.tsx`
- `vercel.json`

### Validation and performance impact

- TypeScript build: passed.
- Production build: passed, 641 modules.
- Final game bundle: 176.46 kB / 51.90 kB gzip; the visible quality pass added about 3.8 kB gzip versus the prior build.
- Regular enemy: 112 meshes, 9,613 rendered triangles, 3,051 unique-geometry triangles.
- Player group: 129 meshes, 15,244 rendered triangles; weapon: 824 rendered triangles.
- Curbs and road scars use instancing; the most expensive facade additions are limited to the six closest buildings.
- Full start-to-victory route passed twice on the final code with no browser errors, checkpoint persistence, 8 kills, boss HP 0, and `VICTORY`.
- Browser layout/WebGL smoke passed. The available headless browser used SwiftShader software rendering, so its frame rate is recorded for regression visibility but is not treated as a modern desktop GPU benchmark.

### Remaining highest-priority weaknesses

1. Replace the procedural articulated player and enemy hierarchies with reproducibly generated, skinned local GLBs for smoother deformation and lower draw-call count.
2. Improve the Paper King model; it is now the most visibly primitive close-range character.
3. Add authored animation blending and planted-foot/root-motion correction for walk/run/action transitions.
4. Add closer facial material variation and expression deformation for the protagonist and enemies.
5. Profile `QUALITY` mode on real desktop GPU hardware and introduce facade/prop LODs if draw-call pressure is measurable.

## Iteration 2 — 2026-07-13

### Current weakest areas found

1. The Paper King was visibly below the quality of the upgraded player and Paper Hands: box-like limbs, a generic head, weak clothing hierarchy, and limited attack silhouettes.
2. Player locomotion still used a simple oscillating gait with insufficient support-foot time, heel strike, toe-off, hip transfer, and state blending.
3. Combat impacts were small non-directional cube fragments; heavy hits and dodge movement lacked a distinct ground response.
4. Close-range faces remain difficult to read in the darkest areas even though model geometry is present.
5. The procedural multi-mesh rigs still create more draw calls than an equivalent skinned GLB.

### Improvements selected and completed

- Rebuilt the Paper King model and every boss-state pose while preserving its state machine, damage, spawn, and progression APIs.
- Replaced the player gait with a continuous stance/swing sampler and added snapshot-based state blending.
- Rebuilt successful-hit, incoming-hit, heavy-impact, and dodge feedback with directional low-cost effects.
- Extended the route smoke test with boss geometry metrics and close-range enemy, impact, and boss captures.

### Models and visual differences

- **Paper King before:** broad primitive torso, rectangular limbs/boots, minimal head, flat chest panel, and weak separation between attacks.
- **Paper King after:** angular infected adult face, jaw/cheeks/nose, twelve hair clumps, five-spike paper crown, layered long coat, distressed front `PAPER KING` and rear `PAPER CROWN` insignias, candlestick chest motif, green/purple seams, articulated giant paper palms/fingers, coat tails, trousers, shins, and multi-part boots.
- Runtime boss measurement: 110 visible meshes, 14,428 rendered triangles, 944 shared unique-geometry triangles, and 24 materials in the active encounter.
- No new GLB or external asset was introduced; the boss remains local faceted Three.js geometry with a hierarchical articulated rig.

### Animations improved

- `IDLE`: breathing plus asymmetric weight transfer, knee loading, head stabilization, and restrained weapon drift.
- `WALK`: 63% support phase, heel strike, planted ankle correction, toe-off, swing clearance, stance-width transfer, and torso/hip counter-rotation.
- `RUN`: 54% support phase, higher knee/swing clearance, stronger but controlled root motion, and continuous phase when switching from walk.
- All player state changes now capture the current pose and blend over approximately 55–180 ms according to urgency, preventing gait/action snaps.
- Dodge recovery normalizes the completed full turn instead of visibly unwinding backward.
- Boss `SLAM`: brace, windup, overhead anticipation, impact, follow-through, and recovery.
- Boss `CHARGE`: crouched preparation, forward hand drive, running phase, and skid.
- Boss `WAVE`: arm rise, hold, release, and recovery.
- Boss `STAGGER` and `DEAD`: asymmetric torso, head, wrist, coat-tail, and fall response.

### Combat feedback improvements

- Directional tetrahedral hit shards.
- Light/dark paper fragments and low dust puffs.
- Additive impact core and shock ring.
- Heavy-hit-only short point light.
- Red incoming-player impact burst.
- Green dodge ground ring with dust and paper fragments.
- Effects remain tied to successful `receiveHit` calls or the existing dodge animation marker; damage values and hit windows are unchanged.
- Effects are capped at nine simultaneous descriptors. Normal effects use at most 10 particles, heavy effects 15, and dodge 6; reduced-motion mode lowers those counts.

### Files changed

- `scripts/full-route-smoke.mjs`
- `src/game/Boss.tsx`
- `src/game/CombatSystem.tsx`
- `src/game/Player.tsx`
- `src/game/PlayerModel.tsx`
- `QUALITY_LOG.md`

### Validation and performance impact

- Typecheck and production build passed.
- Browser production smoke passed with zero console/WebGL errors and no responsive text overlap at all six target widths.
- Hardware renderer: NVIDIA GeForce RTX 4070 Ti SUPER through Direct3D 11.
- `QUALITY` mode at 1440×1000: 84.9 estimated FPS average, 12.1 ms p95 frame time, and zero sampled frames above 25 ms.
- The richer boss, gait sampler, and combat effects increased the GamePage chunk from 176.46 kB / 51.90 kB gzip to 192.51 kB / 57.14 kB gzip.
- Shared effect geometry/materials are reused; per-effect core/ring materials are disposed.
- The complete start-to-victory route passed twice on the final iteration code with checkpoint persistence, 8 kills, boss HP 0, `VICTORY`, and zero browser errors.

### Bugs fixed or regressions protected

- WALK/RUN switches no longer restart or pop the gait phase.
- Action-to-locomotion and locomotion-to-action transitions no longer snap from unrelated poses.
- A finished dodge roll no longer visually unwinds in reverse during recovery.
- Boss gameplay hit windows and progression were explicitly regression-tested after the model/animation replacement.
- Full-route actor discovery now identifies the player and boss by their light signatures rather than fragile mesh-count assumptions.

### Remaining highest-priority weaknesses and next focus

1. Create reproducible skinned GLBs for the player and regular enemies when Blender becomes available; this remains the largest path to better deformation and fewer draw calls.
2. Improve close-up protagonist facial planes, expression, stubble, dirt, and skin damage.
3. Refine close-combat separation so enemies never appear visually embedded in the player at the edge of attack range.
4. Add authored footstep surface variation and animation-event-driven left/right foot audio.
5. Add LOD or merged facade batches if profiling on lower-tier desktop GPUs shows draw-call pressure.

## Iteration 3 - 2026-07-13

### Current weakest areas found

1. The Holder's face and upper-body construction still read as broad procedural shapes in close views: bright round eyes, a helmet-like hair mass, a weak jaw/nose hierarchy, a circular collar, and pale detached shoulder blocks.
2. The candlestick was recognizable but still looked like a uniformly emissive flat panel rather than a worn heavy financial candle with physical edge construction.
3. Paper Walkers and Panic Runners overlapped the player at close range, shared too much of the same silhouette, and lacked a strong visual warning before their active attack frames.
4. The street-to-Pump route remained visually sparse at eye level, with weak overhead utility structure, few roadside props, and no active environmental layer near the forecourt.
5. Procedural multi-mesh characters remain more expensive in draw calls and deform less smoothly than equivalent skinned GLBs.

### Improvements selected and completed

- Rebuilt the protagonist's close-up face, layered hair, neck, raised collar, lapels, chest panels, pockets, and normal-camera shoulder silhouette.
- Rebuilt the candlestick surface construction with four corner ribs, physical end caps, recessed wick sockets, a darker wrapped grip, front/rear material separation, and faceted wear chips.
- Split Walker and Runner posture, proportions, clothing palettes, chase carriage, attack anticipation, and recovery silhouettes while preserving all gameplay timing values.
- Added deterministic enemy-enemy separation, exact-overlap recovery, approach easing, and player personal-space correction through the existing world collision resolver.
- Added a near-route utility corridor with poles, long sagging cables, broken road marks, drains, trash, drums, a faceted abandoned delivery van, a damaged price pylon, and three animated steam vents.
- Added physical world/camera colliders for the new van, pylon, and utility poles without narrowing the central route.
- Repositioned and softened the existing player readability light so facial, jacket, and weapon materials separate in fog without turning the scene bright.
- Removed visible Victory-screen scrollbars, retained mobile/short-screen scrolling, and added direct responsive Victory validation.
- Replaced fragile mesh-count-only actor discovery in the complete-route test with semantic names and added minimum geometry-quality assertions.

### Models added, rebuilt, or replaced

- **The Holder:** narrower adult skull; forehead, temple, cheek, side-jaw, mandible, and chin planes; narrow tired eyes; heavy lids and lower bags; serious angled brows; nose bridge/tip; compressed mouth; ears; tapered neck/tendons; stubble, dirt, bruises, and scars; layered asymmetric crown/fringe/side/nape hair; constructed raised collar, wings, lapels, shirt neckline, front panels, chest pockets, sloped shoulders, and connected upper sleeves.
- **Candlestick:** 25 mesh instances and 1,544 rendered triangles, up from 13 meshes and 824 triangles. Geometry is concentrated in beveled body construction, end hardware, sockets, surface damage, and grip detail rather than additional glow.
- **Paper Hands:** geometry count remains optimized at 112 meshes / 9,613 rendered triangles per enemy, while body scale, torso depth, limb proportions, stance, per-variant shared clothing materials, jaw motion, and warning materials now separate Walker and Runner reads.
- **Environment:** added a shared faceted delivery-van kit, damaged market pylon, instanced utility/trash/drum/drain/marking sets, and instanced steam. No external model or stock asset was introduced.

No GLB was created because Blender is still unavailable in the development environment. All additions are reproducible local Three.js geometry and articulated transform hierarchies.

### Animations and behavior improved

- Walker: heavier planted knees, broader hunched torso, slower heavy arm carriage, two-arm windup, weight lowering, jaw opening, warning eyes/mouth, active strike, and visibly fatigued recovery.
- Runner: narrower/taller proportions, persistent forward claw posture, deeper pre-charge crouch, planted staggered legs, brighter warning face, longer forearms, aggressive charge silhouette, and longer miss recovery read.
- `DETECT`, `CHASE`, `ATTACK`, and `RECOVER` poses now transition through the same existing FSM and active windows; no damage timing or speed constants were changed.
- Enemy correction continues during every live state, including charge, without moving the player or bypassing world collision.
- The previous pass's player locomotion, planted-foot gait, attack poses, dodge timing, and action blending were retained unchanged.

### Environment, materials, and lighting differences

- The previously empty corridor now has repeated vertical poles, four continuous overhead cable runs, denser curb silhouettes, roadside trash/drums, broken markings, active steam, and a large derelict forecourt landmark.
- Wet asphalt roughness was raised and metalness reduced so reflections remain localized and broken instead of reading as a continuous mirror.
- Repeated props and steam use instancing; the van reuses a small geometry/material kit and explicitly disposes it on session teardown.
- The Holder now separates skin highlight/shadow planes, stubble, lips, wounds, hair layers, jacket panels, worn shirt, green construction seams, and purple pocket details.
- Weapon emission was reduced on the main body and concentrated in its inset face/wicks, preserving readability while revealing actual thickness and wear.

### Bugs fixed or regressions protected

- Paper Hands no longer visually occupy the same center as the player; final minimum spacing is 1.02 units for Walkers and 0.94 for Runners.
- Enemy pairs use combined collision radii plus 0.18 units and deterministic opposed fallback when spawned at the same point.
- New environment props now participate in player, enemy, line-of-sight, and camera collision where their silhouettes require it.
- A potential repeated-session leak was removed by allowing React Three Fiber to dispose RouteStreetDressing-owned instance resources.
- Victory rays no longer create visible desktop scrollbars or false mobile scroll range; decorative rays are disabled only in the two scroll-oriented responsive layouts.
- Short wide screens no longer inherit the 540 px game minimum height.
- Camera directions remain natural and aligned with movement/attacks; no inversion or pointer-lock regression was introduced.
- Route tests now resolve the player, Paper Hands, candlestick, and Paper King by stable semantic names and fail if detailed models are replaced by low-detail placeholders.

### Files changed

- `QUALITY_LOG.md`
- `scripts/full-route-smoke.mjs`
- `src/game/Boss.tsx`
- `src/game/CityEnvironment.tsx`
- `src/game/Enemy.tsx`
- `src/game/EnemyAI.ts`
- `src/game/Player.tsx`
- `src/game/PlayerModel.tsx`
- `src/game/Weapon.tsx`
- `src/game/WorldCollision.ts`
- `src/styles/game.css`

### Validation and performance impact

- Dependency audit: 143 packages, zero vulnerabilities.
- TypeScript and production build passed with 641 modules.
- GamePage chunk increased from 192.51 kB / 57.14 kB gzip to 208.55 kB / 61.70 kB gzip.
- Player runtime model: 178 meshes, 20,780 rendered triangles, 7,636 shared unique-geometry triangles, 55 geometries, and 37 materials.
- Candlestick: 25 meshes, 1,544 rendered triangles, 854 shared unique-geometry triangles.
- Paper Hand: 112 meshes, 9,613 rendered triangles, 3,051 shared unique-geometry triangles.
- Paper King remained at 110 visible meshes / 14,428 rendered triangles and passed its quality threshold.
- The environment adds approximately 40 route-wide draw calls and 9,000 rendered triangles; repeated clutter and steam remain instanced.
- Hardware production smoke at 1440x1000 on an RTX 4070 Ti SUPER measured approximately 84 FPS, 12.1 ms p95, zero sampled frames above 25 ms, and zero WebGL/browser errors.
- Website/Tokenomics layouts passed at 320, 375, 768, 1025, 1440, and 1920 px with no overlap or clipped buttons.
- Victory passed at 1440x1000, scrollable 640x560, and short-wide 1024x520; all actions remained reachable and unclipped.
- The complete physical route passed on the final code with checkpoint persistence, 8 kills, boss HP 0, rank A, `VICTORY`, and zero browser errors.

### Remaining highest-priority weaknesses and next focus

1. Replace the procedural player and regular-enemy hierarchies with reproducibly generated skinned GLBs when Blender is available; this remains the clearest route to smoother shoulders/hips and fewer draw calls.
2. Add animation-event-driven left/right footsteps with concrete, puddle, and debris surface variation.
3. Improve hand-to-weapon contact and finger deformation across the full light-combo and overhead-strike arcs.
4. Add lower-tier GPU profiling and facade/prop LOD or merged batches if route draw calls become measurable below current desktop targets.
5. Continue adding modular facade damage and one more dirty interior vignette beyond the Pump Station without changing the playable route.
