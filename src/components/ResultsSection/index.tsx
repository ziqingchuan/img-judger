import React from 'react';
import ResultItem from '../ResultItem';
import { ProcessResult, FilterType } from '../../types';
import './styles.css'
interface ResultsSectionProps {
  results: ProcessResult[];
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onReupload: () => void;
  onRestart: () => void;
  onExportResults: () => void;
  onExportSummary: () => void;
  isProcessing: boolean;
  progress: number;
  onImageClick: (url: string) => void;
}

const ResultsSection: React.FC<ResultsSectionProps> = ({
  results,
  filter,
  setFilter,
  currentPage,
  pageSize,
  onPageChange,
  onReupload,
  onRestart,
  onExportResults,
  onExportSummary,
  isProcessing,
  progress,
  onImageClick
}) => {
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

  return (
    <div className="results-section">
      <div className="results-header">
        <div className="results-header-left">
          <h2 className="results-title">处理结果</h2>
        </div>
        <div className="results-header-right">
          <div className="action-buttons">
            <button 
              className="btn btn-secondary btn-action"
              onClick={onReupload}
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
              onClick={onRestart}
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
                  onClick={onExportResults}
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
                  onClick={onExportSummary}
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
              onImageClick={onImageClick}
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
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
          >
            首页
          </button>
          <button 
            className="btn btn-secondary pagination-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            上一页
          </button>
          
          {/* 页码按钮 */}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button 
              key={page}
              className={`btn pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          
          <button 
            className="btn btn-secondary pagination-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页
          </button>
          <button 
            className="btn btn-secondary pagination-btn"
            onClick={() => onPageChange(totalPages)}
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
  );
};

export default ResultsSection;