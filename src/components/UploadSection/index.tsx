import React, { useState } from 'react';
import './styles.css'
interface UploadSectionProps {
  file: File | null;
  isProcessing: boolean;
  resultsLength: number;
  onFileSelect: (file: File) => void;
  onProcessImages: (continueFromPending: boolean) => void;
  onReupload: () => void;
  onStop: () => void;
  onContinue: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const UploadSection: React.FC<UploadSectionProps> = ({
  file,
  isProcessing,
  resultsLength,
  onFileSelect,
  onProcessImages,
  onReupload,
  onStop,
  onContinue,
  fileInputRef
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const hasPendingItems = resultsLength > 0;

  return (
    <div className="upload-section">
      <input
        ref={fileInputRef}
        type="file"
        className="file-input"
        accept=".xlsx,.xls"
        onChange={handleFileInputChange}
      />
      
      {!file ? (
        <div
          className={`upload-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="upload-text">点击或拖拽Excel文件到此处</div>
          <div className="upload-hint">支持 .xlsx 和 .xls 格式</div>
        </div>
      ) : (
        <div className="selected-file">
          <div className="file-info">
            <span className="file-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </span>
            <span className="file-name">{file.name}</span>
          </div>
          <div className="button-group">
            {!isProcessing && resultsLength === 0 && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => onProcessImages(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  开始处理
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={onReupload}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  重新上传
                </button>
              </>
            )}
            {isProcessing && (
              <button
                className="btn btn-danger"
                onClick={onStop}
              >
                ⏸ 暂停处理
              </button>
            )}
            {!isProcessing && hasPendingItems && (
              <button
                className="btn btn-success"
                onClick={onContinue}
              >
                ▶ 继续处理
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadSection;