import { Box, Text } from '@chakra-ui/react'
import { Message } from '@/types/message'
import { sidebarStyles } from './sidebar-styles'
import { useEffect, useRef } from 'react'

// Type definitions
interface ChatBubbleProps {
  message: Message
  onUpdate?: () => void
}

interface BubbleContentProps {
  content: string
  onContentChange?: () => void
}

interface BubbleIndicatorProps {
  isAI: boolean
}

// Reusable components
const BubbleContent = ({ content, onContentChange }: BubbleContentProps): JSX.Element => {
  const prevContentRef = useRef(content)

  useEffect(() => {
    if (content !== prevContentRef.current) {
      prevContentRef.current = content
      onContentChange?.()
    }
  }, [content, onContentChange])

  return (
    <Box {...sidebarStyles.chatBubble.message}>
      <Text {...sidebarStyles.chatBubble.text}>{content}</Text>
    </Box>
  )
}

const BubbleIndicator = ({ isAI }: BubbleIndicatorProps): JSX.Element => (
  <Box
    {...sidebarStyles.chatBubble.dot}
    left={isAI ? '-1' : 'auto'}
    right={!isAI ? '-1' : 'auto'}
  />
)

// Main component
function ChatBubble({ message, onUpdate }: ChatBubbleProps): JSX.Element {
  const isAI = message.role === 'ai'

  return (
    <Box 
      {...sidebarStyles.chatBubble.container} 
      justifyContent={isAI ? 'flex-start' : 'flex-end'}
    >
      <BubbleContent 
        content={message.content} 
        onContentChange={onUpdate}
      />
      <BubbleIndicator isAI={isAI} />
    </Box>
  )
}

export default ChatBubble