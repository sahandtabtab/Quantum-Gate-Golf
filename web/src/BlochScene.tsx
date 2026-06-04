import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gateRotation, rotateBlochVector, slerpUnit, smoothstep, type Vec3 } from "./quantum";

type BlochSceneProps = {
  keyVectors: Vec3[];
  probeKeyVectors?: Vec3[][];
  gateSequence: string[];
  targetVector: Vec3 | null;
  animationMode: "to-final" | "replay";
  showTrajectory: boolean;
  solved: boolean;
  celebrationNonce: number;
  replayNonce: number;
  onAnimationNearEnd: () => void;
  onAnimationComplete: () => void;
};

type BlochVectorParts = {
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  spin: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  shaftRadius: number;
  headLength: number;
  headDiameter: number;
};

type ProbeStyle = {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  trailColor: number;
};

type ProbeRuntime = {
  keyVectors: Vec3[];
  trailKeyVectors: Vec3[];
  animationPath: Vec3[];
  displayedVector: Vec3;
};

const NORTH_POLE: Vec3 = [0, 0, 1];
const DISPLAY_RADIUS = 0.74;
const VECTOR_UP = new THREE.Vector3(0, 1, 0);
const GATE_TRAJECTORY_SAMPLES = 36;
const REPLAY_MIN_DURATION_MS = 2400;
const REPLAY_GATE_DURATION_MS = 1500;
const SETTLE_MIN_DURATION_MS = 900;
const SETTLE_STEP_DURATION_MS = 650;
const PROBE_STYLES: ProbeStyle[] = [
  { color: 0x00a7d8, emissive: 0x00a7d8, emissiveIntensity: 0.16, trailColor: 0x11d5ff },
  { color: 0xffd391, emissive: 0xffb84d, emissiveIntensity: 0.18, trailColor: 0xffd391 },
  { color: 0x79f0bf, emissive: 0x1cab76, emissiveIntensity: 0.16, trailColor: 0x79f0bf },
];

export default function BlochScene({
  keyVectors,
  probeKeyVectors,
  gateSequence,
  targetVector,
  animationMode,
  showTrajectory,
  solved,
  celebrationNonce,
  replayNonce,
  onAnimationNearEnd,
  onAnimationComplete,
}: BlochSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const probeRuntimesRef = useRef<ProbeRuntime[]>(
    createProbeRuntimes(activeProbeSets(keyVectors, probeKeyVectors), [], animationMode, gateSequence),
  );
  const targetVectorRef = useRef<Vec3 | null>(targetVector);
  const solvedRef = useRef(solved);
  const celebrationStartRef = useRef(0);
  const animationModeRef = useRef(animationMode);
  const showTrajectoryRef = useRef(showTrajectory);
  const gateSequenceRef = useRef(gateSequence);
  const onAnimationNearEndRef = useRef(onAnimationNearEnd);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const replayNonceRef = useRef(replayNonce);
  const durationRef = useRef(900);
  const progressRef = useRef(1);
  const lastFrameTimeRef = useRef(0);
  const nearEndNotifiedRef = useRef(true);
  const completionNotifiedRef = useRef(true);
  const sceneObjectsRef = useRef<{
    stateVectors: BlochVectorParts[];
    targetVector: BlochVectorParts;
    trailMeshes: THREE.Mesh[];
  } | null>(null);

  useEffect(() => {
    onAnimationNearEndRef.current = onAnimationNearEnd;
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationNearEnd, onAnimationComplete]);

  useEffect(() => {
    solvedRef.current = solved;
  }, [solved]);

  useEffect(() => {
    const probeSets = activeProbeSets(keyVectors, probeKeyVectors);
    targetVectorRef.current = targetVector;
    animationModeRef.current = animationMode;
    showTrajectoryRef.current = showTrajectory;
    gateSequenceRef.current = gateSequence;
    replayNonceRef.current = replayNonce;
    probeRuntimesRef.current = createProbeRuntimes(
      probeSets,
      probeRuntimesRef.current,
      animationMode,
      gateSequence,
    );
    const primaryPath = probeRuntimesRef.current[0]?.animationPath ?? [NORTH_POLE];
    const gateCount = animationMode === "replay" && gateSequence.length > 0
      ? gateSequence.length
      : Math.max(1, primaryPath.length - 1);
    durationRef.current = animationMode === "replay"
      ? Math.max(REPLAY_MIN_DURATION_MS, gateCount * REPLAY_GATE_DURATION_MS)
      : Math.max(SETTLE_MIN_DURATION_MS, gateCount * SETTLE_STEP_DURATION_MS);
    progressRef.current = 0;
    lastFrameTimeRef.current = 0;
    nearEndNotifiedRef.current = false;
    completionNotifiedRef.current = false;
    updateTarget();
  }, [animationMode, gateSequence, keyVectors, probeKeyVectors, replayNonce, showTrajectory, targetVector]);

  useEffect(() => {
    if (celebrationNonce > 0) {
      celebrationStartRef.current = performance.now();
    }
  }, [celebrationNonce]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(2.95, 2.15, 2.75);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setClearColor(0x071319, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2.4;
    controls.maxDistance = 6;
    controls.rotateSpeed = 0.8;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(2.5, 3, 4);
    scene.add(keyLight);

    scene.add(createSphere());
    scene.add(createAxes());
    scene.add(createAxisLabels());

    const stateVectors = PROBE_STYLES.map((style) => createBlochVector({
      color: style.color,
      emissive: style.emissive,
      emissiveIntensity: style.emissiveIntensity,
      shaftRadius: 0.018,
      headLength: 0.12,
      headDiameter: 0.07,
    }));
    const targetVectorObject = createBlochVector({
      color: 0xff3f5f,
      emissive: 0xff3f5f,
      emissiveIntensity: 0.22,
      shaftRadius: 0.016,
      headLength: 0.11,
      headDiameter: 0.06,
    });
    const trailMeshes = PROBE_STYLES.map((style) => {
      const trailMesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: style.trailColor,
          transparent: true,
          opacity: 0.94,
          depthTest: false,
        }),
      );
      trailMesh.renderOrder = 8;
      return trailMesh;
    });

    trailMeshes.forEach((trailMesh) => scene.add(trailMesh));
    scene.add(targetVectorObject.group);
    stateVectors.forEach((stateVector) => scene.add(stateVector.group));
    sceneObjectsRef.current = { stateVectors, targetVector: targetVectorObject, trailMeshes };
    updateTarget();

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frameId = 0;
    const render = (time: number) => {
      updateAnimatedState(time);
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material?.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  function updateTarget() {
    const objects = sceneObjectsRef.current;
    if (!objects) {
      return;
    }
    if (!targetVectorRef.current) {
      objects.targetVector.group.visible = false;
      return;
    }

    objects.targetVector.group.visible = true;
    updateBlochVector(objects.targetVector, targetVectorRef.current);
  }

  function updateAnimatedState(time: number) {
    const objects = sceneObjectsRef.current;
    if (!objects) {
      return;
    }
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
    }
    progressRef.current = Math.min(1, Math.max(0, (time - lastFrameTimeRef.current) / durationRef.current));
    const progress = progressRef.current;

    objects.stateVectors.forEach((stateVector, index) => {
      const runtime = probeRuntimesRef.current[index];
      const trailMesh = objects.trailMeshes[index];
      if (!runtime) {
        stateVector.group.visible = false;
        trailMesh.geometry.dispose();
        trailMesh.geometry = new THREE.BufferGeometry();
        return;
      }

      const current = currentAnimatedVector(
        runtime.animationPath,
        progress,
        animationModeRef.current,
        gateSequenceRef.current,
        runtime.trailKeyVectors[0] ?? NORTH_POLE,
      );
      runtime.displayedVector = current;
      updateBlochVector(stateVector, current);

      trailMesh.geometry.dispose();
      if (showTrajectoryRef.current) {
        const trailPoints = buildDisplayedTrail(
          runtime.trailKeyVectors,
          runtime.animationPath,
          progress,
          animationModeRef.current,
          gateSequenceRef.current,
        );
        trailMesh.geometry = createTrailGeometry(trailPoints.map(toDisplayVector3));
      } else {
        trailMesh.geometry = new THREE.BufferGeometry();
      }
    });

    updateTargetPulse(objects.targetVector, time);

    if (animationModeRef.current === "replay" && progress >= 0.86 && !nearEndNotifiedRef.current) {
      nearEndNotifiedRef.current = true;
      onAnimationNearEndRef.current();
    }

    if (animationModeRef.current === "replay" && progress >= 1 && !completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      onAnimationCompleteRef.current();
    }
  }

  function updateTargetPulse(targetParts: BlochVectorParts, time: number) {
    const celebrationAge = time - celebrationStartRef.current;
    const celebrationPulse =
      celebrationStartRef.current > 0 && celebrationAge < 1400
        ? Math.sin((celebrationAge / 1400) * Math.PI)
        : 0;
    const idlePulse = solvedRef.current ? 0.12 * Math.sin(time / 130) : 0;
    const scale = 1 + Math.max(0, celebrationPulse) * 1.3 + idlePulse;
    targetParts.spin.scale.setScalar(scale);

    for (const material of targetParts.materials) {
      material.emissiveIntensity = solvedRef.current ? 0.75 + Math.max(0, celebrationPulse) * 1.1 : 0.22;
    }
  }

  return <div className="sceneMount" data-testid="bloch-scene" ref={mountRef} />;
}

function activeProbeSets(primaryKeyVectors: Vec3[], probeKeyVectors: Vec3[][] | undefined): Vec3[][] {
  const sets = probeKeyVectors?.length ? probeKeyVectors : [primaryKeyVectors];
  return sets.slice(0, PROBE_STYLES.length).map(safeKeyVectorSet);
}

function createProbeRuntimes(
  probeSets: Vec3[][],
  previousRuntimes: ProbeRuntime[],
  mode: "to-final" | "replay",
  gateSequence: string[],
): ProbeRuntime[] {
  return probeSets.map((keyVectorSet, index) => {
    const keyVectors = safeKeyVectorSet(keyVectorSet);
    const previousDisplayed = previousRuntimes[index]?.displayedVector ?? keyVectors[keyVectors.length - 1] ?? NORTH_POLE;
    return {
      keyVectors,
      trailKeyVectors: keyVectors,
      animationPath: nextAnimationPath(keyVectors, previousDisplayed, mode, gateSequence),
      displayedVector: previousDisplayed,
    };
  });
}

function safeKeyVectorSet(vectors: Vec3[] | undefined): Vec3[] {
  return vectors && vectors.length > 0 ? vectors : [NORTH_POLE];
}

function createSphere(): THREE.Group {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(DISPLAY_RADIUS, 72, 36),
    new THREE.MeshPhysicalMaterial({
      color: 0x8ddbe5,
      roughness: 0.28,
      transmission: 0.35,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  group.add(sphere);

  const guideMaterial = new THREE.LineBasicMaterial({ color: 0x68a6b3, transparent: true, opacity: 0.34 });

  for (const latitude of [-60, -30, 0, 30, 60]) {
    const z = Math.sin((latitude * Math.PI) / 180);
    const radius = Math.cos((latitude * Math.PI) / 180);
    group.add(lineFromPoints(circlePoints(radius, z), guideMaterial));
  }

  for (let longitude = 0; longitude < 180; longitude += 30) {
    const angle = (longitude * Math.PI) / 180;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 144; index += 1) {
      const t = (2 * Math.PI * index) / 144;
      points.push(toDisplayVector3([Math.cos(angle) * Math.sin(t), Math.sin(angle) * Math.sin(t), Math.cos(t)]));
    }
    group.add(lineFromPoints(points, guideMaterial));
  }

  return group;
}

function createAxes(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0xa6c9d2, transparent: true, opacity: 0.5 });
  group.add(lineFromPoints([toDisplayVector3([-1.12, 0, 0]), toDisplayVector3([1.12, 0, 0])], material));
  group.add(lineFromPoints([toDisplayVector3([0, -1.12, 0]), toDisplayVector3([0, 1.12, 0])], material));
  group.add(lineFromPoints([toDisplayVector3([0, 0, -1.12]), toDisplayVector3([0, 0, 1.12])], material));
  return group;
}

function createAxisLabels(): THREE.Group {
  const group = new THREE.Group();
  const labels: Array<[string, Vec3]> = [
    ["+x", [1.3, 0, 0]],
    ["-x", [-1.3, 0, 0]],
    ["+y", [0, 1.3, 0]],
    ["-y", [0, -1.3, 0]],
    ["|0⟩", [0, 0, 1.34]],
    ["|1⟩", [0, 0, -1.34]],
  ];

  for (const [label, position] of labels) {
    const sprite = createTextSprite(label);
    sprite.position.copy(toDisplayVector3(position));
    group.add(sprite);
  }

  return group;
}

function createBlochVector({
  color,
  emissive,
  emissiveIntensity,
  shaftRadius,
  headLength,
  headDiameter,
}: {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  shaftRadius: number;
  headLength: number;
  headDiameter: number;
}): BlochVectorParts {
  const group = new THREE.Group();
  const materials = [
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.32, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.25, metalness: 0.06 }),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissiveIntensity + 0.1, roughness: 0.22, metalness: 0.04 }),
  ];
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), materials[0]);
  const head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32), materials[1]);
  const spin = new THREE.Mesh(new THREE.SphereGeometry(headDiameter / 2, 24, 12), materials[2]);

  shaft.renderOrder = 9;
  head.renderOrder = 10;
  spin.renderOrder = 11;
  group.add(shaft, head, spin);

  return { group, shaft, head, spin, materials, shaftRadius, headLength, headDiameter };
}

function updateBlochVector(parts: BlochVectorParts, vector: Vec3) {
  const target = toDisplayVector3(vector);
  const length = target.length();
  if (length < 0.0001) {
    parts.group.visible = false;
    return;
  }

  parts.group.visible = true;
  parts.group.position.set(0, 0, 0);
  parts.group.quaternion.setFromUnitVectors(VECTOR_UP, target.clone().normalize());

  const spinRadius = parts.headDiameter / 2;
  const bodyLength = Math.max(0, length - spinRadius * 0.55);
  const headLength = Math.min(parts.headLength, bodyLength);
  const shaftLength = Math.max(0, bodyLength - headLength);

  parts.shaft.visible = shaftLength > 0.001;
  parts.shaft.scale.set(parts.shaftRadius, shaftLength, parts.shaftRadius);
  parts.shaft.position.set(0, shaftLength / 2, 0);

  parts.head.visible = headLength > 0.001;
  parts.head.scale.set(parts.headDiameter / 2, headLength, parts.headDiameter / 2);
  parts.head.position.set(0, shaftLength + headLength / 2, 0);

  parts.spin.position.set(0, length, 0);
  parts.spin.scale.setScalar(1);
}

function circlePoints(radius: number, z: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 144; index += 1) {
    const angle = (2 * Math.PI * index) / 144;
    points.push(toDisplayVector3([radius * Math.cos(angle), radius * Math.sin(angle), z]));
  }
  return points;
}

function lineFromPoints(points: THREE.Vector3[], material: THREE.Material): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function createTrailGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const movingPoints = removeNearDuplicates(points);
  if (movingPoints.length < 2) {
    return new THREE.BufferGeometry();
  }

  const curve = new THREE.CatmullRomCurve3(movingPoints);
  return new THREE.TubeGeometry(curve, Math.max(12, movingPoints.length * 3), 0.012, 10, false);
}

function removeNearDuplicates(points: THREE.Vector3[]): THREE.Vector3[] {
  const filtered: THREE.Vector3[] = [];
  for (const point of points) {
    const previous = filtered[filtered.length - 1];
    if (!previous || previous.distanceToSquared(point) > 0.000001) {
      filtered.push(point);
    }
  }
  return filtered;
}

function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Sprite();
  }

  context.font = "700 42px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#d8f5ff";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(0.44, 0.22, 1);
  return sprite;
}

function nextAnimationPath(
  keyVectors: Vec3[],
  displayedVector: Vec3,
  mode: "to-final" | "replay",
  gateSequence: string[],
): Vec3[] {
  if (mode === "replay" && gateSequence.length > 0) {
    return buildGateRotationPath(keyVectors[0] ?? NORTH_POLE, gateSequence);
  }

  const finalVector = keyVectors[keyVectors.length - 1] ?? displayedVector;
  return [safeVector(displayedVector), safeVector(finalVector)];
}

function buildGateRotationPath(startVector: Vec3, gateSequence: string[]): Vec3[] {
  const path = [safeVector(startVector)];
  let current = safeVector(startVector);

  for (const gateName of gateSequence) {
    const rotation = gateRotation(gateName);
    const gateStart = current;
    for (let sample = 1; sample <= GATE_TRAJECTORY_SAMPLES; sample += 1) {
      path.push(rotateBlochVector(gateStart, rotation, sample / GATE_TRAJECTORY_SAMPLES));
    }
    current = path[path.length - 1];
  }

  return path;
}

function currentAnimatedVector(
  path: Vec3[],
  progress: number,
  mode: "to-final" | "replay",
  gateSequence: string[],
  startVector: Vec3,
): Vec3 {
  if (mode === "replay" && gateSequence.length > 0) {
    return currentGateRotationVector(startVector, gateSequence, progress);
  }

  return currentVector(path, progress);
}

function currentGateRotationVector(startVector: Vec3, gateSequence: string[], progress: number): Vec3 {
  let current = safeVector(startVector);
  const scaledProgress = clamp01(progress) * gateSequence.length;
  const activeGateIndex = Math.min(gateSequence.length - 1, Math.floor(scaledProgress));
  const localProgress = smoothstep(scaledProgress - activeGateIndex);

  for (let index = 0; index < activeGateIndex; index += 1) {
    current = rotateBlochVector(current, gateRotation(gateSequence[index]), 1);
  }

  return rotateBlochVector(current, gateRotation(gateSequence[activeGateIndex]), localProgress);
}

function buildGateRotationTrail(startVector: Vec3, gateSequence: string[], progress: number): Vec3[] {
  const points = [safeVector(startVector)];
  const scaledProgress = clamp01(progress) * gateSequence.length;
  const activeGateIndex = Math.min(gateSequence.length - 1, Math.floor(scaledProgress));
  let current = safeVector(startVector);

  for (let index = 0; index <= activeGateIndex; index += 1) {
    const rotation = gateRotation(gateSequence[index]);
    const gateStart = current;
    const endAmount = index === activeGateIndex ? scaledProgress - activeGateIndex : 1;
    const samples = Math.max(2, Math.ceil(GATE_TRAJECTORY_SAMPLES * Math.max(endAmount, 0.05)));

    for (let sample = 1; sample <= samples; sample += 1) {
      const amount = endAmount * (sample / samples);
      points.push(rotateBlochVector(gateStart, rotation, smoothstep(amount)));
    }

    current = rotateBlochVector(gateStart, rotation, endAmount);
  }

  return points;
}

function buildDisplayedTrail(
  keyVectors: Vec3[],
  animationPath: Vec3[],
  progress: number,
  mode: "to-final" | "replay",
  gateSequence: string[],
): Vec3[] {
  if (mode === "replay" && gateSequence.length > 0) {
    return buildGateRotationTrail(keyVectors[0] ?? NORTH_POLE, gateSequence, progress);
  }

  if (mode === "replay") {
    return buildTrail(animationPath, progress);
  }

  if (keyVectors.length < 2) {
    return [];
  }

  const completedKeyVectors = keyVectors.slice(0, -1);
  const finalVector = keyVectors[keyVectors.length - 1];
  const current = currentVector(animationPath, progress);
  const trailPoints =
    completedKeyVectors.length > 1 ? buildTrail(completedKeyVectors, 1) : [completedKeyVectors[0]];
  const segmentStart = completedKeyVectors[completedKeyVectors.length - 1] ?? finalVector;
  const samples = 18;

  for (let sample = 1; sample <= samples; sample += 1) {
    const amount = sample / samples;
    trailPoints.push(slerpUnit(segmentStart, current, smoothstep(amount)));
  }

  return trailPoints;
}

function currentVector(path: Vec3[], progress: number): Vec3 {
  if (path.length === 0) {
    return NORTH_POLE;
  }

  if (path.length === 1) {
    return path[0];
  }

  const segmentCount = path.length - 1;
  const scaledProgress = progress * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaledProgress));
  const localProgress = smoothstep(scaledProgress - segmentIndex);
  return slerpUnit(safeVector(path[segmentIndex]), safeVector(path[segmentIndex + 1]), localProgress);
}

function buildTrail(path: Vec3[], progress: number): Vec3[] {
  if (path.length === 0) {
    return [NORTH_POLE];
  }

  if (path.length === 1) {
    return [path[0]];
  }

  const segmentCount = path.length - 1;
  const scaledProgress = progress * segmentCount;
  const activeSegment = Math.min(segmentCount - 1, Math.floor(scaledProgress));
  const localProgress = scaledProgress - activeSegment;
  const points: Vec3[] = [];

  for (let segment = 0; segment <= activeSegment; segment += 1) {
    const start = safeVector(path[segment]);
    const end = safeVector(path[segment + 1] ?? start);
    const endAmount = segment === activeSegment ? localProgress : 1;
    const samples = Math.max(2, Math.ceil(endAmount * 4));
    for (let sample = 0; sample <= samples; sample += 1) {
      const amount = samples === 0 ? 0 : endAmount * (sample / samples);
      points.push(slerpUnit(start, end, smoothstep(amount)));
    }
  }

  return points;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function safeVector(vector: Vec3 | undefined): Vec3 {
  if (
    !vector ||
    !Number.isFinite(vector[0]) ||
    !Number.isFinite(vector[1]) ||
    !Number.isFinite(vector[2])
  ) {
    return NORTH_POLE;
  }
  return vector;
}

function toDisplayVector3(vector: Vec3): THREE.Vector3 {
  return new THREE.Vector3(
    DISPLAY_RADIUS * vector[0],
    DISPLAY_RADIUS * vector[2],
    DISPLAY_RADIUS * vector[1],
  );
}