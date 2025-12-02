const COZE_API_WORKFLOW = 'https://api.coze.cn/v1/workflow/run';
const COZE_AUTH_TOKEN = 'pat_szyWIHrNbn6EgpGJzgz80svFmq3GLtqb7PBKBzYcJLCUrJRu5jYwyWfa2v0ii86R';
const COZE_WORKFLOW_ID = '7577583987406471187';

export const cozeGenTotal = async (url: string): Promise<any> => {
  try {
    const body = JSON.stringify({
      workflow_id: COZE_WORKFLOW_ID,
      parameters: {
        rawUrl: url,
      }
    });

    const response = await fetch(COZE_API_WORKFLOW, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`工作流调用失败: ${errorData.message || `HTTP ${response.status}`}`);
    }

    const result = await response.json();
    console.log("Coze工作流调用成功，结果：", result);

    let parsedData;
    if (typeof result.data === 'string') {
      try {
        parsedData = JSON.parse(result.data);
        console.log('data 字段是字符串，尝试解析', parsedData);
      } catch (parseError: any) {
        throw new Error(`data 解析失败: ${parseError.message}`);
      }
    } else {
      parsedData = result.data;
      console.log('data 字段不是字符串，直接使用', parsedData);
    }

    if (parsedData.res) {
      return parsedData.res;
    } else {
      throw new Error('解析后的数据中未找到 res 字段');
    }
  } catch (error) {
    console.error('Coze工作流调用失败:', error);
    throw error;
  }
};
