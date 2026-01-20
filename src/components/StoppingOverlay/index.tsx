import React from 'react';
import './styles.css'
const StoppingOverlay: React.FC = () => {
  return (
    <div className="stopping-overlay">
      <div className="stopping-content">
        <div className="stopping-spinner"></div>
        <div className="stopping-text">正在暂停处理...</div>
        <div className="stopping-hint">请稍等片刻</div>
      </div>
    </div>
  );
};

export default StoppingOverlay;