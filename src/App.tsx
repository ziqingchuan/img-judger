import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';
import { parseExcelFile, ImageUrlItem } from './services/excelParser';
import { cozeGenTotal } from './services/cozeApi';
import { exportToExcel, exportSummary } from './services/excelExporter';
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from './utils/storage';
import { formatCozeApiError } from './utils/errorFormatter';
import { ProcessResult, TimingInfo, FilterType } from './types';
import UploadSection from './components/UploadSection';
import ResultsSection from './components/ResultsSection';
import Notification from './components/Notification';
import ImagePreviewModal from './components/ImagePreviewModal';
import StoppingOverlay from './components/StoppingOverlay';

function App() {
  // 从localStorage恢复状态
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ProcessResult[]>(() => 
    loadFromStorage(STORAGE_KEYS.RESULTS, [])
  );
  const [isProcessing, setIsProcessing] = useState(() => 
    loadFromStorage('excel-processor-is-processing', false)
  );
  const [isStopping, setIsStopping] = useState(false);
  const [filter, setFilter] = useState<FilterType>(() => 
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
  const [timingInfo, setTimingInfo] = useState<TimingInfo>(() => 
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
          r.status === 'processing' ? { ...r, status: 'pending' } : r
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
    
    // 重置文件输入框的值，确保可以重新选择同一个文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
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

  const processImages = useCallback(async (continueFromPending = false) => {
    if (!file) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    
    // 创建新的AbortController用于中断API调用
    abortControllerRef.current = new AbortController();
    
    // 记录开始时间
    if (!continueFromPending) {
      startTimeRef.current = Date.now();
      setTimingInfo(prev => ({ 
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
        setTimingInfo(prev => ({ 
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

  const progress = results.length > 0 
    ? ((results.filter(r => r.status === 'success').length + results.filter(r => r.status === 'error').length) / results.length) * 100 
    : 0;

  return (
    <div className="app-container">
      {/* 顶部提示 */}
      {notification && (
        <Notification 
          message={notification.message} 
          type={notification.type} 
          onClose={() => setNotification(null)} 
        />
      )}
      
      <div className="app-header">
        <img src='img-judge.svg' />
        <h1 className="app-title">图片审核工具</h1>
      </div>

      <div className="main-content">
      <UploadSection 
        file={file}
        isProcessing={isProcessing}
        resultsLength={results.length}
        onFileSelect={handleFileSelect}
        onProcessImages={processImages}
        onReupload={handleReupload}
        onStop={handleStop}
        onContinue={handleContinue}
        fileInputRef={fileInputRef}
      />

        {results.length > 0 && (
          <ResultsSection 
            results={results}
            filter={filter}
            setFilter={setFilter}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onReupload={handleReupload}
            onRestart={handleRestart}
            onExportResults={handleExportResults}
            onExportSummary={handleExportSummary}
            isProcessing={isProcessing}
            progress={progress}
            onImageClick={setPreviewImageUrl}
          />
        )}

        {results.length === 0 && file && !isProcessing && (
          <div className="empty-state">
            <div className="empty-text">点击"开始处理"按钮来处理Excel中的图片链接</div>
          </div>
        )}

        {previewImageUrl && (
          <ImagePreviewModal 
            imageUrl={previewImageUrl}
            onClose={() => setPreviewImageUrl(null)}
          />
        )}

        {isStopping && <StoppingOverlay />}
      </div>
    </div>
  );
}

export default App;
