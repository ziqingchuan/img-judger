import * as XLSX from 'xlsx';

export interface ImageUrlItem {
  url: string;
  rowIndex: number;
  columnName: string;
  correctAnswer?: number; // 0或1，1表示合格，0表示不合格
}

export const parseExcelFile = async (file: File): Promise<ImageUrlItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const imageUrls: ImageUrlItem[] = [];
        
        if (jsonData.length === 0) {
          resolve([]);
          return;
        }

        // 获取表头
        const headers = jsonData[0] as string[];
        
        // 查找包含"截图链接"字样的列索引
        const imageColumnIndices: number[] = [];
        headers.forEach((header, index) => {
          if (header && header.toString().includes('截图链接')) {
            imageColumnIndices.push(index);
          }
        });

        if (imageColumnIndices.length === 0) {
          console.warn('未找到包含"截图链接"字样的列');
          resolve([]);
          return;
        }

        // 查找"正确答案"列索引
        const correctAnswerIndex = headers.findIndex(header => 
          header && header.toString().includes('正确答案')
        );

        // 提取图片链接
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          imageColumnIndices.forEach(colIndex => {
            const cellValue = row[colIndex];
            if (cellValue && typeof cellValue === 'string' && cellValue.trim()) {
              const item: ImageUrlItem = {
                url: cellValue.trim(),
                rowIndex: i + 1,
                columnName: headers[colIndex]
              };
              
              // 如果找到正确答案列，读取该值
              if (correctAnswerIndex !== -1 && row[correctAnswerIndex] !== undefined) {
                const answerValue = row[correctAnswerIndex];
                item.correctAnswer = Number(answerValue);
              }
              
              imageUrls.push(item);
            }
          });
        }

        resolve(imageUrls);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsBinaryString(file);
  });
};
