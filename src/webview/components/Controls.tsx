import React from 'react';

interface ControlsProps {
  viewMode: 'focused' | 'full';
  onViewModeChange: (mode: 'focused' | 'full') => void;
}

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 7H12V5C12 3.93913 11.5786 2.92178 10.8284 2.17163C10.0783 1.42149 9.06087 1 8 1C6.93913 1 5.92172 1.42149 5.17157 2.17163C4.42143 2.92178 4 3.93913 4 5V7H3L2 8V14L3 15H13L14 14V8L13 7ZM5 5C5 4.20435 5.31607 3.44127 5.87868 2.87866C6.44129 2.31605 7.20435 2 8 2C8.79565 2 9.55871 2.31605 10.1213 2.87866C10.6839 3.44127 11 4.20435 11 5V7H5V5ZM13 14H3V8H13V14Z" fill="#333"/>
  </svg>
);

const UnlockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M5 7V5C5 3.34315 6.34315 2 8 2C9.30622 2 10.4174 2.83481 10.8292 4H11.8739C11.4299 2.27477 9.86384 1 8 1C5.79086 1 4 2.79086 4 5V7H3L2 8V14L3 15H13L14 14V8L13 7H12H11H10H5ZM11 8H12H13V14H3V8H4H5H11Z" fill="#333"/>
  </svg>
);

export function Controls({ viewMode, onViewModeChange }: ControlsProps) {
  const isFocused = viewMode === 'focused';

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
      }}
    >
      <button
        onClick={() => onViewModeChange(isFocused ? 'full' : 'focused')}
        title={isFocused ? 'Focused on active model — click for full project' : 'Showing full project — click to focus on active model'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid #bbb',
          background: '#e1e1e0',
          padding: 0,
        }}
      >
        {isFocused ? <LockIcon /> : <UnlockIcon />}
      </button>
    </div>
  );
}
