import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { slerpUnit, smoothstep, type Vec3 } from "./quantum";

type BlochSceneProps = {
  keyVectors: Vec3[];
  targetVector: Vec3;
  animationMode: "to-final" | "replay";
  showTrajectory: boolean;
  solved: boolean;
  celebrationNonce: number;
  replayNonce: number;
  onAnimationComplete: () => void;
};

const ORIGIN = new THREE.Vector3(0, 0, 0);
const NORTH_POLE: Vec3 = [0, 0, 1];
const DISPLAY_RADIUS = 0.74;
const AXIS_RADIUS = DISPLAY_RADIUS * 1.12;

export default function BlochScene({
  keyVectors,
  targetVector,
  animationMode,
  showTrajectory,
  solved,
  celebrationNonce,
  replayNonce,
  onAnimationComplete,
}: BlochSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const animationPathRef = useRef<Vec3[]>(keyVectors.length > 0 ? keyVectors : [NORTH_POLE]);
  const trailKeyVectorsRef = useRef<Vec3[]>(keyVectors.length > 0 ? keyVectors : [NORTH_POLE]);
  const displayedVectorRef = useRef<Vec3>(keyVectors[keyVectors.length - 1] ?? NORTH_POLE);
  const targetVectorRef = useRef(targetVector);
  const solvedRef = useRef(solved);
  const celebrationStartRef = useRef(0);
  const animationModeRef = useRef(animationMode);
  const showTrajectoryRef = useRef(showTrajectory);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const replayNonceRef = useRef(replayNonce);
  const durationRef = useRef(900);
  const progressRef = useRef(1);
  const lastFrameTimeRef = useRef(0);
  const completionNotifiedRef = useRef(true);
  const sceneObjectsRef = useRef<{
    stateArrow: THREE.ArrowHelper;
    targetArrow: THREE.ArrowHelper;
    targetDot: THREE.Mesh;
    trailMesh: THREE.Mesh;
  } | null>(null);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    targetVectorRef.current = targetVector;
    solvedRef.current = solved;
    trailKeyVectorsRef.current = keyVectors.length > 0 ? keyVectors : [NORTH_POLE];
    animationModeRef.current = animationMode;
    showTrajectoryRef.current = showTrajectory;
    replayNonceRef.current = replayNonce;
    animationPathRef.current = nextAnimationPath(keyVectors, displayedVectorRef.current, animationMode);
    durationRef.current = Math.max(1600, (animationPathRef.current.length - 1) * 1500);
    progressRef.current = 0;
    lastFrameTimeRef.current = 0;
    completionNotifiedRef.current = false;
    updateTarget();
  }, [animationMode, keyVectors, replayNonce, showTrajectory, solved, targetVector]);

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

    const stateArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      ORIGIN,
      DISPLAY_RADIUS,
      0x00a7d8,
      0.12,
      0.07,
    );
    const targetArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      ORIGIN,
      DISPLAY_RADIUS,
      0xff3f5f,
      0.11,
      0.06,
    );
    const targetDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 24, 12),
      new THREE.MeshStandardMaterial({ color: 0xff3f5f, emissive: 0xff3f5f, emissiveIntensity: 0.25 }),
    );
    const trailMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x11d5ff,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
      }),
    );
    trailMesh.renderOrder = 8;

    scene.add(trailMesh);
    scene.add(targetArrow);
    scene.add(targetDot);
    scene.add(stateArrow);
    sceneObjectsRef.current = { stateArrow, targetArrow, targetDot, trailMesh };
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
    const target = toDisplayVector3(targetVectorRef.current);
    objects.targetArrow.setDirection(target.clone().normalize());
    objects.targetArrow.setLength(target.length(), 0.11, 0.06);
    objects.targetDot.position.copy(target);
  }

  function updateAnimatedState(time: number) {
    const objects = sceneObjectsRef.current;
    if (!objects) {
      return;
    }
    const path = animationPathRef.current;
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
    }
    const delta = Math.max(0, Math.min(64, time - lastFrameTimeRef.current));
    lastFrameTimeRef.current = time;
    progressRef.current = Math.min(1, progressRef.current + delta / durationRef.current);
    const progress = progressRef.current;
    const current = currentVector(path, progress);
    const currentThree = toDisplayVector3(current);
    displayedVectorRef.current = current;

    objects.stateArrow.setDirection(currentThree.clone().normalize());
    objects.stateArrow.setLength(currentThree.length(), 0.12, 0.07);
    updateTargetPulse(objects.targetDot, time);

    objects.trailMesh.geometry.dispose();
    if (showTrajectoryRef.current) {
      const trailPoints = buildDisplayedTrail(
        trailKeyVectorsRef.current,
        path,
        progress,
        animationModeRef.current,
      );
      objects.trailMesh.geometry = createTrailGeometry(trailPoints.map(toDisplayVector3));
    } else {
      objects.trailMesh.geometry = new THREE.BufferGeometry();
    }

    if (progress >= 1 && !completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      onAnimationCompleteRef.current();
    }
  }

  function updateTargetPulse(targetDot: THREE.Mesh, time: number) {
    const celebrationAge = time - celebrationStartRef.current;
    const celebrationPulse =
      celebrationStartRef.current > 0 && celebrationAge < 1400
        ? Math.sin((celebrationAge / 1400) * Math.PI)
        : 0;
    const idlePulse = solvedRef.current ? 0.12 * Math.sin(time / 130) : 0;
    const scale = 1 + Math.max(0, celebrationPulse) * 1.3 + idlePulse;
    targetDot.scale.setScalar(scale);

    const material = targetDot.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissiveIntensity = solvedRef.current ? 0.85 + Math.max(0, celebrationPulse) * 1.2 : 0.25;
    }
  }

  return <div className="sceneMount" data-testid="bloch-scene" ref={mountRef} />;
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
    ["|0\u27e9", [0, 0, 1.34]],
    ["|1\u27e9", [0, 0, -1.34]],
  ];

  for (const [label, position] of labels) {
    const sprite = createTextSprite(label);
    sprite.position.copy(toDisplayVector3(position));
    group.add(sprite);
  }

  return group;
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

function nextAnimationPath(keyVectors: Vec3[], displayedVector: Vec3, mode: "to-final" | "replay"): Vec3[] {
  if (mode === "replay" && keyVectors.length > 1) {
    return keyVectors.map(safeVector);
  }

  const finalVector = keyVectors[keyVectors.length - 1] ?? displayedVector;
  return [safeVector(displayedVector), safeVector(finalVector)];
}

function buildDisplayedTrail(
  keyVectors: Vec3[],
  animationPath: Vec3[],
  progress: number,
  mode: "to-final" | "replay",
): Vec3[] {
  if (mode === "replay") {
    return buildTrail(keyVectors, progress);
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
    const samples = Math.max(2, Math.ceil(endAmount * 16));
    for (let sample = 0; sample <= samples; sample += 1) {
      const amount = samples === 0 ? 0 : endAmount * (sample / samples);
      points.push(slerpUnit(start, end, smoothstep(amount)));
    }
  }

  return points;
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
