# Quantum Gate Golf

A prototype game about learning single-qubit gates by building short quantum circuits and watching their action on the Bloch sphere.

The repo currently has two layers:

1. A small Python model for the gate math and the original Matplotlib animation.
2. A browser prototype in `web/` built with React, TypeScript, Vite, and Three.js.

## Game Loop

In the browser version, each level gives you a target state on the Bloch sphere.

1. Pick a level from the level menu.
2. Build a circuit from the available gates.
3. Reorder gates in the circuit by dragging them, or use the small left/right controls.
4. Remove individual gates with the `x` control.
5. Press `RUN` to animate the full circuit.
6. The result is revealed near the end of the animation.
7. Clearing a level awards XP and unlocks the next level.

Some levels lock gates to create different challenge types, such as Hadamard-only, Clifford-only, bit-flip, and Clifford+T puzzles.

## Browser Prototype

Install dependencies:

```bash
cd web
npm install
```

Run the local dev server:

```bash
npm run dev
```

Then open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

Build for production:

```bash
npm run build
```

Run the Playwright visual checks:

```bash
npm run test:visual
```

## Python Prototype

List the available gates and starter puzzles:

```bash
python example.py --list
```

Attempt the default `plus_y` puzzle:

```bash
python example.py H S
```

Try a specific puzzle:

```bash
python example.py --puzzle magic_t H T
```

Open the Matplotlib Bloch sphere animation:

```bash
python animate_bloch.py H S
```

Verify the animation script without opening a window:

```bash
python animate_bloch.py --no-show H S
```

Run the Python tests:

```bash
python -m unittest
```

## Notes

The browser app is the main game direction now. The Python files are still useful as a compact reference for the math and a quick sanity check for gate behavior.

Good next steps:

- add more authored levels with interesting gate restrictions
- add persistent level completion UI polish
- tune the mobile layout after more phone testing
- introduce multi-qubit ideas later with a different visualization
