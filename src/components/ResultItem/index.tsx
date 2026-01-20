import { memo } from 'react';
import './styles.css'
import { ProcessResult } from '../../types';

interface ResultItemProps {
  result: ProcessResult;
  index: number;
  onImageClick: (url: string) => void;
}

const ResultItem = memo(({ result, index, onImageClick }: ResultItemProps) => {
  return (
    <div className={`result-item ${result.status}`}>
      <div className="result-header">
        <div className="result-info">
          <div className="result-index">
            {index + 1} - 第{result.rowIndex}行 - {result.columnName}
          </div>
          <div className="result-url" onClick={() => onImageClick(result.url)}>{result.url}</div>
        </div>
        <div className={`result-status ${result.status}`}>
          {result.status === 'pending' && '等待中'}
          {result.status === 'processing' && (
            <>
              <span className="spinner"></span>
              处理中
            </>
          )}
          {result.status === 'success' && '成功'}
          {result.status === 'error' && '失败'}
        </div>
      </div>
      
      {result.status === 'success' && result.result && (
        <div className="result-content">
          <div>
            {typeof result.result === 'object' && result.result.lijie
              ? result.result.lijie
              : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2))}
          </div>
          {result.correctAnswer !== undefined && (
            <div style={{ marginTop: '8px', fontSize: '13px', color: result.isCorrect ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
              {result.isCorrect ? '判断正确' : '判断错误'} 
              (标准答案: {result.correctAnswer === 1 ? '合格' : '不合格'})
            </div>
          )}
        </div>
      )}
      
      {result.status === 'error' && result.error && (
        <div className="result-content result-error">
          错误: {result.error}
        </div>
      )}
    </div>
  );
});

ResultItem.displayName = 'ResultItem';

export default ResultItem;