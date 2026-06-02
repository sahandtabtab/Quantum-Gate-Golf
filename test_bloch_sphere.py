"""Basic regression tests for the single-qubit prototype."""

from __future__ import annotations

import math
import unittest

from bloch_sphere import (
    apply_sequence,
    bloch_vector,
    default_puzzles,
    evaluate_puzzle,
    fidelity,
    sequence_states,
    state_from_bloch,
)


class BlochSphereTests(unittest.TestCase):
    def assertVectorAlmostEqual(
        self,
        actual: tuple[float, float, float],
        expected: tuple[float, float, float],
        places: int = 7,
    ) -> None:
        for actual_component, expected_component in zip(actual, expected):
            self.assertAlmostEqual(actual_component, expected_component, places=places)

    def test_h_gate_moves_zero_to_plus_x(self) -> None:
        state = apply_sequence(["H"])
        self.assertVectorAlmostEqual(bloch_vector(state), (1.0, 0.0, 0.0))

    def test_x_gate_moves_zero_to_one(self) -> None:
        state = apply_sequence(["X"])
        self.assertVectorAlmostEqual(bloch_vector(state), (0.0, 0.0, -1.0))

    def test_s_after_h_moves_plus_x_to_plus_y(self) -> None:
        state = apply_sequence(["H", "S"])
        self.assertVectorAlmostEqual(bloch_vector(state), (0.0, 1.0, 0.0))

    def test_sequence_states_includes_initial_and_each_gate(self) -> None:
        states = sequence_states(["H", "S"])
        self.assertEqual(len(states), 3)
        self.assertVectorAlmostEqual(bloch_vector(states[0]), (0.0, 0.0, 1.0))
        self.assertVectorAlmostEqual(bloch_vector(states[1]), (1.0, 0.0, 0.0))
        self.assertVectorAlmostEqual(bloch_vector(states[2]), (0.0, 1.0, 0.0))

    def test_fidelity_ignores_global_phase(self) -> None:
        state = state_from_bloch(theta=math.pi / 2, phi=math.pi / 4)
        phased_state = (1j * state[0], 1j * state[1])
        self.assertAlmostEqual(fidelity(state, phased_state), 1.0)

    def test_default_magic_t_solution_scores_as_solved(self) -> None:
        puzzle = default_puzzles()["magic_t"]
        result = evaluate_puzzle(puzzle, ["H", "T"])
        self.assertAlmostEqual(result.fidelity, 1.0)
        self.assertGreaterEqual(result.score, 1200)


if __name__ == "__main__":
    unittest.main()
