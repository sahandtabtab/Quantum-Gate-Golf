"""Single-qubit math for a Bloch-sphere gate puzzle prototype.

The game loop this supports is intentionally small:

1. Start at |0>.
2. Apply a sequence of named quantum gates.
3. Compare the final state to a target state.
4. Score accuracy plus gate efficiency.

Everything here uses only the Python standard library so the prototype is easy
to run before we commit to a UI stack.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import acos, cos, degrees, pi, sin, sqrt
from typing import Iterable, Mapping, Sequence


ComplexVector = tuple[complex, complex]
Matrix2x2 = tuple[tuple[complex, complex], tuple[complex, complex]]

EPSILON = 1e-12
SQRT_HALF = 1 / sqrt(2)


@dataclass(frozen=True)
class Gate:
    """A single-qubit unitary gate."""

    name: str
    matrix: Matrix2x2
    description: str = ""


@dataclass(frozen=True)
class GatePuzzle:
    """One target-state challenge for the prototype."""

    name: str
    target_state: ComplexVector
    par: int
    hint: str = ""


@dataclass(frozen=True)
class PuzzleResult:
    """Outcome after applying a gate sequence to a puzzle."""

    puzzle: GatePuzzle
    sequence: tuple[str, ...]
    final_state: ComplexVector
    final_bloch: tuple[float, float, float]
    target_bloch: tuple[float, float, float]
    fidelity: float
    angular_error_degrees: float
    score: int


def normalize(state: ComplexVector) -> ComplexVector:
    """Return a normalized copy of a two-amplitude state vector."""

    a, b = state
    norm = sqrt(abs(a) ** 2 + abs(b) ** 2)
    if norm < EPSILON:
        raise ValueError("Cannot normalize the zero vector.")
    return (a / norm, b / norm)


def mat_vec_mul(matrix: Matrix2x2, vector: ComplexVector) -> ComplexVector:
    """Apply a 2x2 matrix to a 2-amplitude state vector."""

    return (
        matrix[0][0] * vector[0] + matrix[0][1] * vector[1],
        matrix[1][0] * vector[0] + matrix[1][1] * vector[1],
    )


def apply_gate(state: ComplexVector, gate: Gate) -> ComplexVector:
    """Apply one gate and clean up tiny floating-point drift."""

    next_state = normalize(mat_vec_mul(gate.matrix, state))
    return tuple(0j if abs(amplitude) < EPSILON else amplitude for amplitude in next_state)  # type: ignore[return-value]


def apply_sequence(
    sequence: Iterable[str],
    *,
    initial_state: ComplexVector = (1 + 0j, 0 + 0j),
    gates: Mapping[str, Gate] | None = None,
) -> ComplexVector:
    """Apply named gates from left to right, starting from |0> by default."""

    gate_map = STANDARD_GATES if gates is None else gates
    state = normalize(initial_state)

    for gate_name in sequence:
        try:
            gate = gate_map[gate_name.upper()]
        except KeyError as error:
            allowed = ", ".join(sorted(gate_map))
            raise ValueError(f"Unknown gate {gate_name!r}. Allowed gates: {allowed}.") from error
        state = apply_gate(state, gate)

    return state


def sequence_states(
    sequence: Iterable[str],
    *,
    initial_state: ComplexVector = (1 + 0j, 0 + 0j),
    gates: Mapping[str, Gate] | None = None,
) -> tuple[ComplexVector, ...]:
    """Return the state before any gates and after each gate in the sequence."""

    gate_map = STANDARD_GATES if gates is None else gates
    state = normalize(initial_state)
    states = [state]

    for gate_name in sequence:
        try:
            gate = gate_map[gate_name.upper()]
        except KeyError as error:
            allowed = ", ".join(sorted(gate_map))
            raise ValueError(f"Unknown gate {gate_name!r}. Allowed gates: {allowed}.") from error
        state = apply_gate(state, gate)
        states.append(state)

    return tuple(states)


def bloch_vector(state: ComplexVector) -> tuple[float, float, float]:
    """Convert a pure qubit state into Bloch-sphere coordinates."""

    a, b = normalize(state)
    x = 2 * (a.conjugate() * b).real
    y = 2 * (a.conjugate() * b).imag
    z = abs(a) ** 2 - abs(b) ** 2
    return (_clamp_unit(x), _clamp_unit(y), _clamp_unit(z))


def state_from_bloch(theta: float, phi: float) -> ComplexVector:
    """Create cos(theta/2)|0> + exp(i phi) sin(theta/2)|1>."""

    return normalize(
        (
            cos(theta / 2),
            complex(cos(phi), sin(phi)) * sin(theta / 2),
        )
    )


def fidelity(state: ComplexVector, target_state: ComplexVector) -> float:
    """Return pure-state fidelity, insensitive to global phase."""

    a, b = normalize(state)
    target_a, target_b = normalize(target_state)
    overlap = target_a.conjugate() * a + target_b.conjugate() * b
    return _clamp_probability(abs(overlap) ** 2)


def angular_error_degrees(state: ComplexVector, target_state: ComplexVector) -> float:
    """Return the angle between two Bloch vectors in degrees."""

    sx, sy, sz = bloch_vector(state)
    tx, ty, tz = bloch_vector(target_state)
    dot = _clamp_unit(sx * tx + sy * ty + sz * tz)
    return degrees(acos(dot))


def evaluate_puzzle(
    puzzle: GatePuzzle,
    sequence: Sequence[str],
    *,
    gates: Mapping[str, Gate] | None = None,
) -> PuzzleResult:
    """Apply a sequence to a puzzle and compute game-friendly metrics."""

    final_state = apply_sequence(sequence, gates=gates)
    accuracy = fidelity(final_state, puzzle.target_state)
    gate_count = len(sequence)

    accuracy_points = round(1000 * accuracy)
    par_bonus = max(0, puzzle.par - gate_count) * 100
    over_par_penalty = max(0, gate_count - puzzle.par) * 50
    solved_bonus = 200 if accuracy >= 0.999 else 0
    score = max(0, accuracy_points + par_bonus + solved_bonus - over_par_penalty)

    return PuzzleResult(
        puzzle=puzzle,
        sequence=tuple(gate.upper() for gate in sequence),
        final_state=final_state,
        final_bloch=bloch_vector(final_state),
        target_bloch=bloch_vector(puzzle.target_state),
        fidelity=accuracy,
        angular_error_degrees=angular_error_degrees(final_state, puzzle.target_state),
        score=score,
    )


def rx(angle: float) -> Gate:
    """Rotation about the Bloch sphere x-axis."""

    half = angle / 2
    return Gate(
        name=f"RX({angle:.3f})",
        matrix=((cos(half), -1j * sin(half)), (-1j * sin(half), cos(half))),
        description="Rotation around the x-axis.",
    )


def ry(angle: float) -> Gate:
    """Rotation about the Bloch sphere y-axis."""

    half = angle / 2
    return Gate(
        name=f"RY({angle:.3f})",
        matrix=((cos(half), -sin(half)), (sin(half), cos(half))),
        description="Rotation around the y-axis.",
    )


def rz(angle: float) -> Gate:
    """Rotation about the Bloch sphere z-axis."""

    half = angle / 2
    return Gate(
        name=f"RZ({angle:.3f})",
        matrix=(
            (complex(cos(-half), sin(-half)), 0),
            (0, complex(cos(half), sin(half))),
        ),
        description="Rotation around the z-axis.",
    )


def _phase(angle: float) -> complex:
    return complex(cos(angle), sin(angle))


def _clamp_unit(value: float) -> float:
    return max(-1.0, min(1.0, value))


def _clamp_probability(value: float) -> float:
    return max(0.0, min(1.0, value))


STANDARD_GATES: dict[str, Gate] = {
    "I": Gate(
        "I",
        ((1, 0), (0, 1)),
        "Identity; leaves the state unchanged.",
    ),
    "X": Gate(
        "X",
        ((0, 1), (1, 0)),
        "Bit flip; a pi rotation around the x-axis.",
    ),
    "Y": Gate(
        "Y",
        ((0, -1j), (1j, 0)),
        "Bit-and-phase flip; a pi rotation around the y-axis.",
    ),
    "Z": Gate(
        "Z",
        ((1, 0), (0, -1)),
        "Phase flip; a pi rotation around the z-axis.",
    ),
    "H": Gate(
        "H",
        ((SQRT_HALF, SQRT_HALF), (SQRT_HALF, -SQRT_HALF)),
        "Hadamard; moves |0> to the +x equator state.",
    ),
    "S": Gate(
        "S",
        ((1, 0), (0, 1j)),
        "Quarter-turn phase gate.",
    ),
    "SDG": Gate(
        "SDG",
        ((1, 0), (0, -1j)),
        "Inverse S gate.",
    ),
    "T": Gate(
        "T",
        ((1, 0), (0, _phase(pi / 4))),
        "Eighth-turn phase gate.",
    ),
    "TDG": Gate(
        "TDG",
        ((1, 0), (0, _phase(-pi / 4))),
        "Inverse T gate.",
    ),
}


def default_puzzles() -> dict[str, GatePuzzle]:
    """Return a small starter puzzle set for gate-golf playtesting."""

    return {
        "plus_x": GatePuzzle(
            name="plus_x",
            target_state=state_from_bloch(theta=pi / 2, phi=0),
            par=1,
            hint="The Hadamard gate sends |0> to the +x equator.",
        ),
        "plus_y": GatePuzzle(
            name="plus_y",
            target_state=state_from_bloch(theta=pi / 2, phi=pi / 2),
            par=2,
            hint="Try making +x first, then adding a quarter phase turn.",
        ),
        "minus_x": GatePuzzle(
            name="minus_x",
            target_state=state_from_bloch(theta=pi / 2, phi=pi),
            par=2,
            hint="One route is to make +x, then flip its phase.",
        ),
        "one": GatePuzzle(
            name="one",
            target_state=(0 + 0j, 1 + 0j),
            par=1,
            hint="This is the south pole of the Bloch sphere.",
        ),
        "magic_t": GatePuzzle(
            name="magic_t",
            target_state=state_from_bloch(theta=pi / 2, phi=pi / 4),
            par=2,
            hint="The target is halfway between +x and +y on the equator.",
        ),
    }


def format_complex(value: complex) -> str:
    """Compact complex-number formatting for command-line output."""

    real = 0.0 if abs(value.real) < EPSILON else value.real
    imag = 0.0 if abs(value.imag) < EPSILON else value.imag
    sign = "+" if imag >= 0 else "-"
    return f"{real:.4f}{sign}{abs(imag):.4f}i"


def describe_result(result: PuzzleResult) -> str:
    """Return a readable multiline summary of a puzzle attempt."""

    a, b = result.final_state
    fx, fy, fz = result.final_bloch
    tx, ty, tz = result.target_bloch
    sequence = " ".join(result.sequence) if result.sequence else "(none)"

    return "\n".join(
        [
            f"Puzzle: {result.puzzle.name}",
            f"Sequence: {sequence}",
            f"Final state: {format_complex(a)} |0> + {format_complex(b)} |1>",
            f"Final Bloch vector:  ({fx:+.4f}, {fy:+.4f}, {fz:+.4f})",
            f"Target Bloch vector: ({tx:+.4f}, {ty:+.4f}, {tz:+.4f})",
            f"Fidelity: {result.fidelity:.6f}",
            f"Angular error: {result.angular_error_degrees:.3f} degrees",
            f"Score: {result.score}",
        ]
    )
