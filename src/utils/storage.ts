// 本地存储键名
export const STORAGE_KEYS = {
  RESULTS: 'excel-processor-results',
  FILE_INFO: 'excel-processor-file-info',
  FILTER: 'excel-processor-filter',
  TIMING: 'excel-processor-timing'
};

// 保存数据到localStorage
export const saveToStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('保存数据失败:', error);
  }
};

// 从localStorage读取数据
export const loadFromStorage = (key: string, defaultValue: any = null) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.warn('读取数据失败:', error);
    return defaultValue;
  }
};