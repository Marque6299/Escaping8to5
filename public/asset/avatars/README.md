# Avatar design sources

Avatars are **drawn by code**, not loaded from files: `RR.ui.avatar.render(lookSeed, { role, size, name })` in `public/js/19-ui-art.js`.
This folder documents the parts so artists and later phases can extend them without reverse-engineering the generator.

| Layer (back → front) | Variants | Notes |
|---|---|---|
| background | 6 | flat tones, plus a soft highlight disc |
| body / outfit | 10 shapes × 6 colours × 10 role-family palettes | crew, v-neck, collar, hoodie, turtleneck, blazer, stripe tee, overalls, cardigan, scarf |
| role signature | per family | tie (finance), name badge (agent), lanyard (office), reflective stripes (trade), knit dots (mentor), side stripes (sporty) |
| neck, ears, head | 6 skin tones × 2 head shapes | tones span light → deep |
| hair-back | per style | volume/length behind the head (curly, long, bob, bun, ponytail) |
| face | 4 eyes × 3 brows × 3 noses × 4 mouths | |
| hair-front | 10 styles × 8 colours | buzz, side part, curly, long, bun, ponytail, bob, spiky, long fringe, bald |
| accessory | 6 | none, round glasses, square glasses, studs, cap, headset |

Rules (Appendix F): the generator uses its **own** mulberry32 seeded from `lookSeed` — it never reads or writes `RR.rng`, so art can never change a game outcome.
Draw order inside `resolveLook` is **frozen**: reordering it would change every saved NPC's face.
Roles choose outfit palettes and accessories — never skin or hair — so appearance is not tied to a role stereotype.
The player's avatar seed is derived from `name + professionId` (`RR.ui.avatar.playerSeed`); a chosen look arrives with accounts in Phase 5.
Premium cosmetics (Phase 6) pass a look object with explicit overrides: `{ seed, skin, hairStyle, hairColor, outfit, outfitColor, accessory, bg, eyes, brows, mouth, nose, head }`.
