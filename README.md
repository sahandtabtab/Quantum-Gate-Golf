# Qubit Golf

Qubit Golf is a browser game for learning single-qubit gates. Build a short quantum circuit, run it, and watch the state move on a Bloch sphere toward the target.

Play it here:

https://sahandtabtab.github.io/Quantum-Gate-Golf/

## Game Loop

Each level gives you a target state and a maximum number of gates.

1. Pick a level from the level menu.
2. Build a circuit from the available gates.
3. Reorder gates by dragging them, or use the small left/right controls.
4. Remove individual gates with the `x` control.
5. Press `RUN` to animate the full circuit.
6. Clear the level by landing on the target state within the gate limit.
7. Earn XP, unlock the next level, and spend XP on rare gate hints.

Hints add one gate from a good solution directly into your circuit. Progress and XP are stored locally in the browser, and can be reset from the level menu.

## Development

The web app lives in `web/` and is built with React, TypeScript, Vite, and Three.js.

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