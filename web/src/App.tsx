import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import BlochScene from "./BlochScene";
import {
  PUZZLES,
  STANDARD_GATES,
  blochVector,
  evaluatePuzzle,
  formatAngles,
  formatState,
  sequenceStates,
} from "./quantum";
import type { Puzzle, PuzzleResult } from "./quantum";

const GATE_ORDER = ["X", "Y", "Z", "H", "S", "T", "SDG", "TDG"];
const PROGRESS_STORAGE_KEY = "quantum-gate-golf-progress-v1";
const RANK_XP = 250;
const HINT_COST = 220;
const AUDIO_VOLUME_MULTIPLIER = 2;
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

type GameView = "levels" | "play" | "complete";

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
};

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
  const revealedRunKeyRef = useRef("");
  const activeRunRef = useRef<ActiveRun | null>(null);
  const runTokenRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const puzzle = PUZZLES.find((item) => item.id === puzzleId) ?? PUZZLES[0];
  const puzzleIndex = Math.max(0, PUZZLES.findIndex((item) => item.id === puzzle.id));
  const allowedGateSet = useMemo(() => new Set(puzzle.allowedGates ?? GATE_ORDER), [puzzle]);
  const gateLimitReached = sequence.length >= puzzle.gateLimit;
  const gateUsageText = `${sequence.length}/${puzzle.gateLimit} gates used`;
  const visibleGateOrder = GATE_ORDER.filter((gateName) => allowedGateSet.has(gateName));
  const states = useMemo(() => sequenceStates(displaySequence), [displaySequence]);
  const keyVectors = useMemo(() => states.map(blochVector), [states]);
  const result = useMemo(() => evaluatePuzzle(puzzle, displaySequence), [puzzle, displaySequence]);
  const solved = resultRevealed && result.fidelity >= 0.999;
  const statusText = solved
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
  const firstUnsolvedIndex = PUZZLES.findIndex((item) => !progress[item.id]?.solved);
  const unlockedThrough = firstUnsolvedIndex === -1 ? PUZZLES.length - 1 : firstUnsolvedIndex;
  const nextPuzzle = firstUnsolvedIndex === -1 ? PUZZLES[0] : PUZZLES[firstUnsolvedIndex];
  const nextLevel = PUZZLES[puzzleIndex + 1];
  const finalPuzzleId = PUZZLES[PUZZLES.length - 1]?.id;

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

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

  const gateSymbol = (gateName: string) => STANDARD_GATES[gateName]?.symbol ?? gateName;

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
    const nextIndex = PUZZLES.findIndex((item) => item.id === nextPuzzleId);
    if (nextIndex > unlockedThrough) {
      return;
    }

    setPuzzleId(nextPuzzleId);
    setView("play");
    clearRun("Build circuit");
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
    setAnimationLabel(`Hint added: ${STANDARD_GATES[gateName]?.symbol ?? gateName}`);
    return true;
  };

  const buyGateHint = () => {
    if (isRunning || puzzle.solution.length === 0) {
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
    clearRun("Reset to |0\u27e9");
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
    if (activeRun.result.fidelity < 0.999) {
      playLoss();
      return;
    }

    if (activeRun.puzzle.id === finalPuzzleId) {
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
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    activeRunRef.current = {
      token,
      puzzle,
      sequence: runSequence,
      result: evaluatePuzzle(puzzle, runSequence),
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
      result: evaluatePuzzle(puzzle, replaySequence),
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

    if (activeRun.result.fidelity >= 0.999 && activeRun.puzzle.id === finalPuzzleId) {
      activeRunRef.current = null;
      setView("complete");
    }
  };

  const readoutValue = (value: string) => (resultRevealed ? value : "--");

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
      <div className={`circuitBoard ${sequence.length === 0 ? "empty" : ""}`}>
        <span className="circuitKet">{"|0\u27e9"}</span>
        <div className={`circuitWire ${sequence.length > 0 ? "filled" : ""}`} aria-label="Current gate sequence">
          {sequence.length === 0 ? (
            <span className="circuitEmpty">add gates</span>
          ) : (
            sequence.map((gateName, index) => (
              <span
                className={`circuitGateUnit ${draggedGateIndex === index ? "dragging" : ""}`}
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
                <span className="circuitGate">{gateSymbol(gateName)}</span>
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
        <span className="circuitKet">{"|\u03c8\u27e9"}</span>
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
        unlockedThrough={unlockedThrough}
        nextPuzzle={nextPuzzle}
        startPuzzle={startPuzzle}
        resetProgress={resetProgress}
        showCompletion={() => { playClick(); setView("complete"); }}
      />
    );
  }

  return (
    <div className="appShell playMode">
      <main className="sceneStage">
        <BlochScene
          keyVectors={keyVectors}
          gateSequence={displaySequence}
          targetVector={result.targetBloch}
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
          <span className={`statusPill ${solved ? "solved" : resultRevealed ? "failed" : isRunning ? "running" : ""}`}>
            {statusText}
          </span>
          <h1>{puzzle.title}</h1>
          <p>Choose gates that move the starting state to the target on the Bloch sphere.</p>
          <p className="objectiveMeta">Gate limit: {puzzle.gateLimit} {puzzle.gateLimit === 1 ? "gate" : "gates"}.</p>
          {puzzle.gateSetLabel ? <p className="gateSetMeta">Gate set: {puzzle.gateSetLabel}</p> : null}
          {solved && nextLevel ? (
            <button type="button" className="primaryButton compactButton" onClick={() => startPuzzle(nextLevel.id)}>
              Next level
            </button>
          ) : null}
        </section>

        {renderCircuitPanel("desktopCircuit")}


        <section className="floatingPanel readoutPanel" aria-label="Current result">
          <div>
            <span>Fidelity</span>
            <strong>{readoutValue(`${(result.fidelity * 100).toFixed(2)}%`)}</strong>
          </div>
          <div>
            <span>Error</span>
            <strong>{readoutValue(`${result.angularErrorDegrees.toFixed(1)} deg`)}</strong>
          </div>
          <div>
            <span>Score</span>
            <strong>{readoutValue(String(result.score))}</strong>
          </div>
        </section>
      </main>

      <aside className="controlPanel">
        <div className="panelHeader gamePanelHeader">
          <p className="eyebrow">Qubit Golf</p>
          <button type="button" className="menuButton" onClick={() => { playClick(); setView("levels"); }}>
            Main menu
          </button>
          <h2>Gate controls</h2>
          <div className="panelLevelMeta">
            <span>Level {puzzleIndex + 1} of {PUZZLES.length}</span>
          </div>
        </div>

        {renderCircuitPanel("mobileCircuit")}

        <section className="panelSection gatesSection">
          <div className="sectionHeader">
            <h3>Gates</h3>
            <button type="button" className="textButton" onClick={replay} disabled={displaySequence.length === 0 || isRunning}>
              Replay
            </button>
          </div>
          <p className="gateSetNote">{puzzle.gateSetLabel ?? "All gates available"} - {gateUsageText}</p>
          <div className="gateGrid">
            {visibleGateOrder.map((gateName) => (
              <button
                key={gateName}
                type="button"
                className={`gateButton ${gateLimitReached ? "limitGate" : ""}`}
                onClick={() => addGate(gateName)}
                disabled={isRunning || gateLimitReached}
              >
                <span>{gateSymbol(gateName)}</span>
                <small>{gateLimitReached ? "Gate limit reached" : STANDARD_GATES[gateName].description}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="panelSection details">
          <h3>Readout</h3>
          <dl>
            <div>
              <dt>Target</dt>
              <dd className="mathReadout">{formatAngles(result.targetBloch)}</dd>
            </div>
            <div>
              <dt>Current</dt>
              <dd className="mathReadout">{resultRevealed ? formatAngles(result.finalBloch) : "Run circuit to reveal."}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{resultRevealed ? formatState(result.finalState) : "Run circuit to reveal."}</dd>
            </div>
          </dl>
        </section>

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
  unlockedThrough,
  nextPuzzle,
  startPuzzle,
  resetProgress,
  showCompletion,
}: {
  progress: ProgressState;
  totalXp: number;
  availableXp: number;
  spentXp: number;
  rank: number;
  xpIntoRank: number;
  unlockedThrough: number;
  nextPuzzle: Puzzle;
  startPuzzle: (puzzleId: string) => void;
  resetProgress: () => void;
  showCompletion: () => void;
}) {
  const completedCount = PUZZLES.filter((item) => progress[item.id]?.solved).length;
  const allLevelsComplete = completedCount === PUZZLES.length;
  const xpPercent = Math.round((xpIntoRank / RANK_XP) * 100);

  return (
    <main className="levelSelectScreen">
      <section className="levelHero">
        <div className="levelHeroCopy">
          <h1>QUBIT GOLF</h1>
          <p>
            Clear each target with short quantum circuits. New levels unlock as you solve the previous one.
          </p>
          <button type="button" className="primaryButton" onClick={() => allLevelsComplete ? showCompletion() : startPuzzle(nextPuzzle.id)}>
            {allLevelsComplete ? "View certificate" : `Continue: ${nextPuzzle.title}`}
          </button>
        </div>

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
      </section>

      <section className="levelCardGrid" aria-label="Levels">
        {PUZZLES.map((item, index) => {
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
              aria-label={locked ? `Level ${index + 1} locked` : `${action} Level ${index + 1}: ${item.title}`}
            >
              <div className="levelCardTopline">
                <span>Level {index + 1}</span>
                <strong>{locked ? "Locked" : record?.solved ? "Cleared" : "Open"}</strong>
              </div>
              <h2>{item.title}</h2>
              <p>Gate limit: {item.gateLimit} {item.gateLimit === 1 ? "gate" : "gates"}.</p>
              {item.gateSetLabel ? <p className="levelGateSet">{item.gateSetLabel}</p> : null}
              <div className="levelCardStats">
                <span>{record?.solved ? `Best: ${record.bestScore}` : `${xpForPuzzle(item, item.gateLimit)} XP`}</span>
                <span>{record?.bestGates ? `${record.bestGates} gates` : "No run yet"}</span>
              </div>
            </button>
          );
        })}
      </section>
    </main>
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





