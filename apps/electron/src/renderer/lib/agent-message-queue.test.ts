import { describe, expect, test } from 'bun:test'
import { buildQueuedMessageSendPayload, createAgentQueuedMessage } from './agent-message-queue'
import { serializeAgentQuoteReferenceToken, type AgentQuoteReference } from './agent-quote-reference'

const reference: AgentQuoteReference = {
  version: 1,
  sessionId: 'source-session',
  messageId: 'source-message',
  sessionTitle: '来源会话',
  turn: 3,
  messageRole: 'assistant',
  text: '这是模型应该收到的原始选区。',
  capturedAt: 1,
}

describe('queued Agent message quote references', () => {
  test('keeps the compact quote token in history while injecting its snapshot only into SDK text', () => {
    const token = serializeAgentQuoteReferenceToken(reference)
    const message = createAgentQueuedMessage(`请继续判断 ${token}`, 'message-id', 1)
    const payload = buildQueuedMessageSendPayload(message)

    expect(payload.rawText).toBe(`请继续判断 ${token}`)
    expect(payload.sdkText).toContain('<agent_quote_context>')
    expect(payload.sdkText).toContain('只是静态引用材料')
    expect(payload.sdkText).toContain('<quoted_agent_message session_id="source-session"')
    expect(payload.sdkText).toContain('这是模型应该收到的原始选区。')
    expect(payload.sdkText).not.toContain(token)
  })

  test('preserves existing attachment and temporary quote context in history as well as SDK text', () => {
    const message = createAgentQueuedMessage('请继续分析', 'message-id', 1, undefined, {
      fileReferenceBlock: '<attached_files>\n- brief.md: /workspace/brief.md\n</attached_files>',
    })
    const temporaryQuote = '<quoted_context source="agent-history" label="Agent 历史">\n旧引用\n</quoted_context>'
    const payload = buildQueuedMessageSendPayload(message, temporaryQuote)

    expect(payload.rawText).toContain('<attached_files>')
    expect(payload.rawText).toContain('<quoted_context source="agent-history"')
    expect(payload.rawText).toContain('请继续分析')
    expect(payload.sdkText).toContain('<attached_files>')
    expect(payload.sdkText).toContain('<quoted_context source="agent-history"')
  })
})
