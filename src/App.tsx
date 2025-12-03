import { useState, useRef, memo, useCallback } from 'react';
import './App.css';
import { parseExcelFile, ImageUrlItem } from './services/excelParser';
import { cozeGenTotal } from './services/cozeApi';

interface ProcessResult {
  url: string;
  rowIndex: number;
  columnName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: any;
  error?: string;
  correctAnswer?: number; // 0或1
  isCorrect?: boolean; // 判断是否准确
}

// 优化：使用memo避免不必要的重渲染
const ResultItem = memo(({ result, index, onImageClick }: { result: ProcessResult; index: number; onImageClick: (url: string) => void }) => {
  return (
    <div className={`result-item ${result.status}`} onClick={() => onImageClick(result.url)}>
      <div className="result-header">
        <div className="result-info">
          <div className="result-index">
            #{index + 1} - 第{result.rowIndex}行 - {result.columnName}
          </div>
          <div className="result-url">{result.url}</div>
        </div>
        <div className={`result-status ${result.status}`}>
          {result.status === 'pending' && '等待中'}
          {result.status === 'processing' && (
            <>
              <span className="spinner"></span>
              处理中
            </>
          )}
          {result.status === 'success' && '✓ 成功'}
          {result.status === 'error' && '✗ 失败'}
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
            <div style={{ marginTop: '8px', fontSize: '13px', color: result.isCorrect ? '#67c23a' : '#f56c6c', fontWeight: 'bold' }}>
              {result.isCorrect ? '✓ 判断正确' : '✗ 判断错误'} 
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

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'pending' | 'processing' | 'correct' | 'incorrect'>('all');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 优化：使用ref避免状态更新导致的重渲染
  const shouldStopRef = useRef(false);
  const resultsRef = useRef<ProcessResult[]>([]);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setFile(selectedFile);
      setResults([]);
      resultsRef.current = [];
      setFilter('all');
    } else {
      alert('请选择有效的Excel文件（.xlsx 或 .xls）');
    }
  };

  const handleReupload = useCallback(() => {
    if (isProcessing) return; // 处理中禁用，不执行任何操作
    fileInputRef.current?.click();
  }, [isProcessing]);

  const handleRestart = useCallback(() => {
    if (isProcessing) return; // 处理中禁用，不执行任何操作
    
    if (window.confirm('确定要重新开始吗？当前所有处理结果将被清空。')) {
      setResults([]);
      resultsRef.current = [];
      setFilter('all');
    }
  }, [isProcessing]);

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
      handleFileSelect(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const processImages = useCallback(async (continueFromPending = false) => {
    if (!file) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    
    try {
      let imageUrls: ImageUrlItem[];
      let startIndex = 0;

      if (continueFromPending && resultsRef.current.length > 0) {
        // 继续处理：从第一个未处理的项开始
        imageUrls = resultsRef.current.map(r => ({
          url: r.url,
          rowIndex: r.rowIndex,
          columnName: r.columnName,
          correctAnswer: r.correctAnswer // 重要：保留正确答案字段
        }));
        startIndex = resultsRef.current.findIndex(r => r.status === 'pending');
        if (startIndex === -1) {
          alert('没有待处理的项目');
          setIsProcessing(false);
          return;
        }
      } else {
        // 首次处理：解析Excel文件
        imageUrls = await parseExcelFile(file);
        
        if (imageUrls.length === 0) {
          alert('未在Excel中找到包含"截图链接"字样的列或该列没有数据');
          setIsProcessing(false);
          return;
        }

        const initialResults: ProcessResult[] = imageUrls.map(item => ({
          ...item,
          status: 'pending'
        }));
        
        resultsRef.current = initialResults;
        setResults([...initialResults]);
      }

      // 优化：批量更新，减少渲染次数（每10个更新一次）
      const BATCH_SIZE = 10;
      let batchCount = 0;

      // 顺序处理每个图片链接
      for (let i = startIndex; i < imageUrls.length; i++) {
        // 检查是否需要停止
        if (shouldStopRef.current) {
          console.log('用户终止处理');
          // 将当前处理中的项恢复为待处理
          resultsRef.current[i] = { ...resultsRef.current[i], status: 'pending' };
          setResults([...resultsRef.current]);
          break;
        }

        const item = imageUrls[i];
        
        // 更新状态为处理中
        resultsRef.current[i] = { ...resultsRef.current[i], status: 'processing' };
        batchCount++;
        
        // 批量更新UI
        if (batchCount >= BATCH_SIZE) {
          setResults([...resultsRef.current]);
          batchCount = 0;
        }

        try {
          const result = await cozeGenTotal(item.url);
          
          // 再次检查是否需要停止
          if (shouldStopRef.current) {
            resultsRef.current[i] = { ...resultsRef.current[i], status: 'pending' };
            setResults([...resultsRef.current]);
            break;
          }
          
          // 判断准确性
          let isCorrect: boolean | undefined = undefined;
          if (item.correctAnswer !== undefined) {
            const resultText = typeof result === 'object' && result.lijie 
              ? result.lijie 
              : (typeof result === 'string' ? result : JSON.stringify(result));
            
            const hasQualified = resultText.includes('合格') && !resultText.includes('不合格');
            const hasUnqualified = resultText.includes('不合格');
            
            // 判断逻辑：如果结果包含"合格"（且不包含"不合格"），则认为是合格
            const predictedQualified = hasQualified && !hasUnqualified;
            const expectedQualified = item.correctAnswer === 1;
            
            isCorrect = predictedQualified === expectedQualified;
          }
          
          // 更新状态为成功
          resultsRef.current[i] = { 
            ...resultsRef.current[i], 
            status: 'success', 
            result,
            isCorrect 
          };
        } catch (error: any) {
          // 更新状态为失败
          resultsRef.current[i] = { ...resultsRef.current[i], status: 'error', error: error.message };
        }
        
        batchCount++;
        
        // 批量更新UI
        if (batchCount >= BATCH_SIZE) {
          setResults([...resultsRef.current]);
          batchCount = 0;
        }
      }
      
      // 最后更新一次确保所有状态同步
      setResults([...resultsRef.current]);
    } catch (error: any) {
      alert(`处理失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
    }
  }, [file]);

  const handleStop = useCallback(() => {
    setIsStopping(true);
    shouldStopRef.current = true;
    
    // 监听处理状态变化，当停止后隐藏加载提示
    const checkStopped = setInterval(() => {
      if (!shouldStopRef.current || !isProcessing) {
        setIsStopping(false);
        clearInterval(checkStopped);
      }
    }, 100);
  }, [isProcessing]);

  const handleContinue = useCallback(() => {
    processImages(true);
  }, [processImages]);

  const stats = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    error: results.filter(r => r.status === 'error').length,
    processing: results.filter(r => r.status === 'processing').length,
    pending: results.filter(r => r.status === 'pending').length,
  };

  // 计算准确率
  const accuracyStats = {
    totalWithAnswer: results.filter(r => r.correctAnswer !== undefined && r.status === 'success').length,
    correct: results.filter(r => r.isCorrect === true).length,
    incorrect: results.filter(r => r.isCorrect === false).length,
  };
  
  const accuracy = accuracyStats.totalWithAnswer > 0 
    ? ((accuracyStats.correct / accuracyStats.totalWithAnswer) * 100).toFixed(2)
    : '0.00';

  const progress = stats.total > 0 
    ? ((stats.success + stats.error) / stats.total) * 100 
    : 0;

  const hasPendingItems = stats.pending > 0;

  // 过滤结果
  const filteredResults = results.filter(result => {
    if (filter === 'all') return true;
    if (filter === 'correct') return result.isCorrect === true;
    if (filter === 'incorrect') return result.isCorrect === false;
    return result.status === filter;
  });

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">Excel图片处理工具</h1>
        <p className="app-subtitle">上传Excel文件，自动提取并处理图片链接</p>
      </div>

      <div className="main-card">
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
              <div className="upload-icon">📁</div>
              <div className="upload-text">点击或拖拽Excel文件到此处</div>
              <div className="upload-hint">支持 .xlsx 和 .xls 格式</div>
            </div>
          ) : (
            <div className="selected-file">
              <div className="file-info">
                <span className="file-icon">📄</span>
                <span className="file-name">{file.name}</span>
              </div>
              <div className="button-group">
                {!isProcessing && results.length === 0 && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => processImages(false)}
                    >
                      开始处理
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleReupload}
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
                    onClick={handleStop}
                  >
                    ⏸ 暂停处理
                  </button>
                )}
                {!isProcessing && hasPendingItems && (
                  <button
                    className="btn btn-success"
                    onClick={handleContinue}
                  >
                    ▶ 继续处理
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="results-section">
            <div className="results-header">
              <div className="results-header-left">
                <h2 className="results-title">处理结果</h2>
              </div>
              <div className="results-header-right">
                <button 
                  className="btn btn-secondary btn-icon"
                  onClick={handleReupload}
                  disabled={isProcessing}
                  title="重新上传文件"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="btn-text">重新上传</span>
                </button>
                <button 
                  className="btn btn-secondary btn-icon"
                  onClick={handleRestart}
                  disabled={isProcessing}
                  title="重新开始处理"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M23 20V14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20.49 9C19.9828 7.56678 19.1209 6.28536 17.9845 5.27542C16.8482 4.26548 15.4745 3.55976 13.9917 3.22426C12.5089 2.88875 10.9652 2.93434 9.50481 3.35677C8.04437 3.77921 6.71475 4.56471 5.64 5.64L1 10M23 14L18.36 18.36C17.2853 19.4353 15.9556 20.2208 14.4952 20.6432C13.0348 21.0657 11.4911 21.1112 10.0083 20.7757C8.52547 20.4402 7.1518 19.7345 6.01547 18.7246C4.87913 17.7146 4.01717 16.4332 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="btn-text">重新开始</span>
                </button>
              </div>
            </div>
            
            <div className="results-stats-row">
              <div className="results-stats">
                <div 
                  className={`stat-item clickable ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  <span className="stat-label">总计:</span>
                  <span className="stat-value">{stats.total}</span>
                </div>
                <div 
                  className={`stat-item clickable ${filter === 'success' ? 'active' : ''}`}
                  onClick={() => setFilter('success')}
                >
                  <span className="stat-label">成功:</span>
                  <span className="stat-value success">{stats.success}</span>
                </div>
                <div 
                  className={`stat-item clickable ${filter === 'error' ? 'active' : ''}`}
                  onClick={() => setFilter('error')}
                >
                  <span className="stat-label">失败:</span>
                  <span className="stat-value error">{stats.error}</span>
                </div>
                {stats.processing > 0 && (
                  <div 
                    className={`stat-item clickable ${filter === 'processing' ? 'active' : ''}`}
                    onClick={() => setFilter('processing')}
                  >
                    <span className="stat-label">处理中:</span>
                    <span className="stat-value processing">{stats.processing}</span>
                  </div>
                )}
                {stats.pending > 0 && (
                  <div 
                    className={`stat-item clickable ${filter === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilter('pending')}
                  >
                    <span className="stat-label">待处理:</span>
                    <span className="stat-value pending">{stats.pending}</span>
                  </div>
                )}
              </div>
            </div>

            {accuracyStats.totalWithAnswer > 0 && (
              <div className="accuracy-section">
                <div className="accuracy-card">
                  <div className="accuracy-title">准确率统计</div>
                  <div className="accuracy-value">{accuracy}%</div>
                  <div className="accuracy-details">
                    <span 
                      className={`accuracy-detail-item correct clickable ${filter === 'correct' ? 'active' : ''}`}
                      onClick={() => setFilter('correct')}
                    >
                      正确: {accuracyStats.correct}
                    </span>
                    <span 
                      className={`accuracy-detail-item incorrect clickable ${filter === 'incorrect' ? 'active' : ''}`}
                      onClick={() => setFilter('incorrect')}
                    >
                      错误: {accuracyStats.incorrect}
                    </span>
                    <span 
                      className={`accuracy-detail-item total clickable ${filter === 'all' ? 'active' : ''}`}
                      onClick={() => setFilter('all')}
                    >
                      总数: {accuracyStats.totalWithAnswer}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}

            {filter !== 'all' && (
              <div className="filter-info">
                <span>当前筛选: </span>
                <strong>
                  {filter === 'success' && '成功'}
                  {filter === 'error' && '失败'}
                  {filter === 'pending' && '待处理'}
                  {filter === 'processing' && '处理中'}
                  {filter === 'correct' && '判断正确'}
                  {filter === 'incorrect' && '判断错误'}
                </strong>
                <span> ({filteredResults.length} 条)</span>
                <button 
                  className="btn-clear-filter"
                  onClick={() => setFilter('all')}
                >
                  清除筛选
                </button>
              </div>
            )}

            <div className="results-list">
              {filteredResults.length > 0 ? (
                filteredResults.map((result, index) => (
                  <ResultItem 
                    key={index} 
                    result={result} 
                    index={results.indexOf(result)} 
                    onImageClick={setPreviewImageUrl}
                  />
                ))
              ) : (
                <div className="empty-filter">
                  <div className="empty-filter-text">没有符合筛选条件的结果</div>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setFilter('all')}
                  >
                    查看全部
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {results.length === 0 && file && !isProcessing && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-text">点击"开始处理"按钮来处理Excel中的图片链接</div>
          </div>
        )}

        {previewImageUrl && (
          <div className="image-preview-modal" onClick={() => setPreviewImageUrl(null)}>
            <div className="image-preview-content" onClick={(e) => e.stopPropagation()}>
              <button className="image-preview-close" onClick={() => setPreviewImageUrl(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <img 
                src={previewImageUrl} 
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
                <p className="image-preview-url">{previewImageUrl}</p>
              </div>
            </div>
          </div>
        )}

        {isStopping && (
          <div className="stopping-overlay">
            <div className="stopping-content">
              <div className="stopping-spinner"></div>
              <div className="stopping-text">正在暂停处理...</div>
              <div className="stopping-hint">请稍等片刻</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
