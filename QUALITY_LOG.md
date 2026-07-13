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

