import React from 'react';
import { NetworkData, AssetData, StressTestConfig } from '../types';
import { Flame, Info, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface NetworkVisualizationProps {
  network: NetworkData;
  assets?: AssetData[];
  stressConfig?: StressTestConfig;
}

export const NetworkVisualization: React.FC<NetworkVisualizationProps> = ({
  network,
  assets = [],
  stressConfig,
}) => {
  const { nodes, edges } = network;
  const [transform, setTransform] = React.useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = React.useState<any | null>(null);

  const width = 800;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 60;

  if (nodes.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <p className="text-slate-500 font-medium">No network connections formed at the current correlation threshold.</p>
        <p className="text-xs text-slate-400 mt-1">Try lowering the correlation threshold in settings or selecting a different stress scenario.</p>
      </div>
    );
  }

  // Calculate circular layout positions
  const nodePositions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    nodePositions[node.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoom = (factor: number) => {
    setTransform(prev => ({
      ...prev,
      k: Math.max(0.4, Math.min(3, prev.k * factor)),
    }));
  };

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, k: 1 });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Planar TMFG Network Topology
            {stressConfig?.enabled && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                <Flame className="w-3 h-3 text-amber-600" />
                Stressed Graph ({stressConfig.volatilityMultiplier}x Vol)
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Planar Triangulated Maximal Graph with {nodes.length} nodes and {edges.length} active edges.
            Nodes are colored from <span className="text-red-600 font-semibold">Red (Core / High Centrality)</span> to <span className="text-blue-600 font-semibold">Blue (Periphery / High Diversification)</span>.
          </p>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => handleZoom(1.2)}
            title="Zoom In"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(0.8)}
            title="Zoom Out"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            title="Reset View"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="relative border border-slate-200 rounded-xl bg-slate-900/95 overflow-hidden shadow-inner cursor-grab active:cursor-grabbing"
        style={{ height: '620px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full select-none"
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Draw Edges */}
            {edges.map((edge, i) => {
              const src = nodePositions[edge.source];
              const tgt = nodePositions[edge.target];
              if (!src || !tgt) return null;

              const isHighlighted =
                hoveredNode && (hoveredNode.id === edge.source || hoveredNode.id === edge.target);

              const strokeColor = edge.weight >= 0
                ? `rgba(59, 130, 246, ${Math.min(0.85, Math.max(0.15, Math.abs(edge.weight)))})`
                : `rgba(239, 68, 68, ${Math.min(0.85, Math.max(0.15, Math.abs(edge.weight)))})`;

              return (
                <line
                  key={`${edge.source}-${edge.target}-${i}`}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={isHighlighted ? '#f59e0b' : strokeColor}
                  strokeWidth={isHighlighted ? 2.5 : Math.max(1, Math.abs(edge.weight) * 3)}
                  strokeDasharray={edge.weight < 0 ? '4 2' : undefined}
                />
              );
            })}

            {/* Draw Nodes */}
            {nodes.map(node => {
              const pos = nodePositions[node.id];
              if (!pos) return null;

              // Color gradient: low peripherality = Core (red), high peripherality = Periphery (blue)
              const p = node.peripheralityScore;
              const r = Math.round(239 * (1 - p) + 59 * p);
              const g = Math.round(68 * (1 - p) + 130 * p);
              const b = Math.round(68 * (1 - p) + 246 * p);
              const nodeColor = `rgb(${r}, ${g}, ${b})`;

              const isHovered = hoveredNode?.id === node.id;
              const radiusSize = Math.max(16, 12 + node.degree * 1.5);

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer transition-transform"
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <circle
                    r={isHovered ? radiusSize + 4 : radiusSize}
                    fill={nodeColor}
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 3 : 1.5}
                    className="transition-all duration-150"
                  />
                  <text
                    textAnchor="middle"
                    dy=".35em"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight="bold"
                    className="pointer-events-none font-mono"
                  >
                    {node.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover info tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-slate-800/95 backdrop-blur text-white text-xs p-3.5 rounded-xl border border-slate-700 shadow-xl pointer-events-none min-w-[200px]">
            <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
              <span className="font-bold text-sm font-mono text-amber-400">{hoveredNode.id}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 font-semibold">
                {hoveredNode.peripheralityScore >= 0.7
                  ? 'Periphery'
                  : hoveredNode.peripheralityScore <= 0.3
                  ? 'Core'
                  : 'Intermediate'}
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Peripherality Score:</span>
                <span className="font-bold text-blue-400">{hoveredNode.peripheralityScore.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Network Degree:</span>
                <span>{hoveredNode.degree} edges</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Closeness Centrality:</span>
                <span>{hoveredNode.closeness.toFixed(4)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-slate-800/80 backdrop-blur text-white text-[11px] p-3 rounded-lg border border-slate-700 flex flex-col gap-1.5 pointer-events-none">
          <div className="font-bold text-slate-300 border-b border-slate-700 pb-1">TMFG Node Classification</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            <span>Core (Central, Systemic Risk)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            <span>Periphery (Diversifier, Decorrelated)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-[10px] mt-1">
            <span>Scroll/drag to pan • Drag to re-center</span>
          </div>
        </div>
      </div>
    </div>
  );
};
