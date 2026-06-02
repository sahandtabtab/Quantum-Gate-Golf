# Bloch Sphere Gate Puzzle Prototype

This is step one for the quantum game idea: a tiny, dependency-free Python
prototype of the single-qubit gate mechanic.

The current loop is:

1. Start in `|0>`.
2. Apply a sequence of standard gates.
3. Convert the final state to Bloch-sphere coordinates.
4. Compare it to a target state.
5. Score the attempt by fidelity and gate count.

## Try It

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

Open a simple animated Bloch sphere:

```bash
python animate_bloch.py H S
```

If you only want to verify the animation script without opening a window:

```bash
python animate_bloch.py --no-show H S
```

Run the tests:

```bash
python -m unittest
```

## Browser Game Prototype

The first real playable UI lives in `web/`. It uses React, TypeScript, Vite, and
Three.js.

After Node.js is installed, install the web dependencies:

```bash
cd web
npm install
```

Run the browser prototype:

```bash
npm run dev
```

Then open the local URL printed by Vite.

## Why This Shape

The first playable game can focus on one qubit. That keeps the math simple while
still producing a very visual puzzle: every gate moves the state arrow on the
Bloch sphere.

Good next steps:

- build a minimal browser UI around this model
- hand-author a few more puzzles with increasing restrictions
- later, add multi-qubit ideas with a different visualization
