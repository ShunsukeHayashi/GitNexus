import { useEffect, useCallback, useMemo, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { ZoomIn, ZoomOut, Maximize2, Lightbulb, LightbulbOff, X } from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
import type { AnimationType } from '../hooks/useAppState';
import { QueryFAB } from './QueryFAB';

export interface GraphCanvasHandle {
  focusNode: (nodeId: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  glow: boolean;
  /** Animation type from triggerNodeAnimation; independent of the static glow flag */
  animationType?: AnimationType;
  raw: any;
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink {
  source: string;
  target: string;
  color: string;
}

// Vivid/bright colors for dark canvas background (#06060a)
const NODE_COLORS: Record<string, string> = {
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

// Vivid edge colors per relationship type
const EDGE_COLORS: Record<string, string> = {
  CONTAINS:   '#22c55e',
  DEFINES:    '#06b6d4',
  IMPORTS:    '#60a5fa',
  CALLS:      '#c084fc',
  EXTENDS:    '#fb923c',
  IMPLEMENTS: '#f472b6',
};

const DEFAULT_NODE_COLOR = '#94a3b8';
const DEFAULT_EDGE_COLOR = '#4a4a70';
// T002: distinct colors for each AI highlight source
const CITATION_COLOR  = '#06b6d4';  // Cyan   — AI citation grounding
const TOOL_COLOR      = '#a855f7';  // Purple — AI tool result
const HIGHLIGHT_COLOR = '#38bdf8';  // Sky    — manual query highlight
const BLAST_COLOR     = '#ef4444';
const SELECTED_COLOR  = '#f59e0b';

// T004: module-level geometry/material caches — shared across all node renders
// Geometries are keyed by "radius:wSeg:hSeg", materials by "colorHex:shininess:emissiveHex"
// Each node still gets its own THREE.Group so it can be positioned independently.
const _geoCache = new Map<string, THREE.SphereGeometry>();
const _matCache = new Map<string, THREE.MeshPhongMaterial>();
const _haloGeoCache = new Map<string, THREE.SphereGeometry>();
const _haloMatCache = new Map<string, THREE.MeshBasicMaterial>();

function _cachedSphereGeo(radius: number, w: number, h: number): THREE.SphereGeometry {
  const k = `${radius.toFixed(4)}:${w}:${h}`;
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.SphereGeometry(radius, w, h));
  return _geoCache.get(k)!;
}

function _cachedPhongMat(color: THREE.Color, shininess: number, emissive: THREE.Color): THREE.MeshPhongMaterial {
  const k = `${color.getHexString()}:${shininess}:${emissive.getHexString()}`;
  if (!_matCache.has(k)) {
    _matCache.set(k, new THREE.MeshPhongMaterial({
      color: color.clone(),
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
      color: color.clone(),
      transparent: true,
      opacity,
      side: THREE.BackSide,
    }));
  }
  return _haloMatCache.get(k)!;
}

// MeshPhong sphere + optional glow halo — gives stereoscopic depth via specular highlights
// animationType modifies emissiveIntensity and halo geometry independently of the static glow flag.
// T004: reuses cached geometries/materials to minimise GPU allocations per frame.
function buildNodeObject(node: GraphNode): THREE.Group {
  const size  = Math.cbrt(node.val) * 2;
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();

  // Determine emissive contribution from animationType
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

  // Halo — ripple spreads wider, pulse/glow are brighter
  const shouldShowHalo = node.glow || node.animationType != null;
  if (shouldShowHalo) {
    const haloRadius  = node.animationType === 'ripple' ? size * 3.5 : size * 2.8;
    const haloOpacity = node.animationType === 'pulse'  ? 0.35
                      : node.animationType === 'glow'   ? 0.30
                      : node.animationType === 'ripple' ? 0.15
                      : 0.18;

    const haloGeoKey = `${haloRadius.toFixed(4)}:12:6`;
    if (!_haloGeoCache.has(haloGeoKey))
      _haloGeoCache.set(haloGeoKey, new THREE.SphereGeometry(haloRadius, 12, 6));

    const haloGeo = _haloGeoCache.get(haloGeoKey)!;
    const haloMat = _cachedHaloMat(color, haloOpacity);
    group.add(new THREE.Mesh(haloGeo, haloMat));
  }

  return group;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle>((_, ref) => {
  const {
    graph,
    setSelectedNode,
    selectedNode: appSelectedNode,
    openCodePanel,
    isAIHighlightsEnabled,
    toggleAIHighlights,
    highlightedNodeIds,
    setHighlightedNodeIds,
    aiCitationHighlightedNodeIds,
    aiToolHighlightedNodeIds,
    blastRadiusNodeIds,
    // T007: filter states now consumed by GraphCanvas
    visibleLabels,
    visibleEdgeTypes,
    // T001: animation state from triggerNodeAnimation
    animatedNodes,
  } = useAppState();

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  // T005: warmupTicks scales with graph size (10–50), avoids over-simulation on small graphs
  const warmupTicks = useMemo(
    () => Math.min(50, Math.max(10, Math.ceil((graph?.nodes.length ?? 0) / 20))),
    [graph?.nodes.length]
  );

  // T007: filter + T002: per-source AI color differentiation
  useEffect(() => {
    if (!graph) return;

    const visibleLabelSet = new Set<string>(visibleLabels);
    const visibleEdgeSet  = new Set<string>(visibleEdgeTypes);
    const effectiveBlast  = isAIHighlightsEnabled ? blastRadiusNodeIds : new Set<string>();

    const nodes: GraphNode[] = graph.nodes
      // T007: respect label filter (empty set = show all)
      .filter(n => visibleLabelSet.size === 0 || visibleLabelSet.has(n.label))
      .map(n => {
        const isBlast    = effectiveBlast.has(n.id);
        const isSelected = appSelectedNode?.id === n.id;
        // T002: check citation vs tool separately
        const isCitation = isAIHighlightsEnabled && aiCitationHighlightedNodeIds.has(n.id);
        const isTool     = isAIHighlightsEnabled && aiToolHighlightedNodeIds.has(n.id);
        const isHighlit  = highlightedNodeIds.has(n.id);

        const nodeColor = isBlast    ? BLAST_COLOR
                        : isSelected ? SELECTED_COLOR
                        : isTool     ? TOOL_COLOR      // T002: tool purple
                        : isCitation ? CITATION_COLOR  // T002: citation cyan
                        : isHighlit  ? HIGHLIGHT_COLOR
                        : NODE_COLORS[n.label] ?? DEFAULT_NODE_COLOR;

        // T001: pick up animation type if this node is currently animated
        const animationType = animatedNodes.get(n.id)?.type;

        return {
          id:    n.id,
          name:  n.properties.name,
          val:   n.label === 'Project'   ? 30 : n.label === 'Package'   ? 20 : n.label === 'Module'    ? 15 :
                 n.label === 'Folder'    ? 10 : n.label === 'File'      ? 7  : n.label === 'Class'     ? 9  :
                 n.label === 'Interface' ? 8  : n.label === 'Function'  ? 4  : n.label === 'Method'    ? 3  : 2,
          color: nodeColor,
          glow:  isBlast || isSelected || isCitation || isTool || isHighlit,
          animationType,
          raw:   n,
        };
      });

    const links: GraphLink[] = graph.relationships
      // T007: respect edge type filter (empty set = show all)
      .filter(r => visibleEdgeSet.size === 0 || visibleEdgeSet.has(r.type))
      .map(r => ({
        source: r.sourceId,
        target: r.targetId,
        color:  EDGE_COLORS[r.type] ?? DEFAULT_EDGE_COLOR,
      }));

    setGraphData({ nodes, links });
  }, [
    graph,
    appSelectedNode,
    highlightedNodeIds,
    blastRadiusNodeIds,
    aiCitationHighlightedNodeIds,
    aiToolHighlightedNodeIds,
    isAIHighlightsEnabled,
    visibleLabels,    // T007
    visibleEdgeTypes, // T007
    animatedNodes,    // T001
  ]);

  // Stable callback — reads only from node data, no external deps needed
  const nodeThreeObject = useCallback((node: unknown) => buildNodeObject(node as GraphNode), []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (!node?.raw) return;
    setSelectedNode(node.raw);
    openCodePanel();

    const distance = 60;
    const dist = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    const distRatio = dist > 0 ? 1 + distance / dist : 2.5;
    fgRef.current?.cameraPosition(
      {
        x: (node.x ?? 0) * distRatio,
        y: (node.y ?? 0) * distRatio,
        z: (node.z ?? 0) * distRatio,
      },
      node as any,
      1500
    );
  }, [setSelectedNode, openCodePanel]);

  useImperativeHandle(ref, () => ({
    focusNode: (nodeId: string) => {
      // ForceGraph3D のライブデータから位置を取得（シミュレーション後のx/y/zを持つ）
      const liveNodes = (fgRef.current as any)?.graphData()?.nodes as GraphNode[] | undefined;
      const node = liveNodes?.find((n: GraphNode) => n.id === nodeId);
      if (node) handleNodeClick(node);
    },
  }), [handleNodeClick]);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setHighlightedNodeIds(new Set());
  }, [setSelectedNode, setHighlightedNodeIds]);

  const handleZoomIn = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) {
      fgRef.current?.cameraPosition(
        { x: pos.x * 0.8, y: pos.y * 0.8, z: pos.z * 0.8 },
        undefined,
        400
      );
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) {
      fgRef.current?.cameraPosition(
        { x: pos.x * 1.25, y: pos.y * 1.25, z: pos.z * 1.25 },
        undefined,
        400
      );
    }
  }, []);

  const handleResetCamera = useCallback(() => {
    fgRef.current?.cameraPosition({ x: 0, y: 0, z: 400 }, undefined, 800);
  }, []);

  return (
    <div className="relative w-full h-full bg-void overflow-hidden">
      {/* 3D Force Graph — Phong shading + glow halos + directional particles */}
      <ForceGraph3D
        ref={fgRef as any}
        graphData={graphData as any}
        nodeId="id"
        nodeLabel="name"
        nodeColor="color"
        nodeVal="val"
        nodeThreeObject={nodeThreeObject as any}
        linkColor="color"
        backgroundColor="#06060a"
        onNodeClick={handleNodeClick as any}
        enableNodeDrag={false}
        linkOpacity={0.6}
        linkWidth={1.0}
        warmupTicks={warmupTicks}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor="color"
      />

      {/* Selected node info bar */}
      {appSelectedNode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/70 border border-white/10 rounded-xl backdrop-blur-sm z-20">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: SELECTED_COLOR }} />
          <span className="font-mono text-sm text-white">
            {appSelectedNode.properties.name}
          </span>
          <span className="text-xs text-white/50">
            ({appSelectedNode.label})
          </span>
          <button
            onClick={handleClearSelection}
            className="ml-1 p-0.5 text-white/40 hover:text-white transition-colors rounded"
            title="Clear selection"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Camera controls - Bottom Right */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetCamera}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Reset Camera"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* AI Highlights toggle - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => {
            if (isAIHighlightsEnabled) {
              setHighlightedNodeIds(new Set());
            }
            toggleAIHighlights();
          }}
          className={
            isAIHighlightsEnabled
              ? 'w-10 h-10 flex items-center justify-center bg-cyan-500/20 border border-cyan-400/40 rounded-lg text-cyan-300 hover:bg-cyan-500/30 transition-colors backdrop-blur-sm'
              : 'w-10 h-10 flex items-center justify-center bg-black/60 border border-white/10 rounded-lg text-white/40 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm'
          }
          title={isAIHighlightsEnabled ? 'Turn off highlights' : 'Turn on AI highlights'}
        >
          {isAIHighlightsEnabled ? <Lightbulb className="w-4 h-4" /> : <LightbulbOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Node color legend - Bottom Left */}
      <div className="absolute bottom-4 left-4 p-3 bg-black/70 border border-white/10 rounded-xl backdrop-blur-md z-10 max-h-64 overflow-y-auto">
        <p className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">Node Types</p>
        <div className="flex flex-col gap-1.5">
          {(['Project','Package','Module','Folder','File','Class','Function','Method','Interface'] as const).map(label => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: NODE_COLORS[label] }} />
              <span className="text-xs text-white/70">{label}</span>
            </div>
          ))}
          <div className="border-t border-white/10 my-1" />
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SELECTED_COLOR }} />
            <span className="text-xs text-white/60">Selected</span>
          </div>
          {/* T002: distinct legend entries for each AI highlight type */}
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CITATION_COLOR }} />
            <span className="text-xs text-white/60">AI Citation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TOOL_COLOR }} />
            <span className="text-xs text-white/60">AI Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: HIGHLIGHT_COLOR }} />
            <span className="text-xs text-white/60">Query Match</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: BLAST_COLOR }} />
            <span className="text-xs text-white/60">Blast Radius</span>
          </div>
        </div>
      </div>

      {/* Query FAB */}
      <QueryFAB />
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';
