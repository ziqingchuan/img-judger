export interface ProcessResult {
  url: string;
  rowIndex: number;
  columnName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: any;
  error?: string;
  correctAnswer?: number; // 0或1
  isCorrect?: boolean; // 判断是否准确
}

export interface TimingInfo {
  startTime: number | null;
  endTime: number | null;
  totalTime: number;
}

export type FilterType = 'all' | 'success' | 'error' | 'pending' | 'processing' | 'correct' | 'incorrect';