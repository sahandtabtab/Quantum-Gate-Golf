"""Command-line playtest for the Bloch-sphere gate puzzle prototype."""

from __future__ import annotations

import argparse

from bloch_sphere import STANDARD_GATES, default_puzzles, describe_result, evaluate_puzzle


def build_parser() -> argparse.ArgumentParser:
    puzzles = default_puzzles()
    parser = argparse.ArgumentParser(
        description="Try a single-qubit gate sequence against a Bloch-sphere target."
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
        help="Starter puzzle to attempt.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available gates and puzzles.",
    )
    parser.add_argument(
        "--hint",
        action="store_true",
        help="Show the hint for the selected puzzle.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    puzzles = default_puzzles()

    if args.list:
        print("Gates:")
        for gate_name in sorted(STANDARD_GATES):
            print(f"  {gate_name:>3}  {STANDARD_GATES[gate_name].description}")

        print("\nPuzzles:")
        for puzzle_name in sorted(puzzles):
            puzzle = puzzles[puzzle_name]
            print(f"  {puzzle.name:<8} par {puzzle.par}")
        return

    puzzle = puzzles[args.puzzle]
    sequence = args.gates or ["H", "S"]

    if args.hint:
        print(f"Hint: {puzzle.hint}\n")

    result = evaluate_puzzle(puzzle, sequence)
    print(describe_result(result))


if __name__ == "__main__":
    main()
