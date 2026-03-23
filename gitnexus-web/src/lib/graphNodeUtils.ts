/**
 * graphNodeUtils.ts
 * Shared types, color constants, and Three.js mesh factory for the 3D knowledge graph.
 * Extracted from GraphCanvas.tsx (T006 component split).
 */

import * as THREE from 'three';
import type { AnimationType } from '../hooks/useAppState';

// ---------------------------------------------------------------------------
// Graph data types (used by GraphCanvas and data-wiring logic)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  glow: boolean;
  /** Animation type from triggerNodeAnimation; independent of the static glow flag */
  animationType?: AnimationType;
  /** Repository namespace — used for cluster force grouping (T012) */
  repoName?: string;
  raw: any;
  x?: number;
  y?: number;
  z?: number;
  /** T023: hex colors for users who have this node focused (renders torus ring per color) */
  presenceFocusColors?: string[];
  /** T023: hex colors for users who have this node in their selectedNodeIds (renders faint tinted border) */
  presenceSelectedColors?: string[];
}

export interface GraphLink {
  source: string;
  target: string;
  color: string;
  /** True when this is a CROSS_REPO_CALL edge — rendered as dashed line (T012) */
  isCrossRepo?: boolean;
  /** Source repository name for CROSS_REPO_CALL edges */
  sourceRepo?: string;
  /** Target repository name for CROSS_REPO_CALL edges */
  targetRepo?: string;
}

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

/** Vivid/bright node colors for dark canvas background (#06060a) */
export const NODE_COLORS: Record<string, string> = {
  Project:   '#e879f9',  // Bright fuchsia
  Package:   '#c084fc',  // Bright violet
  Module:    '#a78bfa',  // Bright purple
  Folder:    '#818cf8',  // Bright indigo
  File:      '#60a5fa',  // Bright sky blue
  Class:     '#fbbf24',  // Bright amber
  Function:  '#34d399',  // Bright emerald
  Method:    '#2dd4bf',  // Bright teal
  Interface: '#f472b6',  // Bright pink
  Enum:      '#fb923c',  // Bright orange
  Decorator: '#facc15',  // Bright yellow
  Community: '#38bdf8',  // Bright sky
  Process:   '#fb7185',  // Bright rose
};

/** Vivid edge colors per relationship type */
export const EDGE_COLORS: Record<string, string> = {
  CONTAINS:        '#22c55e',
  DEFINES:         '#06b6d4',
  IMPORTS:         '#60a5fa',
  CALLS:           '#c084fc',
  EXTENDS:         '#fb923c',
  IMPLEMENTS:      '#f472b6',
  // T012: cross-repo call — vivid orange so it stands out from in-repo CALLS (violet)
  CROSS_REPO_CALL: '#f97316',
};

export const DEFAULT_NODE_COLOR = '#94a3b8';
export const DEFAULT_EDGE_COLOR = '#4a4a70';

// T012: distinct color used exclusively for CROSS_REPO_CALL dashed edges
export const CROSS_REPO_EDGE_COLOR = '#f97316'; // Bright orange

// ---------------------------------------------------------------------------
// T012: Repo-cluster palette — up to 12 distinct colors for repo bounding
// hulls and tinted cluster labels.
// ---------------------------------------------------------------------------
export const REPO_CLUSTER_COLORS = [
  '#38bdf8', // sky
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
  '#f87171', // red
  '#60a5fa', // blue
  '#c084fc', // purple
  '#2dd4bf', // teal
  '#facc15', // yellow
] as const;

/**
 * Return a consistent color for a given repository name.
 * Uses a simple djb2-style hash so the same repo always maps to the same color.
 */
export function getRepoColor(repoName: string): string {
  let hash = 5381;
  for (let i = 0; i < repoName.length; i++) {
    hash = ((hash << 5) + hash) ^ repoName.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return REPO_CLUSTER_COLORS[hash % REPO_CLUSTER_COLORS.length];
}

// Highlight colors — one per source (T002)
export const CITATION_COLOR  = '#06b6d4';  // Cyan   — AI citation grounding
export const TOOL_COLOR      = '#a855f7';  // Purple — AI tool result
export const HIGHLIGHT_COLOR = '#38bdf8';  // Sky    — manual query highlight
export const BLAST_COLOR     = '#ef4444';
export const SELECTED_COLOR  = '#f59e0b';

// ---------------------------------------------------------------------------
// T023: Presence colors — 8 visually distinct hex values for multi-user indicators
// Chosen to contrast against both the dark canvas and the existing node palette.
// ---------------------------------------------------------------------------

export const PRESENCE_COLORS: readonly string[] = [
  '#f59e0b',  // Amber
  '#10b981',  // Emerald
  '#3b82f6',  // Blue
  '#ec4899',  // Pink
  '#8b5cf6',  // Violet
  '#14b8a6',  // Teal
  '#f97316',  // Orange
  '#6366f1',  // Indigo
] as const;

/**
 * Returns a presence color for the given round-robin index.
 * @param index - 0-based index; wraps around modulo PRESENCE_COLORS.length
 */
export function getPresenceColor(index: number): string {
  return PRESENCE_COLORS[((index % PRESENCE_COLORS.length) + PRESENCE_COLORS.length) % PRESENCE_COLORS.length];
}

// ---------------------------------------------------------------------------
// T004: module-level geometry / material caches
// Geometries keyed by "radius:wSeg:hSeg", materials by visual parameters.
// Each node still receives its own THREE.Group for independent positioning.
// ---------------------------------------------------------------------------

const _geoCache     = new Map<string, THREE.SphereGeometry>();
const _matCache     = new Map<string, THREE.MeshPhongMaterial>();
const _haloGeoCache = new Map<string, THREE.SphereGeometry>();
const _haloMatCache = new Map<string, THREE.MeshBasicMaterial>();

function _cachedSphereGeo(radius: number, w: number, h: number): THREE.SphereGeometry {
  const k = `${radius.toFixed(4)}:${w}:${h}`;
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.SphereGeometry(radius, w, h));
  return _geoCache.get(k)!;
}

function _cachedPhongMat(
  color: THREE.Color,
  shininess: number,
  emissive: THREE.Color,
): THREE.MeshPhongMaterial {
  const k = `${color.getHexString()}:${shininess}:${emissive.getHexString()}`;
  if (!_matCache.has(k)) {
    _matCache.set(k, new THREE.MeshPhongMaterial({
      color:    color.clone(),
      shininess,
      specular: new THREE.Color(0x666666),
      emissive: emissive.clone(),
    }));
  }
  return _matCache.get(k)!;
}

function _cachedHaloMat(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  const k = `${color.getHexString()}:${opacity}`;
  if (!_haloMatCache.has(k)) {
    _haloMatCache.set(k, new THREE.MeshBasicMaterial({
      color:       color.clone(),
      transparent: true,
      opacity,
      side:        THREE.BackSide,
    }));
  }
  return _haloMatCache.get(k)!;
}

// ---------------------------------------------------------------------------
// T025: Golden aura color constant for active AI agent work
// ---------------------------------------------------------------------------

/** Golden aura color (#fbbf24) rendered on nodes being actively read/written by an AI agent */
export const AGENT_AURA_COLOR = '#fbbf24';

// Cache for T025 agent aura geometry/material (reused across all active nodes)
const _agentAuraGeoCache = new Map<string, THREE.SphereGeometry>();
const _agentAuraMatCache = new Map<string, THREE.MeshBasicMaterial>();

function _cachedAgentAuraMat(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  const k = `${color.getHexString()}:${opacity}`;
  if (!_agentAuraMatCache.has(k)) {
    _agentAuraMatCache.set(k, new THREE.MeshBasicMaterial({
      color:       color.clone(),
      transparent: true,
      opacity,
      side:        THREE.BackSide,
    }));
  }
  return _agentAuraMatCache.get(k)!;
}

// Cache for T025 agent name badge textures — keyed by agent name string.
// Avoids recreating a <canvas> + CanvasTexture on every render tick.
const _agentBadgeTexCache = new Map<string, THREE.CanvasTexture>();

function _cachedAgentBadgeTex(name: string): THREE.CanvasTexture {
  if (!_agentBadgeTexCache.has(name)) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.font         = 'Bold 20px Arial, sans-serif';
      ctx.fillStyle    = '#ff9900';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 128, 32);
    }
    _agentBadgeTexCache.set(name, new THREE.CanvasTexture(canvas));
  }
  return _agentBadgeTexCache.get(name)!;
}

// ---------------------------------------------------------------------------
// buildNodeObject — MeshPhong sphere + optional glow halo
// Reuses cached geometries/materials (T004) to minimise GPU allocations per frame.
// animationType modifies emissive intensity and halo size independently of glow flag.
// T025: accepts optional `agentNames` (string[]) to add a golden aura + name badge.
//       Pass undefined/empty to render without agent indicators.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Presence ring geometry / material caches (T023)
// One thin torus ring per presence user focused on this node.
// ---------------------------------------------------------------------------

const _ringGeoCache = new Map<string, THREE.TorusGeometry>();
const _ringMatCache = new Map<string, THREE.MeshBasicMaterial>();

function _cachedTorusGeo(radius: number, tube: number): THREE.TorusGeometry {
  const k = `${radius.toFixed(4)}:${tube.toFixed(4)}`;
  if (!_ringGeoCache.has(k)) _ringGeoCache.set(k, new THREE.TorusGeometry(radius, tube, 6, 24));
  return _ringGeoCache.get(k)!;
}

function _cachedRingMat(hex: string, opacity: number): THREE.MeshBasicMaterial {
  const k = `${hex}:${opacity.toFixed(3)}`;
  if (!_ringMatCache.has(k)) {
    _ringMatCache.set(k, new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex),
      transparent: true,
      opacity,
    }));
  }
  return _ringMatCache.get(k)!;
}

export function buildNodeObject(node: GraphNode, agentNames?: string[]): THREE.Group {
  const size  = Math.cbrt(node.val) * 2;
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();

  // Emissive scalar per state
  let emissiveScalar = 0;
  if      (node.animationType === 'glow')   emissiveScalar = 0.60;
  else if (node.animationType === 'pulse')  emissiveScalar = 0.55;
  else if (node.animationType === 'ripple') emissiveScalar = 0.25;
  else if (node.glow)                        emissiveScalar = 0.30;

  const emissiveColor = emissiveScalar > 0
    ? color.clone().multiplyScalar(emissiveScalar)
    : new THREE.Color(0x000000);

  const shininess = node.animationType === 'pulse' ? 120 : 60;

  // Core sphere — reuse cached geo + mat
  const geo = _cachedSphereGeo(size, 16, 8);
  const mat = _cachedPhongMat(color, shininess, emissiveColor);
  group.add(new THREE.Mesh(geo, mat));

  // Halo — ripple spreads wider; pulse/glow are brighter
  if (node.glow || node.animationType != null) {
    const haloRadius  = node.animationType === 'ripple' ? size * 3.5 : size * 2.8;
    const haloOpacity = node.animationType === 'pulse'  ? 0.35
                      : node.animationType === 'glow'   ? 0.30
                      : node.animationType === 'ripple' ? 0.15
                      : 0.18;

    const haloGeoKey = `${haloRadius.toFixed(4)}:12:6`;
    if (!_haloGeoCache.has(haloGeoKey))
      _haloGeoCache.set(haloGeoKey, new THREE.SphereGeometry(haloRadius, 12, 6));

    group.add(new THREE.Mesh(
      _haloGeoCache.get(haloGeoKey)!,
      _cachedHaloMat(color, haloOpacity),
    ));
  }

  // T023: Presence focus rings — one thin torus per focused user, slightly distinct radii
  // so multiple simultaneous users are visible (each ring offset by 0.4 * index).
  if (node.presenceFocusColors && node.presenceFocusColors.length > 0) {
    const baseRingRadius = size * 2.0;
    const tubeRadius     = Math.max(0.12, size * 0.10);
    node.presenceFocusColors.forEach((hex, i) => {
      const ringRadius = baseRingRadius + i * tubeRadius * 2.5;
      const ring = new THREE.Mesh(
        _cachedTorusGeo(ringRadius, tubeRadius),
        _cachedRingMat(hex, 0.85),
      );
      // Tilt slightly so the ring is visible even from front-facing angles
      ring.rotation.x = Math.PI / 4;
      group.add(ring);
    });
  }

  // T023: Presence selection tint — very faint sphere overlay for nodes in another
  // user's selectedNodeIds list, distinct from the focused-ring style.
  if (node.presenceSelectedColors && node.presenceSelectedColors.length > 0) {
    // Use the first (or only) user's color for the tint
    const tintHex = node.presenceSelectedColors[0];
    const tintRadius = size * 1.55;
    const tintGeoKey = `${tintRadius.toFixed(4)}:10:5`;
    if (!_haloGeoCache.has(tintGeoKey))
      _haloGeoCache.set(tintGeoKey, new THREE.SphereGeometry(tintRadius, 10, 5));
    group.add(new THREE.Mesh(
      _haloGeoCache.get(tintGeoKey)!,
      _cachedHaloMat(new THREE.Color(tintHex), 0.12),
    ));
  }

  // T025: Golden aura + agent name badge for nodes actively worked on by AI agents
  if (agentNames && agentNames.length > 0) {
    const auraRadius  = size * 4.2;
    const auraColor   = new THREE.Color(AGENT_AURA_COLOR);
    const auraGeoKey  = `${auraRadius.toFixed(4)}:14:7`;
    if (!_agentAuraGeoCache.has(auraGeoKey)) {
      _agentAuraGeoCache.set(auraGeoKey, new THREE.SphereGeometry(auraRadius, 14, 7));
    }
    group.add(new THREE.Mesh(
      _agentAuraGeoCache.get(auraGeoKey)!,
      _cachedAgentAuraMat(auraColor, 0.35),
    ));

    // Orange canvas-text badge floating above the aura — one badge per agent.
    // Textures are module-level cached so no canvas/texture allocation occurs per frame.
    agentNames.forEach((name, i) => {
      const spriteMat = new THREE.SpriteMaterial({
        map:       _cachedAgentBadgeTex(name),
        transparent: true,
        depthTest:   false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(18, 4.5, 1);
      // Stack badges above the aura; each subsequent agent offset further up
      sprite.position.set(0, auraRadius + 4 + i * 5, 0);
      group.add(sprite);
    });
  }

  return group;
}
