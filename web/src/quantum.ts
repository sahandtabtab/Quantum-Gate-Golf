export type Complex = {
  re: number;
  im: number;
};

export type QubitState = [Complex, Complex];
export type Matrix2 = [[Complex, Complex], [Complex, Complex]];
export type Vec3 = [number, number, number];

export type GateRotation = {
  axis: Vec3;
  angle: number;
};

export type Gate = {
  name: string;
  symbol: string;
  matrix: Matrix2;
  description: string;
  rotation: GateRotation;
};

export type Puzzle = {
  id: string;
  title: string;
  targetState: QubitState;
  gateLimit: number;
  solution: string[];
  allowedGates?: string[];
  gateSetLabel?: string;
};

export type PuzzleResult = {
  finalState: QubitState;
  finalBloch: Vec3;
  targetBloch: Vec3;
  fidelity: number;
  angularErrorDegrees: number;
  score: number;
};

const EPSILON = 1e-12;
const SQRT_HALF = 1 / Math.sqrt(2);

export const INITIAL_STATE: QubitState = [c(1), c(0)];

export const STANDARD_GATES: Record<string, Gate> = {
  I: gate("I", "I", [[c(1), c(0)], [c(0), c(1)]], "Identity", [0, 0, 1], 0),
  X: gate("X", "X", [[c(0), c(1)], [c(1), c(0)]], "Bit flip", [1, 0, 0], Math.PI),
  Y: gate("Y", "Y", [[c(0), c(0, -1)], [c(0, 1), c(0)]], "Bit-and-phase flip", [0, 1, 0], Math.PI),
  Z: gate("Z", "Z", [[c(1), c(0)], [c(0), c(-1)]], "Phase flip", [0, 0, 1], Math.PI),
  H: gate(
    "H",
    "H",
    [
      [c(SQRT_HALF), c(SQRT_HALF)],
      [c(SQRT_HALF), c(-SQRT_HALF)],
    ],
    "Hadamard",
    [SQRT_HALF, 0, SQRT_HALF],
    Math.PI,
  ),
  S: gate("S", "S", [[c(1), c(0)], [c(0), c(0, 1)]], "Quarter phase", [0, 0, 1], Math.PI / 2),
  SDG: gate("SDG", "S\u207b\u00b9", [[c(1), c(0)], [c(0), c(0, -1)]], "Inverse S", [0, 0, 1], -Math.PI / 2),
  T: gate("T", "T", [[c(1), c(0)], [c(0), phase(Math.PI / 4)]], "Eighth phase", [0, 0, 1], Math.PI / 4),
  TDG: gate("TDG", "T\u207b\u00b9", [[c(1), c(0)], [c(0), phase(-Math.PI / 4)]], "Inverse T", [0, 0, 1], -Math.PI / 4),
};

export const PUZZLES: Puzzle[] = [
  {
    id: "plus_x",
    title: "Find |+x\u27e9",
    targetState: stateFromBloch(Math.PI / 2, 0),
    gateLimit: 1,
    solution: ["H"],
    allowedGates: ["H", "X", "Z"],
    gateSetLabel: "Starter gates",
  },
  {
    id: "plus_y",
    title: "Find |+y\u27e9",
    targetState: stateFromBloch(Math.PI / 2, Math.PI / 2),
    gateLimit: 2,
    solution: ["H", "S"],
    allowedGates: ["H", "S", "SDG", "X", "Z"],
    gateSetLabel: "Small Clifford set",
  },
  {
    id: "minus_x",
    title: "Find |-x\u27e9",
    targetState: stateFromBloch(Math.PI / 2, Math.PI),
    gateLimit: 2,
    solution: ["H", "Z"],
    allowedGates: ["H", "X", "Y", "Z", "S"],
    gateSetLabel: "Clifford gates",
  },
  {
    id: "one",
    title: "Reach |1\u27e9",
    targetState: [c(0), c(1)],
    gateLimit: 1,
    solution: ["X"],
    allowedGates: ["X", "Y", "H", "Z"],
    gateSetLabel: "Bit-flip set",
  },
  {
    id: "magic_t",
    title: "Find \u03d5 = 45 deg",
    targetState: stateFromBloch(Math.PI / 2, Math.PI / 4),
    gateLimit: 2,
    solution: ["H", "T"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Z"],
    gateSetLabel: "Clifford + T",
  },
  {
    id: "minus_y_inverse_s",
    title: "Find |-y\u27e9",
    targetState: stateFromBloch(Math.PI / 2, -Math.PI / 2),
    gateLimit: 2,
    solution: ["H", "SDG"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Z"],
    gateSetLabel: "Phase gates",
  },
  {
    id: "minus_magic_t",
    title: "Find \u03d5 = -45 deg",
    targetState: stateFromBloch(Math.PI / 2, -Math.PI / 4),
    gateLimit: 2,
    solution: ["H", "TDG"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Z"],
    gateSetLabel: "Clifford + T",
  },
  {
    id: "make_t_without_t",
    title: "Make 45 deg without T",
    targetState: stateFromBloch(Math.PI / 2, Math.PI / 4),
    gateLimit: 3,
    solution: ["H", "S", "TDG"],
    allowedGates: ["H", "S", "SDG", "TDG", "Z"],
    gateSetLabel: "No T gate",
  },
  {
    id: "make_tdg_without_tdg",
    title: "Make -45 deg without T\u207b\u00b9",
    targetState: stateFromBloch(Math.PI / 2, -Math.PI / 4),
    gateLimit: 3,
    solution: ["H", "SDG", "T"],
    allowedGates: ["H", "S", "SDG", "T", "Z"],
    gateSetLabel: "No T\u207b\u00b9 gate",
  },
  {
    id: "t_tilt_down",
    title: "Tilt with T",
    targetState: targetFromSequence(["H", "T", "H"]),
    gateLimit: 3,
    solution: ["H", "T", "H"],
    allowedGates: ["H", "T", "TDG", "S", "SDG"],
    gateSetLabel: "Hadamard + phases",
  },
  {
    id: "tdg_tilt_up",
    title: "Tilt with T\u207b\u00b9",
    targetState: targetFromSequence(["H", "TDG", "H"]),
    gateLimit: 3,
    solution: ["H", "TDG", "H"],
    allowedGates: ["H", "T", "TDG", "S", "SDG"],
    gateSetLabel: "Hadamard + phases",
  },
  {
    id: "clifford_t_weave",
    title: "Clifford-T weave",
    targetState: targetFromSequence(["H", "T", "H", "S"]),
    gateLimit: 4,
    solution: ["H", "T", "H", "S"],
    allowedGates: ["H", "T", "TDG", "S", "SDG", "Z"],
    gateSetLabel: "Clifford + T weave",
  },
  {
    id: "inverse_weave",
    title: "Inverse weave",
    targetState: targetFromSequence(["H", "TDG", "H", "SDG"]),
    gateLimit: 4,
    solution: ["H", "TDG", "H", "SDG"],
    allowedGates: ["H", "T", "TDG", "S", "SDG", "Z"],
    gateSetLabel: "Inverse phase weave",
  },
  {
    id: "full_toolbox_weave",
    title: "Full toolbox weave",
    targetState: targetFromSequence(["H", "T", "H", "S", "TDG"]),
    gateLimit: 5,
    solution: ["H", "T", "H", "S", "TDG"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Z"],
    gateSetLabel: "Phase toolbox",
  },
  {
    id: "phase_ladder",
    title: "Phase ladder",
    targetState: targetFromSequence(["H", "S", "TDG", "H", "T"]),
    gateLimit: 5,
    solution: ["H", "S", "TDG", "H", "T"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Z"],
    gateSetLabel: "Phase toolbox",
  },
  {
    id: "inverse_ladder",
    title: "Inverse ladder",
    targetState: targetFromSequence(["H", "SDG", "T", "H", "TDG"]),
    gateLimit: 5,
    solution: ["H", "SDG", "T", "H", "TDG"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Y", "Z"],
    gateSetLabel: "Inverse phase toolbox",
  },
  {
    id: "double_weave",
    title: "Double weave",
    targetState: targetFromSequence(["H", "T", "H", "TDG", "S", "H"]),
    gateLimit: 6,
    solution: ["H", "T", "H", "TDG", "S", "H"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Z"],
    gateSetLabel: "Long phase weave",
  },
  {
    id: "toolbox_finale",
    title: "Toolbox finale",
    targetState: targetFromSequence(["H", "T", "H", "S", "TDG", "H", "SDG"]),
    gateLimit: 7,
    solution: ["H", "T", "H", "S", "TDG", "H", "SDG"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Y", "Z"],
    gateSetLabel: "Full single-qubit toolbox",
  },
];

export function sequenceStates(sequence: string[]): QubitState[] {
  let state = normalize(INITIAL_STATE);
  const states = [state];

  for (const gateName of sequence) {
    const selectedGate = STANDARD_GATES[gateName.toUpperCase()];
    if (!selectedGate) {
      throw new Error(`Unknown gate: ${gateName}`);
    }
    state = applyGate(state, selectedGate);
    states.push(state);
  }

  return states;
}

export function applyGate(state: QubitState, selectedGate: Gate): QubitState {
  const [a, b] = state;
  const [[m00, m01], [m10, m11]] = selectedGate.matrix;
  return normalize([
    clean(cAdd(cMul(m00, a), cMul(m01, b))),
    clean(cAdd(cMul(m10, a), cMul(m11, b))),
  ]);
}

export function blochVector(state: QubitState): Vec3 {
  const [a, b] = normalize(state);
  const product = cMul(cConj(a), b);
  return [
    clamp(2 * product.re, -1, 1),
    clamp(2 * product.im, -1, 1),
    clamp(cAbs2(a) - cAbs2(b), -1, 1),
  ];
}

export function stateFromBloch(theta: number, phi: number): QubitState {
  return normalize([c(Math.cos(theta / 2)), cMul(phase(phi), c(Math.sin(theta / 2)))]);
}

function targetFromSequence(sequence: string[]): QubitState {
  const states = sequenceStates(sequence);
  return states[states.length - 1] ?? INITIAL_STATE;
}

export function fidelity(state: QubitState, target: QubitState): number {
  const [a, b] = normalize(state);
  const [ta, tb] = normalize(target);
  const overlap = cAdd(cMul(cConj(ta), a), cMul(cConj(tb), b));
  return clamp(cAbs2(overlap), 0, 1);
}

export function angularErrorDegrees(state: QubitState, target: QubitState): number {
  const stateVector = blochVector(state);
  const targetVector = blochVector(target);
  const dotProduct = clamp(dot(stateVector, targetVector), -1, 1);
  return (Math.acos(dotProduct) * 180) / Math.PI;
}

export function evaluatePuzzle(puzzle: Puzzle, sequence: string[]): PuzzleResult {
  const states = sequenceStates(sequence);
  const finalState = states[states.length - 1];
  const accuracy = fidelity(finalState, puzzle.targetState);
  const gateCount = sequence.length;

  const accuracyPoints = Math.round(1000 * accuracy);
  const solvedBonus = accuracy >= 0.999 ? 200 : 0;
  const remainingGateBonus = accuracy >= 0.999 ? Math.max(0, puzzle.gateLimit - gateCount) * 75 : 0;
  const overLimitPenalty = Math.max(0, gateCount - puzzle.gateLimit) * 250;

  return {
    finalState,
    finalBloch: blochVector(finalState),
    targetBloch: blochVector(puzzle.targetState),
    fidelity: accuracy,
    angularErrorDegrees: angularErrorDegrees(finalState, puzzle.targetState),
    score: Math.max(0, accuracyPoints + solvedBonus + remainingGateBonus - overLimitPenalty),
  };
}

export function gateRotation(gateName: string): GateRotation {
  const selectedGate = STANDARD_GATES[gateName.toUpperCase()];
  if (!selectedGate) {
    throw new Error(`Unknown gate: ${gateName}`);
  }
  return selectedGate.rotation;
}

export function rotateBlochVector(vector: Vec3, rotation: GateRotation, amount = 1): Vec3 {
  const axis = normalize3(rotation.axis);
  const angle = rotation.angle * amount;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const axisDotVector = dot(axis, vector);
  return normalize3([
    vector[0] * cosAngle + cross(axis, vector)[0] * sinAngle + axis[0] * axisDotVector * (1 - cosAngle),
    vector[1] * cosAngle + cross(axis, vector)[1] * sinAngle + axis[1] * axisDotVector * (1 - cosAngle),
    vector[2] * cosAngle + cross(axis, vector)[2] * sinAngle + axis[2] * axisDotVector * (1 - cosAngle),
  ]);
}

export function slerpUnit(start: Vec3, end: Vec3, amount: number): Vec3 {
  const dotProduct = clamp(dot(start, end), -1, 1);

  if (dotProduct > 0.9995) {
    return normalize3([
      start[0] + amount * (end[0] - start[0]),
      start[1] + amount * (end[1] - start[1]),
      start[2] + amount * (end[2] - start[2]),
    ]);
  }

  if (dotProduct < -0.9995) {
    const perpendicular = perpendicularUnit(start);
    return normalize3([
      start[0] * Math.cos(Math.PI * amount) + perpendicular[0] * Math.sin(Math.PI * amount),
      start[1] * Math.cos(Math.PI * amount) + perpendicular[1] * Math.sin(Math.PI * amount),
      start[2] * Math.cos(Math.PI * amount) + perpendicular[2] * Math.sin(Math.PI * amount),
    ]);
  }

  const theta = Math.acos(dotProduct);
  const scaleStart = Math.sin((1 - amount) * theta) / Math.sin(theta);
  const scaleEnd = Math.sin(amount * theta) / Math.sin(theta);
  return [
    scaleStart * start[0] + scaleEnd * end[0],
    scaleStart * start[1] + scaleEnd * end[1],
    scaleStart * start[2] + scaleEnd * end[2],
  ];
}

export function smoothstep(amount: number): number {
  return amount * amount * (3 - 2 * amount);
}

export function formatState(state: QubitState): string {
  const [a, b] = state;
  return `|\u03c8\u27e9 = (${formatComplex(a)})|0\u27e9 + (${formatComplex(b)})|1\u27e9`;
}

export function formatVec3(vector: Vec3): string {
  return `(${formatSigned(vector[0])}, ${formatSigned(vector[1])}, ${formatSigned(vector[2])})`;
}

export function formatAngles(vector: Vec3): string {
  const [x, y, z] = vector;
  const theta = (Math.acos(clamp(z, -1, 1)) * 180) / Math.PI;
  let phi = (Math.atan2(y, x) * 180) / Math.PI;
  if (Math.abs(x) < EPSILON && Math.abs(y) < EPSILON) {
    phi = 0;
  } else if (phi < 0) {
    phi += 360;
  }
  return `(\u03b8, \u03d5) = (${theta.toFixed(2)} deg, ${phi.toFixed(2)} deg)`;
}

function normalize(state: QubitState): QubitState {
  const norm = Math.sqrt(cAbs2(state[0]) + cAbs2(state[1]));
  if (norm < EPSILON) {
    throw new Error("Cannot normalize the zero vector.");
  }
  return [cScale(state[0], 1 / norm), cScale(state[1], 1 / norm)];
}

function c(re: number, im = 0): Complex {
  return { re, im };
}

function gate(name: string, symbol: string, matrix: Matrix2, description: string, axis: Vec3, angle: number): Gate {
  return { name, symbol, matrix, description, rotation: { axis: normalize3(axis), angle } };
}

function phase(angle: number): Complex {
  return c(Math.cos(angle), Math.sin(angle));
}

function cAdd(a: Complex, b: Complex): Complex {
  return c(a.re + b.re, a.im + b.im);
}

function cMul(a: Complex, b: Complex): Complex {
  return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function cScale(value: Complex, scalar: number): Complex {
  return c(value.re * scalar, value.im * scalar);
}

function cConj(value: Complex): Complex {
  return c(value.re, -value.im);
}

function cAbs2(value: Complex): number {
  return value.re * value.re + value.im * value.im;
}

function clean(value: Complex): Complex {
  return c(Math.abs(value.re) < EPSILON ? 0 : value.re, Math.abs(value.im) < EPSILON ? 0 : value.im);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(vector: Vec3): Vec3 {
  const norm = Math.sqrt(dot(vector, vector));
  if (norm < EPSILON) {
    return [0, 0, 1];
  }
  return [vector[0] / norm, vector[1] / norm, vector[2] / norm];
}

function perpendicularUnit(vector: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(vector[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize3(cross(vector, helper));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function formatComplex(value: Complex): string {
  const real = Math.abs(value.re) < EPSILON ? 0 : value.re;
  const imag = Math.abs(value.im) < EPSILON ? 0 : value.im;
  const sign = imag >= 0 ? "+" : "-";
  return `${real.toFixed(2)}${sign}${Math.abs(imag).toFixed(2)}i`;
}

function formatSigned(value: number): string {
  const cleanValue = Math.abs(value) < EPSILON ? 0 : value;
  return `${cleanValue >= 0 ? "+" : ""}${cleanValue.toFixed(3)}`;
}
