/**
 * 将技术错误信息转换为用户友好的描述。
 * 共享于 DailyBriefingShell 的风险点面板和 SubscriptionPage 的错误提示。
 */

export interface FriendlyIssue {
  title: string
  description: string
  category: 'rate_limit' | 'network' | 'not_found' | 'parse' | 'no_results' | 'auth' | 'other'
  severity: 'error' | 'warning'
  icon: string
  suggestion?: string
}

export function classifyIssueMessage(rawMessage: string): FriendlyIssue {
  const message = rawMessage || ''
  const lower = message.toLowerCase()

  // 429 速率限制
  if (message.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      title: 'API 访问过于频繁',
      description: '请求被源站限流，稍后将自动重试。',
      category: 'rate_limit',
      severity: 'warning',
      icon: '⏱️',
      suggestion: '可以减少订阅源数量或降低拉取频率',
    }
  }

  // 读超时
  if (lower.includes('read operation timed out') || lower.includes('timeout') || lower.includes('timed out')) {
    return {
      title: '连接超时',
      description: '源站响应过慢，未能在 30 秒内返回数据。',
      category: 'network',
      severity: 'warning',
      icon: '🌐',
      suggestion: '可能需要配置代理或稍后重试',
    }
  }

  // JSON 解析失败
  if (lower.includes('expecting value') || lower.includes('json') || lower.includes('char 0')) {
    return {
      title: '数据格式异常',
      description: '源站返回了空响应或非 JSON 内容。',
      category: 'parse',
      severity: 'warning',
      icon: '📋',
      suggestion: '可能是源站 API 变更或临时故障',
    }
  }

  // RSS feed 解析失败
  if (lower.includes('rss feed parse failed') || lower.includes('xml') || lower.includes('parse')) {
    return {
      title: 'RSS 订阅解析失败',
      description: '该 RSS 源返回的内容无法解析为标准 XML。',
      category: 'parse',
      severity: 'warning',
      icon: '📋',
      suggestion: '建议检查 RSS 地址是否仍然有效',
    }
  }

  // 没有返回候选
  if (message.includes('没有返回任何候选条目')) {
    return {
      title: '无新论文',
      description: '本次拉取没有找到新的候选论文。',
      category: 'no_results',
      severity: 'warning',
      icon: '📭',
      suggestion: '可能源站暂无更新，或关键词太严格',
    }
  }

  // 连接被拒 / 网络问题
  if (message.includes('10061') || lower.includes('connection') || lower.includes('refused')) {
    return {
      title: '网络连接失败',
      description: '无法连接到源站，可能是代理未启动或网络问题。',
      category: 'network',
      severity: 'error',
      icon: '🌐',
      suggestion: '请在设置中检查代理配置',
    }
  }

  // 401 / 认证失败
  if (message.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
    return {
      title: '认证失败',
      description: '源站拒绝访问，可能是 API Key 缺失或失效。',
      category: 'auth',
      severity: 'error',
      icon: '🔒',
      suggestion: '请检查 .env 中的 API Key 配置',
    }
  }

  // 404 / 资源不存在
  if (message.includes('404') || lower.includes('not found')) {
    return {
      title: '资源不存在',
      description: '源站返回 404，请确认订阅配置正确。',
      category: 'not_found',
      severity: 'error',
      icon: '🔍',
    }
  }

  // 5xx 服务器错误
  if (message.match(/\b5\d{2}\b/)) {
    return {
      title: '源站服务异常',
      description: '源站暂时不可用（5xx 错误），稍后会自动重试。',
      category: 'network',
      severity: 'warning',
      icon: '🌐',
    }
  }

  // 默认：截断长消息
  const short = message.length > 100 ? message.slice(0, 100) + '…' : message
  return {
    title: '其他问题',
    description: short || '未知错误',
    category: 'other',
    severity: 'warning',
    icon: '⚠️',
  }
}
