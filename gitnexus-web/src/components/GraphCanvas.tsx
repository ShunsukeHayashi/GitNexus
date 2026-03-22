import { useEffect, useCallback, useMemo, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { ZoomIn, ZoomOut, Maximize2, Lightbulb, LightbulbOff, X } from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
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
const HIGHLIGHT_COLOR    = '#06b6d4';
const BLAST_COLOR        = '#ef4444';
const SELECTED_COLOR     = '#f59e0b';

// MeshPhong sphere + optional glow halo — gives stereoscopic depth via specular highlights
function buildNodeObject(node: GraphNode): THREE.Group {
  const size  = Math.cbrt(node.val) * 2;
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();

  // Core sphere: Phong shading adds specular highlights that convey 3D depth
  const geo = new THREE.SphereGeometry(size, 16, 8);
  const mat = new THREE.MeshPhongMaterial({
    color,
    shininess: 60,
    specular:  new THREE.Color(0x666666),
    emissive:  node.glow ? color.clone().multiplyScalar(0.3) : new THREE.Color(0x000000),
  });
  group.add(new THREE.Mesh(geo, mat));

  // Back-side halo for highlighted/selected/blast nodes
  if (node.glow) {
    const haloGeo = new THREE.SphereGeometry(size * 2.8, 12, 6);
    const haloMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    });
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
  } = useAppState();

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  const effectiveHighlightedNodeIds = useMemo(() => {
    if (!isAIHighlightsEnabled) return highlightedNodeIds;
    const next = new Set(highlightedNodeIds);
    for (const id of aiCitationHighlightedNodeIds) next.add(id);
    for (const id of aiToolHighlightedNodeIds) next.add(id);
    return next;
  }, [highlightedNodeIds, aiCitationHighlightedNodeIds, aiToolHighlightedNodeIds, isAIHighlightsEnabled]);

  const effectiveBlastRadiusNodeIds = useMemo(() => {
    if (!isAIHighlightsEnabled) return new Set<string>();
    return blastRadiusNodeIds;
  }, [blastRadiusNodeIds, isAIHighlightsEnabled]);

  useEffect(() => {
    if (!graph) return;

    const nodes: GraphNode[] = graph.nodes.map(n => {
      const isBlast    = effectiveBlastRadiusNodeIds.has(n.id);
      const isSelected = appSelectedNode?.id === n.id;
      const isHighlit  = effectiveHighlightedNodeIds.has(n.id);

      const nodeColor = isBlast    ? BLAST_COLOR
                      : isSelected ? SELECTED_COLOR
                      : isHighlit  ? HIGHLIGHT_COLOR
                      : NODE_COLORS[n.label] ?? DEFAULT_NODE_COLOR;

      return {
        id:    n.id,
        name:  n.properties.name,
        val:   n.label === 'Project'   ? 30 : n.label === 'Package'   ? 20 : n.label === 'Module'    ? 15 :
               n.label === 'Folder'    ? 10 : n.label === 'File'      ? 7  : n.label === 'Class'     ? 9  :
               n.label === 'Interface' ? 8  : n.label === 'Function'  ? 4  : n.label === 'Method'    ? 3  : 2,
        color: nodeColor,
        glow:  isBlast || isSelected || isHighlit,
        raw:   n,
      };
    });

    const links: GraphLink[] = graph.relationships.map(r => ({
      source: r.sourceId,
      target: r.targetId,
      color:  EDGE_COLORS[r.type] ?? DEFAULT_EDGE_COLOR,
    }));

    setGraphData({ nodes, links });
  }, [graph, appSelectedNode, effectiveHighlightedNodeIds, effectiveBlastRadiusNodeIds]);

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
        warmupTicks={30}
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
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: HIGHLIGHT_COLOR }} />
            <span className="text-xs text-white/60">AI Highlight</span>
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
