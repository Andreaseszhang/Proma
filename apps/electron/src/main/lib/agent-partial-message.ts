import type {
  AgentAssistantDelta,
  SDKAssistantMessage,
  SDKContentBlock,
} from '@proma/shared'

/**
 * Build a durable assistant snapshot from the deltas already received from Pi.
 * The snapshot is only used when the provider never emits message_end.
 */
export function applyAgentAssistantDelta(
  message: SDKAssistantMessage,
  delta: AgentAssistantDelta,
): SDKAssistantMessage {
  const content = [...message.message.content] as SDKContentBlock[]
  const index = 'contentIndex' in delta ? delta.contentIndex : undefined
  const ensureBlock = (fallback: SDKContentBlock): number => {
    if (index == null) {
      content.push(fallback)
      return content.length - 1
    }
    while (content.length <= index) content.push({ type: 'text', text: '' })
    return index
  }
  const existing = index != null ? content[index] : undefined

  switch (delta.type) {
    case 'text_start':
      content[ensureBlock({ type: 'text', text: '' })] = { type: 'text', text: '' }
      break
    case 'text_delta': {
      const blockIndex = ensureBlock({ type: 'text', text: '' })
      const text = existing?.type === 'text' && 'text' in existing && typeof existing.text === 'string'
        ? existing.text
        : ''
      content[blockIndex] = { type: 'text', text: text + delta.delta }
      break
    }
    case 'text_end':
      content[ensureBlock({ type: 'text', text: '' })] = { type: 'text', text: delta.content }
      break
    case 'thinking_start':
      content[ensureBlock({ type: 'thinking', thinking: '' })] = { type: 'thinking', thinking: '' }
      break
    case 'thinking_delta': {
      const blockIndex = ensureBlock({ type: 'thinking', thinking: '' })
      const thinking = existing?.type === 'thinking'
        && 'thinking' in existing
        && typeof existing.thinking === 'string'
        ? existing.thinking
        : ''
      content[blockIndex] = { type: 'thinking', thinking: thinking + delta.delta }
      break
    }
    case 'thinking_end':
      content[ensureBlock({ type: 'thinking', thinking: '' })] = { type: 'thinking', thinking: delta.content }
      break
    case 'toolcall_start':
    case 'toolcall_delta':
    case 'toolcall_end': {
      const toolCall = delta.toolCall
      if (!toolCall) break
      const blockIndex = ensureBlock({ type: 'tool_use', id: toolCall.id, name: toolCall.name, input: {} })
      const previous = content[blockIndex]
      content[blockIndex] = {
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.arguments
          ?? (previous?.type === 'tool_use' && 'input' in previous ? previous.input : {}),
      }
      break
    }
    case 'start':
      break
  }

  return { ...message, message: { ...message.message, content }, _partial: true } as SDKAssistantMessage
}

export function createPartialAssistantMessage(options: {
  uuid: string
  sessionId: string
  createdAt: number
  modelId?: string
  provider?: SDKAssistantMessage['_channelProvider']
}): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: { content: [] },
    parent_tool_use_id: null,
    session_id: options.sessionId,
    uuid: options.uuid,
    _partial: true,
    _createdAt: options.createdAt,
    ...(options.modelId ? { _channelModelId: options.modelId } : {}),
    ...(options.provider ? { _channelProvider: options.provider } : {}),
  } as SDKAssistantMessage
}

/** Remove the live-only marker before writing the snapshot to JSONL. */
export function finalizePartialAssistantMessage(
  message: SDKAssistantMessage,
): SDKAssistantMessage | null {
  if (message.message.content.length === 0) return null
  const { _partial: _ignored, ...durableMessage } = message as SDKAssistantMessage & { _partial?: boolean }
  return durableMessage
}

/**
 * Stores one run's live assistant messages until a complete SDK message arrives.
 * Draining the store is the fallback for abort/timeout paths without message_end.
 */
export class AgentPartialMessageStore {
  private readonly messages = new Map<string, SDKAssistantMessage>()

  constructor(private readonly options: {
    sessionId: string
    createdAt: number
    modelId?: string
    provider?: SDKAssistantMessage['_channelProvider']
  }) {}

  applyDelta(uuid: string, delta: AgentAssistantDelta): void {
    const current = this.messages.get(uuid)
      ?? createPartialAssistantMessage({ uuid, ...this.options })
    this.messages.set(uuid, applyAgentAssistantDelta(current, delta))
  }

  markComplete(uuid: string): void {
    this.messages.delete(uuid)
  }

  drainDurable(): SDKAssistantMessage[] {
    const durableMessages = Array.from(this.messages.values())
      .map(finalizePartialAssistantMessage)
      .filter((message): message is SDKAssistantMessage => message !== null)
    this.messages.clear()
    return durableMessages
  }
}
