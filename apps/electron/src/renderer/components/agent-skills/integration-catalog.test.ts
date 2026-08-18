import { describe, expect, test } from 'bun:test'
import { MCP_INTEGRATION_CATALOG, type CatalogMcpIntegration } from './integration-catalog'

describe('MCP integration catalog', () => {
  test('uses unique server names and valid MCP transports', () => {
    const mcps = MCP_INTEGRATION_CATALOG.filter((integration) => integration.kind === 'mcp')
    const serverNames = mcps.map((integration) => integration.serverName)

    expect(new Set(serverNames).size).toBe(serverNames.length)
    for (const integration of mcps) {
      expect(['stdio', 'http', 'sse']).toContain(integration.entry.type)
      expect(integration.entry.enabled).toBe(integration.authentication === 'none')
      expect(integration.capabilities).toHaveLength(3)
      if (integration.entry.type === 'stdio') {
        expect(integration.entry.command).toBeTruthy()
      } else {
        expect(integration.entry.url).toMatch(/^https:\/\//)
      }
    }
  })

  test('marks only implemented catalog providers for built-in OAuth', () => {
    const oauthProviders = MCP_INTEGRATION_CATALOG
      .filter((integration): integration is CatalogMcpIntegration => integration.kind === 'mcp')
      .filter((integration) => integration.authentication === 'oauth' && integration.oauthProvider)
      .map((integration) => ({ id: integration.id, provider: integration.oauthProvider, serverName: integration.serverName }))

    expect(oauthProviders).toEqual([
      { id: 'notion-mcp', provider: 'notion', serverName: 'notion' },
    ])
  })

  test('keeps CLI entries separate from workspace MCP configuration and removes deprecated services', () => {
    const clis = MCP_INTEGRATION_CATALOG.filter((integration) => integration.kind === 'cli')

    expect(clis).not.toHaveLength(0)
    expect(clis).toContainEqual(expect.objectContaining({
      id: 'feishu-cli',
      setupUrl: 'https://www.feishu.cn/feishu-cli',
    }))
    expect(clis).toContainEqual(expect.objectContaining({
      id: 'dingtalk-cli',
      setupUrl: 'https://open.dingtalk.com/document/development/dingtalk-cli-performing-tasks-within',
    }))
    expect(MCP_INTEGRATION_CATALOG.filter((integration) => integration.kind === 'guided').map((integration) => integration.id)).toEqual([
      'tongdaxin-mcp',
      'wecom-mcp',
      'tencent-meeting-mcp',
      'ctrip-wendao',
      'netease-mail',
      'baidu-netdisk',
      'zsxq',
      'qichacha-mcp',
      'qq-mail-mcp',
      'eastmoney-miaoxiang',
    ])
    expect(MCP_INTEGRATION_CATALOG.some((integration) => integration.id === 'dingtalk-mcp')).toBe(false)
    expect(MCP_INTEGRATION_CATALOG.some((integration) => integration.id === 'linear-mcp')).toBe(false)
    expect(MCP_INTEGRATION_CATALOG.some((integration) => integration.id === 'sentry-mcp' || integration.id === 'sentry-cli')).toBe(false)
    expect(MCP_INTEGRATION_CATALOG.some((integration) => integration.id === 'supabase-cli')).toBe(false)
    const credentialEntries = MCP_INTEGRATION_CATALOG.filter((integration) => integration.kind === 'credential')
    expect(credentialEntries).toEqual([expect.objectContaining({
      id: 'tencent-docs-mcp',
      serverName: 'tencent-docs',
      credential: expect.objectContaining({ headerName: 'Authorization' }),
    })])
    expect(MCP_INTEGRATION_CATALOG).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tencent-docs-mcp', iconSlug: 'asset:tencent-docs' }),
      expect.objectContaining({ id: 'baidu-netdisk', iconSlug: 'asset:baidu-netdisk' }),
      expect.objectContaining({ id: 'qichacha-mcp', iconSlug: 'asset:qichacha' }),
      expect.objectContaining({ id: 'qq-mail-mcp', iconSlug: 'asset:qq-mail' }),
    ]))
    for (const integration of clis) {
      expect(integration.setupUrl).toMatch(/^https:\/\//)
      expect(integration.capabilities).toHaveLength(3)
      expect('entry' in integration).toBe(false)
    }
    for (const integration of MCP_INTEGRATION_CATALOG.filter((item) => item.kind === 'guided')) {
      expect(integration.capabilities).toHaveLength(3)
    }
  })
})
