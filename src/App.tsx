import { useState, useRef, memo, useCallback, useEffect } from 'react';
import './App.css';
import { parseExcelFile, ImageUrlItem } from './services/excelParser';
import { cozeGenTotal } from './services/cozeApi';
import { exportToExcel, exportSummary } from './services/excelExporter';

// 格式化 Coze API 错误信息
const formatCozeApiError = (error: any): string => {
  if (!error) return '未知错误';
  
  // 如果是结构化的错误对象
  if (error.type && error.message) {
    const parts = [error.message];
    
    // 根据错误类型添加详细信息
    if (error.type === 'api' && error.statusCode) {
      parts.push(`  状态码: ${error.statusCode}`);
      if (error.url) {
        parts.push(`  请求URL: ${error.url}`);
      }
      if (error.responseText) {
        parts.push(`  响应内容: ${error.responseText.substring(0, 200)}${error.responseText.length > 200 ? '...' : ''}`);
      }
      if (error.response && typeof error.response === 'object') {
        const errorDetails = JSON.stringify(error.response, null, 2);
        if (errorDetails !== '{}') {
          parts.push(`  错误详情: ${errorDetails}`);
        }
      }
    } else if (error.type === 'network') {
      if (error.url) {
        parts.push(`  请求URL: ${error.url}`);
      }
      if (error.originalError && error.originalError.message) {
        parts.push(`  原始错误: ${error.originalError.message}`);
      }
    } else if (error.type === 'parse') {
      if (error.url) {
        parts.push(`  请求URL: ${error.url}`);
      }
      if (error.data) {
        parts.push(`  解析失败的data: ${error.data.substring(0, 100)}${error.data.length > 100 ? '...' : ''}`);
      }
      if (error.responseText) {
        parts.push(`  响应文本: ${error.responseText.substring(0, 200)}${error.responseText.length > 200 ? '...' : ''}`);
      }
    } else if (error.type === 'data') {
      if (error.url) {
        parts.push(`  请求URL: ${error.url}`);
      }
      if (error.parsedData) {
        parts.push(`  解析后的数据: ${JSON.stringify(error.parsedData, null, 2).substring(0, 200)}${JSON.stringify(error.parsedData).length > 200 ? '...' : ''}`);
      }
      if (error.result) {
        parts.push(`  原始结果: ${JSON.stringify(error.result, null, 2)}`);
      }
    }
    
    return parts.join('\n');
  }
  
  // 普通错误
  return error.message || String(error);
};

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

// 本地存储键名
const STORAGE_KEYS = {
  RESULTS: 'excel-processor-results',
  FILE_INFO: 'excel-processor-file-info',
  FILTER: 'excel-processor-filter',
  TIMING: 'excel-processor-timing'
};

// 保存数据到localStorage
const saveToStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('保存数据失败:', error);
  }
};

// 从localStorage读取数据
const loadFromStorage = (key: string, defaultValue: any = null) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.warn('读取数据失败:', error);
    return defaultValue;
  }
};

function App() {
  // 从localStorage恢复状态
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<ProcessResult[]>(() => 
    loadFromStorage(STORAGE_KEYS.RESULTS, [])
  );
  const [isProcessing, setIsProcessing] = useState(() => 
    loadFromStorage('excel-processor-is-processing', false)
  );
  const [isStopping, setIsStopping] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'pending' | 'processing' | 'correct' | 'incorrect'>(() => 
    loadFromStorage(STORAGE_KEYS.FILTER, 'all')
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 优化：使用ref避免状态更新导致的重渲染
  const shouldStopRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<ProcessResult[]>(loadFromStorage(STORAGE_KEYS.RESULTS, []));
  
  // 时间统计
  const [timingInfo, setTimingInfo] = useState<{ startTime: number | null; endTime: number | null; totalTime: number }>(() => 
    loadFromStorage(STORAGE_KEYS.TIMING, { startTime: null, endTime: null, totalTime: 0 })
  );
  const startTimeRef = useRef<number | null>(null);
  
  // 顶部提示
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 2000);
  }, []);

  // 页面加载时恢复文件信息和处理状态
  useEffect(() => {
    const fileInfo = loadFromStorage(STORAGE_KEYS.FILE_INFO);
    if (fileInfo) {
      // 创建一个虚拟文件对象用于显示
      const virtualFile = new File([''], fileInfo.name, { type: fileInfo.type });
      setFile(virtualFile);
    }
    
    // 检查是否有正在处理的项目，如果有，将它们恢复为待处理状态
    // 因为页面刷新后，之前的处理进程已经被中断
    if (results.length > 0) {
      const hasProcessingItems = results.some(r => r.status === 'processing');
      if (hasProcessingItems) {
        const updatedResults: ProcessResult[] = results.map(r => 
          r.status === 'processing' ? { ...r, status: 'pending' as const } : r
        );
        setResults(updatedResults);
        resultsRef.current = updatedResults;
        saveToStorage(STORAGE_KEYS.RESULTS, updatedResults);
        setIsProcessing(false);
        saveToStorage('excel-processor-is-processing', false);
      }
    }
  }, []);

  // 监听浏览器关闭或刷新事件
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 只有在处理过程中或有未完成的项目时才显示确认弹窗
      if (isProcessing || results.some(r => r.status === 'pending' || r.status === 'processing')) {
        // 取消默认行为
        e.preventDefault();
        // 现代浏览器只需要调用preventDefault()
        // 不同浏览器对返回值的处理方式不同，但都会显示确认弹窗
        return '';
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 清理函数
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isProcessing, results]);

  // 监听results变化，自动保存到localStorage
  useEffect(() => {
    if (results.length > 0) {
      saveToStorage(STORAGE_KEYS.RESULTS, results);
      resultsRef.current = results;
    }
  }, [results]);

  // 监听filter变化，自动保存到localStorage并重置页码
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FILTER, filter);
    setCurrentPage(1);
  }, [filter]);

  // 监听timingInfo变化，自动保存到localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.TIMING, timingInfo);
  }, [timingInfo]);

  // 监听isProcessing变化，自动保存到localStorage
  useEffect(() => {
    saveToStorage('excel-processor-is-processing', isProcessing);
  }, [isProcessing]);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile && selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      setFile(selectedFile);
      setResults([]);
      resultsRef.current = [];
      setFilter('all');
      
      // 保存文件信息到localStorage
      saveToStorage(STORAGE_KEYS.FILE_INFO, {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size
      });
      
      // 清空之前的结果和时间统计
      localStorage.removeItem(STORAGE_KEYS.RESULTS);
      localStorage.removeItem(STORAGE_KEYS.TIMING);
      setTimingInfo({ startTime: null, endTime: null, totalTime: 0 });
    } else {
      alert('请选择有效的Excel文件（.xlsx 或 .xls）');
    }
  };

  const handleReupload = useCallback(() => {
    if (isProcessing) return; // 处理中禁用，不执行任何操作
    
    // 清除localStorage中的所有数据
    localStorage.removeItem(STORAGE_KEYS.RESULTS);
    localStorage.removeItem(STORAGE_KEYS.FILE_INFO);
    localStorage.removeItem(STORAGE_KEYS.FILTER);
    localStorage.removeItem(STORAGE_KEYS.TIMING);
    
    // 重置所有状态
    setResults([]);
    resultsRef.current = [];
    setFilter('all');
    setFile(null);
    setTimingInfo({ startTime: null, endTime: null, totalTime: 0 });
    
    // 触发文件选择
    fileInputRef.current?.click();
  }, [isProcessing]);

  const handleRestart = useCallback(() => {
    if (isProcessing) return; // 处理中禁用，不执行任何操作
    
    if (window.confirm('确定要重新开始吗？当前所有处理结果将被清空。')) {
      setResults([]);
      resultsRef.current = [];
      setFilter('all');
      
      // 清空localStorage中的结果数据和时间统计
      localStorage.removeItem(STORAGE_KEYS.RESULTS);
      localStorage.removeItem(STORAGE_KEYS.TIMING);
      saveToStorage(STORAGE_KEYS.FILTER, 'all');
      setTimingInfo({ startTime: null, endTime: null, totalTime: 0 });
    }
  }, [isProcessing]);

  const handleExportResults = useCallback(() => {
    if (results.length === 0) {
      showNotification('没有可导出的数据', 'error');
      return;
    }
    
    try {
      const filename = exportToExcel(results, '图片处理结果');
      showNotification(`导出成功！文件名：${filename}`, 'success');
    } catch (error: any) {
      showNotification(`导出失败：${error.message}`, 'error');
    }
  }, [results, showNotification]);

  const handleExportSummary = useCallback(() => {
    if (results.length === 0) {
      showNotification('没有可导出的数据', 'error');
      return;
    }
    
    try {
      const filename = exportSummary(results, '处理统计摘要', timingInfo);
      showNotification(`导出成功！文件名：${filename}`, 'success');
    } catch (error: any) {
      showNotification(`导出失败：${error.message}`, 'error');
    }
  }, [results, timingInfo, showNotification]);

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
    
    // 创建新的AbortController用于中断API调用
    abortControllerRef.current = new AbortController();
    
    // 记录开始时间
    if (!continueFromPending) {
      startTimeRef.current = Date.now();
      setTimingInfo((prev: { startTime: number | null; endTime: number | null; totalTime: number }) => ({ 
        ...prev, 
        startTime: startTimeRef.current, 
        endTime: null 
      }));
    } else if (startTimeRef.current === null && timingInfo.startTime) {
      startTimeRef.current = timingInfo.startTime;
    }
    
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
        
        // 更新状态为处理中 - 实时更新UI
        resultsRef.current[i] = { ...resultsRef.current[i], status: 'processing' };
        setResults([...resultsRef.current]);

        try {
          const result = await cozeGenTotal(item.url, abortControllerRef.current?.signal);
          
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
          
          // 更新状态为成功 - 实时更新UI
          resultsRef.current[i] = { 
            ...resultsRef.current[i], 
            status: 'success', 
            result,
            isCorrect 
          };
          setResults([...resultsRef.current]);
        } catch (error: any) {
          // 更新状态为失败 - 实时更新UI
          resultsRef.current[i] = { ...resultsRef.current[i], status: 'error', error: formatCozeApiError(error) };
          setResults([...resultsRef.current]);
        }
      }
    } catch (error: any) {
      // 忽略中止错误，因为这是用户主动停止的
      if (error.name !== 'AbortError') {
        alert(`处理失败: ${error.message}`);
      }
    } finally {
      // 清理AbortController
      abortControllerRef.current = null;
      setIsProcessing(false);
      setIsStopping(false);
      
      // 记录结束时间和总时间
      if (startTimeRef.current !== null) {
        const endTime = Date.now();
        setTimingInfo((prev: { startTime: number | null; endTime: number | null; totalTime: number }) => ({ 
          ...prev, 
          endTime, 
          totalTime: endTime - startTimeRef.current!
        }));
      }
    }
  }, [file]);

  const handleStop = useCallback(() => {
    setIsStopping(true);
    shouldStopRef.current = true;
    
    // 中断正在进行的API调用
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('已中断API调用');
    }
    
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

  const hasPendingItems = stats.pending > 0;

  // 过滤结果
  const filteredResults = results.filter(result => {
    if (filter === 'all') return true;
    if (filter === 'correct') return result.isCorrect === true;
    if (filter === 'incorrect') return result.isCorrect === false;
    return result.status === filter;
  });

  // 分页相关计算
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPageResults = filteredResults.slice(startIndex, endIndex);
  
  // 处理分页变化
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const progress = stats.total > 0 
    ? ((stats.success + stats.error) / stats.total) * 100 
    : 0;

  return (
    <div className="app-container">
      {/* 顶部提示 */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <div className="notification-content">
          <span className="notification-icon">
            {notification.type === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 8L8 15L1 8L8 1Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 2L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </span>
          <span className="notification-message">{notification.message}</span>
        </div>
        </div>
      )}
      
      <div className="app-header">
        <h1 className="app-title">AI审核图片工具</h1>
      </div>

      <div className="main-content">
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
                <div className="action-buttons">
                  <button 
                    className="btn btn-secondary btn-action"
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
                    className="btn btn-secondary btn-action"
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
                  {results.length > 0 && (
                    <>
                      <button 
                        className="btn btn-secondary btn-action"
                        onClick={handleExportResults}
                        disabled={isProcessing}
                        title="导出详细结果"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="btn-text">导出结果</span>
                      </button>
                      <button 
                        className="btn btn-secondary btn-action"
                        onClick={handleExportSummary}
                        disabled={isProcessing}
                        title="导出统计摘要"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                          <path d="M9 9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M9 15H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        <span className="btn-text">导出摘要</span>
                      </button>
                    </>
                  )}
                </div>
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
              {currentPageResults.length > 0 ? (
                currentPageResults.map((result) => (
                  <ResultItem 
                    key={results.indexOf(result)} 
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
            
            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  className="btn btn-secondary pagination-btn"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                >
                  首页
                </button>
                <button 
                  className="btn btn-secondary pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  上一页
                </button>
                
                {/* 页码按钮 */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button 
                    key={page}
                    className={`btn pagination-btn ${currentPage === page ? 'active' : ''}`}
                    onClick={() => handlePageChange(page)}
                  >
                    {page}
                  </button>
                ))}
                
                <button 
                  className="btn btn-secondary pagination-btn"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </button>
                <button 
                  className="btn btn-secondary pagination-btn"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  末页
                </button>
                
                <div className="pagination-info">
                  第 {currentPage} / {totalPages} 页
                </div>
              </div>
            )}
          </div>
        )}

        {results.length === 0 && file && !isProcessing && (
          <div className="empty-state">
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
