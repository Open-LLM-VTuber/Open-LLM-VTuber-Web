import { Box, Text } from '@chakra-ui/react';
import { memo, forwardRef } from 'react';
import { canvasStyles } from './canvas-styles';
import { useSubtitleDisplay } from '@/hooks/canvas/use-subtitle-display';
import { useSubtitle } from '@/context/subtitle-context';

// Type definitions
interface SubtitleTextProps {
  text: string
  fontSize?: string
  color?: string
  fontFamily?: string
}

// Reusable components
const SubtitleText = memo(({ text, fontSize, color, fontFamily }: SubtitleTextProps) => (
  <Text
    {...canvasStyles.subtitle.text}
    fontSize={fontSize || canvasStyles.subtitle.text.fontSize}
    color={color || canvasStyles.subtitle.text.color}
    fontFamily={fontFamily || canvasStyles.subtitle.text.fontFamily}
  >
    {text}
  </Text>
));

SubtitleText.displayName = 'SubtitleText';

interface SubtitleProps {
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

// Main component
const Subtitle = memo(forwardRef<HTMLDivElement, SubtitleProps>(({ onMouseDown, onMouseEnter, onMouseLeave }, ref): JSX.Element | null => {
  const { subtitleText, isLoaded } = useSubtitleDisplay();
  const { showSubtitle, subtitleConfig } = useSubtitle();

  if (!isLoaded || !subtitleText || !showSubtitle) return null;

  return (
    <Box
      ref={ref}
      {...canvasStyles.subtitle.container}
      backgroundColor={subtitleConfig.backgroundColor}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      cursor="grab"
      _active={{ cursor: 'grabbing' }}
    >
      <SubtitleText
        text={subtitleText}
        fontSize={subtitleConfig.fontSize}
        color={subtitleConfig.color}
        fontFamily={subtitleConfig.fontFamily}
      />
    </Box>
  );
}));

Subtitle.displayName = 'Subtitle';

export default Subtitle;
