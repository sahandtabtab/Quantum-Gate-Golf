"""Animate a gate sequence on the Bloch sphere.

This is deliberately a prototype visualization, not the eventual game UI. It
lets us see whether the core mechanic feels good before building a slick app.
"""

from __future__ import annotations

import argparse
from math import acos, cos, pi, sin, sqrt
from pathlib import Path
from typing import Sequence

from bloch_sphere import (
    bloch_vector,
    default_puzzles,
    describe_result,
    evaluate_puzzle,
    sequence_states,
)


Vector3 = tuple[float, float, float]


def build_parser() -> argparse.ArgumentParser:
    puzzles = default_puzzles()
    parser = argparse.ArgumentParser(
        description="Animate a single-qubit gate sequence on the Bloch sphere."
    )
    parser.add_argument(
        "gates",
        nargs="*",
        help="Gate sequence to apply, for example: H S",
    )
    parser.add_argument(
        "--puzzle",
        default="plus_y",
        choices=sorted(puzzles),
        help="Target puzzle to show on the sphere.",
    )
    parser.add_argument(
        "--frames-per-gate",
        type=int,
        default=28,
        help="Animation smoothness for each gate transition.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=35,
        help="Milliseconds between animation frames.",
    )
    parser.add_argument(
        "--save",
        type=Path,
        help="Optional output path, usually .gif or .mp4.",
    )
    parser.add_argument(
        "--no-show",
        action="store_true",
        help="Build the visualization without opening a window.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.frames_per_gate < 2:
        parser.error("--frames-per-gate must be at least 2.")

    sequence = tuple(gate.upper() for gate in (args.gates or ["H", "S"]))
    puzzles = default_puzzles()
    puzzle = puzzles[args.puzzle]

    states = sequence_states(sequence)
    key_vectors = tuple(bloch_vector(state) for state in states)
    frames = expand_keyframes(key_vectors, sequence, args.frames_per_gate)
    result = evaluate_puzzle(puzzle, sequence)

    plt, animation = import_matplotlib(headless=args.no_show or args.save is not None)
    fig = plt.figure(figsize=(8, 8))
    ax = fig.add_subplot(111, projection="3d")
    fig.canvas.manager.set_window_title("Bloch Sphere Gate Puzzle")
    draw_static_scene(ax, result.target_bloch)

    (state_line,) = ax.plot([], [], [], color="#00d1ff", linewidth=3)
    (state_tip,) = ax.plot([], [], [], marker="o", color="#00d1ff", markersize=8)
    (trail_line,) = ax.plot([], [], [], color="#00d1ff", linewidth=1.5, alpha=0.45)
    label = ax.text2D(0.04, 0.95, "", transform=ax.transAxes, fontsize=12)

    def update(frame_index: int):
        frame = frames[frame_index]
        x, y, z = frame["vector"]
        trail = [entry["vector"] for entry in frames[: frame_index + 1]]

        state_line.set_data([0, x], [0, y])
        state_line.set_3d_properties([0, z])
        state_tip.set_data([x], [y])
        state_tip.set_3d_properties([z])
        trail_line.set_data([point[0] for point in trail], [point[1] for point in trail])
        trail_line.set_3d_properties([point[2] for point in trail])
        label.set_text(
            f"Puzzle: {puzzle.name}\n"
            f"Gate: {frame['gate']}\n"
            f"Sequence: {' '.join(sequence) if sequence else '(none)'}\n"
            f"Fidelity: {result.fidelity:.6f}\n"
            f"Score: {result.score}"
        )
        return state_line, state_tip, trail_line, label

    print(describe_result(result))

    if args.no_show and args.save is None:
        update(len(frames) - 1)
        plt.close(fig)
        return

    ani = animation.FuncAnimation(
        fig,
        update,
        frames=len(frames),
        interval=args.interval,
        blit=False,
        repeat=True,
    )

    if args.save is not None:
        ani.save(args.save)
        print(f"\nSaved animation to {args.save}")

    if not args.no_show:
        plt.show()


def import_matplotlib(*, headless: bool):
    """Import matplotlib late so --no-show can select a non-GUI backend."""

    try:
        import matplotlib

        if headless:
            matplotlib.use("Agg")

        import matplotlib.animation as animation
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise SystemExit(
            "This animation needs matplotlib. Install it with your Python package "
            "manager, for example: python -m pip install matplotlib"
        ) from error

    return plt, animation


def draw_static_scene(ax, target: Vector3) -> None:
    """Draw the sphere, axes, labels, and target vector."""

    try:
        import numpy as np
    except ImportError as error:
        raise SystemExit(
            "This visualization needs numpy, which is normally installed with "
            "matplotlib. Try: python -m pip install matplotlib"
        ) from error

    ax.set_box_aspect((1, 1, 1))
    ax.set_xlim((-1.15, 1.15))
    ax.set_ylim((-1.15, 1.15))
    ax.set_zlim((-1.15, 1.15))
    ax.set_title("Bloch Sphere Gate Puzzle", pad=18)
    ax.view_init(elev=24, azim=38)
    ax.set_axis_off()

    u_grid, v_grid = np.mgrid[0 : 2 * pi : 80j, 0 : pi : 40j]
    x_surface = np.cos(u_grid) * np.sin(v_grid)
    y_surface = np.sin(u_grid) * np.sin(v_grid)
    z_surface = np.cos(v_grid)
    ax.plot_surface(
        x_surface,
        y_surface,
        z_surface,
        color="#7db7ff",
        alpha=0.13,
        linewidth=0,
        antialiased=True,
        shade=False,
    )

    u_values = [2 * pi * index / 144 for index in range(145)]
    for latitude in (-60, -30, 0, 30, 60):
        z = sin(latitude * pi / 180)
        radius = cos(latitude * pi / 180)
        ax.plot(
            [radius * cos(u) for u in u_values],
            [radius * sin(u) for u in u_values],
            [z for _u in u_values],
            color="#4c78a8",
            alpha=0.24,
            linewidth=0.8,
        )

    for longitude in range(0, 180, 30):
        angle = longitude * pi / 180
        v_values = [pi * index / 144 for index in range(145)]
        ax.plot(
            [cos(angle) * sin(v) for v in v_values],
            [sin(angle) * sin(v) for v in v_values],
            [cos(v) for v in v_values],
            color="#4c78a8",
            alpha=0.24,
            linewidth=0.8,
        )

    ax.plot([-1.1, 1.1], [0, 0], [0, 0], color="#6b7280", alpha=0.5)
    ax.plot([0, 0], [-1.1, 1.1], [0, 0], color="#6b7280", alpha=0.5)
    ax.plot([0, 0], [0, 0], [-1.1, 1.1], color="#6b7280", alpha=0.5)

    for radius in (-1, 1):
        ax.text(radius * 1.18, 0, 0, "+X" if radius > 0 else "-X", color="#374151")
        ax.text(0, radius * 1.18, 0, "+Y" if radius > 0 else "-Y", color="#374151")
        ax.text(0, 0, radius * 1.18, "|0>" if radius > 0 else "|1>", color="#374151")

    tx, ty, tz = target
    ax.plot([0, tx], [0, ty], [0, tz], color="#ff3860", linewidth=2.5, linestyle="--")
    ax.plot([tx], [ty], [tz], marker="*", color="#ff3860", markersize=13)
    ax.text(tx * 1.08, ty * 1.08, tz * 1.08, "target", color="#ff3860")


def expand_keyframes(
    key_vectors: Sequence[Vector3],
    sequence: Sequence[str],
    frames_per_gate: int,
) -> list[dict[str, object]]:
    """Create smooth Bloch-vector frames between each gate result."""

    if len(key_vectors) == 1:
        return [{"vector": key_vectors[0], "gate": "start"}]

    frames: list[dict[str, object]] = []
    for gate_index, gate_name in enumerate(sequence):
        start = key_vectors[gate_index]
        end = key_vectors[gate_index + 1]
        for frame_number in range(frames_per_gate):
            if frames and frame_number == 0:
                continue
            progress = frame_number / (frames_per_gate - 1)
            frames.append(
                {
                    "vector": slerp_unit(start, end, smoothstep(progress)),
                    "gate": gate_name,
                }
            )

    return frames


def slerp_unit(start: Vector3, end: Vector3, amount: float) -> Vector3:
    """Spherical interpolation between two unit-ish vectors."""

    dot = clamp(sum(a * b for a, b in zip(start, end)), -1.0, 1.0)

    if dot > 0.9995:
        return normalize3(
            tuple(
                start_component + amount * (end_component - start_component)
                for start_component, end_component in zip(start, end)
            )
        )

    if dot < -0.9995:
        perpendicular = perpendicular_unit(start)
        return normalize3(
            (
                start[0] * cos(pi * amount) + perpendicular[0] * sin(pi * amount),
                start[1] * cos(pi * amount) + perpendicular[1] * sin(pi * amount),
                start[2] * cos(pi * amount) + perpendicular[2] * sin(pi * amount),
            )
        )

    theta = acos(dot)
    scale_start = sin((1 - amount) * theta) / sin(theta)
    scale_end = sin(amount * theta) / sin(theta)
    return (
        scale_start * start[0] + scale_end * end[0],
        scale_start * start[1] + scale_end * end[1],
        scale_start * start[2] + scale_end * end[2],
    )


def smoothstep(amount: float) -> float:
    return amount * amount * (3 - 2 * amount)


def normalize3(vector: Vector3) -> Vector3:
    norm = sqrt(sum(component * component for component in vector))
    if norm == 0:
        return (0.0, 0.0, 1.0)
    return tuple(component / norm for component in vector)  # type: ignore[return-value]


def perpendicular_unit(vector: Vector3) -> Vector3:
    """Return a deterministic unit vector perpendicular to vector."""

    helper = (1.0, 0.0, 0.0) if abs(vector[0]) < 0.9 else (0.0, 1.0, 0.0)
    return normalize3(cross(vector, helper))


def cross(a: Vector3, b: Vector3) -> Vector3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


if __name__ == "__main__":
    main()
