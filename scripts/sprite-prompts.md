# Paste-ready prompt pack

Drop these into ComfyUI / Retro Diffusion / your generator. Generate all of them in one batch with the same base model + LoRA + seed to keep the kingdom visually coherent.

## Shared style suffix

Append this to **every** prompt:

```
SNES JRPG, Final Fantasy 6 style, Chrono Trigger style, pixel art, limited 16-color palette, crisp pixels, transparent background, no anti-aliasing, no gradient, no blur, top-down view
```

Negative for all:

```
blurry, anti-aliased, soft edges, photorealistic, 3d render, high resolution, smooth gradients, anime, manga, watermark, signature, text, modern, sci-fi
```

## Structures (do these first — biggest visual impact)

1. `pixel art top-down medieval castle with red banner, gray stone walls, crenellations, single tower, wooden door, 128x96`
2. `pixel art top-down small village of three houses with red sloped roofs, warm yellow walls, brown doors, 96x64`
3. `pixel art top-down small stone library building with a purple dome and golden cross on top, two small yellow windows, 64x64`
4. `pixel art top-down blacksmith forge with stone chimney, smoke rising, orange fire glow visible through opening, anvil outside, 64x64`
5. `pixel art top-down mine entrance carved into a brown hillside, wooden support beams, mining cart tracks, dark interior, 64x64`

## Tiles (4 variants each — re-roll with the same prompt, different seeds)

6. `pixel art seamless tileable grass field tile, warm sage green, small grass tufts, 32x32`
7. `pixel art seamless tileable dense forest tile with one tall pine tree, dark green leaves, dark brown trunk, grass base, 32x32`
8. `pixel art seamless tileable ocean tile with simple wave dashes, deep blue, 32x32`
9. `pixel art seamless tileable shallow river tile with horizontal wave lines, lighter blue, 32x32`
10. `pixel art seamless tileable rocky mountain tile, gray triangular peak, dark shadow, 32x32`
11. `pixel art seamless tileable snow-capped mountain tile, white peak gradient, 32x32`
12. `pixel art seamless tileable sandy coast tile, warm yellow sand with darker speckles, 32x32`
13. `pixel art seamless tileable grassy hill tile, raised mound with shadow, 32x32`

## Character sheets (32×32 per frame, 4 directions × 4 frames = 128×128 each)

14. `pixel art character sprite sheet, peasant villager, brown hair, yellow tunic, walking animation, 4 rows (down, up, left, right), 4 frames per row, transparent background, JRPG`
15. `pixel art character sprite sheet, mounted courier riding brown horse with leather satchel, green cloak, running animation, 4 directions × 4 frames`
16. `pixel art character sprite sheet, robed scholar with thick book, purple robe, slow walk cycle, 4 directions × 4 frames`
17. `pixel art character sprite sheet, burly blacksmith with leather apron and hammer, red-brown clothes, walking cycle, 4 directions × 4 frames`
18. `pixel art character sprite sheet, miner with pickaxe and helmet lantern, gray and brown clothes, walking cycle, 4 directions × 4 frames`
19. `pixel art character sprite sheet, armored kingdom guard with red plume helmet, gold trim, spear, walking, 4 directions × 4 frames`

## Props

20. `pixel art fantasy airship side view, large red balloon, wooden gondola underneath, ropes, small propeller at rear, 64x32`
21. `pixel art small purple monster, two yellow eyes, sharp fangs, dark silhouette, JRPG enemy, 32x32`
22. `pixel art puffy white cloud, three lobes, semi-transparent edges, 64x24`

## Particles (tiny — easier to draw by hand)

These are 1-4 pixels and not worth AI generation. The procedural fallback covers them fine.

## Workflow tip

Generate `structures` and `tiles` first. Verify they look like one cohesive kingdom (same palette feel). Only THEN move on to characters — re-rolling characters is cheap, re-rolling structures is expensive.
