# Toy Town — Tidy-Up

A first-person WebGL2 game: a toy store buried under **312,000 toys** (teddy bears, ducks, cars, blocks, balls, robots, dinosaurs, bunnies). Vacuum them up, carry them to the matching shelf (every shelf has a name and a live counter) and stock all 24 products. When the last toy is on its shelf, the store is perfect.

**Play:** open `index.html` in a modern browser (double-click). No build, no dependencies.

## Controls
- Mouse: look (click to lock pointer) · Hold left click: vacuum toys
- WASD / arrows: move · Shift: run · E: stock the shelf in front of you · U: upgrades · Esc: pause
- Touch: left joystick, drag to look, VACUUM and E buttons

## How it works
All 312,000 toys are real instances drawn with GPU instancing (two levels of detail, chunk culling and distance sampling), each one individually picked up through a spatial grid. Models, textures, shelf labels and audio are all generated in code.

## License
MIT
