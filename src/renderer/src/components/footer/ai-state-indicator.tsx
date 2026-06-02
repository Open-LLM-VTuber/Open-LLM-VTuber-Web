import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';

const stateColors: Record<string, string> = {
  [AiStateEnum.IDLE]: 'gray.500',
  [AiStateEnum.THINKING_SPEAKING]: '#7C5CFF',
  [AiStateEnum.INTERRUPTED]: 'orange.500',
  [AiStateEnum.LOADING]: 'yellow.500',
  [AiStateEnum.LISTENING]: 'blue.400',
  [AiStateEnum.WAITING]: 'gray.500',
};

function AIStateIndicator(): JSX.Element {
  const { t } = useTranslation();
  const { aiState } = useAiState();
  const color = stateColors[aiState] || 'gray.500';

  return (
    <Box
      padding="8px 16px"
      borderRadius="20px"
      fontSize="14px"
      fontWeight="medium"
      color="white"
      backgroundColor={color}
      transition="all 0.3s"
      userSelect="none"
      whiteSpace="nowrap"
    >
      <Text fontSize="14px">{t(`aiState.${aiState}`)}</Text>
    </Box>
  );
}

export default AIStateIndicator;
