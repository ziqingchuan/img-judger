import * as XLSX from 'xlsx';

export interface ExportData {
  序号: number;
  行号: number;
  列名: string;
  图片链接: string;
  处理状态: string;
  审核结果: string;
  标准答案: string;
  判断结果: string;
  错误信息?: string;
}

export const exportToExcel = (results: any[], filename: string = '处理结果') => {
  // 转换数据格式
  const exportData: ExportData[] = results.map((result, index) => {
    let 处理状态 = '';
    switch (result.status) {
      case 'success':
        处理状态 = '成功';
        break;
      case 'error':
        处理状态 = '失败';
        break;
      case 'pending':
        处理状态 = '待处理';
        break;
      case 'processing':
        处理状态 = '处理中';
        break;
      default:
        处理状态 = '未知';
    }

    // 提取审核结果
    let 审核结果 = '';
    if (result.status === 'success' && result.result) {
      if (typeof result.result === 'object' && result.result.lijie) {
        审核结果 = result.result.lijie;
      } else if (typeof result.result === 'string') {
        审核结果 = result.result;
      } else {
        审核结果 = JSON.stringify(result.result);
      }
    }

    // 标准答案
    let 标准答案 = '';
    if (result.correctAnswer !== undefined) {
      标准答案 = result.correctAnswer === 1 ? '合格' : '不合格';
    }

    // 判断结果
    let 判断结果 = '';
    if (result.correctAnswer !== undefined && result.isCorrect !== undefined) {
      判断结果 = result.isCorrect ? '正确' : '错误';
    }

    const exportRow: ExportData = {
      序号: index + 1,
      行号: result.rowIndex,
      列名: result.columnName,
      图片链接: result.url,
      处理状态,
      审核结果,
      标准答案,
      判断结果
    };

    // 如果有错误信息，添加到导出数据中
    if (result.status === 'error' && result.error) {
      exportRow.错误信息 = result.error;
    }

    return exportRow;
  });

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 创建工作表
  const ws = XLSX.utils.json_to_sheet(exportData);

  // 设置列宽
  const colWidths = [
    { wch: 6 },   // 序号
    { wch: 8 },   // 行号
    { wch: 15 },  // 列名
    { wch: 50 },  // 图片链接
    { wch: 10 },  // 处理状态
    { wch: 30 },  // 审核结果
    { wch: 10 },  // 标准答案
    { wch: 10 },  // 判断结果
    { wch: 30 }   // 错误信息
  ];
  ws['!cols'] = colWidths;

  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(wb, ws, '处理结果');

  // 生成文件名（包含时间戳）
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/[/:]/g, '-').replace(/\s/g, '_');
  
  const finalFilename = `${filename}_${timestamp}.xlsx`;

  // 导出文件
  XLSX.writeFile(wb, finalFilename);
  
  return finalFilename;
};

// 导出统计摘要
export const exportSummary = (results: any[], filename: string = '处理摘要', timingInfo?: { startTime: number | null; endTime: number | null; totalTime: number }) => {
  const stats = {
    总计: results.length,
    成功: results.filter(r => r.status === 'success').length,
    失败: results.filter(r => r.status === 'error').length,
    待处理: results.filter(r => r.status === 'pending').length,
    处理中: results.filter(r => r.status === 'processing').length,
  };

  // 准确率统计
  const accuracyStats = {
    有标准答案总数: results.filter(r => r.correctAnswer !== undefined && r.status === 'success').length,
    判断正确: results.filter(r => r.isCorrect === true).length,
    判断错误: results.filter(r => r.isCorrect === false).length,
  };

  const accuracy = accuracyStats.有标准答案总数 > 0 
    ? ((accuracyStats.判断正确 / accuracyStats.有标准答案总数) * 100).toFixed(2) + '%'
    : '0.00%';

  // 时间统计
  const timeStats = {
    总处理时间: timingInfo?.totalTime ? `${(timingInfo.totalTime / 1000).toFixed(2)}秒` : '未记录',
    平均每张处理时间: (timingInfo?.totalTime && stats.成功 > 0) 
      ? `${(timingInfo.totalTime / 1000 / stats.成功).toFixed(2)}秒` 
      : '未记录',
    开始时间: timingInfo?.startTime ? new Date(timingInfo.startTime).toLocaleString('zh-CN') : '未记录',
    结束时间: timingInfo?.endTime ? new Date(timingInfo.endTime).toLocaleString('zh-CN') : '未记录'
  };

  // 创建摘要数据
  const summaryData = [
    { 项目: '处理统计', 数值: '', 说明: '' },
    { 项目: '总计', 数值: stats.总计, 说明: '所有数据条数' },
    { 项目: '成功', 数值: stats.成功, 说明: '处理成功的条数' },
    { 项目: '失败', 数值: stats.失败, 说明: '处理失败的条数' },
    { 项目: '待处理', 数值: stats.待处理, 说明: '尚未处理的条数' },
    { 项目: '处理中', 数值: stats.处理中, 说明: '正在处理的条数' },
    { 项目: '', 数值: '', 说明: '' },
    { 项目: '准确率统计', 数值: '', 说明: '' },
    { 项目: '准确率', 数值: accuracy, 说明: '判断正确的比例' },
    { 项目: '有标准答案总数', 数值: accuracyStats.有标准答案总数, 说明: '包含标准答案的数据条数' },
    { 项目: '判断正确', 数值: accuracyStats.判断正确, 说明: '与标准答案一致的条数' },
    { 项目: '判断错误', 数值: accuracyStats.判断错误, 说明: '与标准答案不一致的条数' },
    { 项目: '', 数值: '', 说明: '' },
    { 项目: '时间统计', 数值: '', 说明: '' },
    { 项目: '总处理时间', 数值: timeStats.总处理时间, 说明: '从开始到结束的总时间' },
    { 项目: '平均每张处理时间', 数值: timeStats.平均每张处理时间, 说明: '成功处理的图片平均用时' },
    { 项目: '开始时间', 数值: timeStats.开始时间, 说明: '处理开始的时间' },
    { 项目: '结束时间', 数值: timeStats.结束时间, 说明: '处理结束的时间' },
  ];

  // 创建工作簿
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(summaryData);

  // 设置列宽
  ws['!cols'] = [
    { wch: 20 },  // 项目
    { wch: 15 },  // 数值
    { wch: 30 }   // 说明
  ];

  XLSX.utils.book_append_sheet(wb, ws, '处理摘要');

  // 生成文件名
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/[/:]/g, '-').replace(/\s/g, '_');
  
  const finalFilename = `${filename}_${timestamp}.xlsx`;
  XLSX.writeFile(wb, finalFilename);
  
  return finalFilename;
};