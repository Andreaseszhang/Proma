import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { agentQuoteFocusAtom, agentSessionsAtom } from '@/atoms/agent-atoms'
import { AGENT_QUOTE_OPEN_EVENT, type AgentQuoteReference } from '@/lib/agent-quote-reference'
import { useOpenSession } from '@/hooks/useOpenSession'

/** Keeps quote-chip navigation available even while Scratch Pad is the active tab. */
export function AgentQuoteNavigationListener(): null {
  const agentSessions = useAtomValue(agentSessionsAtom)
  const setQuoteFocus = useSetAtom(agentQuoteFocusAtom)
  const openSession = useOpenSession()

  React.useEffect(() => {
    const handleOpenQuote = (event: Event): void => {
      const reference = (event as CustomEvent<AgentQuoteReference>).detail
      if (!reference?.sessionId || !reference.messageId) return
      const session = agentSessions.find((item) => item.id === reference.sessionId)
      if (!session) {
        toast.error('来源 Agent 会话已不存在')
        return
      }
      setQuoteFocus({
        sessionId: reference.sessionId,
        messageId: reference.messageId,
        nonce: Date.now(),
      })
      openSession('agent', session.id, session.title)
    }

    window.addEventListener(AGENT_QUOTE_OPEN_EVENT, handleOpenQuote)
    return () => window.removeEventListener(AGENT_QUOTE_OPEN_EVENT, handleOpenQuote)
  }, [agentSessions, openSession, setQuoteFocus])

  return null
}
