import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
import type { Puzzle } from "./quantum";

const GATE_ORDER = ["X", "Y", "Z", "H", "S", "T", "SDG", "TDG"];
const PROGRESS_STORAGE_KEY = "quantum-gate-golf-progress-v1";
const RANK_XP = 250;
const CELEBRATION_BITS = Array.from({ length: 18 }, (_, index) => ({
  delay: `${(index % 6) * 70}ms`,
  rotation: `${index * 37}deg`,
  x: `${Math.cos((index / 18) * Math.PI * 2) * (70 + (index % 3) * 26)}px`,
  y: `${Math.sin((index / 18) * Math.PI * 2) * (50 + (index % 4) * 18)}px`,
}));

type GameView = "levels" | "play";

type LevelRecord = {
  solved: boolean;
  bestScore: number;
  bestGates: number;
  xpAwarded: number;
};

type ProgressState = Record<string, LevelRecord>;

export default function App() {
  const [view, setView] = useState<GameView>("levels");
  const [puzzleId, setPuzzleId] = useState(PUZZLES[0]?.id ?? "plus_x");
  const [sequence, setSequence] = useState<string[]>([]);
  const [replayNonce, setReplayNonce] = useState(0);
  const [animationMode, setAnimationMode] = useState<"to-final" | "replay">("to-final");
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [animationLabel, setAnimationLabel] = useState("Idle");
  const [celebrationNonce, setCelebrationNonce] = useState(0);
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const previousSolvedRef = useRef(false);

  const puzzle = PUZZLES.find((item) => item.id === puzzleId) ?? PUZZLES[0];
  const puzzleIndex = Math.max(0, PUZZLES.findIndex((item) => item.id === puzzle.id));
  const states = useMemo(() => sequenceStates(sequence), [sequence]);
  const keyVectors = useMemo(() => states.map(blochVector), [states]);
  const result = useMemo(() => evaluatePuzzle(puzzle, sequence), [puzzle, sequence]);
  const solved = result.fidelity >= 0.999;
  const totalXp = useMemo(
    () => PUZZLES.reduce((sum, item) => sum + (progress[item.id]?.xpAwarded ?? 0), 0),
    [progress],
  );
  const rank = Math.floor(totalXp / RANK_XP) + 1;
  const xpIntoRank = totalXp % RANK_XP;
  const firstUnsolvedIndex = PUZZLES.findIndex((item) => !progress[item.id]?.solved);
  const unlockedThrough = firstUnsolvedIndex === -1 ? PUZZLES.length - 1 : firstUnsolvedIndex;
  const nextPuzzle = firstUnsolvedIndex === -1 ? PUZZLES[0] : PUZZLES[firstUnsolvedIndex];

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (solved && !previousSolvedRef.current && sequence.length > 0) {
      setCelebrationNonce((current) => current + 1);
      setProgress((current) => {
        const existing = current[puzzle.id];
        const bestGates = Math.min(existing?.bestGates ?? Number.POSITIVE_INFINITY, sequence.length);
        const bestScore = Math.max(existing?.bestScore ?? 0, result.score);
        const xpAwarded = existing?.xpAwarded ?? xpForPuzzle(puzzle, sequence.length);

        return {
          ...current,
          [puzzle.id]: {
            solved: true,
            bestScore,
            bestGates,
            xpAwarded,
          },
        };
      });
    }
    previousSolvedRef.current = solved;
  }, [puzzle.id, puzzle.par, result.score, sequence.length, solved]);

  const clearRun = (label: string) => {
    setSequence([]);
    setShowHint(false);
    setAnimationMode("to-final");
    setShowTrajectory(false);
    setAnimationLabel(label);
    previousSolvedRef.current = false;
    setReplayNonce((current) => current + 1);
  };

  const startPuzzle = (nextPuzzleId: string) => {
    const nextIndex = PUZZLES.findIndex((item) => item.id === nextPuzzleId);
    if (nextIndex > unlockedThrough) {
      return;
    }

    setPuzzleId(nextPuzzleId);
    setView("play");
    clearRun("New target");
  };

  const addGate = (gateName: string) => {
    setSequence((current) => [...current, gateName]);
    setAnimationMode("to-final");
    setShowTrajectory(true);
    setAnimationLabel(`Animating ${gateName}`);
    setReplayNonce((current) => current + 1);
  };

  const undo = () => {
    setSequence((current) => current.slice(0, -1));
    setAnimationMode("to-final");
    setShowTrajectory(false);
    setAnimationLabel("Animating undo");
    previousSolvedRef.current = false;
    setReplayNonce((current) => current + 1);
  };

  const reset = () => {
    clearRun("Reset to |0\u27e9");
  };

  const replay = () => {
    setAnimationMode("replay");
    setShowTrajectory(sequence.length > 0);
    setAnimationLabel(sequence.length === 0 ? "Still at |0\u27e9" : "Replaying sequence");
    setReplayNonce((current) => current + 1);
  };

  const renderCircuitPanel = (className: string) => (
    <section className={`floatingPanel circuitPanel ${className}`} aria-label="Current quantum circuit">
      <div className="sectionHeader circuitHeader">
        <h2>Circuit</h2>
        <div className="inlineActions">
          <button type="button" className="textButton" onClick={undo} disabled={sequence.length === 0}>
            Undo
          </button>
          <button type="button" className="textButton" onClick={reset} disabled={sequence.length === 0}>
            Reset
          </button>
        </div>
      </div>
      <div className={`circuitBoard ${sequence.length === 0 ? "empty" : ""}`}>
        <span className="circuitKet">{"|0\u27e9"}</span>
        <div className="circuitWire" aria-label="Current gate sequence">
          {sequence.length === 0 ? (
            <span className="circuitEmpty">add gates</span>
          ) : (
            sequence.map((gateName, index) => (
              <span className="circuitGate" key={`${gateName}-${index}`}>
                {gateName}
              </span>
            ))
          )}
        </div>
        <span className="circuitKet">{"|\u03c8\u27e9"}</span>
      </div>
    </section>
  );

  if (view === "levels") {
    return (
      <LevelSelectScreen
        progress={progress}
        totalXp={totalXp}
        rank={rank}
        xpIntoRank={xpIntoRank}
        unlockedThrough={unlockedThrough}
        nextPuzzle={nextPuzzle}
        startPuzzle={startPuzzle}
      />
    );
  }

  return (
    <div className="appShell playMode">
      <main className="sceneStage">
        <BlochScene
          keyVectors={keyVectors}
          targetVector={result.targetBloch}
          animationMode={animationMode}
          showTrajectory={showTrajectory}
          solved={solved}
          celebrationNonce={celebrationNonce}
          replayNonce={replayNonce}
          onAnimationComplete={() => setAnimationLabel("Idle")}
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
          <span className={`statusPill ${solved ? "solved" : ""}`}>{solved ? "Solved" : "In progress"}</span>
          <h1>{puzzle.title}</h1>
          <p>Match the red target with as few gates as you can.</p>
          <p className="objectiveMeta">Optimized solution: {puzzle.par} {puzzle.par === 1 ? "gate" : "gates"}.</p>
        </section>

        {renderCircuitPanel("desktopCircuit")}

        <section className="floatingPanel motionPanel" aria-label="Animation status">
          <span>Motion</span>
          <strong>{animationLabel}</strong>
        </section>

        <section className="floatingPanel readoutPanel" aria-label="Current result">
          <div>
            <span>Fidelity</span>
            <strong>{(result.fidelity * 100).toFixed(2)}%</strong>
          </div>
          <div>
            <span>Error</span>
            <strong>{result.angularErrorDegrees.toFixed(1)} deg</strong>
          </div>
          <div>
            <span>Score</span>
            <strong>{result.score}</strong>
          </div>
        </section>
      </main>

      <aside className="controlPanel">
        <div className="panelHeader gamePanelHeader">
          <button type="button" className="textButton levelBackButton" onClick={() => setView("levels")}>
            Levels
          </button>
          <p className="eyebrow">Quantum Gate Golf</p>
          <h2>Gate controls</h2>
          <div className="panelLevelMeta">
            <span>Level {puzzleIndex + 1} of {PUZZLES.length}</span>
            <strong>Rank {rank} / {totalXp} XP</strong>
          </div>
        </div>

        {renderCircuitPanel("mobileCircuit")}

        <section className="panelSection gatesSection">
          <div className="sectionHeader">
            <h3>Gates</h3>
            <button type="button" className="textButton" onClick={replay}>
              Replay
            </button>
          </div>
          <div className="gateGrid">
            {GATE_ORDER.map((gateName) => (
              <button key={gateName} type="button" className="gateButton" onClick={() => addGate(gateName)}>
                <span>{gateName}</span>
                <small>{STANDARD_GATES[gateName].description}</small>
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
              <dd className="mathReadout">{formatAngles(result.finalBloch)}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{formatState(result.finalState)}</dd>
            </div>
          </dl>
        </section>

        <section className="panelSection hintBox">
          <div className="sectionHeader">
            <h3>Hint</h3>
            <button type="button" className="textButton" onClick={() => setShowHint((current) => !current)}>
              {showHint ? "Hide" : "Show"}
            </button>
          </div>
          {showHint ? <p>{puzzle.hint}</p> : null}
        </section>
      </aside>
    </div>
  );
}

function LevelSelectScreen({
  progress,
  totalXp,
  rank,
  xpIntoRank,
  unlockedThrough,
  nextPuzzle,
  startPuzzle,
}: {
  progress: ProgressState;
  totalXp: number;
  rank: number;
  xpIntoRank: number;
  unlockedThrough: number;
  nextPuzzle: Puzzle;
  startPuzzle: (puzzleId: string) => void;
}) {
  const completedCount = PUZZLES.filter((item) => progress[item.id]?.solved).length;
  const xpPercent = Math.round((xpIntoRank / RANK_XP) * 100);

  return (
    <main className="levelSelectScreen">
      <section className="levelHero">
        <div className="levelHeroCopy">
          <p className="eyebrow">Quantum Gate Golf</p>
          <h1>Pick a gate challenge</h1>
          <p>
            Clear each target with short quantum circuits. New levels unlock as you solve the previous one.
          </p>
          <button type="button" className="primaryButton" onClick={() => startPuzzle(nextPuzzle.id)}>
            Continue: {nextPuzzle.title}
          </button>
        </div>

        <div className="xpCard" aria-label="Player progress">
          <span>Rank {rank}</span>
          <strong>{totalXp} XP</strong>
          <div className="xpBar" aria-hidden="true">
            <span style={{ width: `${xpPercent}%` }} />
          </div>
          <p>{xpIntoRank} / {RANK_XP} XP to next rank</p>
          <small>{completedCount} / {PUZZLES.length} levels cleared</small>
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
              <p>Optimized solution: {item.par} {item.par === 1 ? "gate" : "gates"}.</p>
              <div className="levelCardStats">
                <span>{record?.solved ? `Best: ${record.bestScore}` : `${xpForPuzzle(item, item.par)} XP`}</span>
                <span>{record?.bestGates ? `${record.bestGates} gates` : "No run yet"}</span>
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function xpForPuzzle(puzzle: Puzzle, gateCount: number): number {
  const efficiencyBonus = Math.max(0, puzzle.par + 2 - gateCount) * 15;
  return 100 + puzzle.par * 35 + efficiencyBonus;
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
    if (!validIds.has(id) || !record?.solved) {
      continue;
    }

    sanitized[id] = {
      solved: true,
      bestScore: numberOrZero(record.bestScore),
      bestGates: Math.max(1, numberOrZero(record.bestGates)),
      xpAwarded: numberOrZero(record.xpAwarded),
    };
  }

  return sanitized;
}

function numberOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
