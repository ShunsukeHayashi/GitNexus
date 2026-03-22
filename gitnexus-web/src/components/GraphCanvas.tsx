import {
  useEffect, useCallback, useMemo, useState,
  forwardRef, useImperativeHandle, useRef,
} from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import { useAppState } from '../hooks/useAppState';
import {
  GraphNode, GraphLink,
  NODE_COLORS, EDGE_COLORS,
  DEFAULT_NODE_COLOR, DEFAULT_EDGE_COLOR,
  BLAST_COLOR, SELECTED_COLOR, TOOL_COLOR, CITATION_COLOR, HIGHLIGHT_COLOR,
  buildNodeObject,
} from '../lib/graphNodeUtils';
import { GraphCanvasOverlay } from './GraphCanvasOverlay';

export interface GraphCanvasHandle {
  focusNode: (nodeId: string) => void;
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
    visibleLabels,
    visibleEdgeTypes,
    animatedNodes,
  } = useAppState();

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  const warmupTicks = useMemo(
    () => Math.min(50, Math.max(10, Math.ceil((graph?.nodes.length ?? 0) / 20))),
    [graph?.nodes.length],
  );

  useEffect(() => {
    if (!graph) return;

    const visibleLabelSet = new Set<string>(visibleLabels);
    const visibleEdgeSet  = new Set<string>(visibleEdgeTypes);
    const effectiveBlast  = isAIHighlightsEnabled ? blastRadiusNodeIds : new Set<string>();

    const nodes: GraphNode[] = graph.nodes
      .filter(n => visibleLabelSet.size === 0 || visibleLabelSet.has(n.label))
      .map(n => {
        const isBlast    = effectiveBlast.has(n.id);
        const isSelected = appSelectedNode?.id === n.id;
        const isCitation = isAIHighlightsEnabled && aiCitationHighlightedNodeIds.has(n.id);
        const isTool     = isAIHighlightsEnabled && aiToolHighlightedNodeIds.has(n.id);
        const isHighlit  = highlightedNodeIds.has(n.id);

        const nodeColor = isBlast    ? BLAST_COLOR
                        : isSelected ? SELECTED_COLOR
                        : isTool     ? TOOL_COLOR
                        : isCitation ? CITATION_COLOR
                        : isHighlit  ? HIGHLIGHT_COLOR
                        : NODE_COLORS[n.label] ?? DEFAULT_NODE_COLOR;

        const animationType = animatedNodes.get(n.id)?.type;

        return {
          id:   n.id,
          name: n.properties.name,
          val:  n.label === 'Project'   ? 30 : n.label === 'Package'   ? 20 : n.label === 'Module'    ? 15
              : n.label === 'Folder'    ? 10 : n.label === 'File'      ? 7  : n.label === 'Class'     ? 9
              : n.label === 'Interface' ? 8  : n.label === 'Function'  ? 4  : n.label === 'Method'    ? 3  : 2,
          color: nodeColor,
          glow:  isBlast || isSelected || isCitation || isTool || isHighlit,
          animationType,
          raw:   n,
        };
      });

    const links: GraphLink[] = graph.relationships
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
    visibleLabels,
    visibleEdgeTypes,
    animatedNodes,
  ]);

  const nodeThreeObject = useCallback((node: unknown) => buildNodeObject(node as GraphNode), []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (!node?.raw) return;
    setSelectedNode(node.raw);
    openCodePanel();

    const distance  = 60;
    const dist      = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    const distRatio = dist > 0 ? 1 + distance / dist : 2.5;
    fgRef.current?.cameraPosition(
      { x: (node.x ?? 0) * distRatio, y: (node.y ?? 0) * distRatio, z: (node.z ?? 0) * distRatio },
      node as any,
      1500,
    );
  }, [setSelectedNode, openCodePanel]);

  useImperativeHandle(ref, () => ({
    focusNode: (nodeId: string) => {
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
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) fgRef.current?.cameraPosition(
      { x: pos.x * 0.8, y: pos.y * 0.8, z: pos.z * 0.8 }, undefined, 400,
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) fgRef.current?.cameraPosition(
      { x: pos.x * 1.25, y: pos.y * 1.25, z: pos.z * 1.25 }, undefined, 400,
    );
  }, []);

  const handleResetCamera = useCallback(() => {
    fgRef.current?.cameraPosition({ x: 0, y: 0, z: 400 }, undefined, 800);
  }, []);

  const handleToggleAIHighlights = useCallback(() => {
    if (isAIHighlightsEnabled) setHighlightedNodeIds(new Set());
    toggleAIHighlights();
  }, [isAIHighlightsEnabled, setHighlightedNodeIds, toggleAIHighlights]);

  return (
    <div className="relative w-full h-full bg-void overflow-hidden">
      <ForceGraph3D
        ref={fgRef as any}
        graphData={graphData as any}
        nodeId="id"
        nodeLabel="name"
        nodeColor="color"
        nodeVal="val"
        nodeThreeObject={nodeThreeObject as any}
        linkColor="color"
        backgroundColor="#f2f2f7"
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

      <GraphCanvasOverlay
        selectedNode={appSelectedNode}
        onClearSelection={handleClearSelection}
        isAIHighlightsEnabled={isAIHighlightsEnabled}
        onToggleAIHighlights={handleToggleAIHighlights}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
      />
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';
