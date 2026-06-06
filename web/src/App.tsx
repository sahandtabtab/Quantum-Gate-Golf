import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import BlochScene from "./BlochScene";
import {
  PUZZLES,
  SANDBOX_PUZZLE,
  STANDARD_GATES,
  blochVector,
  evaluatePuzzle,
  fidelityExpansionForSequence,
  formatAngles,
  formatState,
  isPuzzleSolved,
  puzzleCases,
  stateFromBloch,
  sequenceStates,
  unitarySpecForPuzzle,
} from "./quantum";
import type { Puzzle, PuzzleCase, PuzzleResult } from "./quantum";

const GATE_ORDER = ["X", "Y", "Z", "H", "S", "T", "SDG", "TDG"];
const ROBUST_GATE_ORDER = ["X45", "Y45", "X90", "Y90", "XM90", "YM90", "X180", "Y180", "XM180", "YM180", "XM360"];
const DEFAULT_ROBUST_EPSILON = "0.05";
const PROGRESS_STORAGE_KEY = "quantum-gate-golf-progress-v1";
const RANK_XP = 250;
const HINT_COST = 220;
const AUDIO_VOLUME_MULTIPLIER = 2;
const SUBSCRIPT_PATTERN = /_\{([^}]+)\}|_([^_\s{}()[\],;]+)/g;

function mathTextParts(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  text.replace(SUBSCRIPT_PATTERN, (match, bracedSubscript: string | undefined, simpleSubscript: string | undefined, offset: number) => {
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset));
    }
    parts.push(<sub key={`sub-${offset}`}>{bracedSubscript ?? simpleSubscript}</sub>);
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function plainMathText(text: string): string {
  return text.replace(SUBSCRIPT_PATTERN, (_match, bracedSubscript: string | undefined, simpleSubscript: string | undefined) => bracedSubscript ?? simpleSubscript ?? "");
}

function renderMathLabel(text: string, className = "") {
  return <span className={["mathLabel", className].filter(Boolean).join(" ")}>{mathTextParts(text)}</span>;
}

function gateSymbolText(gateName: string): string {
  return STANDARD_GATES[gateName]?.symbol ?? gateName;
}

function isPulseGate(gateName: string): boolean {
  return Boolean(STANDARD_GATES[gateName]?.description.toLowerCase().includes("pulse"));
}

function renderGateSymbol(gateName: string): ReactNode[] {
  return mathTextParts(gateSymbolText(gateName));
}

const DEFAULT_SANDBOX_THETA = "0";
const DEFAULT_SANDBOX_PHI = "0";
type SandboxProbeMode = "single" | "trio";
const CELEBRATION_BITS = Array.from({ length: 18 }, (_, index) => ({
  delay: `${(index % 6) * 70}ms`,
  rotation: `${index * 37}deg`,
  x: `${Math.cos((index / 18) * Math.PI * 2) * (70 + (index % 3) * 26)}px`,
  y: `${Math.sin((index / 18) * Math.PI * 2) * (50 + (index % 4) * 18)}px`,
}));
const CERTIFICATE_CONFETTI = Array.from({ length: 96 }, (_, index) => ({
  color: ["#11d5ff", "#ff4f72", "#ffd391", "#79f0bf"][index % 4],
  delay: `${(index % 24) * 90}ms`,
  drift: `${((index % 11) - 5) * 18}px`,
  duration: `${2600 + (index % 7) * 240}ms`,
  left: `${(index * 37) % 100}%`,
  rotation: `${index * 31}deg`,
}));

type GameView = "levels" | "play" | "sandbox" | "complete";

type LevelRecord = {
  solved: boolean;
  bestScore: number;
  bestGates: number;
  xpAwarded: number;
  xpSpent: number;
};

type ProgressState = Record<string, LevelRecord>;

type ActiveRun = {
  token: number;
  puzzle: Puzzle;
  sequence: string[];
  result: PuzzleResult;
  completesWholeGame: boolean;
};

type PuzzleMode = "state-transfer" | "unitary-design" | "robust-gate-design";

function puzzleModeFor(puzzle: Puzzle): PuzzleMode {
  if (puzzle.robust) {
    return "robust-gate-design";
  }

  return puzzle.kind === "gate-design" ? "unitary-design" : "state-transfer";
}

function puzzlesForMode(mode: PuzzleMode): Puzzle[] {
  return PUZZLES.filter((item) => puzzleModeFor(item) === mode);
}

function completedCountForMode(mode: PuzzleMode, progress: ProgressState): number {
  return puzzlesForMode(mode).filter((item) => progress[item.id]?.solved).length;
}

function unlockedIndexForMode(mode: PuzzleMode, progress: ProgressState): number {
  const modePuzzles = puzzlesForMode(mode);
  const firstUnsolved = modePuzzles.findIndex((item) => !progress[item.id]?.solved);
  return firstUnsolved === -1 ? modePuzzles.length - 1 : firstUnsolved;
}

function nextPuzzleForMode(mode: PuzzleMode, progress: ProgressState): Puzzle {
  const modePuzzles = puzzlesForMode(mode);
  return modePuzzles.find((item) => !progress[item.id]?.solved) ?? modePuzzles[0];
}

function modeTitle(mode: PuzzleMode): string {
  if (mode === "state-transfer") {
    return "State-to-state transfer";
  }

  if (mode === "unitary-design") {
    return "Unitary design";
  }

  return "Robust gate design";
}

function modeCopy(mode: PuzzleMode): string {
  if (mode === "state-transfer") {
    return "Move |0\u27e9 to a specific target state using the given gates.";
  }

  if (mode === "unitary-design") {
    return "Engineer a target unitary using the given gates.";
  }

  return "Build circuits that stay accurate when every available pulse overrotates.";
}

function modeEyebrow(mode: PuzzleMode): string {
  if (mode === "state-transfer") {
    return "State mode";
  }

  if (mode === "unitary-design") {
    return "Design mode";
  }

  return "Robust mode";
}

function modeTagForPuzzle(puzzle: Puzzle): string | null {
  if (puzzle.robust) {
    return puzzle.kind === "gate-design" ? "Robust unitary" : "Robust transfer";
  }

  return puzzle.kind === "gate-design" ? "Gate design" : null;
}

function formatEpsilon(value: number): string {
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(3);
}

function formatFidelityExpansion(expansion: { constant: number; linear: number; quadratic: number }): ReactNode {
  const threshold = 0.0005;
  const terms = [`${expansion.constant.toFixed(4)}`];
  let remainderOrder = 3;
  const addTerm = (coefficient: number, label: string) => {
    const sign = coefficient >= 0 ? "+" : "-";
    terms.push(`${sign} ${Math.abs(coefficient).toFixed(3)}${label}`);
  };

  if (Math.abs(expansion.linear) >= threshold) {
    addTerm(expansion.linear, "\u03b5");
    remainderOrder = 2;
  } else if (Math.abs(expansion.quadratic) >= threshold) {
    addTerm(expansion.quadratic, "\u03b5\u00b2");
  }

  return <>{`F(${"\u03b5"}) = ${terms.join(" ")} + O(${"\u03b5"}`}<sup>{remainderOrder}</sup>{")"}</>;
}

function successThresholdForPuzzle(puzzle: Puzzle): number {
  return puzzle.successThreshold ?? 0.999;
}

function isPuzzleUnlocked(puzzleId: string, progress: ProgressState): boolean {
  const selectedPuzzle = PUZZLES.find((item) => item.id === puzzleId);
  if (!selectedPuzzle) {
    return false;
  }

  const mode = puzzleModeFor(selectedPuzzle);
  const modePuzzles = puzzlesForMode(mode);
  const modeIndex = modePuzzles.findIndex((item) => item.id === puzzleId);
  return modeIndex >= 0 && modeIndex <= unlockedIndexForMode(mode, progress);
}

function allLevelsSolvedAfterRun(progress: ProgressState, solvedPuzzleId: string): boolean {
  return PUZZLES.every((item) => item.id === solvedPuzzleId || progress[item.id]?.solved);
}

function runCompletesWholeGame(progress: ProgressState, solvedPuzzleId: string): boolean {
  return !progress[solvedPuzzleId]?.solved && allLevelsSolvedAfterRun(progress, solvedPuzzleId);
}

export default function App() {
  const [view, setView] = useState<GameView>("levels");
  const [puzzleId, setPuzzleId] = useState(PUZZLES[0]?.id ?? "plus_x");
  const [sequence, setSequence] = useState<string[]>([]);
  const [displaySequence, setDisplaySequence] = useState<string[]>([]);
  const [replayNonce, setReplayNonce] = useState(0);
  const [animationMode, setAnimationMode] = useState<"to-final" | "replay">("to-final");
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [, setAnimationLabel] = useState("Idle");
  const [isRunning, setIsRunning] = useState(false);
  const [resultRevealed, setResultRevealed] = useState(false);
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [draggedGateIndex, setDraggedGateIndex] = useState<number | null>(null);
  const [sandboxThetaDegrees, setSandboxThetaDegrees] = useState(DEFAULT_SANDBOX_THETA);
  const [sandboxProbeMode, setSandboxProbeMode] = useState<SandboxProbeMode>("single");
  const [sandboxPhiDegrees, setSandboxPhiDegrees] = useState(DEFAULT_SANDBOX_PHI);
  const [robustEpsilonInput, setRobustEpsilonInput] = useState(DEFAULT_ROBUST_EPSILON);
  const revealedRunKeyRef = useRef("");
  const activeRunRef = useRef<ActiveRun | null>(null);
  const activeEntryKeyRef = useRef("");
  const runTokenRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const isSandbox = view === "sandbox";
  const sandboxInitialState = useMemo(
    () => stateFromBloch(
      degreesToRadians(clampNumber(parseDegreeInput(sandboxThetaDegrees, 0), 0, 180)),
      degreesToRadians(parseDegreeInput(sandboxPhiDegrees, 0)),
    ),
    [sandboxPhiDegrees, sandboxThetaDegrees],
  );
  const sandboxCases = useMemo<PuzzleCase[]>(() => {
    if (sandboxProbeMode === "trio") {
      return sandboxUnitaryProbeCases();
    }

    return [
      {
        label: "Custom state",
        startLabel: "|ψ₀⟩",
        targetLabel: "|ψ⟩",
        startState: sandboxInitialState,
        targetState: sandboxInitialState,
      },
    ];
  }, [sandboxInitialState, sandboxProbeMode]);
  const sandboxPuzzle = useMemo<Puzzle>(() => ({
    ...SANDBOX_PUZZLE,
    targetState: sandboxCases[0]?.startState ?? sandboxInitialState,
    cases: sandboxCases,
  }), [sandboxCases, sandboxInitialState]);
  const puzzle = isSandbox ? sandboxPuzzle : PUZZLES.find((item) => item.id === puzzleId) ?? PUZZLES[0];
  const puzzleKind = puzzle.kind ?? "target";
  const isRobust = Boolean(puzzle.robust);
  const robustDefaultEpsilon = puzzle.defaultErrorEpsilon ?? Number(DEFAULT_ROBUST_EPSILON);
  const robustEpsilon = clampNumber(parseDegreeInput(robustEpsilonInput, robustDefaultEpsilon), -0.1, 0.1);
  const activeOverrotationEpsilon = isRobust ? robustEpsilon : 0;
  const puzzleSuccessThreshold = successThresholdForPuzzle(puzzle);
  const activePuzzleCases = useMemo(() => puzzleCases(puzzle), [puzzle]);
  const primaryCase = activePuzzleCases[0];
  const activePuzzleMode = puzzleModeFor(puzzle);
  const activeModePuzzles = isSandbox ? [] : puzzlesForMode(activePuzzleMode);
  const puzzleIndex = Math.max(0, activeModePuzzles.findIndex((item) => item.id === puzzle.id));
  const allowedGateSet = useMemo(() => new Set(puzzle.allowedGates ?? (isRobust ? ROBUST_GATE_ORDER : GATE_ORDER)), [isRobust, puzzle]);
  const gateLimitReached = sequence.length >= puzzle.gateLimit;
  const gateUsageText = isSandbox
    ? `${sequence.length}/${puzzle.gateLimit} sandbox gates`
    : `${sequence.length}/${puzzle.gateLimit} gates used`;
  const activeGateOrder = isRobust ? ROBUST_GATE_ORDER : GATE_ORDER;
  const visibleGateOrder = activeGateOrder.filter((gateName) => allowedGateSet.has(gateName));
  const states = useMemo(
    () => sequenceStates(displaySequence, primaryCase.startState, activeOverrotationEpsilon),
    [activeOverrotationEpsilon, displaySequence, primaryCase],
  );
  const keyVectors = useMemo(() => states.map(blochVector), [states]);
  const showProbeVectors = puzzleKind === "gate-design" || (isSandbox && sandboxProbeMode === "trio");
  const probeKeyVectors = useMemo(
    () => showProbeVectors
      ? activePuzzleCases.map((puzzleCase) => sequenceStates(displaySequence, puzzleCase.startState, activeOverrotationEpsilon).map(blochVector))
      : undefined,
    [activeOverrotationEpsilon, activePuzzleCases, displaySequence, showProbeVectors],
  );
  const result = useMemo(() => evaluatePuzzle(puzzle, displaySequence, activeOverrotationEpsilon), [activeOverrotationEpsilon, puzzle, displaySequence]);
  const robustFidelityExpansion = useMemo(() => isRobust && sequence.length > 0 ? fidelityExpansionForSequence(puzzle, sequence) : null, [isRobust, puzzle, sequence]);
  const unitarySpec = useMemo(() => unitarySpecForPuzzle(puzzle), [puzzle]);
  const solved = !isSandbox && resultRevealed && isPuzzleSolved(puzzle, result.fidelity, displaySequence.length);
  const circuitStartLabel = showProbeVectors ? "probes" : primaryCase.startLabel;
  const circuitEndLabel = puzzleKind === "gate-design" ? "targets" : sandboxProbeMode === "trio" && isSandbox ? "outputs" : "|ψ⟩";
  const statusText = isSandbox
    ? isRunning && !resultRevealed
      ? "Running"
      : "Sandbox"
    : solved
      ? "Solved"
      : isRunning && !resultRevealed
        ? "Running"
        : resultRevealed
          ? "Try again"
          : "Build circuit";
  const totalXp = useMemo(
    () => PUZZLES.reduce((sum, item) => sum + (progress[item.id]?.xpAwarded ?? 0), 0),
    [progress],
  );
  const spentXp = useMemo(
    () => PUZZLES.reduce((sum, item) => sum + (progress[item.id]?.xpSpent ?? 0), 0),
    [progress],
  );
  const availableXp = Math.max(0, totalXp - spentXp);
  const rank = Math.floor(totalXp / RANK_XP) + 1;
  const xpIntoRank = totalXp % RANK_XP;
  const nextLevel = activeModePuzzles[puzzleIndex + 1];
  const finalPuzzleId = PUZZLES[PUZZLES.length - 1]?.id;

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (!puzzle.robust) {
      return;
    }

    setRobustEpsilonInput((puzzle.defaultErrorEpsilon ?? Number(DEFAULT_ROBUST_EPSILON)).toFixed(3));
  }, [puzzle.defaultErrorEpsilon, puzzle.id, puzzle.robust]);

  useEffect(() => {
    if (view !== "play" && view !== "sandbox") {
      activeEntryKeyRef.current = "";
      return;
    }

    const entryKey = `${view}:${puzzle.id}`;
    if (activeEntryKeyRef.current === entryKey) {
      return;
    }

    activeEntryKeyRef.current = entryKey;
    setSequence([]);
    setDisplaySequence([]);
    setAnimationMode("to-final");
    setShowTrajectory(false);
    setIsRunning(false);
    setResultRevealed(false);
    setCelebrationNonce(0);
    activeRunRef.current = null;
    revealedRunKeyRef.current = "";
    setReplayNonce((current) => current + 1);
  }, [puzzle.id, view]);

  useEffect(() => {
    if (!isSandbox) {
      return;
    }

    setDisplaySequence([]);
    setAnimationMode("to-final");
    setShowTrajectory(false);
    setIsRunning(false);
    setResultRevealed(false);
    activeRunRef.current = null;
    revealedRunKeyRef.current = "";
    setReplayNonce((current) => current + 1);
  }, [isSandbox, sandboxInitialState, sandboxProbeMode]);

  const getAudioContext = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const playTone = (frequency: number, duration: number, volume: number, delay = 0, type: OscillatorType = "sine") => {
    try {
      const audioContext = getAudioContext();
      if (!audioContext) {
        return;
      }

      const startTime = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      const peakVolume = Math.min(volume * AUDIO_VOLUME_MULTIPLIER, 0.08);
      gain.gain.exponentialRampToValueAtTime(peakVolume, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    } catch {
      // Audio cues are decorative; gameplay should never depend on them.
    }
  };

  const playClick = () => playTone(420, 0.045, 0.018);
  const playWin = () => {
    playTone(523.25, 0.1, 0.025, 0);
    playTone(659.25, 0.12, 0.022, 0.08);
    playTone(783.99, 0.18, 0.02, 0.17);
  };
  const playFinale = () => {
    playTone(523.25, 0.12, 0.026, 0);
    playTone(659.25, 0.13, 0.026, 0.08);
    playTone(783.99, 0.16, 0.024, 0.17);
    playTone(1046.5, 0.18, 0.022, 0.32);
    playTone(1318.51, 0.2, 0.02, 0.48);
    playTone(1567.98, 0.28, 0.018, 0.66);
  };
  const playLoss = () => {
    playTone(246.94, 0.12, 0.018, 0, "triangle");
    playTone(196, 0.16, 0.016, 0.11, "triangle");
  };

  const clearRun = (label: string) => {
    setSequence([]);
    setDisplaySequence([]);
    setAnimationMode("to-final");
    setShowTrajectory(false);
    setAnimationLabel(label);
    setIsRunning(false);
    setResultRevealed(false);
    revealedRunKeyRef.current = "";
    activeRunRef.current = null;
    setReplayNonce((current) => current + 1);
  };

  const startPuzzle = (nextPuzzleId: string) => {
    playClick();
    if (!isPuzzleUnlocked(nextPuzzleId, progress)) {
      return;
    }

    setPuzzleId(nextPuzzleId);
    setView("play");
    clearRun("Build circuit");
  };

  const startSandbox = () => {
    playClick();
    setPuzzleId(SANDBOX_PUZZLE.id);
    setView("sandbox");
    clearRun("Sandbox");
  };

  const resetProgress = () => {
    playClick();
    const confirmed = window.confirm("Reset all level progress and XP?");
    if (!confirmed) {
      return;
    }

    setProgress({});
    setPuzzleId(PUZZLES[0]?.id ?? "plus_x");
    setView("levels");
    clearRun("Progress reset");
  };

  const addHintGateToCircuit = (gateName: string) => {
    if (sequence.length >= puzzle.gateLimit) {
      setAnimationLabel("Clear space in the circuit first");
      return false;
    }

    if (!allowedGateSet.has(gateName)) {
      setAnimationLabel("No usable hint for this level");
      return false;
    }

    updateDraftSequence((current) => [...current, gateName]);
    setAnimationLabel(`Hint added: ${plainMathText(gateSymbolText(gateName))}`);
    return true;
  };

  const buyGateHint = () => {
    if (isSandbox || isRunning || puzzle.solution.length === 0) {
      return;
    }

    if (availableXp < HINT_COST) {
      setAnimationLabel(`Need ${HINT_COST - availableXp} more XP`);
      return;
    }

    const hintGate = pickHintGate(puzzle, sequence);
    if (!addHintGateToCircuit(hintGate)) {
      return;
    }

    playClick();
    setProgress((current) => {
      const existing = current[puzzle.id];
      return {
        ...current,
        [puzzle.id]: {
          solved: Boolean(existing?.solved),
          bestScore: numberOrZero(existing?.bestScore),
          bestGates: numberOrZero(existing?.bestGates),
          xpAwarded: numberOrZero(existing?.xpAwarded),
          xpSpent: numberOrZero(existing?.xpSpent) + HINT_COST,
        },
      };
    });
  };

  const markCircuitEdited = () => {
    setResultRevealed(false);
    activeRunRef.current = null;
    setAnimationLabel("Ready to run");
  };

  const updateDraftSequence = (updater: (current: string[]) => string[]) => {
    if (isRunning) {
      return;
    }

    setSequence((current) => updater(current));
    markCircuitEdited();
  };

  const addGate = (gateName: string) => {
    if (!allowedGateSet.has(gateName)) {
      return;
    }

    if (sequence.length >= puzzle.gateLimit) {
      setAnimationLabel("Gate limit reached");
      return;
    }

    playClick();
    updateDraftSequence((current) => [...current, gateName]);
  };

  const undo = () => {
    playClick();
    updateDraftSequence((current) => current.slice(0, -1));
  };

  const reset = () => {
    playClick();
    clearRun("Reset circuit");
  };

  const removeGate = (index: number) => {
    playClick();
    updateDraftSequence((current) => current.filter((_, gateIndex) => gateIndex !== index));
  };

  const moveGate = (index: number, direction: -1 | 1) => {
    playClick();
    updateDraftSequence((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [gate] = next.splice(index, 1);
      next.splice(nextIndex, 0, gate);
      return next;
    });
  };

  const handleGateDragStart = (event: DragEvent<HTMLSpanElement>, index: number) => {
    setDraggedGateIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleGateDrop = (event: DragEvent<HTMLSpanElement>, dropIndex: number) => {
    event.preventDefault();
    const sourceIndex = draggedGateIndex ?? Number(event.dataTransfer.getData("text/plain"));
    setDraggedGateIndex(null);

    if (!Number.isInteger(sourceIndex) || sourceIndex === dropIndex) {
      return;
    }

    updateDraftSequence((current) => {
      if (sourceIndex < 0 || sourceIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [gate] = next.splice(sourceIndex, 1);
      next.splice(dropIndex, 0, gate);
      return next;
    });
  };

  const revealRunResult = () => {
    const activeRun = activeRunRef.current;
    if (!activeRun) {
      return;
    }

    const runKey = String(activeRun.token);
    if (revealedRunKeyRef.current === runKey) {
      return;
    }

    revealedRunKeyRef.current = runKey;
    setResultRevealed(true);
    if (activeRun.puzzle.kind === "sandbox") {
      return;
    }

    if (!isPuzzleSolved(activeRun.puzzle, activeRun.result.fidelity, activeRun.sequence.length)) {
      playLoss();
      return;
    }

    if (activeRun.completesWholeGame) {
      playFinale();
    } else {
      playWin();
    }
    setCelebrationNonce((current) => current + 1);
    setProgress((current) => {
      const existing = current[activeRun.puzzle.id];
      const bestGates = Math.min(existing?.bestGates ?? Number.POSITIVE_INFINITY, activeRun.sequence.length);
      const bestScore = Math.max(existing?.bestScore ?? 0, activeRun.result.score);
      const xpAwarded = existing?.xpAwarded ?? xpForPuzzle(activeRun.puzzle, activeRun.sequence.length);

      return {
        ...current,
        [activeRun.puzzle.id]: {
          solved: true,
          bestScore,
          bestGates,
          xpAwarded,
          xpSpent: existing?.xpSpent ?? 0,
        },
      };
    });
  };


  const runCircuit = () => {
    if (sequence.length === 0 || isRunning) {
      setAnimationLabel("Add gates first");
      return;
    }

    playClick();
    const runSequence = [...sequence];
    const runResult = evaluatePuzzle(puzzle, runSequence, activeOverrotationEpsilon);
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    activeRunRef.current = {
      token,
      puzzle,
      sequence: runSequence,
      result: runResult,
      completesWholeGame: puzzle.kind !== "sandbox" && isPuzzleSolved(puzzle, runResult.fidelity, runSequence.length) && runCompletesWholeGame(progress, puzzle.id),
    };

    setDisplaySequence(runSequence);
    setAnimationMode("replay");
    setShowTrajectory(true);
    setAnimationLabel("Running circuit");
    setIsRunning(true);
    setResultRevealed(false);
    revealedRunKeyRef.current = "";
    setReplayNonce((current) => current + 1);
  };

  const replay = () => {
    if (displaySequence.length === 0 || isRunning) {
      setAnimationLabel("Run a circuit first");
      return;
    }

    playClick();
    const replaySequence = [...displaySequence];
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    activeRunRef.current = {
      token,
      puzzle,
      sequence: replaySequence,
      result: evaluatePuzzle(puzzle, replaySequence, activeOverrotationEpsilon),
      completesWholeGame: false,
    };

    setAnimationMode("replay");
    setShowTrajectory(true);
    setAnimationLabel("Replaying last run");
    setIsRunning(true);
    setResultRevealed(false);
    revealedRunKeyRef.current = "";
    setReplayNonce((current) => current + 1);
  };

  const handleAnimationComplete = () => {
    const activeRun = activeRunRef.current;
    if (!activeRun) {
      return;
    }

    setAnimationLabel("Idle");
    setIsRunning(false);

    if (activeRun.completesWholeGame) {
      activeRunRef.current = null;
      setView("complete");
    }
  };

  const readoutValue = (value: string) => (resultRevealed ? value : "--");

  const setSandboxPreset = (thetaDegrees: string, phiDegrees: string) => {
    if (isRunning) {
      return;
    }

    playClick();
    setSandboxThetaDegrees(thetaDegrees);
    setSandboxPhiDegrees(phiDegrees);
  };

  const setSandboxProbeView = (mode: SandboxProbeMode) => {
    if (isRunning || sandboxProbeMode === mode) {
      return;
    }

    playClick();
    setSandboxProbeMode(mode);
  };

  const setRobustEpsilonValue = (value: string) => {
    if (isRunning) {
      return;
    }

    setRobustEpsilonInput(value);
  };

  const renderCircuitPanel = (className: string) => (
    <section className={`floatingPanel circuitPanel ${className}`} aria-label="Draft quantum circuit">
      <div className="sectionHeader circuitHeader">
        <h2>Circuit</h2>
        <div className="inlineActions">
          <button type="button" className="runButton" onClick={runCircuit} disabled={sequence.length === 0 || isRunning}>
            RUN
          </button>
          <button type="button" className="textButton" onClick={undo} disabled={sequence.length === 0 || isRunning}>
            Undo
          </button>
          <button type="button" className="textButton" onClick={reset} disabled={(sequence.length === 0 && displaySequence.length === 0) || isRunning}>
            Reset
          </button>
        </div>
      </div>
      <div className={`circuitBoard ${sequence.length === 0 ? "empty" : ""} ${sequence.length > 5 ? "longCircuit" : ""}`}>
        <span className="circuitKet circuitStartKet">{circuitStartLabel}</span>
        <div className={`circuitWire ${sequence.length > 0 ? "filled" : ""}`} aria-label="Current gate sequence">
          {sequence.length === 0 ? (
            <span className="circuitEmpty">add gates</span>
          ) : (
            sequence.map((gateName, index) => (
              <span
                className={`circuitGateUnit ${isPulseGate(gateName) ? "pulseGateUnit" : ""} ${draggedGateIndex === index ? "dragging" : ""}`}
                draggable={!isRunning && sequence.length > 1}
                key={`${gateName}-${index}`}
                onDragEnd={() => setDraggedGateIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => handleGateDragStart(event, index)}
                onDrop={(event) => handleGateDrop(event, index)}
                aria-label={`Gate ${index + 1}: ${gateName}`}
              >
                <button
                  type="button"
                  className="circuitNudge"
                  onClick={() => moveGate(index, -1)}
                  disabled={index === 0 || isRunning}
                  aria-label={`Move ${gateName} left`}
                >
                  &lt;
                </button>
                <span className={`circuitGate ${isPulseGate(gateName) ? "pulseGateSymbol" : ""}`}>{renderGateSymbol(gateName)}</span>
                <button
                  type="button"
                  className="circuitRemove"
                  onClick={() => removeGate(index)}
                  disabled={isRunning}
                  aria-label={`Remove ${gateName}`}
                >
                  x
                </button>
                <button
                  type="button"
                  className="circuitNudge"
                  onClick={() => moveGate(index, 1)}
                  disabled={index === sequence.length - 1 || isRunning}
                  aria-label={`Move ${gateName} right`}
                >
                  &gt;
                </button>
              </span>
            ))
          )}
        </div>
        <span className="circuitKet circuitEndKet">{circuitEndLabel}</span>
      </div>
    </section>
  );

  if (view === "complete") {
    return (
      <CompletionScreen
        availableXp={availableXp}
        rank={rank}
        replayFinal={() => finalPuzzleId ? startPuzzle(finalPuzzleId) : undefined}
        resetProgress={resetProgress}
        showLevels={() => { playClick(); setView("levels"); }}
        totalXp={totalXp}
      />
    );
  }

  if (view === "levels") {
    return (
      <LevelSelectScreen
        progress={progress}
        totalXp={totalXp}
        availableXp={availableXp}
        spentXp={spentXp}
        rank={rank}
        xpIntoRank={xpIntoRank}
        startPuzzle={startPuzzle}
        resetProgress={resetProgress}
        showCompletion={() => { playClick(); setView("complete"); }}
        startSandbox={startSandbox}
      />
    );
  }

  return (
    <div className="appShell playMode">
      <main className="sceneStage">
        <BlochScene
          keyVectors={keyVectors}
          gateSequence={displaySequence}
          gateErrorEpsilon={activeOverrotationEpsilon}
          targetVector={isSandbox || puzzleKind === "gate-design" ? null : result.targetBloch}
          probeKeyVectors={probeKeyVectors}
          animationMode={animationMode}
          showTrajectory={showTrajectory}
          solved={solved}
          celebrationNonce={celebrationNonce}
          replayNonce={replayNonce}
          onAnimationNearEnd={revealRunResult}
          onAnimationComplete={handleAnimationComplete}
        />

        {celebrationNonce > 0 ? (
          <div className="celebrationBurst" key={celebrationNonce} aria-hidden="true">
            <div className="celebrationCore">Solved</div>
            {CELEBRATION_BITS.map((bit, index) => (
              <span
                className="celebrationBit"
                key={index}
                style={
                  {
                    "--delay": bit.delay,
                    "--rotation": bit.rotation,
                    "--x": bit.x,
                    "--y": bit.y,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        <section className="floatingPanel statusPanel" aria-label="Puzzle status">
          <span className={`statusPill ${solved ? "solved" : !isSandbox && resultRevealed ? "failed" : isRunning ? "running" : isSandbox ? "sandbox" : ""}`}>
            {statusText}
          </span>
          <h1>{renderMathLabel(puzzle.title)}</h1>
          {!isRobust ? <p>{renderMathLabel(puzzle.mission ?? "Choose gates that move the starting state to the target on the Bloch sphere.")}</p> : null}
          <p className="objectiveMeta">
            {isSandbox
              ? `Free build cap: ${puzzle.gateLimit} gates.`
              : `Gate limit: ${puzzle.gateLimit} ${puzzle.gateLimit === 1 ? "gate" : "gates"}.`}
          </p>
          {unitarySpec ? (
            <p className="unitarySpecMeta">
              <strong>Target unitary:</strong>
              <span>{unitarySpec}</span>
            </p>
          ) : null}
          {puzzle.gateSetLabel && !isRobust ? <p className="gateSetMeta">{puzzleKind === "gate-design" ? "Challenge" : "Gate set"}: {renderMathLabel(puzzle.gateSetLabel)}</p> : null}
          {solved && nextLevel ? (
            <button type="button" className="primaryButton compactButton" onClick={() => startPuzzle(nextLevel.id)}>
              Next level
            </button>
          ) : null}
        </section>

        {renderCircuitPanel("desktopCircuit")}


        <section className="floatingPanel readoutPanel" aria-label="Current result">
          <div>
            <span>{isSandbox ? "Gates" : puzzleKind === "gate-design" ? "Gate fidelity" : "Fidelity"}</span>
            <strong>{isSandbox ? readoutValue(String(displaySequence.length)) : readoutValue(`${((puzzleKind === "gate-design" ? result.gateFidelity : result.fidelity) * 100).toFixed(2)}%`)}</strong>
          </div>
          <div>
            <span>{isSandbox ? "Mode" : puzzleKind === "gate-design" ? "Gates" : "Error"}</span>
            <strong>{isSandbox ? "Free" : puzzleKind === "gate-design" ? readoutValue(`${displaySequence.length}/${puzzle.gateLimit}`) : readoutValue(`${result.angularErrorDegrees.toFixed(1)} deg`)}</strong>
          </div>
          <div>
            <span>Score</span>
            <strong>{isSandbox ? "--" : readoutValue(String(result.score))}</strong>
          </div>
        </section>
      </main>

      <aside className="controlPanel">
        <div className="panelHeader gamePanelHeader">
          <p className="eyebrow">Qubit Golf</p>
          <button type="button" className="menuButton" onClick={() => { playClick(); setView("levels"); }}>
            Main menu
          </button>
          <h2>{isSandbox ? "Sandbox controls" : isRobust ? "Robust controls" : "Gate controls"}</h2>
          <div className="panelLevelMeta">
            <span>{isSandbox ? "Free play" : `Level ${puzzleIndex + 1} of ${activeModePuzzles.length}`}</span>
          </div>
        </div>

        {isSandbox ? (
          <section className="panelSection sandboxStatePanel" aria-label="Sandbox initial state">
            <div className="sectionHeader">
              <h3>Initial state</h3>
              <span className="sandboxStateKet">{sandboxProbeMode === "trio" ? "probes" : "|ψ₀⟩"}</span>
            </div>
            <div className="sandboxProbeToggle" role="group" aria-label="Sandbox probe view">
              <button type="button" className={sandboxProbeMode === "single" ? "active" : ""} onClick={() => setSandboxProbeView("single")} disabled={isRunning}>Single state</button>
              <button type="button" className={sandboxProbeMode === "trio" ? "active" : ""} onClick={() => setSandboxProbeView("trio")} disabled={isRunning}>Unitary probes</button>
            </div>
            {sandboxProbeMode === "single" ? (
            <>
            <div className="angleInputGrid">
              <label>
                <span>θ (deg)</span>
                <input
                  type="number"
                  min="0"
                  max="180"
                  step="1"
                  value={sandboxThetaDegrees}
                  onChange={(event) => setSandboxThetaDegrees(event.target.value)}
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>φ (deg)</span>
                <input
                  type="number"
                  step="1"
                  value={sandboxPhiDegrees}
                  onChange={(event) => setSandboxPhiDegrees(event.target.value)}
                  disabled={isRunning}
                />
              </label>
            </div>
            <p className="sandboxStateReadout">{formatAngles(blochVector(sandboxInitialState))}</p>
            <div className="presetRow" aria-label="Initial state presets">
              <button type="button" className="statePresetButton" onClick={() => setSandboxPreset("0", "0")} disabled={isRunning}>|0⟩</button>
              <button type="button" className="statePresetButton" onClick={() => setSandboxPreset("90", "0")} disabled={isRunning}>|+x⟩</button>
              <button type="button" className="statePresetButton" onClick={() => setSandboxPreset("90", "90")} disabled={isRunning}>|+y⟩</button>
            </div>
            </>
            ) : (
              <div className="sandboxProbeList" aria-label="Sandbox unitary probes">
                <span>|0⟩</span>
                <span>|+x⟩</span>
                <span>|+y⟩</span>
              </div>
            )}
          </section>
        ) : null}

        {isRobust ? (
          <section className="panelSection robustErrorPanel" aria-label="Robust overrotation error">
            <div className="sectionHeader">
              <h3>Pulse error</h3>
              <span className="sandboxStateKet">{"\u03b5"}</span>
            </div>
            <label className="epsilonSlider">
              <span>Fractional overrotation</span>
              <input
                type="range"
                min="-0.1"
                max="0.1"
                step="0.005"
                value={robustEpsilon.toFixed(3)}
                onChange={(event) => setRobustEpsilonValue(event.target.value)}
                disabled={isRunning}
              />
            </label>
            <div className="angleInputGrid compactInputGrid">
              <label>
                <span>{"\u03b5"}</span>
                <input
                  type="number"
                  min="-0.1"
                  max="0.1"
                  step="0.005"
                  value={robustEpsilonInput}
                  onChange={(event) => setRobustEpsilonValue(event.target.value)}
                  disabled={isRunning}
                />
              </label>
              <label>
                <span>scale</span>
                <input type="text" value={(1 + activeOverrotationEpsilon).toFixed(3) + "x"} readOnly />
              </label>
            </div>
          </section>
        ) : null}

        {renderCircuitPanel("mobileCircuit")}

        <section className="panelSection gatesSection">
          <div className="sectionHeader">
            <h3>Gates</h3>
            <button type="button" className="textButton" onClick={replay} disabled={displaySequence.length === 0 || isRunning}>
              Replay
            </button>
          </div>
          <p className="gateSetNote">{isSandbox ? `Sandbox mode - all standard gates - ${gateUsageText}` : isRobust ? gateUsageText : <>{puzzleKind === "gate-design" ? "Challenge" : "Gate set"}: {renderMathLabel(puzzle.gateSetLabel ?? "All gates available")} - {gateUsageText}</>}</p>
          <div className="gateGrid">
            {visibleGateOrder.map((gateName) => (
              <button
                key={gateName}
                type="button"
                className={`gateButton ${gateLimitReached ? "limitGate" : ""}`}
                onClick={() => addGate(gateName)}
                disabled={isRunning || gateLimitReached}
              >
                <span className={isPulseGate(gateName) ? "pulseGateButtonSymbol" : ""}>{renderGateSymbol(gateName)}</span>
                <small>{gateLimitReached ? "Gate limit reached" : STANDARD_GATES[gateName].description}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="panelSection details">
          <h3>Readout</h3>
          <dl>
            {!isSandbox && puzzleKind !== "gate-design" ? (
              <div>
                <dt>Target</dt>
                <dd className="mathReadout">{formatAngles(result.targetBloch)}</dd>
              </div>
            ) : null}
            {isSandbox ? (
              <div>
                <dt>{sandboxProbeMode === "trio" ? "Initial probes" : "Initial"}</dt>
                <dd className="mathReadout">{sandboxProbeMode === "trio" ? "|0⟩, |+x⟩, |+y⟩" : formatAngles(blochVector(sandboxInitialState))}</dd>
              </div>
            ) : null}
            {puzzleKind !== "gate-design" ? (
              <div>
                <dt>Current</dt>
                <dd className="mathReadout">{resultRevealed ? (sandboxProbeMode === "trio" && isSandbox ? `${result.cases.length} probe outputs` : formatAngles(result.finalBloch)) : isSandbox ? (sandboxProbeMode === "trio" ? "Run circuit to transform all probes." : formatAngles(blochVector(sandboxInitialState))) : "Run circuit to reveal."}</dd>
              </div>
            ) : null}
            {isRobust ? (
              <div>
                <dt className="fidelityExpansionLabel">Fidelity expansion</dt>
                <dd className="mathReadout">{robustFidelityExpansion ? formatFidelityExpansion(robustFidelityExpansion) : "Add gates to estimate."}</dd>
              </div>
            ) : null}
            {isSandbox && sandboxProbeMode === "trio" ? (
              <div>
                <dt>Probe outputs</dt>
                <dd className="probeCaseList">
                  {result.cases.map((caseResult) => (
                    <span className="probeCase" key={caseResult.label}>
                      <strong>{caseResult.label}</strong>
                      <em>{caseResult.startLabel} → {resultRevealed ? formatAngles(caseResult.finalBloch) : "waiting for run"}</em>
                    </span>
                  ))}
                </dd>
              </div>
            ) : puzzleKind !== "gate-design" ? (
              <div>
                <dt>State</dt>
                <dd>{resultRevealed ? formatState(result.finalState) : isSandbox ? formatState(sandboxInitialState) : "Run circuit to reveal."}</dd>
              </div>
            ) : null}
            {puzzleKind === "gate-design" ? (
              <>
              <div>
                <dt>Target unitary</dt>
                <dd className="mathReadout">{unitarySpec ?? "No target unitary specified."}</dd>
              </div>
              <div>
                <dt>Gate fidelity</dt>
                <dd className="mathReadout">{readoutValue(`${(result.gateFidelity * 100).toFixed(2)}%`)}</dd>
              </div>
              <div>
                <dt>Probe tests</dt>
                <dd className="probeCaseList">
                  {result.cases.map((caseResult) => (
                    <span
                      className={`probeCase ${resultRevealed ? (caseResult.fidelity >= puzzleSuccessThreshold ? "pass" : "fail") : ""}`}
                      key={caseResult.label}
                    >
                      <strong>{caseResult.label}</strong>
                      <em>{renderMathLabel(`${caseResult.startLabel} \u2192 ${caseResult.targetLabel}`)}</em>
                      <b>{resultRevealed ? `${(caseResult.fidelity * 100).toFixed(1)}%` : "--"}</b>
                    </span>
                  ))}
                </dd>
              </div>
              </>
            ) : null}
          </dl>
        </section>

        {!isSandbox ? (
        <section className="panelSection hintBox">
          <p className="hintWallet">Rank {rank} / {availableXp} XP</p>
          <div className="sectionHeader">
            <h3>Gate hint</h3>
            <button
              type="button"
              className="textButton"
              onClick={buyGateHint}
              disabled={availableXp < HINT_COST || gateLimitReached || isRunning}
            >
              Spend {HINT_COST} XP
            </button>
          </div>
        </section>
        ) : null}
      </aside>
    </div>
  );
}

function LevelSelectScreen({
  progress,
  totalXp,
  availableXp,
  spentXp,
  rank,
  xpIntoRank,
  startPuzzle,
  resetProgress,
  showCompletion,
  startSandbox,
}: {
  progress: ProgressState;
  totalXp: number;
  availableXp: number;
  spentXp: number;
  rank: number;
  xpIntoRank: number;
  startPuzzle: (puzzleId: string) => void;
  resetProgress: () => void;
  showCompletion: () => void;
  startSandbox: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState<PuzzleMode | null>(null);
  const completedCount = PUZZLES.filter((item) => progress[item.id]?.solved).length;
  const allLevelsComplete = completedCount === PUZZLES.length;
  const xpPercent = Math.round((xpIntoRank / RANK_XP) * 100);
  const statePuzzles = puzzlesForMode("state-transfer");
  const designPuzzles = puzzlesForMode("unitary-design");
  const robustPuzzles = puzzlesForMode("robust-gate-design");
  const stateComplete = completedCountForMode("state-transfer", progress);
  const designComplete = completedCountForMode("unitary-design", progress);
  const robustComplete = completedCountForMode("robust-gate-design", progress);
  const modeCards: Array<{ complete: number; mode: PuzzleMode; total: number }> = [
    { mode: "state-transfer", complete: stateComplete, total: statePuzzles.length },
    { mode: "unitary-design", complete: designComplete, total: designPuzzles.length },
    { mode: "robust-gate-design", complete: robustComplete, total: robustPuzzles.length },
  ];

  const renderLevelCards = (mode: PuzzleMode, title: string) => {
    const modePuzzles = puzzlesForMode(mode);
    const unlockedThrough = unlockedIndexForMode(mode, progress);

    return (
      <div className="levelCardGrid">
        {modePuzzles.map((item, index) => {
          const record = progress[item.id];
          const locked = index > unlockedThrough;
          const action = record?.solved ? "Replay" : "Start";

          return (
            <button
              type="button"
              className={`levelCard ${record?.solved ? "cleared" : ""} ${locked ? "locked" : ""}`}
              key={item.id}
              disabled={locked}
              onClick={() => startPuzzle(item.id)}
              aria-label={locked ? `${title} level ${index + 1} locked` : `${action} ${title} Level ${index + 1}: ${plainMathText(item.title)}`}
            >
              <div className="levelCardTopline">
                <span>Level {index + 1}</span>
                <strong>{locked ? "Locked" : record?.solved ? "Cleared" : "Open"}</strong>
              </div>
              <h2>{renderMathLabel(item.title)}</h2>
              <p>Gate limit: {item.gateLimit} {item.gateLimit === 1 ? "gate" : "gates"}.</p>
              {item.gateSetLabel ? <p className="levelGateSet">{renderMathLabel(item.gateSetLabel)}</p> : null}
              {modeTagForPuzzle(item) ? <p className="levelModeTag">{modeTagForPuzzle(item)}</p> : null}
              <div className="levelCardStats">
                <span>{record?.solved ? `Best: ${record.bestScore}` : `${xpForPuzzle(item, item.gateLimit)} XP`}</span>
                <span>{record?.bestGates ? `${record.bestGates} gates` : "No run yet"}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  if (selectedMode) {
    const title = modeTitle(selectedMode);
    const copy = modeCopy(selectedMode);
    const modePuzzles = puzzlesForMode(selectedMode);
    const modeComplete = completedCountForMode(selectedMode, progress);
    const nextPuzzle = nextPuzzleForMode(selectedMode, progress);

    return (
      <main className="levelSelectScreen">
        <section className="modeSubmenuHeader">
          <button type="button" className="menuButton" onClick={() => setSelectedMode(null)}>
            Back to modes
          </button>
          <div className="modeSubmenuCopy">
            <p className="eyebrow">{modeEyebrow(selectedMode)}</p>
            <h1>{title}</h1>
            <p>{copy}</p>
          </div>
          <div className="modeSubmenuActions">
            <strong>{modeComplete} / {modePuzzles.length} cleared</strong>
            <button type="button" className="primaryButton" onClick={() => startPuzzle(nextPuzzle.id)}>
              {modeComplete === modePuzzles.length ? "Review first level" : <>Continue: {renderMathLabel(nextPuzzle.title)}</>}
            </button>
          </div>
        </section>

        <section className="modeLevelSection" aria-label={`${title} levels`}>
          {renderLevelCards(selectedMode, title)}
        </section>
      </main>
    );
  }

  return (
    <main className="levelSelectScreen">
      <section className="levelHero mainMenuHero">
        <div className="levelHeroCopy">
          <h1>QUBIT GOLF</h1>
          <p>
            Choose a challenge mode: move states, synthesize unitary gates, or build circuits that resist pulse errors.
          </p>
          <div className="levelHeroActions mainMenuActions">
            {allLevelsComplete ? (
              <button type="button" className="primaryButton" onClick={showCompletion}>
                View certificate
              </button>
            ) : null}
            <button type="button" className="menuButton sandboxButton" onClick={startSandbox} aria-label="Start sandbox">
              Open sandbox
            </button>
          </div>
          <div className="mobileMenuGraphic" aria-hidden="true">
            <MenuGraphic />
          </div>
          <section className="modeCardGrid mainMenuModes" aria-label="Game modes">
            {modeCards.map((card, index) => (
              <button
                type="button"
                className="modeCard"
                key={card.mode}
                onClick={() => setSelectedMode(card.mode)}
                aria-label={"Open " + modeTitle(card.mode) + " levels"}
              >
                <span>Mode {index + 1}</span>
                <h2>{modeTitle(card.mode)}</h2>
                <p>{modeCopy(card.mode)}</p>
                <strong>{card.complete} / {card.total} cleared - View levels</strong>
              </button>
            ))}
          </section>
        </div>

        <div className="menuHeroSide">
          <MenuGraphic />
          <div className="xpCard" aria-label="Player progress">
            <span>Rank {rank}</span>
            <strong>{availableXp} XP</strong>
            <div className="xpBar" aria-hidden="true">
              <span style={{ width: `${xpPercent}%` }} />
            </div>
            <p>{totalXp} earned / {spentXp} spent</p>
            <small>{xpIntoRank} / {RANK_XP} XP to next rank</small>
            <small>{completedCount} / {PUZZLES.length} levels cleared</small>
            <button type="button" className="textButton resetProgressButton" onClick={resetProgress} disabled={totalXp === 0 && completedCount === 0}>
              Reset progress
            </button>
          </div>
        </div>
      </section>

    </main>
  );
}

function MenuGraphic() {
  return (
    <section className="quantumMenuGraphic" aria-label="Decorative Bloch sphere and quantum circuit">
      <div className="menuBlochSphere" aria-hidden="true">
        <span className="sphereGlow" />
        <span className="sphereRing ringEquator" />
        <span className="sphereRing ringMeridianA" />
        <span className="sphereRing ringMeridianB" />
        <span className="sphereAxis axisX" />
        <span className="sphereAxis axisY" />
        <span className="sphereAxis axisZ" />
        <span className="sphereVector vectorCyan" />
        <span className="sphereVector vectorCoral" />
        <span className="spherePoint pointCyan" />
        <span className="spherePoint pointCoral" />
      </div>
      <div className="menuCircuitGraphic" aria-hidden="true">
        <span className="miniKet">|0⟩</span>
        <span className="miniWire" />
        <span className="miniGate">H</span>
        <span className="miniGate">T</span>
        <span className="miniGate">S⁻¹</span>
        <span className="miniWire" />
        <span className="miniKet">|ψ⟩</span>
      </div>
    </section>
  );
}

function CompletionScreen({
  availableXp,
  rank,
  replayFinal,
  resetProgress,
  showLevels,
  totalXp,
}: {
  availableXp: number;
  rank: number;
  replayFinal: () => void | undefined;
  resetProgress: () => void;
  showLevels: () => void;
  totalXp: number;
}) {
  return (
    <main className="completionScreen" aria-label="Completion certificate">
      <div className="completionConfetti" aria-hidden="true">
        {CERTIFICATE_CONFETTI.map((bit, index) => (
          <span
            className="completionConfettiPiece"
            key={index}
            style={
              {
                "--color": bit.color,
                "--delay": bit.delay,
                "--drift": bit.drift,
                "--duration": bit.duration,
                "--left": bit.left,
                "--rotation": bit.rotation,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <section className="completionContent">
        <p className="completionEyebrow">Qubit Golf complete</p>
        <h1>Certified Quantum Engineer!</h1>
        <p className="completionCopy">
          Every Bloch target cleared. Every gate challenge conquered. This certificate is extremely unofficial and fully deserved.
        </p>
        <div className="completionStats" aria-label="Completion stats">
          <span>{PUZZLES.length} levels cleared</span>
          <span>Rank {rank}</span>
          <span>{availableXp} XP available</span>
          <span>{totalXp} XP earned</span>
        </div>
        <div className="completionActions">
          <button type="button" className="primaryButton" onClick={showLevels}>
            Level menu
          </button>
          <button type="button" className="menuButton" onClick={replayFinal}>
            Replay finale
          </button>
          <button type="button" className="textButton resetProgressButton" onClick={resetProgress}>
            Reset progress
          </button>
        </div>
      </section>
    </main>
  );
}
function sandboxUnitaryProbeCases(): PuzzleCase[] {
  const zeroState = stateFromBloch(0, 0);
  const plusXState = stateFromBloch(Math.PI / 2, 0);
  const plusYState = stateFromBloch(Math.PI / 2, Math.PI / 2);

  return [
    { label: "|0⟩ probe", startLabel: "|0⟩", targetLabel: "output", startState: zeroState, targetState: zeroState },
    { label: "|+x⟩ probe", startLabel: "|+x⟩", targetLabel: "output", startState: plusXState, targetState: plusXState },
    { label: "|+y⟩ probe", startLabel: "|+y⟩", targetLabel: "output", startState: plusYState, targetState: plusYState },
  ];
}

function parseDegreeInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clampNumber(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function pickHintGate(puzzle: Puzzle, sequence: string[]): string {
  const solution = puzzle.solution;
  if (solution.length === 0) {
    return "H";
  }

  let prefixLength = 0;
  while (prefixLength < sequence.length && sequence[prefixLength] === solution[prefixLength]) {
    prefixLength += 1;
  }

  return solution[Math.min(prefixLength, solution.length - 1)] ?? solution[0];
}
function xpForPuzzle(puzzle: Puzzle, gateCount: number): number {
  const efficiencyBonus = Math.max(0, puzzle.gateLimit - gateCount) * 12;
  return 80 + puzzle.gateLimit * 35 + efficiencyBonus;
}

function loadProgress(): ProgressState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawProgress = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!rawProgress) {
      return {};
    }

    const parsed = JSON.parse(rawProgress) as ProgressState;
    return sanitizeProgress(parsed);
  } catch {
    return {};
  }
}

function saveProgress(progress: ProgressState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function sanitizeProgress(progress: ProgressState): ProgressState {
  const validIds = new Set(PUZZLES.map((item) => item.id));
  const sanitized: ProgressState = {};

  for (const [id, record] of Object.entries(progress)) {
    if (!validIds.has(id) || !record) {
      continue;
    }

    const solved = Boolean(record.solved);
    const xpSpent = Math.max(0, numberOrZero(record.xpSpent));

    if (!solved && xpSpent === 0) {
      continue;
    }

    sanitized[id] = {
      solved,
      bestScore: solved ? numberOrZero(record.bestScore) : 0,
      bestGates: solved ? Math.max(1, numberOrZero(record.bestGates)) : 0,
      xpAwarded: solved ? numberOrZero(record.xpAwarded) : 0,
      xpSpent,
    };
  }

  return sanitized;
}

function numberOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}





