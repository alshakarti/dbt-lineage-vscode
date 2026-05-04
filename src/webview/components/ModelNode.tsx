import { Handle, Position, type NodeProps } from '@xyflow/react';
import React from 'react';
import type { LineageNode } from '../../types';
import { getNodeColor } from '../utils/nodeClassifier';

interface ModelNodeData {
  node: LineageNode;
  isFocused: boolean;
  onOpen?: (path: string) => void;
}

export function ModelNode({ data }: NodeProps) {
  const { node, isFocused, onOpen } = data as unknown as ModelNodeData;
  const color = getNodeColor(node.resourceType, node.materialization, node.nodeColor);

  return (
    <div
      title={node.description || node.name}
      onClick={() => node.path && onOpen?.(node.path)}
      style={{
        width: 180,
        minHeight: 56,
        borderRadius: 5,
        background: '#f3f3f3',
        border: isFocused ? `2.5px solid ${color}` : `2px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '6px 10px',
        overflow: 'hidden',
        cursor: node.path ? 'pointer' : 'default',
        boxShadow: isFocused ? `0 0 0 2px ${color}44` : 'none',
        gap: 2,
      }}
    >
      <div
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
      </div>

      {node.folderPath && (
        <div
          style={{
            fontSize: 10,
            color: '#555',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Relative path: </span>{node.folderPath}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: color, width: 8, height: 8, border: '2px solid #f3f3f3' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color, width: 8, height: 8, border: '2px solid #f3f3f3' }}
      />
    </div>
  );
}
