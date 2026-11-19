import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  PlotPoint,
  RiemannPrism,
  SurfaceIntegralConfig,
  SurfacePlotResult,
} from '@/shared/contracts';
import styles from './Surface3DViewer.module.css';

export interface Surface3DViewerProps {
  result: SurfacePlotResult;
  expression: string;
  xDomain: [number, number];
  yDomain: [number, number];
  zDomain?: [number | undefined, number | undefined];
  integralConfig?: SurfaceIntegralConfig;
  showWireframe?: boolean;
  showContours?: boolean;
}

type CameraPreset = 'iso' | 'top' | 'front' | 'side';

interface SpatialTransform {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zLo: number;
  zHi: number;
  zSpan: number;
  zClampMin?: number;
  zClampMax?: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  mapX: (x: number) => number;
  mapY: (y: number) => number;
  mapZ: (z: number) => number;
}

interface EngineHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  contentGroup: THREE.Group;
  wireframeGroup: THREE.Group;
  contourGroup: THREE.Group;
  requestRender: () => void;
  flyTo: (preset: CameraPreset) => void;
}

const BOX_HALF_XY = 3.2;
const BOX_HALF_Z = 2.2;
const CLIFF_JUMP_RATIO = 0.85;

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { pos: [6.4, -7.1, 5.1], target: [0, 0, -0.05] },
  top: { pos: [0, -0.003, 10.6], target: [0, 0, 0] },
  front: { pos: [0, -10.4, 0.15], target: [0, 0, 0] },
  side: { pos: [10.4, 0, 0.15], target: [0, 0, 0] },
};

const COLOR_STOPS: ReadonlyArray<{ t: number; hex: number }> = [
  { t: 0.0, hex: 0x0d5c4d },
  { t: 0.36, hex: 0x1ea888 },
  { t: 0.7, hex: 0xeab354 },
  { t: 1.0, hex: 0xdf6c4f },
];

function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  if (
    !('WebGLRenderingContext' in window) &&
    !('WebGL2RenderingContext' in window)
  ) {
    return false;
  }
  try {
    const probe = document.createElement('canvas');
    const ctx =
      probe.getContext('webgl2') ??
      probe.getContext('webgl') ??
      probe.getContext('experimental-webgl');
    return Boolean(ctx);
  } catch {
    return false;
  }
}

function formatAxisNumber(val: number): string {
  const clean = Object.is(val, -0) || Math.abs(val) < 1e-12 ? 0 : val;
  if (clean === 0) return '0';
  const abs = Math.abs(clean);
  if (abs >= 1e4 || abs < 1e-3) {
    return clean.toExponential(1).replace('+', '');
  }
  return String(Number(clean.toFixed(2)));
}

function writeElevationColor(
  tRaw: number,
  out: THREE.Color,
  scratchA: THREE.Color,
  scratchB: THREE.Color,
): THREE.Color {
  const t = Math.max(0, Math.min(1, tRaw));
  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    const c0 = COLOR_STOPS[i];
    const c1 = COLOR_STOPS[i + 1];
    if (t <= c1.t || i === COLOR_STOPS.length - 2) {
      const localT =
        c1.t > c0.t ? Math.max(0, Math.min(1, (t - c0.t) / (c1.t - c0.t))) : 0;
      scratchA.setHex(c0.hex);
      scratchB.setHex(c1.hex);
      return out.lerpColors(scratchA, scratchB, localT);
    }
  }
  return out.setHex(COLOR_STOPS[COLOR_STOPS.length - 1].hex);
}

/* Lightweight pure recursive-descent evaluator used only to disambiguate
   grid stride orientation (iy*nx+ix vs ix*ny+iy) on asymmetric surfaces. */
function evalBivariateHint(
  expr: string,
  xVal: number,
  yVal: number,
): number | null {
  let pos = 0;
  const s = expr.replace(/\s+/g, '');
  if (!s) return null;

  const peek = () => (pos < s.length ? s[pos] : '');
  const consume = () => s[pos++];

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return Number.isFinite(left) ? left : null;
  };

  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseUnary();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return Number.isFinite(left) ? left : null;
  };

  const parseUnary = (): number | null => {
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    if (peek() === '-') {
      consume();
      const v = parseUnary();
      return v === null ? null : -v;
    }
    return parsePower();
  };

  const parsePower = (): number | null => {
    const base = parseAtom();
    if (base === null) return null;
    if (peek() === '^') {
      consume();
      const exp = parseUnary();
      if (exp === null) return null;
      const res = Math.pow(base, exp);
      return Number.isFinite(res) ? res : null;
    }
    return base;
  };

  const parseAtom = (): number | null => {
    if (peek() === '(') {
      consume();
      const inner = parseExpr();
      if (peek() !== ')') return null;
      consume();
      return inner;
    }
    const numMatch = s.slice(pos).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (numMatch) {
      pos += numMatch[0].length;
      const n = Number(numMatch[0]);
      return Number.isFinite(n) ? n : null;
    }
    const idMatch = s.slice(pos).match(/^[a-zA-Z_]\w*/);
    if (idMatch) {
      const name = idMatch[0];
      pos += name.length;
      if (peek() === '(') {
        consume();
        const args: number[] = [];
        if (peek() !== ')') {
          const first = parseExpr();
          if (first === null) return null;
          args.push(first);
          while (peek() === ',') {
            consume();
            const next = parseExpr();
            if (next === null) return null;
            args.push(next);
          }
        }
        if (peek() !== ')') return null;
        consume();
        const u = args[0];
        switch (name) {
          case 'sin':
            return Math.sin(u);
          case 'cos':
            return Math.cos(u);
          case 'tan':
            return Math.tan(u);
          case 'asin':
            return Math.abs(u) <= 1 ? Math.asin(u) : null;
          case 'acos':
            return Math.abs(u) <= 1 ? Math.acos(u) : null;
          case 'atan':
            return Math.atan(u);
          case 'atan2':
            return args.length === 2 ? Math.atan2(args[0], args[1]) : null;
          case 'sinh':
            return Math.sinh(u);
          case 'cosh':
            return Math.cosh(u);
          case 'tanh':
            return Math.tanh(u);
          case 'abs':
            return Math.abs(u);
          case 'sqrt':
            return u >= 0 ? Math.sqrt(u) : null;
          case 'cbrt':
            return Math.cbrt(u);
          case 'ln':
          case 'log':
            return u > 0 ? Math.log(u) : null;
          case 'lg':
            return u > 0 ? Math.log10(u) : null;
          case 'exp':
            return Math.exp(u);
          case 'sign':
            return Math.sign(u);
          case 'floor':
            return Math.floor(u);
          case 'ceil':
            return Math.ceil(u);
          case 'min':
            return args.length >= 2 ? Math.min(...args) : u;
          case 'max':
            return args.length >= 2 ? Math.max(...args) : u;
          case 'hypot':
            return Math.hypot(...args);
          default:
            return null;
        }
      }
      if (name === 'x') return xVal;
      if (name === 'y') return yVal;
      if (name === 'pi' || name === 'PI') return Math.PI;
      if (name === 'e' || name === 'E') return Math.E;
    }
    return null;
  };

  const out = parseExpr();
  return pos === s.length && out !== null && Number.isFinite(out) ? out : null;
}

function detectRowMajorOrder(
  result: SurfacePlotResult,
  expression: string,
): boolean {
  const { gridX, gridY, zValues } = result;
  const nx = gridX.length;
  const ny = gridY.length;
  if (nx <= 1 || ny <= 1 || zValues.length < nx * ny) {
    return true;
  }

  const rowAt = (ix: number, iy: number) => zValues[iy * nx + ix];
  const colAt = (ix: number, iy: number) => zValues[ix * ny + iy];

  const probes: Array<[number, number]> = [
    [nx - 1, 0],
    [Math.floor(nx * 0.82), Math.floor(ny * 0.18)],
    [Math.floor(nx * 0.68), Math.floor(ny * 0.31)],
    [Math.floor(nx * 0.25), Math.floor(ny * 0.77)],
  ];

  let allEqual = true;
  for (const [ix, iy] of probes) {
    if (rowAt(ix, iy) !== colAt(ix, iy)) {
      allEqual = false;
      break;
    }
  }
  if (allEqual) return true;

  let rowErr = 0;
  let colErr = 0;
  let compared = 0;

  for (const [ix, iy] of probes) {
    const refZ = evalBivariateHint(expression, gridX[ix], gridY[iy]);
    const rZ = rowAt(ix, iy);
    const cZ = colAt(ix, iy);
    if (refZ !== null && rZ !== null && cZ !== null) {
      rowErr += Math.abs(refZ - rZ);
      colErr += Math.abs(refZ - cZ);
      compared += 1;
    }
  }

  if (compared > 0 && Math.abs(rowErr - colErr) > 1e-5) {
    return rowErr <= colErr;
  }

  return true;
}

function buildSpatialTransform(
  result: SurfacePlotResult,
  xDomain: [number, number],
  yDomain: [number, number],
  zDomain: [number | undefined, number | undefined] | undefined,
): SpatialTransform {
  const xMin = Number.isFinite(xDomain[0]) ? xDomain[0] : -3;
  let xMax = Number.isFinite(xDomain[1]) ? xDomain[1] : 3;
  if (xMax <= xMin) xMax = xMin + 2;

  const yMin = Number.isFinite(yDomain[0]) ? yDomain[0] : -3;
  let yMax = Number.isFinite(yDomain[1]) ? yDomain[1] : 3;
  if (yMax <= yMin) yMax = yMin + 2;

  const zClampMin =
    zDomain?.[0] !== undefined && Number.isFinite(zDomain[0])
      ? zDomain[0]
      : undefined;
  const zClampMax =
    zDomain?.[1] !== undefined && Number.isFinite(zDomain[1])
      ? zDomain[1]
      : undefined;

  let dataLo = Infinity;
  let dataHi = -Infinity;

  for (const v of result.zValues) {
    if (v === null || !Number.isFinite(v)) continue;
    if (zClampMin !== undefined && v < zClampMin) continue;
    if (zClampMax !== undefined && v > zClampMax) continue;
    if (v < dataLo) dataLo = v;
    if (v > dataHi) dataHi = v;
  }

  if (result.integralResult && result.integralResult.prisms.length > 0) {
    dataLo = Math.min(dataLo, 0);
    dataHi = Math.max(dataHi, 0);
    for (const p of result.integralResult.prisms) {
      if (!Number.isFinite(p.z)) continue;
      const cz = Math.max(
        zClampMin ?? -Infinity,
        Math.min(zClampMax ?? Infinity, p.z),
      );
      if (cz < dataLo) dataLo = cz;
      if (cz > dataHi) dataHi = cz;
    }
  }

  if (
    result.probeResult?.z0 !== null &&
    result.probeResult?.z0 !== undefined &&
    Number.isFinite(result.probeResult.z0)
  ) {
    const pz = result.probeResult.z0;
    if (
      (zClampMin === undefined || pz >= zClampMin) &&
      (zClampMax === undefined || pz <= zClampMax)
    ) {
      dataLo = Math.min(dataLo, pz);
      dataHi = Math.max(dataHi, pz);
    }
  }

  if (!Number.isFinite(dataLo) || !Number.isFinite(dataHi)) {
    dataLo = result.zDataMin ?? -2;
    dataHi = result.zDataMax ?? 2;
  }

  let zLo = zClampMin ?? dataLo;
  let zHi = zClampMax ?? dataHi;

  if (!Number.isFinite(zLo) || !Number.isFinite(zHi)) {
    zLo = -2;
    zHi = 2;
  }
  if (zHi - zLo < 1e-5) {
    const pad = Math.max(1, Math.abs(zLo) * 0.25);
    zLo -= pad;
    zHi += pad;
  }

  const xMid = (xMin + xMax) * 0.5;
  const yMid = (yMin + yMax) * 0.5;
  const zMid = (zLo + zHi) * 0.5;

  const xHalf = Math.max((xMax - xMin) * 0.5, 1e-6);
  const yHalf = Math.max((yMax - yMin) * 0.5, 1e-6);
  const zHalf = Math.max((zHi - zLo) * 0.5, 1e-6);

  const scaleX = BOX_HALF_XY / xHalf;
  const scaleY = BOX_HALF_XY / yHalf;
  const scaleZ = BOX_HALF_Z / zHalf;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    zLo,
    zHi,
    zSpan: zHi - zLo,
    zClampMin,
    zClampMax,
    scaleX,
    scaleY,
    scaleZ,
    mapX: (x: number) => (x - xMid) * scaleX,
    mapY: (y: number) => (y - yMid) * scaleY,
    mapZ: (z: number) => (z - zMid) * scaleZ,
  };
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) {
      obj.geometry.dispose();
    }
    if ('material' in obj && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.Material) {
          if ('map' in m && m.map instanceof THREE.Texture) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    }
  });
  while (root.children.length > 0) {
    root.remove(root.children[0]);
  }
}

function createTextSprite(
  text: string,
  color: string,
  options?: { bold?: boolean; scale?: number },
): THREE.Sprite | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontSize = 36;
    const weight = options?.bold ? '700' : '600';
    const font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", sans-serif`;
    ctx.font = font;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    const padX = 24;
    const padY = 14;

    canvas.width = Math.max(64, textWidth + padX * 2);
    canvas.height = fontSize + padY * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(r, 2);
    ctx.lineTo(canvas.width - r, 2);
    ctx.quadraticCurveTo(canvas.width - 2, 2, canvas.width - 2, r);
    ctx.lineTo(canvas.width - 2, canvas.height - r);
    ctx.quadraticCurveTo(
      canvas.width - 2,
      canvas.height - 2,
      canvas.width - r,
      canvas.height - 2,
    );
    ctx.lineTo(r, canvas.height - 2);
    ctx.quadraticCurveTo(2, canvas.height - 2, 2, canvas.height - r);
    ctx.lineTo(2, r);
    ctx.quadraticCurveTo(2, 2, r, 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.52);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const baseScale = options?.scale ?? 0.34;
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(baseScale * aspect, baseScale, 1);
    sprite.renderOrder = 12;
    return sprite;
  } catch {
    return null;
  }
}

function buildCoordinateBoxAndAxes(tf: SpatialTransform): THREE.Group {
  const group = new THREE.Group();
  const bx = BOX_HALF_XY;
  const by = BOX_HALF_XY;
  const bz = BOX_HALF_Z;

  // Architectural bounding box wireframe (excluding colored main axes edges)
  const boxVerts = new Float32Array([
    bx,
    -by,
    -bz,
    bx,
    by,
    -bz,
    bx,
    by,
    -bz,
    -bx,
    by,
    -bz,
    -bx,
    -by,
    bz,
    bx,
    -by,
    bz,
    bx,
    -by,
    bz,
    bx,
    by,
    bz,
    bx,
    by,
    bz,
    -bx,
    by,
    bz,
    -bx,
    by,
    bz,
    -bx,
    -by,
    bz,
    bx,
    -by,
    -bz,
    bx,
    -by,
    bz,
    bx,
    by,
    -bz,
    bx,
    by,
    bz,
    -bx,
    by,
    -bz,
    -bx,
    by,
    bz,
  ]);
  const boxGeo = new THREE.BufferGeometry();
  boxGeo.setAttribute('position', new THREE.BufferAttribute(boxVerts, 3));
  const boxMat = new THREE.LineBasicMaterial({
    color: 0x1e4d40,
    transparent: true,
    opacity: 0.16,
  });
  group.add(new THREE.LineSegments(boxGeo, boxMat));

  const addAxisWithArrow = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    hex: number,
  ) => {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const lineMat = new THREE.LineBasicMaterial({ color: hex });
    group.add(new THREE.Line(lineGeo, lineMat));

    const coneGeo = new THREE.ConeGeometry(0.075, 0.24, 18);
    const coneMat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.35,
      metalness: 0.1,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    const dir = end.clone().sub(start).normalize();
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(cone);
  };

  // X Axis: Coral Red (#d45846)
  addAxisWithArrow(
    new THREE.Vector3(-bx, -by, -bz),
    new THREE.Vector3(bx + 0.32, -by, -bz),
    0xd45846,
  );
  // Y Axis: Emerald Green (#168f72)
  addAxisWithArrow(
    new THREE.Vector3(-bx, -by, -bz),
    new THREE.Vector3(-bx, by + 0.32, -bz),
    0x168f72,
  );
  // Z Axis: Indigo Blue (#3568d4), vertically UP!
  addAxisWithArrow(
    new THREE.Vector3(-bx, -by, -bz),
    new THREE.Vector3(-bx, -by, bz + 0.32),
    0x3568d4,
  );

  const placeLabel = (
    text: string,
    color: string,
    pos: [number, number, number],
    bold = false,
    scale = 0.3,
  ) => {
    const sp = createTextSprite(text, color, { bold, scale });
    if (sp) {
      sp.position.set(pos[0], pos[1], pos[2]);
      group.add(sp);
    }
  };

  placeLabel('X', '#c54634', [bx + 0.64, -by, -bz], true, 0.36);
  placeLabel('Y', '#117c62', [-bx, by + 0.64, -bz], true, 0.36);
  placeLabel('Z', '#2856c2', [-bx, -by, bz + 0.64], true, 0.36);

  // Endpoint & midpoint numeric tick labels
  const xMid = (tf.xMin + tf.xMax) * 0.5;
  const yMid = (tf.yMin + tf.yMax) * 0.5;
  const zMid = (tf.zLo + tf.zHi) * 0.5;

  placeLabel(formatAxisNumber(tf.xMin), '#8f3a2e', [
    -bx,
    -by - 0.34,
    -bz - 0.16,
  ]);
  placeLabel(formatAxisNumber(xMid), '#8f3a2e', [0, -by - 0.34, -bz - 0.16]);
  placeLabel(formatAxisNumber(tf.xMax), '#8f3a2e', [
    bx,
    -by - 0.34,
    -bz - 0.16,
  ]);

  placeLabel(formatAxisNumber(tf.yMin), '#126954', [
    -bx - 0.36,
    -by,
    -bz - 0.16,
  ]);
  placeLabel(formatAxisNumber(yMid), '#126954', [-bx - 0.36, 0, -bz - 0.16]);
  placeLabel(formatAxisNumber(tf.yMax), '#126954', [
    -bx - 0.36,
    by,
    -bz - 0.16,
  ]);

  placeLabel(formatAxisNumber(tf.zLo), '#274da8', [
    -bx - 0.38,
    -by - 0.28,
    -bz,
  ]);
  placeLabel(formatAxisNumber(zMid), '#274da8', [-bx - 0.38, -by - 0.28, 0]);
  placeLabel(formatAxisNumber(tf.zHi), '#274da8', [-bx - 0.38, -by - 0.28, bz]);

  return group;
}

function buildSurfaceAndFloorGroups(
  result: SurfacePlotResult,
  expression: string,
  tf: SpatialTransform,
  hasPrisms: boolean,
): {
  surfaceMesh: THREE.Mesh | null;
  wireframeGroup: THREE.Group;
  contourGroup: THREE.Group;
} {
  const wireframeGroup = new THREE.Group();
  const contourGroup = new THREE.Group();

  // Base reference plane + grid inside contourGroup
  const floorZ = -BOX_HALF_Z;
  const floorPlaneGeo = new THREE.PlaneGeometry(
    BOX_HALF_XY * 2,
    BOX_HALF_XY * 2,
  );
  const floorPlaneMat = new THREE.MeshBasicMaterial({
    color: 0xf2f8f6,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorMesh = new THREE.Mesh(floorPlaneGeo, floorPlaneMat);
  floorMesh.position.set(0, 0, floorZ - 0.006);
  contourGroup.add(floorMesh);

  const gridSegs: number[] = [];
  const gridDivs = 8;
  for (let k = 0; k <= gridDivs; k += 1) {
    const u = -BOX_HALF_XY + (BOX_HALF_XY * 2 * k) / gridDivs;
    gridSegs.push(u, -BOX_HALF_XY, floorZ, u, BOX_HALF_XY, floorZ);
    gridSegs.push(-BOX_HALF_XY, u, floorZ, BOX_HALF_XY, u, floorZ);
  }
  const floorGridGeo = new THREE.BufferGeometry();
  floorGridGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(gridSegs), 3),
  );
  contourGroup.add(
    new THREE.LineSegments(
      floorGridGeo,
      new THREE.LineBasicMaterial({
        color: 0x1c5446,
        transparent: true,
        opacity: 0.14,
      }),
    ),
  );

  const { gridX, gridY, zValues } = result;
  const nx = gridX.length;
  const ny = gridY.length;
  if (nx < 2 || ny < 2 || zValues.length < nx * ny) {
    return { surfaceMesh: null, wireframeGroup, contourGroup };
  }

  const isRowMajor = detectRowMajorOrder(result, expression);
  const rawZ = (ix: number, iy: number): number | null => {
    const v = isRowMajor ? zValues[iy * nx + ix] : zValues[ix * ny + iy];
    if (v === null || !Number.isFinite(v)) return null;
    if (tf.zClampMin !== undefined && v < tf.zClampMin) return null;
    if (tf.zClampMax !== undefined && v > tf.zClampMax) return null;
    return v;
  };

  const vertCount = nx * ny;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const validGridZ = new Float64Array(vertCount);
  const validMask = new Uint8Array(vertCount);

  const cOut = new THREE.Color();
  const cA = new THREE.Color();
  const cB = new THREE.Color();

  for (let iy = 0; iy < ny; iy += 1) {
    const wy = tf.mapY(gridY[iy]);
    for (let ix = 0; ix < nx; ix += 1) {
      const idx = iy * nx + ix;
      const wx = tf.mapX(gridX[ix]);
      const zv = rawZ(ix, iy);
      if (zv !== null) {
        validMask[idx] = 1;
        validGridZ[idx] = zv;
        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = wy;
        positions[idx * 3 + 2] = tf.mapZ(zv);
        const t = (zv - tf.zLo) / tf.zSpan;
        writeElevationColor(t, cOut, cA, cB);
        colors[idx * 3] = cOut.r;
        colors[idx * 3 + 1] = cOut.g;
        colors[idx * 3 + 2] = cOut.b;
      } else {
        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = wy;
        positions[idx * 3 + 2] = 0;
      }
    }
  }

  const maxAllowedJump = CLIFF_JUMP_RATIO * tf.zSpan;
  const indices: number[] = [];
  const validCells: Array<[number, number]> = [];

  for (let iy = 0; iy < ny - 1; iy += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const i00 = iy * nx + ix;
      const i10 = i00 + 1;
      const i01 = i00 + nx;
      const i11 = i01 + 1;

      if (
        !validMask[i00] ||
        !validMask[i10] ||
        !validMask[i01] ||
        !validMask[i11]
      ) {
        continue;
      }

      const z00 = validGridZ[i00];
      const z10 = validGridZ[i10];
      const z01 = validGridZ[i01];
      const z11 = validGridZ[i11];

      const cellMin = Math.min(z00, z10, z01, z11);
      const cellMax = Math.max(z00, z10, z01, z11);
      if (cellMax - cellMin > maxAllowedJump) {
        continue;
      }

      indices.push(i00, i10, i11, i00, i11, i01);
      validCells.push([ix, iy]);
    }
  }

  let surfaceMesh: THREE.Mesh | null = null;
  if (indices.length > 0) {
    const surfaceGeo = new THREE.BufferGeometry();
    surfaceGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    surfaceGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    surfaceGeo.setIndex(indices);
    surfaceGeo.computeVertexNormals();

    const surfaceMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.32,
      metalness: 0.06,
      clearcoat: 0.24,
      clearcoatRoughness: 0.28,
      transparent: hasPrisms,
      opacity: hasPrisms ? 0.46 : 1.0,
      depthWrite: !hasPrisms,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.renderOrder = hasPrisms ? 3 : 1;
  }

  // Clean isoparametric quad-mesh lines on the surface
  const wireVerts: number[] = [];
  const stepX = Math.max(1, Math.round((nx - 1) / 20));
  const stepY = Math.max(1, Math.round((ny - 1) / 20));

  for (let iy = 0; iy < ny; iy += stepY) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const a = iy * nx + ix;
      const b = a + 1;
      if (
        validMask[a] &&
        validMask[b] &&
        Math.abs(validGridZ[a] - validGridZ[b]) <= maxAllowedJump
      ) {
        wireVerts.push(
          positions[a * 3],
          positions[a * 3 + 1],
          positions[a * 3 + 2],
          positions[b * 3],
          positions[b * 3 + 1],
          positions[b * 3 + 2],
        );
      }
    }
  }
  for (let ix = 0; ix < nx; ix += stepX) {
    for (let iy = 0; iy < ny - 1; iy += 1) {
      const a = iy * nx + ix;
      const b = a + nx;
      if (
        validMask[a] &&
        validMask[b] &&
        Math.abs(validGridZ[a] - validGridZ[b]) <= maxAllowedJump
      ) {
        wireVerts.push(
          positions[a * 3],
          positions[a * 3 + 1],
          positions[a * 3 + 2],
          positions[b * 3],
          positions[b * 3 + 1],
          positions[b * 3 + 2],
        );
      }
    }
  }

  if (wireVerts.length > 0) {
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(wireVerts), 3),
    );
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x0b3a30,
      transparent: true,
      opacity: hasPrisms ? 0.18 : 0.26,
    });
    const wireLines = new THREE.LineSegments(wireGeo, wireMat);
    wireLines.renderOrder = 4;
    wireframeGroup.add(wireLines);
  }

  // Marching-squares elevation contours projected onto the floor reference plane
  if (validCells.length > 0) {
    const contourPos: number[] = [];
    const contourCol: number[] = [];
    const numLevels = 9;
    const contourZ = floorZ + 0.01;

    const interpEdge = (
      x1: number,
      y1: number,
      v1: number,
      x2: number,
      y2: number,
      v2: number,
      iso: number,
    ): [number, number] => {
      const denom = v2 - v1;
      const t =
        Math.abs(denom) > 1e-12
          ? Math.max(0, Math.min(1, (iso - v1) / denom))
          : 0.5;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };

    for (let lv = 1; lv <= numLevels; lv += 1) {
      const tNorm = lv / (numLevels + 1);
      const iso = tf.zLo + tNorm * tf.zSpan;
      writeElevationColor(tNorm, cOut, cA, cB);

      for (let c = 0; c < validCells.length; c += 1) {
        const [ix, iy] = validCells[c];
        const i00 = iy * nx + ix;
        const i10 = i00 + 1;
        const i01 = i00 + nx;
        const i11 = i01 + 1;

        const z00 = validGridZ[i00];
        const z10 = validGridZ[i10];
        const z11 = validGridZ[i11];
        const z01 = validGridZ[i01];

        const mask =
          (z00 >= iso ? 1 : 0) |
          (z10 >= iso ? 2 : 0) |
          (z11 >= iso ? 4 : 0) |
          (z01 >= iso ? 8 : 0);

        if (mask === 0 || mask === 15) continue;

        const x0 = positions[i00 * 3];
        const x1 = positions[i10 * 3];
        const y0 = positions[i00 * 3 + 1];
        const y1 = positions[i01 * 3 + 1];

        const eBottom = () => interpEdge(x0, y0, z00, x1, y0, z10, iso);
        const eRight = () => interpEdge(x1, y0, z10, x1, y1, z11, iso);
        const eTop = () => interpEdge(x0, y1, z01, x1, y1, z11, iso);
        const eLeft = () => interpEdge(x0, y0, z00, x0, y1, z01, iso);

        const pushSeg = (pA: [number, number], pB: [number, number]) => {
          contourPos.push(pA[0], pA[1], contourZ, pB[0], pB[1], contourZ);
          contourCol.push(cOut.r, cOut.g, cOut.b, cOut.r, cOut.g, cOut.b);
        };

        switch (mask) {
          case 1:
          case 14:
            pushSeg(eLeft(), eBottom());
            break;
          case 2:
          case 13:
            pushSeg(eBottom(), eRight());
            break;
          case 3:
          case 12:
            pushSeg(eLeft(), eRight());
            break;
          case 4:
          case 11:
            pushSeg(eRight(), eTop());
            break;
          case 5:
            pushSeg(eLeft(), eTop());
            pushSeg(eBottom(), eRight());
            break;
          case 6:
          case 9:
            pushSeg(eBottom(), eTop());
            break;
          case 7:
          case 8:
            pushSeg(eLeft(), eTop());
            break;
          case 10:
            pushSeg(eLeft(), eBottom());
            pushSeg(eRight(), eTop());
            break;
          default:
            break;
        }
      }
    }

    if (contourPos.length > 0) {
      const contourGeo = new THREE.BufferGeometry();
      contourGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(contourPos), 3),
      );
      contourGeo.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(contourCol), 3),
      );
      const contourMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
      });
      contourGroup.add(new THREE.LineSegments(contourGeo, contourMat));
    }
  }

  return { surfaceMesh, wireframeGroup, contourGroup };
}

function resolvePrismCenters(
  prisms: RiemannPrism[],
  config?: SurfaceIntegralConfig,
): Array<{ cx: number; cy: number; dx: number; dy: number; z: number }> {
  if (prisms.length === 0) return [];
  if (!config) {
    return prisms.map((p) => ({
      cx: p.x,
      cy: p.y,
      dx: p.dx,
      dy: p.dy,
      z: p.z,
    }));
  }

  const sample = prisms[0];
  const shiftAxis = (
    axis: 'x' | 'y',
    val: number,
    step: number,
    start: number,
    end: number,
  ) => {
    if (step <= 1e-12) return 0;
    const rawMod = ((((val - start) / step) % 1) + 1) % 1;
    if (rawMod > 0.2 && rawMod < 0.8) {
      return 0; // Already cell center
    }
    let maxCoord = -Infinity;
    for (const p of prisms) {
      const c = p[axis];
      if (c > maxCoord) maxCoord = c;
    }
    return maxCoord > end - 0.25 * step ? -0.5 * step : 0.5 * step;
  };

  const offsetX = shiftAxis(
    'x',
    sample.x,
    sample.dx,
    config.xStart,
    config.xEnd,
  );
  const offsetY = shiftAxis(
    'y',
    sample.y,
    sample.dy,
    config.yStart,
    config.yEnd,
  );

  return prisms.map((p) => ({
    cx: p.x + offsetX,
    cy: p.y + offsetY,
    dx: p.dx,
    dy: p.dy,
    z: p.z,
  }));
}

function buildDomainBoundaryPoints(
  config: SurfaceIntegralConfig | undefined,
  prisms: Array<{ cx: number; cy: number; dx: number; dy: number }>,
): Array<[number, number]> {
  if (!config) {
    if (prisms.length === 0) return [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of prisms) {
      x0 = Math.min(x0, p.cx - p.dx * 0.5);
      x1 = Math.max(x1, p.cx + p.dx * 0.5);
      y0 = Math.min(y0, p.cy - p.dy * 0.5);
      y1 = Math.max(y1, p.cy + p.dy * 0.5);
    }
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }

  const { regionType, xStart, xEnd, yStart, yEnd } = config;
  if (regionType === 'disk') {
    const cx = (xStart + xEnd) * 0.5;
    const cy = (yStart + yEnd) * 0.5;
    const rx = (xEnd - xStart) * 0.5;
    const ry = (yEnd - yStart) * 0.5;
    const segs = 96;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < segs; i += 1) {
      const theta = (Math.PI * 2 * i) / segs;
      pts.push([cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)]);
    }
    return pts;
  }

  if (regionType === 'triangle') {
    const spanX = Math.max(xEnd - xStart, 1e-9);
    const spanY = Math.max(yEnd - yStart, 1e-9);
    let countSimplex = 0; // u + v <= 1
    let countLowerDiag = 0; // v <= u
    let countUpperDiag = 0; // u <= v
    for (const p of prisms) {
      const u = (p.cx - xStart) / spanX;
      const v = (p.cy - yStart) / spanY;
      if (u + v <= 1.05) countSimplex += 1;
      if (v <= u + 0.05) countLowerDiag += 1;
      if (u <= v + 0.05) countUpperDiag += 1;
    }
    if (
      prisms.length > 0 &&
      countLowerDiag > countSimplex &&
      countLowerDiag >= countUpperDiag
    ) {
      return [
        [xStart, yStart],
        [xEnd, yStart],
        [xEnd, yEnd],
      ];
    }
    if (
      prisms.length > 0 &&
      countUpperDiag > countSimplex &&
      countUpperDiag > countLowerDiag
    ) {
      return [
        [xStart, yStart],
        [xEnd, yEnd],
        [xStart, yEnd],
      ];
    }
    return [
      [xStart, yStart],
      [xEnd, yStart],
      [xStart, yEnd],
    ];
  }

  return [
    [xStart, yStart],
    [xEnd, yStart],
    [xEnd, yEnd],
    [xStart, yEnd],
  ];
}

function buildPlanarRibbonGeometry(
  pts: ReadonlyArray<[number, number]>,
  halfWidth: number,
  zPos: number,
  closed: boolean,
): THREE.BufferGeometry | null {
  const n = pts.length;
  if (n < 2) return null;
  if (closed && n < 3) return null;

  const normals: Array<[number, number]> = new Array(n);

  const segNormal = (
    p0: [number, number],
    p1: [number, number],
  ): [number, number] => {
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return [0, 1];
    return [-dy / len, dx / len];
  };

  for (let i = 0; i < n; i += 1) {
    if (!closed && i === 0) {
      normals[i] = segNormal(pts[0], pts[1]);
    } else if (!closed && i === n - 1) {
      normals[i] = segNormal(pts[n - 2], pts[n - 1]);
    } else {
      const prevIdx = (i - 1 + n) % n;
      const nextIdx = (i + 1) % n;
      const nPrev = segNormal(pts[prevIdx], pts[i]);
      const nNext = segNormal(pts[i], pts[nextIdx]);
      const mx = nPrev[0] + nNext[0];
      const my = nPrev[1] + nNext[1];
      const mLen = Math.hypot(mx, my);
      if (mLen < 1e-6) {
        normals[i] = nNext;
      } else {
        const ux = mx / mLen;
        const uy = my / mLen;
        const dot = Math.max(0.55, ux * nNext[0] + uy * nNext[1]);
        const miterScale = Math.min(1.8, 1 / dot);
        normals[i] = [ux * miterScale, uy * miterScale];
      }
    }
  }

  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    const [wx, wy] = pts[i];
    const [nx, ny] = normals[i];
    const base = i * 6;
    positions[base] = wx + nx * halfWidth;
    positions[base + 1] = wy + ny * halfWidth;
    positions[base + 2] = zPos;
    positions[base + 3] = wx - nx * halfWidth;
    positions[base + 4] = wy - ny * halfWidth;
    positions[base + 5] = zPos;
  }

  const segCount = closed ? n : n - 1;
  const indices: number[] = [];
  for (let i = 0; i < segCount; i += 1) {
    const j = (i + 1) % n;
    const a0 = i * 2;
    const a1 = i * 2 + 1;
    const b0 = j * 2;
    const b1 = j * 2 + 1;
    indices.push(a0, a1, b0, a1, b1, b0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function synthesizeFallbackCurvilinearCurves(
  config: SurfaceIntegralConfig,
): { curveA: PlotPoint[]; curveB: PlotPoint[] } | null {
  const samples = 80;
  const curveA: PlotPoint[] = [];
  const curveB: PlotPoint[] = [];

  if (
    config.regionType === 'x-type' &&
    config.yLowerExpr &&
    config.yUpperExpr
  ) {
    const span = config.xEnd - config.xStart;
    for (let i = 0; i <= samples; i += 1) {
      const x = config.xStart + (span * i) / samples;
      curveA.push([x, evalBivariateHint(config.yLowerExpr, x, 0)]);
      curveB.push([x, evalBivariateHint(config.yUpperExpr, x, 0)]);
    }
    return { curveA, curveB };
  }

  if (
    config.regionType === 'y-type' &&
    config.xLowerExpr &&
    config.xUpperExpr
  ) {
    const span = config.yEnd - config.yStart;
    for (let i = 0; i <= samples; i += 1) {
      const y = config.yStart + (span * i) / samples;
      const xLo = evalBivariateHint(config.xLowerExpr, 0, y);
      const xHi = evalBivariateHint(config.xUpperExpr, 0, y);
      curveA.push(xLo === null ? [0, null] : [xLo, y]);
      curveB.push(xHi === null ? [0, null] : [xHi, y]);
    }
    return { curveA, curveB };
  }

  return null;
}

function addCurvilinearDomainBoundary(
  group: THREE.Group,
  config: SurfaceIntegralConfig,
  integralResult: SurfacePlotResult['integralResult'],
  tf: SpatialTransform,
  worldZeroZ: number,
): boolean {
  let curveA = integralResult?.boundaryCurveA;
  let curveB = integralResult?.boundaryCurveB;

  if (!curveA || curveA.length === 0 || !curveB || curveB.length === 0) {
    const synthesized = synthesizeFallbackCurvilinearCurves(config);
    if (synthesized) {
      curveA = synthesized.curveA;
      curveB = synthesized.curveB;
    }
  }

  if (!curveA || !curveB || curveA.length === 0 || curveB.length === 0) {
    return false;
  }

  const extractWorldRuns = (
    curve: PlotPoint[],
  ): {
    runs: Array<Array<[number, number]>>;
    allValid: Array<[number, number]>;
  } => {
    const runs: Array<Array<[number, number]>> = [];
    const allValid: Array<[number, number]> = [];
    let current: Array<[number, number]> = [];

    for (const [x, y] of curve) {
      if (y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
        if (current.length >= 2) {
          runs.push(current);
        }
        current = [];
        continue;
      }
      const wpt: [number, number] = [tf.mapX(x), tf.mapY(y)];
      current.push(wpt);
      allValid.push(wpt);
    }
    if (current.length >= 2) {
      runs.push(current);
    }
    return { runs, allValid };
  };

  const { runs: runsA, allValid: validA } = extractWorldRuns(curveA);
  const { runs: runsB, allValid: validB } = extractWorldRuns(curveB);
  if (validA.length === 0 || validB.length === 0) {
    return false;
  }

  const drawFloor = Math.abs(worldZeroZ - -BOX_HALF_Z) > 0.08;
  const floorZ = -BOX_HALF_Z;

  const emitGlowingPath = (pts: Array<[number, number]>, closed: boolean) => {
    if (pts.length < (closed ? 3 : 2)) return;

    // Soft outer emerald luminescence halo on z = 0 plane
    const haloGeo = buildPlanarRibbonGeometry(
      pts,
      0.058,
      worldZeroZ + 0.007,
      closed,
    );
    if (haloGeo) {
      const haloMesh = new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      haloMesh.renderOrder = 5;
      group.add(haloMesh);
    }

    // Crisp luminous emerald core ribbon on z = 0 plane
    const coreRibbonGeo = buildPlanarRibbonGeometry(
      pts,
      0.022,
      worldZeroZ + 0.009,
      closed,
    );
    if (coreRibbonGeo) {
      const coreMesh = new THREE.Mesh(
        coreRibbonGeo,
        new THREE.MeshBasicMaterial({
          color: 0x05b58d,
          transparent: true,
          opacity: 0.94,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      coreMesh.renderOrder = 6;
      group.add(coreMesh);
    }

    // Razor-sharp emerald-jade highlight centerline on z = 0 plane
    const lineVerts = pts.map(
      ([wx, wy]) => new THREE.Vector3(wx, wy, worldZeroZ + 0.011),
    );
    const lineGeo = new THREE.BufferGeometry().setFromPoints(lineVerts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x34f5c5,
      transparent: true,
      opacity: 0.98,
    });
    const lineObj = closed
      ? new THREE.LineLoop(lineGeo, lineMat)
      : new THREE.Line(lineGeo, lineMat);
    lineObj.renderOrder = 7;
    group.add(lineObj);

    // Projected curvilinear contour on the floor reference plane
    if (drawFloor) {
      const floorRibbonGeo = buildPlanarRibbonGeometry(
        pts,
        0.018,
        floorZ + 0.013,
        closed,
      );
      if (floorRibbonGeo) {
        const floorRibbon = new THREE.Mesh(
          floorRibbonGeo,
          new THREE.MeshBasicMaterial({
            color: 0x0d7a62,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        floorRibbon.renderOrder = 4;
        group.add(floorRibbon);
      }

      const floorVerts = pts.map(
        ([wx, wy]) => new THREE.Vector3(wx, wy, floorZ + 0.015),
      );
      const floorGeo = new THREE.BufferGeometry().setFromPoints(floorVerts);
      const floorMat = new THREE.LineBasicMaterial({
        color: 0x05b58d,
        transparent: true,
        opacity: 0.68,
      });
      const floorLine = closed
        ? new THREE.LineLoop(floorGeo, floorMat)
        : new THREE.Line(floorGeo, floorMat);
      floorLine.renderOrder = 5;
      group.add(floorLine);
    }
  };

  const aStart = validA[0];
  const aEnd = validA[validA.length - 1];
  const bStart = validB[0];
  const bEnd = validB[validB.length - 1];

  const distDirect =
    Math.hypot(aStart[0] - bStart[0], aStart[1] - bStart[1]) +
    Math.hypot(aEnd[0] - bEnd[0], aEnd[1] - bEnd[1]);
  const distReversed =
    Math.hypot(aStart[0] - bEnd[0], aStart[1] - bEnd[1]) +
    Math.hypot(aEnd[0] - bStart[0], aEnd[1] - bStart[1]);
  const bAlignedSameDir = distDirect <= distReversed;

  let closedLoopPts: Array<[number, number]> | null = null;
  if (runsA.length === 1 && runsB.length === 1) {
    const seqB = bAlignedSameDir ? [...runsB[0]].reverse() : runsB[0];
    const rawLoop = [...runsA[0], ...seqB];
    const deduped: Array<[number, number]> = [];
    for (const pt of rawLoop) {
      const prev = deduped[deduped.length - 1];
      if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-4) {
        deduped.push(pt);
      }
    }
    if (
      deduped.length >= 2 &&
      Math.hypot(
        deduped[0][0] - deduped[deduped.length - 1][0],
        deduped[0][1] - deduped[deduped.length - 1][1],
      ) <= 1e-4
    ) {
      deduped.pop();
    }
    if (deduped.length >= 3) {
      closedLoopPts = deduped;
      emitGlowingPath(closedLoopPts, true);
    }
  }

  if (!closedLoopPts) {
    for (const r of runsA) emitGlowingPath(r, false);
    for (const r of runsB) emitGlowingPath(r, false);

    const side1B = bAlignedSameDir ? bStart : bEnd;
    const side2B = bAlignedSameDir ? bEnd : bStart;
    if (Math.hypot(aStart[0] - side1B[0], aStart[1] - side1B[1]) > 1e-4) {
      emitGlowingPath([aStart, side1B], false);
    }
    if (Math.hypot(aEnd[0] - side2B[0], aEnd[1] - side2B[1]) > 1e-4) {
      emitGlowingPath([aEnd, side2B], false);
    }
  }

  // Translucent curvilinear domain interior highlight on z = 0 plane
  if (curveA.length === curveB.length && curveA.length >= 2) {
    const stripVerts: number[] = [];
    const stripIndices: number[] = [];
    let hasOrdered = false;
    let hasInverted = false;
    for (let i = 0; i < curveA.length; i += 1) {
      const [xa, ya] = curveA[i];
      const [xb, yb] = curveB[i];
      if (
        ya === null ||
        yb === null ||
        !Number.isFinite(xa) ||
        !Number.isFinite(xb)
      ) {
        continue;
      }
      const diff = config.regionType === 'y-type' ? xb - xa : yb - ya;
      if (diff > 1e-6) hasOrdered = true;
      if (diff < -1e-6) hasInverted = true;
    }
    const enforceOrder = hasOrdered && hasInverted;

    for (let i = 0; i < curveA.length - 1; i += 1) {
      const [xa0, ya0] = curveA[i];
      const [xb0, yb0] = curveB[i];
      const [xa1, ya1] = curveA[i + 1];
      const [xb1, yb1] = curveB[i + 1];
      if (
        ya0 === null ||
        yb0 === null ||
        ya1 === null ||
        yb1 === null ||
        !Number.isFinite(xa0) ||
        !Number.isFinite(xb0) ||
        !Number.isFinite(xa1) ||
        !Number.isFinite(xb1)
      ) {
        continue;
      }
      if (enforceOrder) {
        const d0 = config.regionType === 'y-type' ? xb0 - xa0 : yb0 - ya0;
        const d1 = config.regionType === 'y-type' ? xb1 - xa1 : yb1 - ya1;
        if (d0 < -1e-5 && d1 < -1e-5) continue;
      }

      const base = stripVerts.length / 3;
      stripVerts.push(
        tf.mapX(xa0),
        tf.mapY(ya0),
        worldZeroZ,
        tf.mapX(xb0),
        tf.mapY(yb0),
        worldZeroZ,
        tf.mapX(xa1),
        tf.mapY(ya1),
        worldZeroZ,
        tf.mapX(xb1),
        tf.mapY(yb1),
        worldZeroZ,
      );
      stripIndices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }

    if (stripIndices.length > 0) {
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(stripVerts), 3),
      );
      fillGeo.setIndex(stripIndices);
      const fillMesh = new THREE.Mesh(
        fillGeo,
        new THREE.MeshBasicMaterial({
          color: 0x149678,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      fillMesh.renderOrder = 3;
      group.add(fillMesh);
    }
  } else if (closedLoopPts && closedLoopPts.length >= 3) {
    const shape = new THREE.Shape(
      closedLoopPts.map(([wx, wy]) => new THREE.Vector2(wx, wy)),
    );
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMesh = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({
        color: 0x149678,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fillMesh.position.z = worldZeroZ;
    fillMesh.renderOrder = 3;
    group.add(fillMesh);
  }

  return true;
}

function buildRiemannIntegralGroup(
  prismsRaw: RiemannPrism[],
  config: SurfaceIntegralConfig | undefined,
  tf: SpatialTransform,
  integralResult?: SurfacePlotResult['integralResult'],
): THREE.Group {
  const group = new THREE.Group();
  const prisms = resolvePrismCenters(prismsRaw, config);

  const zZeroClamped = Math.max(tf.zLo, Math.min(tf.zHi, 0));
  const worldZeroZ = tf.mapZ(zZeroClamped);

  const isCurvilinear =
    config?.regionType === 'x-type' || config?.regionType === 'y-type';
  const renderedCurvilinear =
    isCurvilinear && config
      ? addCurvilinearDomainBoundary(
          group,
          config,
          integralResult,
          tf,
          worldZeroZ,
        )
      : false;

  // Luminous integration region boundary loop on z = 0 plane & floor
  const boundaryPts = renderedCurvilinear
    ? []
    : buildDomainBoundaryPoints(config, prisms);
  if (boundaryPts.length >= 3) {
    const loopZeroVerts = boundaryPts.map(
      ([x, y]) => new THREE.Vector3(tf.mapX(x), tf.mapY(y), worldZeroZ + 0.008),
    );
    const loopGeo = new THREE.BufferGeometry().setFromPoints(loopZeroVerts);
    const loopMat = new THREE.LineBasicMaterial({
      color: 0x05b58d,
      transparent: true,
      opacity: 0.96,
    });
    const loopLine = new THREE.LineLoop(loopGeo, loopMat);
    loopLine.renderOrder = 5;
    group.add(loopLine);

    // Translucent region interior highlight on z = 0 plane
    const shape = new THREE.Shape(
      boundaryPts.map(([x, y]) => new THREE.Vector2(tf.mapX(x), tf.mapY(y))),
    );
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x149678,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.z = worldZeroZ;
    group.add(fillMesh);

    if (Math.abs(worldZeroZ - -BOX_HALF_Z) > 0.08) {
      const floorLoopVerts = boundaryPts.map(
        ([x, y]) =>
          new THREE.Vector3(tf.mapX(x), tf.mapY(y), -BOX_HALF_Z + 0.014),
      );
      const floorLoopGeo = new THREE.BufferGeometry().setFromPoints(
        floorLoopVerts,
      );
      group.add(
        new THREE.LineLoop(
          floorLoopGeo,
          new THREE.LineBasicMaterial({
            color: 0x0d7a62,
            transparent: true,
            opacity: 0.55,
          }),
        ),
      );
    }
  }

  if (prisms.length === 0) return group;

  const posList = prisms.filter((p) => Number.isFinite(p.z) && p.z >= 0);
  const negList = prisms.filter((p) => Number.isFinite(p.z) && p.z < 0);

  const buildInstancedColumns = (
    items: typeof prisms,
    fillHex: number,
    edgeHex: number,
  ) => {
    if (items.length === 0) return;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshPhysicalMaterial({
      color: fillHex,
      transparent: true,
      opacity: 0.78,
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.3,
      depthWrite: true,
    });

    const instanced = new THREE.InstancedMesh(unitBox, mat, items.length);
    instanced.renderOrder = 2;

    const dummyPos = new THREE.Vector3();
    const dummyQuat = new THREE.Quaternion();
    const dummyScale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();

    const edgePositions: number[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const p = items[i];
      const zClamped = Math.max(tf.zLo, Math.min(tf.zHi, p.z));
      const zA = worldZeroZ;
      const zB = tf.mapZ(zClamped);
      const zMinW = Math.min(zA, zB);
      const zMaxW = Math.max(zA, zB);

      const wx = tf.mapX(p.cx);
      const wy = tf.mapY(p.cy);
      const sx = Math.max(p.dx * 0.94 * tf.scaleX, 0.012);
      const sy = Math.max(p.dy * 0.94 * tf.scaleY, 0.012);
      const sz = Math.max(zMaxW - zMinW, 0.012);
      const wz = (zMinW + zMaxW) * 0.5;

      dummyPos.set(wx, wy, wz);
      dummyScale.set(sx, sy, sz);
      matrix.compose(dummyPos, dummyQuat, dummyScale);
      instanced.setMatrixAt(i, matrix);

      // Subtle crystal edge highlights on top cap and vertical corners
      const hx = sx * 0.5;
      const hy = sy * 0.5;
      const zTop = p.z >= 0 ? wz + sz * 0.5 : wz - sz * 0.5;
      const zBot = p.z >= 0 ? wz - sz * 0.5 : wz + sz * 0.5;

      const x0 = wx - hx;
      const x1 = wx + hx;
      const y0 = wy - hy;
      const y1 = wy + hy;

      // Top face rim
      edgePositions.push(
        x0,
        y0,
        zTop,
        x1,
        y0,
        zTop,
        x1,
        y0,
        zTop,
        x1,
        y1,
        zTop,
        x1,
        y1,
        zTop,
        x0,
        y1,
        zTop,
        x0,
        y1,
        zTop,
        x0,
        y0,
        zTop,
      );
      // Four vertical pillar edges
      edgePositions.push(
        x0,
        y0,
        zBot,
        x0,
        y0,
        zTop,
        x1,
        y0,
        zBot,
        x1,
        y0,
        zTop,
        x1,
        y1,
        zBot,
        x1,
        y1,
        zTop,
        x0,
        y1,
        zBot,
        x0,
        y1,
        zTop,
      );
    }

    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);

    if (edgePositions.length > 0) {
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(edgePositions), 3),
      );
      const edgeMat = new THREE.LineBasicMaterial({
        color: edgeHex,
        transparent: true,
        opacity: 0.44,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.renderOrder = 2;
      group.add(edges);
    }
  };

  buildInstancedColumns(posList, 0x149678, 0xd8fff4);
  buildInstancedColumns(negList, 0xd97338, 0xffe8d6);

  return group;
}

function buildProbeAndTangentGroup(
  probe: NonNullable<SurfacePlotResult['probeResult']>,
  tf: SpatialTransform,
): THREE.Group {
  const group = new THREE.Group();
  const maxJump = CLIFF_JUMP_RATIO * tf.zSpan;

  const addTraceRuns = (
    slice: PlotPoint[],
    toWorld: (param: number, z: number) => THREE.Vector3,
    hex: number,
  ) => {
    let run: THREE.Vector3[] = [];
    let prevZ: number | null = null;

    const flush = () => {
      if (run.length >= 2) {
        const geo = new THREE.BufferGeometry().setFromPoints(run);
        const mat = new THREE.LineBasicMaterial({ color: hex });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 6;
        group.add(line);
      }
      run = [];
    };

    for (const [u, z] of slice) {
      if (
        z === null ||
        !Number.isFinite(u) ||
        !Number.isFinite(z) ||
        z < tf.zLo - tf.zSpan * 0.08 ||
        z > tf.zHi + tf.zSpan * 0.08
      ) {
        flush();
        prevZ = null;
        continue;
      }
      if (prevZ !== null && Math.abs(z - prevZ) > maxJump) {
        flush();
      }
      run.push(toWorld(u, z));
      prevZ = z;
    }
    flush();
  };

  const wy0 = tf.mapY(probe.y0);
  const wx0 = tf.mapX(probe.x0);

  // sliceX (y = y0): Cyan (#06b6d4)
  addTraceRuns(
    probe.sliceX,
    (x, z) => new THREE.Vector3(tf.mapX(x), wy0, tf.mapZ(z) + 0.012),
    0x06b6d4,
  );

  // sliceY (x = x0): Gold (#eab308)
  addTraceRuns(
    probe.sliceY,
    (y, z) => new THREE.Vector3(wx0, tf.mapY(y), tf.mapZ(z) + 0.012),
    0xeab308,
  );

  if (
    probe.z0 !== null &&
    Number.isFinite(probe.z0) &&
    probe.z0 >= tf.zLo - tf.zSpan * 0.15 &&
    probe.z0 <= tf.zHi + tf.zSpan * 0.15
  ) {
    const wz0 = tf.mapZ(probe.z0);
    const anchor = new THREE.Vector3(wx0, wy0, wz0);

    // Glowing anchor sphere + halo
    const coreGeo = new THREE.SphereGeometry(0.095, 24, 24);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x2563eb,
      emissiveIntensity: 0.75,
      roughness: 0.15,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(anchor);
    coreMesh.renderOrder = 8;
    group.add(coreMesh);

    const haloGeo = new THREE.SphereGeometry(0.18, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.copy(anchor);
    haloMesh.renderOrder = 7;
    group.add(haloMesh);

    // Vertical drop-line to base reference plane
    const dropGeo = new THREE.BufferGeometry().setFromPoints([
      anchor,
      new THREE.Vector3(wx0, wy0, -BOX_HALF_Z),
    ]);
    group.add(
      new THREE.Line(
        dropGeo,
        new THREE.LineBasicMaterial({
          color: 0x2563eb,
          transparent: true,
          opacity: 0.45,
        }),
      ),
    );

    // Local sapphire tangent plane z = z0 + fx*(x - x0) + fy*(y - y0)
    if (
      probe.fx !== null &&
      probe.fy !== null &&
      Number.isFinite(probe.fx) &&
      Number.isFinite(probe.fy)
    ) {
      const kX = probe.fx * (tf.scaleZ / tf.scaleX);
      const kY = probe.fy * (tf.scaleZ / tf.scaleY);

      const dirX = new THREE.Vector3(1, 0, kX).normalize();
      const dirYRaw = new THREE.Vector3(0, 1, kY);
      const basisU = dirX.clone();
      const basisV = dirYRaw
        .clone()
        .addScaledVector(basisU, -dirYRaw.dot(basisU))
        .normalize();

      const radius = 1.08;
      const c0 = anchor
        .clone()
        .addScaledVector(basisU, -radius)
        .addScaledVector(basisV, -radius);
      const c1 = anchor
        .clone()
        .addScaledVector(basisU, radius)
        .addScaledVector(basisV, -radius);
      const c2 = anchor
        .clone()
        .addScaledVector(basisU, radius)
        .addScaledVector(basisV, radius);
      const c3 = anchor
        .clone()
        .addScaledVector(basisU, -radius)
        .addScaledVector(basisV, radius);

      const patchGeo = new THREE.BufferGeometry();
      const patchVerts = new Float32Array([
        c0.x,
        c0.y,
        c0.z,
        c1.x,
        c1.y,
        c1.z,
        c2.x,
        c2.y,
        c2.z,
        c3.x,
        c3.y,
        c3.z,
      ]);
      patchGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(patchVerts, 3),
      );
      patchGeo.setIndex([0, 1, 2, 0, 2, 3]);
      patchGeo.computeVertexNormals();

      const patchMat = new THREE.MeshPhysicalMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.34,
        roughness: 0.18,
        metalness: 0.05,
        clearcoat: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const patchMesh = new THREE.Mesh(patchGeo, patchMat);
      patchMesh.renderOrder = 5;
      group.add(patchMesh);

      const rimGeo = new THREE.BufferGeometry().setFromPoints([c0, c1, c2, c3]);
      const rimLine = new THREE.LineLoop(
        rimGeo,
        new THREE.LineBasicMaterial({
          color: 0x2563eb,
          transparent: true,
          opacity: 0.85,
        }),
      );
      rimLine.renderOrder = 6;
      group.add(rimLine);
    }
  }

  return group;
}

export function Surface3DViewer({
  result,
  expression,
  xDomain,
  yDomain,
  zDomain,
  integralConfig,
  showWireframe,
  showContours,
}: Surface3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);

  const [webglSupported] = useState(() => detectWebGLSupport());
  const [runtimeFallback, setRuntimeFallback] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset | null>('iso');

  const [wirePref, setWirePref] = useState<{
    propVal: boolean | undefined;
    value: boolean;
  } | null>(null);

  const [contourPref, setContourPref] = useState<{
    propVal: boolean | undefined;
    value: boolean;
  } | null>(null);

  const wireframeEnabled =
    wirePref !== null && wirePref.propVal === showWireframe
      ? wirePref.value
      : (showWireframe ?? true);

  const contoursEnabled =
    contourPref !== null && contourPref.propVal === showContours
      ? contourPref.value
      : (showContours ?? true);

  const zMinProp = zDomain?.[0];
  const zMaxProp = zDomain?.[1];

  const spatial = useMemo(
    () => buildSpatialTransform(result, xDomain, yDomain, [zMinProp, zMaxProp]),
    [result, xDomain, yDomain, zMinProp, zMaxProp],
  );

  const hasPrisms = Boolean(
    result.integralResult && result.integralResult.prisms.length > 0,
  );
  const hasProbe = Boolean(result.probeResult);

  const wireframeRef = useRef(wireframeEnabled);
  const contoursRef = useRef(contoursEnabled);
  useEffect(() => {
    wireframeRef.current = wireframeEnabled;
    contoursRef.current = contoursEnabled;
  }, [wireframeEnabled, contoursEnabled]);

  // Effect 1: Initialize WebGLRenderer, Z-up Camera, Lighting & On-Demand OrbitControls
  useEffect(() => {
    if (!webglSupported || runtimeFallback) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setRuntimeFallback(true));
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const scene = new THREE.Scene();

    const initW = Math.max(container.clientWidth || 720, 100);
    const initH = Math.max(container.clientHeight || 480, 100);
    renderer.setSize(initW, initH, false);

    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 120);
    // Crucial: configure mathematical Z-up right-handed axis BEFORE OrbitControls
    camera.up.set(0, 0, 1);
    camera.position.set(...CAMERA_PRESETS.iso.pos);
    camera.lookAt(...CAMERA_PRESETS.iso.target);

    const hemiLight = new THREE.HemisphereLight(0xf6fcf9, 0xd5e6e0, 1.18);
    hemiLight.position.set(0, 0, 10);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.32);
    keyLight.position.set(7.5, -8.5, 11);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdcf4ec, 0.64);
    fillLight.position.set(-8, 7.5, 6);
    scene.add(fillLight);

    const underLight = new THREE.DirectionalLight(0xfbe8d3, 0.34);
    underLight.position.set(0, 2, -9);
    scene.add(underLight);

    const contentGroup = new THREE.Group();
    const wireframeGroup = new THREE.Group();
    const contourGroup = new THREE.Group();
    wireframeGroup.visible = wireframeRef.current;
    contourGroup.visible = contoursRef.current;
    scene.add(contentGroup);
    scene.add(wireframeGroup);
    scene.add(contourGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.84;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.82;
    controls.minDistance = 3.2;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI * 0.96;
    controls.update();

    let rafId = 0;
    let isTicking = false;
    let tweenState: {
      startTime: number;
      durationMs: number;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
    } | null = null;

    const tick = (now: number) => {
      rafId = 0;
      isTicking = true;

      let tweenActive = false;
      if (tweenState) {
        const elapsed = Math.max(0, now - tweenState.startTime);
        const rawT = Math.min(1, elapsed / tweenState.durationMs);
        const eased = 1 - Math.pow(1 - rawT, 3);
        camera.position.lerpVectors(
          tweenState.fromPos,
          tweenState.toPos,
          eased,
        );
        controls.target.lerpVectors(
          tweenState.fromTarget,
          tweenState.toTarget,
          eased,
        );
        if (rawT >= 1) {
          tweenState = null;
        } else {
          tweenActive = true;
        }
      }

      const dampingActive = controls.update();
      renderer.render(scene, camera);
      isTicking = false;

      if (tweenActive || dampingActive) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const requestRender = () => {
      if (isTicking || rafId !== 0) return;
      rafId = window.requestAnimationFrame(tick);
    };

    const onUserInteractStart = () => {
      tweenState = null;
      setActivePreset(null);
      requestRender();
    };

    controls.addEventListener('start', onUserInteractStart);
    controls.addEventListener('change', requestRender);

    const flyTo = (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS[preset];
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reducedMotion) {
        tweenState = null;
        camera.position.set(...cfg.pos);
        controls.target.set(...cfg.target);
        controls.update();
        requestRender();
        return;
      }

      tweenState = {
        startTime: performance.now(),
        durationMs: 340,
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(...cfg.pos),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...cfg.target),
      };
      requestRender();
    };

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 20 || h <= 20) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);

    engineRef.current = {
      scene,
      camera,
      renderer,
      controls,
      contentGroup,
      wireframeGroup,
      contourGroup,
      requestRender,
      flyTo,
    };

    requestRender();

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      controls.removeEventListener('start', onUserInteractStart);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      disposeObjectTree(contentGroup);
      disposeObjectTree(wireframeGroup);
      disposeObjectTree(contourGroup);
      renderer.dispose();
      engineRef.current = null;
    };
  }, [webglSupported, runtimeFallback]);

  // Effect 2: Rebuild 3D mathematical geometry when surface/integral/probe data changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    disposeObjectTree(engine.contentGroup);
    disposeObjectTree(engine.wireframeGroup);
    disposeObjectTree(engine.contourGroup);

    engine.contentGroup.add(buildCoordinateBoxAndAxes(spatial));

    const { surfaceMesh, wireframeGroup, contourGroup } =
      buildSurfaceAndFloorGroups(result, expression, spatial, hasPrisms);

    if (surfaceMesh) {
      engine.contentGroup.add(surfaceMesh);
    }
    while (wireframeGroup.children.length > 0) {
      engine.wireframeGroup.add(wireframeGroup.children[0]);
    }
    while (contourGroup.children.length > 0) {
      engine.contourGroup.add(contourGroup.children[0]);
    }

    if (result.integralResult || integralConfig) {
      engine.contentGroup.add(
        buildRiemannIntegralGroup(
          result.integralResult?.prisms ?? [],
          integralConfig,
          spatial,
          result.integralResult,
        ),
      );
    }

    if (result.probeResult) {
      engine.contentGroup.add(
        buildProbeAndTangentGroup(result.probeResult, spatial),
      );
    }

    engine.requestRender();
  }, [result, expression, spatial, integralConfig, hasPrisms]);

  // Effect 3: Instant visibility toggles without geometry reconstruction
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.wireframeGroup.visible = wireframeEnabled;
    engine.contourGroup.visible = contoursEnabled;
    engine.requestRender();
  }, [wireframeEnabled, contoursEnabled]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    engineRef.current?.flyTo(preset);
  };

  const handleResetCamera = () => {
    setActivePreset('iso');
    engineRef.current?.flyTo('iso');
  };

  const showFallback = !webglSupported || runtimeFallback;

  return (
    <div
      ref={containerRef}
      className={`function-chart ${styles.viewerRoot}`}
      role="img"
      aria-label={`二元函数 ${expression} 的三维曲面图像`}
    >
      {showFallback ? (
        <div className={styles.fallbackPanel}>
          <span className={styles.fallbackBadge}>三维数学视图 · 静态摘要</span>
          <p className={styles.fallbackTitle}>f(x, y) = {expression}</p>
          <p className={styles.fallbackMeta}>
            定义域 [{formatAxisNumber(spatial.xMin)},{' '}
            {formatAxisNumber(spatial.xMax)}] × [
            {formatAxisNumber(spatial.yMin)}, {formatAxisNumber(spatial.yMax)}]
            {' · '}高程范围 [{formatAxisNumber(spatial.zLo)},{' '}
            {formatAxisNumber(spatial.zHi)}]
            {hasPrisms &&
              ` · 黎曼柱体 ${result.integralResult?.prisms.length ?? 0} 个`}
            {hasProbe &&
              ` · 偏导截痕观察点 (${formatAxisNumber(result.probeResult?.x0 ?? 0)}, ${formatAxisNumber(result.probeResult?.y0 ?? 0)})`}
          </p>
        </div>
      ) : (
        <canvas ref={canvasRef} className={styles.webglCanvas} />
      )}

      <div className={styles.hudTopRight}>
        <div className={styles.capsuleGroup}>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'iso' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('iso')}
          >
            等轴 3D
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'top' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('top')}
          >
            俯视 xOy（看积分域）
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'front' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('front')}
          >
            正视 xOz
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'side' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('side')}
          >
            侧视 yOz
          </button>
          <button
            type="button"
            className={styles.capsuleBtn}
            onClick={handleResetCamera}
          >
            重置视角
          </button>
        </div>

        <div className={styles.capsuleGroup}>
          <button
            type="button"
            aria-pressed={wireframeEnabled}
            className={`${styles.capsuleBtn} ${wireframeEnabled ? styles.capsuleBtnActive : ''}`}
            onClick={() =>
              setWirePref({
                propVal: showWireframe,
                value: !wireframeEnabled,
              })
            }
          >
            曲面网格
          </button>
          <button
            type="button"
            aria-pressed={contoursEnabled}
            className={`${styles.capsuleBtn} ${contoursEnabled ? styles.capsuleBtnActive : ''}`}
            onClick={() =>
              setContourPref({
                propVal: showContours,
                value: !contoursEnabled,
              })
            }
          >
            底面参考面
          </button>
        </div>
      </div>

      <div className={styles.hudBottomLeft} aria-hidden="true">
        <div className={styles.scaleCard}>
          <div className={styles.scaleRow}>
            <span className={styles.scaleLabel}>高程 z</span>
            <span>{formatAxisNumber(spatial.zLo)}</span>
            <span className={styles.colorRamp} />
            <span>{formatAxisNumber(spatial.zHi)}</span>
          </div>

          {(hasPrisms || hasProbe) && (
            <div className={styles.featureBadges}>
              {hasPrisms && (
                <>
                  <span className={styles.badgeItem}>
                    <span className={styles.swatchPos} />z ≥ 0 正体积
                  </span>
                  <span className={styles.badgeItem}>
                    <span className={styles.swatchNeg} />z &lt; 0 负体积
                  </span>
                </>
              )}
              {hasProbe && (
                <>
                  <span className={styles.badgeItem}>
                    <span className={styles.swatchSliceX} />y = y₀ 截痕
                  </span>
                  <span className={styles.badgeItem}>
                    <span className={styles.swatchSliceY} />x = x₀ 截痕
                  </span>
                  {result.probeResult?.fx !== null &&
                    result.probeResult?.fy !== null &&
                    result.probeResult?.z0 !== null && (
                      <span className={styles.badgeItem}>
                        <span className={styles.swatchTangent} />
                        切平面
                      </span>
                    )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.interactionHint}>
          拖拽旋转 · 滚轮缩放 · 右键平移
        </div>
      </div>
    </div>
  );
}
