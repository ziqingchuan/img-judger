// 格式化 Coze API 错误信息
export const formatCozeApiError = (error: any): string => {
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