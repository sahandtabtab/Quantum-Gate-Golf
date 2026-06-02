export type Complex = {
  re: number;
  im: number;
};

export type QubitState = [Complex, Complex];
export type Matrix2 = [[Complex, Complex], [Complex, Complex]];
export type Vec3 = [number, number, number];

export type Gate = {
  name: string;
  matrix: Matrix2;
  description: string;
};

export type Puzzle = {
  id: string;
  title: string;
  targetState: QubitState;
  par: number;
  hint: string;
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
  I: gate("I", [[c(1), c(0)], [c(0), c(1)]], "Identity"),
  X: gate("X", [[c(0), c(1)], [c(1), c(0)]], "Bit flip"),
  Y: gate("Y", [[c(0), c(0, -1)], [c(0, 1), c(0)]], "Bit-and-phase flip"),
  Z: gate("Z", [[c(1), c(0)], [c(0), c(-1)]], "Phase flip"),
  H: gate(
    "H",
    [
      [c(SQRT_HALF), c(SQRT_HALF)],
      [c(SQRT_HALF), c(-SQRT_HALF)],
    ],
    "Hadamard",
  ),
  S: gate("S", [[c(1), c(0)], [c(0), c(0, 1)]], "Quarter phase"),
  SDG: gate("SDG", [[c(1), c(0)], [c(0), c(0, -1)]], "Inverse S"),
  T: gate("T", [[c(1), c(0)], [c(0), phase(Math.PI / 4)]], "Eighth phase"),
  TDG: gate("TDG", [[c(1), c(0)], [c(0), phase(-Math.PI / 4)]], "Inverse T"),
};

export const PUZZLES: Puzzle[] = [
  {
    id: "plus_x",
    title: "Find |+x\u27e9",
    targetState: stateFromBloch(Math.PI / 2, 0),
    par: 1,
    hint: "The Hadamard gate sends |0\u27e9 to the +x equator.",
  },
  {
    id: "plus_y",
    title: "Find |+y\u27e9",
    targetState: stateFromBloch(Math.PI / 2, Math.PI / 2),
    par: 2,
    hint: "Try making |+x\u27e9 first, then add a quarter phase turn.",
  },
  {
    id: "minus_x",
    title: "Find |-x\u27e9",
    targetState: stateFromBloch(Math.PI / 2, Math.PI),
    par: 2,
    hint: "One route is to make |+x\u27e9, then flip its phase.",
  },
  {
    id: "one",
    title: "Reach |1\u27e9",
    targetState: [c(0), c(1)],
    par: 1,
    hint: "This is the south pole of the Bloch sphere.",
  },
  {
    id: "magic_t",
    title: "Find \u03d5 = 45 deg",
    targetState: stateFromBloch(Math.PI / 2, Math.PI / 4),
    par: 2,
    hint: "The target is halfway between +x and +y on the equator.",
  },
];

export function sequenceStates(sequence: string[]): QubitState[] {
  let state = normalize(INITIAL_STATE);
  const states = [state];

  for (const gateName of sequence) {
    const gate = STANDARD_GATES[gateName.toUpperCase()];
    if (!gate) {
      throw new Error(`Unknown gate: ${gateName}`);
    }
    state = applyGate(state, gate);
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
  const parBonus = Math.max(0, puzzle.par - gateCount) * 100;
  const overParPenalty = Math.max(0, gateCount - puzzle.par) * 50;
  const solvedBonus = accuracy >= 0.999 ? 200 : 0;

  return {
    finalState,
    finalBloch: blochVector(finalState),
    targetBloch: blochVector(puzzle.targetState),
    fidelity: accuracy,
    angularErrorDegrees: angularErrorDegrees(finalState, puzzle.targetState),
    score: Math.max(0, accuracyPoints + parBonus + solvedBonus - overParPenalty),
  };
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

function gate(name: string, matrix: Matrix2, description: string): Gate {
  return { name, matrix, description };
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
