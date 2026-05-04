import { Handle, Position, type NodeProps } from '@xyflow/react';
import React from 'react';
import type { LineageNode } from '../../types';
import { SOURCE_COLOR } from '../utils/nodeClassifier';

interface SourceNodeData {
  node: LineageNode;
  isFocused: boolean;
}

export function SourceNode({ data }: NodeProps) {
  const { node, isFocused } = data as unknown as SourceNodeData;
  const color = SOURCE_COLOR;

  return (
    <div
      title={node.description || node.name}
      style={{
        width: 180,
        height: 56,
        borderRadius: 5,
        background: '#f3f3f3',
        border: isFocused ? `2.5px solid ${color}` : `2px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 10px',
        overflow: 'hidden',
        boxShadow: isFocused ? `0 0 0 2px ${color}44` : 'none',
        gap: 3,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill={color} style={{ flexShrink: 0 }}>
          <polygon points="5,0 10,5 5,10 0,5" />
        </svg>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#1a1a1a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#555', paddingLeft: 14 }}>
        Source
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color, width: 8, height: 8, border: '2px solid #f3f3f3' }}
      />
    </div>
  );
}
