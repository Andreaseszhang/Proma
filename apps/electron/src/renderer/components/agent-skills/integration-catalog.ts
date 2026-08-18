import type { McpOAuthProvider, McpServerEntry } from '@proma/shared'

export type CatalogIntegrationKind = 'mcp' | 'cli' | 'guided' | 'credential'
export type CatalogAuthentication = 'none' | 'oauth' | 'api-key'

interface CatalogIntegrationBase {
  id: string
  name: string
  description: string
  capabilities: string[]
  iconSlug: string
  setupUrl: string
  kind: CatalogIntegrationKind
}

export interface CatalogMcpIntegration extends CatalogIntegrationBase {
  kind: 'mcp'
  authentication: CatalogAuthentication
  oauthProvider?: McpOAuthProvider
  serverName: string
  entry: McpServerEntry
}

export interface CatalogCliIntegration extends CatalogIntegrationBase {
  kind: 'cli'
}

export interface CatalogGuidedIntegration extends CatalogIntegrationBase {
  kind: 'guided'
  authType: 'api-key' | 'provider-app' | 'provider-login'
  agentPrompt: string
}

/** A fixed-token remote MCP that Proma can configure after the user supplies one credential. */
export interface CatalogCredentialIntegration extends CatalogIntegrationBase {
  kind: 'credential'
  serverName: string
  entry: McpServerEntry
  credential: {
    label: string
    placeholder: string
    helpText: string
    acquisitionUrl: string
    acquisitionLabel: string
    headerName: string
  }
}

export type CatalogIntegration = CatalogMcpIntegration | CatalogCliIntegration | CatalogGuidedIntegration | CatalogCredentialIntegration

const remoteMcp = (url: string): McpServerEntry => ({ type: 'http', url, enabled: false })

const providerSetupPrompt = (name: string, setupUrl: string, authentication: string): string => `请帮我为当前 Proma 工作区配置「${name}」。

官方入口：${setupUrl}
认证方式线索：${authentication}

执行要求：
1. 先通过公开官方文档核验 MCP server URL、transport、所需 scope/权限和认证字段；不要猜测或使用非官方 endpoint。
2. 若可得到可用 MCP 配置，将非敏感 transport 配置写入当前工作区的 mcp.json；不要覆盖已有同名服务器。
3. 不要把 API Key、AppSecret、Cookie、OAuth code 或 access token 写入 mcp.json、AGENTS.md、日志或普通项目文件。需要用户在 Proma 设置中输入敏感值时，明确说明字段名与来源页面。
4. 若官方接入要求企业应用审核、管理员授权、桌面客户端登录或没有公开的 MCP 合约，停止在安全步骤处，说明已核验的事实、缺失条件和用户需要完成的操作。
5. 完成后测试 MCP 连接；仅在测试成功时启用。`

export const MCP_INTEGRATION_CATALOG: CatalogIntegration[] = [
  {
    id: 'github-mcp', name: 'GitHub', iconSlug: 'github', kind: 'mcp', authentication: 'oauth', serverName: 'github',
    description: '让 Agent 在你的 GitHub 上读取代码上下文，并处理协作与代码质量工作流。',
    capabilities: ['仓库与文件', 'Issue / PR', 'Actions 与安全扫描'],
    setupUrl: 'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server',
    entry: remoteMcp('https://api.githubcopilot.com/mcp/'),
  },
  {
    id: 'notion-mcp', name: 'Notion', iconSlug: 'notion', kind: 'mcp', authentication: 'oauth', oauthProvider: 'notion', serverName: 'notion',
    description: '把页面、数据库和团队知识直接提供给 Agent，用于查询、整理和写回协作文档。',
    capabilities: ['页面与区块', '数据库查询', '评论与内容编辑'],
    setupUrl: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
    entry: remoteMcp('https://mcp.notion.com/mcp'),
  },
  {
    id: 'vercel-mcp', name: 'Vercel', iconSlug: 'vercel', kind: 'mcp', authentication: 'oauth', serverName: 'vercel',
    description: '为 Agent 提供部署上下文，定位生产问题并查询项目与运行状态。',
    capabilities: ['项目与部署', '日志与运行状态', 'Web Analytics'],
    setupUrl: 'https://vercel.com/docs/agent-resources/vercel-mcp',
    entry: remoteMcp('https://mcp.vercel.com'),
  },
  {
    id: 'supabase-mcp', name: 'Supabase', iconSlug: 'supabase', kind: 'mcp', authentication: 'oauth', serverName: 'supabase',
    description: '让 Agent 查询并管理 Supabase 项目，覆盖数据库、认证、Storage 和 Edge Functions。',
    capabilities: ['SQL 与数据库 schema', 'Auth 与 Storage', '项目与 Edge Functions'],
    setupUrl: 'https://supabase.com/docs/guides/ai-tools/mcp',
    entry: remoteMcp('https://mcp.supabase.com/mcp'),
  },
  {
    id: 'stripe-mcp', name: 'Stripe', iconSlug: 'stripe', kind: 'mcp', authentication: 'oauth', serverName: 'stripe',
    description: '让 Agent 搜索 Stripe 文档并在授权范围内读取或操作支付与账务资源。',
    capabilities: ['API 文档检索', '账户与资源查询', '退款与支付操作'],
    setupUrl: 'https://docs.stripe.com/mcp',
    entry: remoteMcp('https://mcp.stripe.com'),
  },
  {
    id: 'playwright-mcp', name: 'Playwright', iconSlug: 'playwright', kind: 'mcp', authentication: 'none', serverName: 'playwright',
    description: '通过浏览器自动化完成页面检查、表单操作、断言、截图和测试证据采集。',
    capabilities: ['页面与标签操作', '可访问性定位', '断言、Trace 与截图'],
    setupUrl: 'https://playwright.dev/mcp/introduction',
    entry: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], enabled: true },
  },
  {
    id: 'tongdaxin-mcp', name: '通达信 MCP', iconSlug: 'asset:tongdaxin', kind: 'guided', authType: 'provider-login',
    description: '金融行情和投研能力需要先核验通达信的正式 MCP 契约与账户授权方式。',
    capabilities: ['行情与金融数据', '账户授权核验', '官方契约调研'],
    setupUrl: 'https://www.tdx.com.cn',
    agentPrompt: providerSetupPrompt('通达信 MCP', 'https://www.tdx.com.cn', '通达信账户登录或官方 connector 授权'),
  },
  {
    id: 'wecom-mcp', name: '企业微信', iconSlug: 'asset:wecom', kind: 'guided', authType: 'provider-app',
    description: '通过企业内部应用接入组织通讯录、消息与协作能力，通常需要管理员审批。',
    capabilities: ['企业通讯录', '消息与会话', '管理员权限配置'],
    setupUrl: 'https://developer.work.weixin.qq.com',
    agentPrompt: providerSetupPrompt('企业微信', 'https://developer.work.weixin.qq.com', '企业内部应用凭据与管理员授权'),
  },
  {
    id: 'dingtalk-cli', name: '钉钉 CLI', iconSlug: 'asset:dingtalk', kind: 'cli',
    description: '使用钉钉官方 CLI 调用 AI 开发助手，完成问答、代码生成与开发辅助。',
    capabilities: ['AI 开发助手', '代码生成与解释', '钉钉开发工具'],
    setupUrl: 'https://open.dingtalk.com/document/development/dingtalk-cli-performing-tasks-within',
  },
  {
    id: 'tencent-meeting-mcp', name: '腾讯会议', iconSlug: 'asset:tencent-meeting', kind: 'guided', authType: 'provider-login',
    description: '腾讯会议的官方 AI Skill 以长期 Token 接入，涵盖会议查询、日程与会议纪要能力。',
    capabilities: ['会议与日程', '会议纪要与参会人', '官方 Skill 安装'],
    setupUrl: 'https://meeting.tencent.com/support/topic/2233/index.html',
    agentPrompt: providerSetupPrompt('腾讯会议', 'https://meeting.tencent.com/support/topic/2233/index.html', 'AI Skill 专区的个人 Token；获取后需安装官方 Skills 封装包'),
  },
  {
    id: 'tencent-docs-mcp', name: '腾讯文档', iconSlug: 'asset:tencent-docs', kind: 'credential', serverName: 'tencent-docs',
    description: '连接指定腾讯文档空间，让 Agent 读取、创建和编辑协作文档与表格。',
    capabilities: ['文档与表格', '空间 MCP 工具', '直接 Token 连接'],
    setupUrl: 'https://docs.qq.com/open/document/mcp/tool-introduce',
    entry: remoteMcp('https://docs.qq.com/openapi/mcp'),
    credential: {
      label: 'MCP Token',
      placeholder: '输入腾讯文档空间的 MCP Token',
      helpText: '在腾讯文档空间中生成的 Token，仅用于当前工作区的腾讯文档连接。',
      acquisitionUrl: 'https://docs.qq.com/open/document/mcp/get-token',
      acquisitionLabel: '去腾讯文档获取 Token',
      headerName: 'Authorization',
    },
  },
  {
    id: 'ctrip-wendao', name: '携程问道', iconSlug: 'asset:ctrip', kind: 'guided', authType: 'api-key',
    description: '携程问道 Token 可提供机酒火车、景点推荐和行程规划；官方当前以 Skill 封装接入。',
    capabilities: ['机酒火车查询', '景点与行程规划', 'API Token + Skill'],
    setupUrl: 'https://ctrip.com/wendao/openclaw',
    agentPrompt: providerSetupPrompt('携程问道', 'https://ctrip.com/wendao/openclaw', '携程问道开放平台 API Token；获取后安装官方 Skill 封装并验证'),
  },
  {
    id: 'netease-mail', name: '网易邮箱', iconSlug: 'asset:netease-mail', kind: 'guided', authType: 'provider-login',
    description: '使用网易邮箱客户端授权码接入邮件工作流，需先在邮箱设置中开启 IMAP/SMTP 或 POP3 服务。',
    capabilities: ['邮件读取与搜索', '发送与附件', '客户端授权码'],
    setupUrl: 'https://mail.163.com',
    agentPrompt: providerSetupPrompt('网易邮箱', 'https://mail.163.com', '邮箱地址和客户端授权码；先在设置中开启 POP3/SMTP/IMAP 服务'),
  },
  {
    id: 'baidu-netdisk', name: '百度网盘', iconSlug: 'asset:baidu-netdisk', kind: 'guided', authType: 'api-key',
    description: '百度网盘官方 MCP 可检索、管理与分享文件；上传场景还需要本地 stdio 服务。',
    capabilities: ['文件与目录管理', '搜索与分享', 'OAuth Access Token'],
    setupUrl: 'https://github.com/baidu-netdisk/mcp',
    agentPrompt: providerSetupPrompt('百度网盘', 'https://github.com/baidu-netdisk/mcp', '百度网盘 OAuth Access Token；SSE 模式不支持上传，上传需官方本地 stdio 方案'),
  },
  {
    id: 'zsxq', name: '知识星球', iconSlug: 'lucide-orbit', kind: 'guided', authType: 'provider-login',
    description: '管理已加入的知识星球内容前，需要先确认服务方是否提供可用的正式开放接口与授权方式。',
    capabilities: ['星球内容检索', '主题与评论', '官方接口核验'],
    setupUrl: 'https://www.zsxq.com',
    agentPrompt: providerSetupPrompt('知识星球', 'https://www.zsxq.com', '账号授权或服务方正式 API 凭据；不得通过浏览器开发者工具提取登录 token'),
  },
  {
    id: 'qichacha-mcp', name: '企查查', iconSlug: 'asset:qichacha', kind: 'guided', authType: 'api-key',
    description: '企业工商、风险和关联信息需通过企查查开放平台的业务授权或 API Key 获取。',
    capabilities: ['工商与股权信息', '风险与关联查询', '开放平台 API Key'],
    setupUrl: 'https://open.qcc.com',
    agentPrompt: providerSetupPrompt('企查查', 'https://open.qcc.com', '开放平台 API Key 或企业应用授权'),
  },
  {
    id: 'qq-mail-mcp', name: 'QQ 邮箱', iconSlug: 'asset:qq-mail', kind: 'guided', authType: 'provider-login',
    description: '邮件搜索、收发和整理能力需按 QQ 邮箱正式授权码或 OAuth 接口核验后配置。',
    capabilities: ['邮件搜索与读取', '收发与附件', '授权码 / OAuth 核验'],
    setupUrl: 'https://mail.qq.com',
    agentPrompt: providerSetupPrompt('QQ 邮箱', 'https://mail.qq.com', '邮箱授权码、IMAP/SMTP 或官方 OAuth，取决于服务方能力'),
  },
  {
    id: 'eastmoney-miaoxiang', name: '东方财富妙想', iconSlug: 'lucide-trending-up', kind: 'guided', authType: 'api-key',
    description: '投研与金融数据能力按妙想 Skills、平台预授权或 API Key 的正式路径配置。',
    capabilities: ['金融投研 Skills', '市场与数据能力', 'API Key / 平台授权'],
    setupUrl: 'https://ai.eastmoney.com',
    agentPrompt: providerSetupPrompt('东方财富妙想', 'https://ai.eastmoney.com', '东方财富妙想 Skills API Key 或平台预授权'),
  },
  {
    id: 'github-cli', name: 'GitHub CLI', iconSlug: 'github', kind: 'cli',
    description: '在终端管理 GitHub 资源，适合开发、协作与仓库自动化，不会作为 MCP 注入。',
    capabilities: ['PR、Issue 与 Release', '仓库与 Actions', '认证与 API 调用'],
    setupUrl: 'https://cli.github.com',
  },
  {
    id: 'feishu-cli', name: '飞书 CLI', iconSlug: 'feishu', kind: 'cli',
    description: '飞书官方命令行与 Agent 工具集，可操作消息、日历、文档、多维表格和任务。',
    capabilities: ['消息、日历与文档', '多维表格与任务', '多 Profile 授权'],
    setupUrl: 'https://www.feishu.cn/feishu-cli',
  },
  {
    id: 'vercel-cli', name: 'Vercel CLI', iconSlug: 'vercel', kind: 'cli',
    description: '从终端部署与管理 Vercel 项目，并处理环境变量、日志、域名和缓存。',
    capabilities: ['部署与项目管理', '环境变量与日志', '域名、缓存与集成'],
    setupUrl: 'https://vercel.com/docs/cli',
  },
  {
    id: 'wrangler-cli', name: 'Cloudflare Wrangler', iconSlug: 'cloudflare', kind: 'cli',
    description: 'Cloudflare Workers 的开发与发布入口，也可管理 Pages、KV、R2、D1 和 Secrets。',
    capabilities: ['Workers 与 Pages', 'D1、KV、R2', 'Secrets 与部署'],
    setupUrl: 'https://developers.cloudflare.com/workers/wrangler/',
  },
  {
    id: 'stripe-cli', name: 'Stripe CLI', iconSlug: 'stripe', kind: 'cli',
    description: '在本地调试 Stripe 集成，转发 webhook、触发测试事件并直接调用资源 API。',
    capabilities: ['Webhook 转发与测试', '事件与日志', '资源 / HTTP API 调用'],
    setupUrl: 'https://docs.stripe.com/stripe-cli',
  },
]

export function matchesCatalogSearch(integration: CatalogIntegration, query: string): boolean {
  if (!query) return true
  return `${integration.name} ${integration.description} ${integration.capabilities.join(' ')} ${integration.kind}`.toLowerCase().includes(query.toLowerCase())
}
