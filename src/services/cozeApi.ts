const COZE_API_WORKFLOW = 'https://api.coze.cn/v1/workflow/run';
const COZE_AUTH_TOKEN = 'pat_v6RwanL44Q047UNcfQVnvdBiS6VPfzFJQ4EeXy0gOLYNE3Ar1CsSGoka2tyksCyP';
const COZE_WORKFLOW_ID = '7577583987406471187';

// 定义详细的错误类型
interface CozeApiError extends Error {
  type: 'network' | 'api' | 'parse' | 'data';
  statusCode?: number;
  url?: string;
  data?: any;
  response?: any;
  responseText?: string;
  originalError?: any;
  parsedData?: any;
  result?: any;
  debugUrl?: string;
  logId?: string;
}

const createError = (
  message: string,
  type: CozeApiError['type'],
  details?: Partial<CozeApiError>
): CozeApiError => {
  const error = new Error(message) as CozeApiError;
  error.type = type;
  Object.assign(error, details);
  return error;
};

export const cozeGenTotal = async (url: string, signal?: AbortSignal): Promise<any> => {
  try {
    const body = JSON.stringify({
      workflow_id: COZE_WORKFLOW_ID,
      parameters: {
        rawUrl: url,
      }
    });

    // 网络请求错误处理
    let response;
    try {
      response = await fetch(COZE_API_WORKFLOW, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COZE_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: body,
        signal: signal
      });
    } catch (fetchError: any) {
      // 检查是否是中止错误
      if (fetchError.name === 'AbortError') {
        throw fetchError; // 直接抛出中止错误，让上层处理
      }
      
      throw createError(
        `网络请求失败: ${fetchError.message}`,
        'network',
        {
          url: COZE_API_WORKFLOW,
          originalError: fetchError,
        }
      );
    }

    // API错误处理
    if (!response.ok) {
      let errorData: any = {};
      let responseText = '';
      
      try {
        responseText = await response.text();
        try {
          errorData = JSON.parse(responseText);
        } catch {
          // 如果不是JSON，直接使用文本
          errorData = { message: responseText };
        }
      } catch {
        errorData = {};
      }
      
      // 专门处理频率限制错误 (4013)
      if (errorData.code === 4013) {
        throw createError(
          `请求频率超过限制: ${errorData.msg || '请降低请求频率'}`,
          'api',
          {
            statusCode: response.status,
            url,
            response: errorData,
            responseText,
            debugUrl: errorData.debug_url,
            logId: errorData.detail?.logid
          }
        );
      }
      
      throw createError(
        `工作流API调用失败 (HTTP ${response.status})${errorData.msg ? ': ' + errorData.msg : ''}`,
        'api',
        {
          statusCode: response.status,
          url,
          response: errorData,
          responseText,
        }
      );
    }

    // 响应JSON解析错误处理
    let result;
    try {
      result = await response.json();
      console.log("Coze工作流调用成功，结果：", result);
    } catch (jsonError: any) {
      const responseText = await response.text();
      throw createError(
        `响应JSON解析失败: ${jsonError.message}`,
        'parse',
        {
          responseText,
          url,
          originalError: jsonError,
        }
      );
    }

    // 数据字段解析错误处理
    let parsedData;
    if (typeof result.data === 'string') {
      try {
        parsedData = JSON.parse(result.data);
        console.log('data 字段是字符串，尝试解析', parsedData);
      } catch (parseError: any) {
        throw createError(
          `工作流返回的data字段JSON解析失败: ${parseError.message}`,
          'parse',
          {
            data: result.data,
            url,
            originalError: parseError,
          }
        );
      }
    } else if (result.data) {
      parsedData = result.data;
      console.log('data 字段不是字符串，直接使用', parsedData);
    } else {
      throw createError(
        '工作流返回的数据中缺少 data 字段',
        'data',
        {
          result,
          url,
        }
      );
    }

    // res字段验证
    if (parsedData.res) {
      return parsedData.res;
    } else {
      throw createError(
        '解析后的数据中未找到 res 字段',
        'data',
        {
          parsedData,
          url,
        }
      );
    }
  } catch (error: any) {
    console.error('Coze工作流调用失败:', error);
    // 如果是我们自定义的错误，直接抛出；否则包装一下
    if (error && error.type) {
      throw error;
    }
    throw createError(
      `未知错误: ${error?.message || String(error)}`,
      'network',
      {
        url,
        originalError: error,
      }
    );
  }
};