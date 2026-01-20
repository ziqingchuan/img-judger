import React from 'react';
import './styles.css'
interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose }) => {
  return (
    <div className="image-preview-modal" onClick={onClose}>
      <div className="image-preview-content" onClick={(e) => e.stopPropagation()}>
        <button className="image-preview-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <img 
          src={imageUrl} 
          alt="预览图片" 
          className="image-preview-img"
          onError={(e) => {
            const imgElement = e.currentTarget as HTMLImageElement;
            const errorDiv = imgElement.nextElementSibling as HTMLDivElement;
            imgElement.style.display = 'none';
            if (errorDiv) {
              errorDiv.style.display = 'block';
            }
          }}
        />
        <div className="image-preview-error" style={{ display: 'none' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#f56c6c" strokeWidth="2"/>
            <path d="M12 8V12" stroke="#f56c6c" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="16" r="1" fill="#f56c6c"/>
          </svg>
          <p>图片加载失败</p>
          <p className="image-preview-url">{imageUrl}</p>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;