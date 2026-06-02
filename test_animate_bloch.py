"""Regression tests for animation-path helpers."""

from __future__ import annotations

import unittest

from animate_bloch import expand_keyframes, slerp_unit


class AnimateBlochTests(unittest.TestCase):
    def assertVectorAlmostEqual(
        self,
        actual: tuple[float, float, float],
        expected: tuple[float, float, float],
        places: int = 7,
    ) -> None:
        for actual_component, expected_component in zip(actual, expected):
            self.assertAlmostEqual(actual_component, expected_component, places=places)

    def test_slerp_handles_antipodal_vectors(self) -> None:
        midpoint = slerp_unit((0.0, 0.0, 1.0), (0.0, 0.0, -1.0), 0.5)

        self.assertAlmostEqual(sum(component * component for component in midpoint), 1.0)
        self.assertAlmostEqual(midpoint[2], 0.0, places=7)

    def test_x_gate_path_moves_between_poles(self) -> None:
        frames = expand_keyframes(
            [(0.0, 0.0, 1.0), (0.0, 0.0, -1.0)],
            ["X"],
            frames_per_gate=5,
        )

        self.assertVectorAlmostEqual(frames[0]["vector"], (0.0, 0.0, 1.0))
        self.assertVectorAlmostEqual(frames[-1]["vector"], (0.0, 0.0, -1.0))
        self.assertLess(abs(frames[2]["vector"][2]), 0.1)


if __name__ == "__main__":
    unittest.main()
