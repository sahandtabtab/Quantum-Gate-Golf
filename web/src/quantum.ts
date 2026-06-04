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

export type PuzzleCase = {
  label: string;
  startLabel: string;
  targetLabel: string;
  startState: QubitState;
  targetState: QubitState;
};

export type Puzzle = {
  id: string;
  title: string;
  targetState: QubitState;
  gateLimit: number;
  solution: string[];
  allowedGates?: string[];
  gateSetLabel?: string;
  kind?: "target" | "gate-design" | "sandbox";
  mission?: string;
  cases?: PuzzleCase[];
};

export type PuzzleCaseResult = PuzzleCase & {
  finalState: QubitState;
  finalBloch: Vec3;
  targetBloch: Vec3;
  fidelity: number;
  angularErrorDegrees: number;
};

export type PuzzleResult = {
  finalState: QubitState;
  finalBloch: Vec3;
  targetBloch: Vec3;
  fidelity: number;
  angularErrorDegrees: number;
  score: number;
  cases: PuzzleCaseResult[];
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

const STATE_ZERO = INITIAL_STATE;
const STATE_PLUS_X = stateFromBloch(Math.PI / 2, 0);
const STATE_PLUS_Y = stateFromBloch(Math.PI / 2, Math.PI / 2);
const DESIGN_PROBES: Array<[label: string, startLabel: string, startState: QubitState]> = [
  ["+X probe", "|+x⟩", STATE_PLUS_X],
  ["+Y probe", "|+y⟩", STATE_PLUS_Y],
  ["North pole", "|0⟩", STATE_ZERO],
];

export const SANDBOX_PUZZLE: Puzzle = {
  id: "sandbox",
  title: "Sandbox",
  targetState: INITIAL_STATE,
  gateLimit: 32,
  solution: [],
  allowedGates: ["X", "Y", "Z", "H", "S", "T", "SDG", "TDG"],
  gateSetLabel: "All standard gates",
  kind: "sandbox",
  mission: "Experiment freely with gate sequences and watch the Bloch vector move.",
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
    title: "Clifford + T circuit",
    targetState: targetFromSequence(["H", "T", "H", "S"]),
    gateLimit: 4,
    solution: ["H", "T", "H", "S"],
    allowedGates: ["H", "T", "TDG", "S", "SDG", "Z"],
    gateSetLabel: "Clifford + T phases",
  },
  {
    id: "inverse_weave",
    title: "Inverse phase circuit",
    targetState: targetFromSequence(["H", "TDG", "H", "SDG"]),
    gateLimit: 4,
    solution: ["H", "TDG", "H", "SDG"],
    allowedGates: ["H", "T", "TDG", "S", "SDG", "Z"],
    gateSetLabel: "Inverse phase gates",
  },
  {
    id: "full_toolbox_weave",
    title: "Phase toolbox circuit",
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
    title: "Six-gate phase circuit",
    targetState: targetFromSequence(["H", "T", "H", "TDG", "S", "H"]),
    gateLimit: 6,
    solution: ["H", "T", "H", "TDG", "S", "H"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Z"],
    gateSetLabel: "Long phase circuit",
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
  {
    id: "design_x_no_x",
    title: "Design X gate",
    targetState: targetFromStateSequence(STATE_ZERO, ["X"]),
    gateLimit: 3,
    solution: ["H", "Z", "H"],
    allowedGates: ["H", "Z", "S", "SDG", "T", "TDG"],
    gateSetLabel: "Gate design: no X gate",
    kind: "gate-design",
    mission: "Build one circuit that behaves like an X gate on every probe state.",
    cases: operationCases(["X"], DESIGN_PROBES),
  },
  {
    id: "design_z_no_z",
    title: "Design Z gate",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["Z"]),
    gateLimit: 3,
    solution: ["H", "X", "H"],
    allowedGates: ["H", "X", "S", "SDG", "T", "TDG"],
    gateSetLabel: "Gate design: no Z gate",
    kind: "gate-design",
    mission: "Build one circuit that behaves like a Z gate on every probe state.",
    cases: operationCases(["Z"], DESIGN_PROBES),
  },
  {
    id: "design_sdg_from_tdg",
    title: "Design S⁻¹",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["SDG"]),
    gateLimit: 2,
    solution: ["TDG", "TDG"],
    allowedGates: ["H", "T", "TDG", "Z"],
    gateSetLabel: "Gate design: inverse phase",
    kind: "gate-design",
    mission: "Synthesize S⁻¹ from smaller phase rotations and pass every probe.",
    cases: operationCases(["SDG"], DESIGN_PROBES),
  },
  {
    id: "design_tdg_without_tdg",
    title: "Design T⁻¹",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["TDG"]),
    gateLimit: 2,
    solution: ["SDG", "T"],
    allowedGates: ["H", "S", "SDG", "T", "Z"],
    gateSetLabel: "Gate design: no T⁻¹ gate",
    kind: "gate-design",
    mission: "Build a T⁻¹ operation without using the T⁻¹ button.",
    cases: operationCases(["TDG"], DESIGN_PROBES),
  },
  {
    id: "design_s_from_t",
    title: "Design S gate",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["S"]),
    gateLimit: 2,
    solution: ["T", "T"],
    allowedGates: ["H", "T", "TDG", "X", "Z"],
    gateSetLabel: "Gate design: no S gate",
    kind: "gate-design",
    mission: "Build the S phase gate using smaller T rotations, then pass every probe.",
    cases: operationCases(["S"], DESIGN_PROBES),
  },
  {
    id: "design_t_from_inverse",
    title: "Design T gate",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["T"]),
    gateLimit: 2,
    solution: ["S", "TDG"],
    allowedGates: ["H", "S", "SDG", "TDG", "X", "Z"],
    gateSetLabel: "Gate design: no T gate",
    kind: "gate-design",
    mission: "Recover the T operation from a quarter phase and an inverse eighth phase.",
    cases: operationCases(["T"], DESIGN_PROBES),
  },
  {
    id: "design_sqrt_x",
    title: "Design √X gate",
    targetState: targetFromStateSequence(STATE_ZERO, ["H", "S", "H"]),
    gateLimit: 3,
    solution: ["H", "S", "H"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Z"],
    gateSetLabel: "Gate design: phase sandwich",
    kind: "gate-design",
    mission: "Turn a Z-axis phase rotation into a half X-axis flip by conjugating with H.",
    cases: operationCases(["H", "S", "H"], DESIGN_PROBES),
  },
  {
    id: "design_inverse_sqrt_x",
    title: "Design √X⁻¹",
    targetState: targetFromStateSequence(STATE_ZERO, ["H", "SDG", "H"]),
    gateLimit: 3,
    solution: ["H", "SDG", "H"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "Z"],
    gateSetLabel: "Gate design: inverse sandwich",
    kind: "gate-design",
    mission: "Build the inverse half-turn around X using an inverse phase sandwich.",
    cases: operationCases(["H", "SDG", "H"], DESIGN_PROBES),
  },
  {
    id: "design_clifford_t_mix",
    title: "Design Clifford+T mix",
    targetState: targetFromStateSequence(STATE_PLUS_X, ["H", "T", "S", "H"]),
    gateLimit: 4,
    solution: ["H", "T", "S", "H"],
    allowedGates: ["H", "S", "SDG", "T", "TDG", "X", "Z"],
    gateSetLabel: "Gate design: mixed axes",
    kind: "gate-design",
    mission: "Compose H, T, and S so every probe experiences the same mixed-axis operation.",
    cases: operationCases(["H", "T", "S", "H"], DESIGN_PROBES),
  },  {
    id: "design_y_no_y",
    title: "Design Y gate",
    targetState: targetFromStateSequence(STATE_ZERO, ["Y"]),
    gateLimit: 3,
    solution: ["S", "X", "SDG"],
    allowedGates: ["H", "X", "S", "SDG", "T", "TDG"],
    gateSetLabel: "Gate design: no Y gate",
    kind: "gate-design",
    mission: "Assemble a Y gate from phase shifts and a bit flip, then pass every probe.",
    cases: operationCases(["Y"], DESIGN_PROBES),
  },
];

export function sequenceStates(sequence: string[], initialState: QubitState = INITIAL_STATE): QubitState[] {
  let state = normalize(initialState);
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

export function puzzleCases(puzzle: Puzzle): PuzzleCase[] {
  if (puzzle.cases?.length) {
    return puzzle.cases;
  }

  return [
    {
      label: "Target",
      startLabel: "|0⟩",
      targetLabel: puzzle.title,
      startState: INITIAL_STATE,
      targetState: puzzle.targetState,
    },
  ];
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

function targetFromStateSequence(initialState: QubitState, sequence: string[]): QubitState {
  const states = sequenceStates(sequence, initialState);
  return states[states.length - 1] ?? initialState;
}

function operationCases(
  operation: string[],
  probes: Array<[label: string, startLabel: string, startState: QubitState]>,
): PuzzleCase[] {
  const operationLabel = operation.map((gateName) => STANDARD_GATES[gateName]?.symbol ?? gateName).join(" ");
  return probes.map(([label, startLabel, startState]) => ({
    label,
    startLabel,
    targetLabel: `${operationLabel} ${startLabel}`,
    startState,
    targetState: targetFromStateSequence(startState, operation),
  }));
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
  const caseResults = puzzleCases(puzzle).map((puzzleCase) => evaluatePuzzleCase(puzzleCase, sequence));
  const primaryCase = caseResults[0];
  const accuracy = Math.min(...caseResults.map((item) => item.fidelity));
  const gateCount = sequence.length;

  const accuracyPoints = Math.round(1000 * accuracy);
  const solvedBonus = accuracy >= 0.999 ? 200 : 0;
  const remainingGateBonus = accuracy >= 0.999 ? Math.max(0, puzzle.gateLimit - gateCount) * 75 : 0;
  const overLimitPenalty = Math.max(0, gateCount - puzzle.gateLimit) * 250;

  return {
    finalState: primaryCase.finalState,
    finalBloch: primaryCase.finalBloch,
    targetBloch: primaryCase.targetBloch,
    fidelity: accuracy,
    angularErrorDegrees: Math.max(...caseResults.map((item) => item.angularErrorDegrees)),
    score: Math.max(0, accuracyPoints + solvedBonus + remainingGateBonus - overLimitPenalty),
    cases: caseResults,
  };
}

function evaluatePuzzleCase(puzzleCase: PuzzleCase, sequence: string[]): PuzzleCaseResult {
  const states = sequenceStates(sequence, puzzleCase.startState);
  const finalState = states[states.length - 1];
  return {
    ...puzzleCase,
    finalState,
    finalBloch: blochVector(finalState),
    targetBloch: blochVector(puzzleCase.targetState),
    fidelity: fidelity(finalState, puzzleCase.targetState),
    angularErrorDegrees: angularErrorDegrees(finalState, puzzleCase.targetState),
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
