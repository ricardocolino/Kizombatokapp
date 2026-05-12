import React from 'react';

interface AngoCoinIconProps {
  className?: string;
  size?: number;
}

const AngoCoinIcon: React.FC<AngoCoinIconProps> = ({ className = "", size = 16 }) => {
  return (
    <div 
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 border border-amber-700 shadow-sm shrink-0 ${className}`}
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.2)'
      }}
    >
      <span 
        style={{ fontSize: `${Math.floor(size * 0.65)}px` }}
        className="leading-none select-none"
      >
        🐙
      </span>
    </div>
  );
};

export default AngoCoinIcon;
