/* eslint-disable react/require-default-props */
import {
  Box, Textarea, IconButton, HStack,
} from '@chakra-ui/react';
import { BsMicFill, BsMicMuteFill, BsPaperclip } from 'react-icons/bs';
import { IoHandRightSharp } from 'react-icons/io5';
import { FiChevronDown } from 'react-icons/fi';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { InputGroup } from '@/components/ui/input-group';
import { footerStyles } from './footer-styles';
import { useFooter } from '@/hooks/footer/use-footer';

// Type definitions
interface FooterProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

interface ToggleButtonProps {
  isCollapsed: boolean
  onToggle?: () => void
}

interface ActionButtonsProps {
  micOn: boolean
  onMicToggle: () => void
  onInterrupt: () => void
}

interface MessageInputProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
}

// Reusable components
const ToggleButton = memo(({ isCollapsed, onToggle }: ToggleButtonProps) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={isCollapsed ? t('tooltip.expandInput') : t('tooltip.collapseInput')} showArrow openDelay={300}>
      <Box
        {...footerStyles.footer.toggleButton}
        onClick={onToggle}
        color="whiteAlpha.500"
        style={{
          transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        <FiChevronDown />
      </Box>
    </Tooltip>
  );
});

ToggleButton.displayName = 'ToggleButton';

const ActionButtons = memo(({ micOn, onMicToggle, onInterrupt }: ActionButtonsProps) => {
  const { t } = useTranslation();
  return (
    <HStack gap={2}>
      <Tooltip content={micOn ? t('tooltip.micOn') : t('tooltip.micOff')} showArrow openDelay={300}>
        <IconButton
          bg={micOn ? 'green.500' : 'red.500'}
          {...footerStyles.footer.actionButton}
          onClick={onMicToggle}
          transition="all 0.15s ease"
          _hover={{ bg: micOn ? 'green.400' : 'red.400', transform: 'scale(1.05)' }}
          _active={{ bg: micOn ? 'green.600' : 'red.600', transform: 'scale(0.88)', boxShadow: micOn ? '0 0 12px rgba(34, 197, 94, 0.6)' : '0 0 12px rgba(239, 68, 68, 0.6)' }}
        >
          {micOn ? <BsMicFill /> : <BsMicMuteFill />}
        </IconButton>
      </Tooltip>
      <Tooltip content={t('tooltip.raiseHand')} showArrow openDelay={300}>
        <IconButton
          aria-label="Raise hand"
          bg="yellow.500"
          {...footerStyles.footer.actionButton}
          onClick={onInterrupt}
          transition="all 0.15s ease"
          _hover={{ bg: 'yellow.400', transform: 'scale(1.05)' }}
          _active={{ bg: 'yellow.600', transform: 'scale(0.88)', boxShadow: '0 0 12px rgba(234, 179, 8, 0.6)' }}
        >
          <IoHandRightSharp size="24" />
        </IconButton>
      </Tooltip>
    </HStack>
  );
});

ActionButtons.displayName = 'ActionButtons';

const MessageInput = memo(({
  value,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: MessageInputProps) => {
  const { t } = useTranslation();

  return (
    <InputGroup flex={1}>
      <Box position="relative" width="100%">
        <Tooltip content={t('tooltip.attachFile')} showArrow openDelay={300}>
          <IconButton
            aria-label="Attach file"
            variant="ghost"
            {...footerStyles.footer.attachButton}
          >
            <BsPaperclip size="24" />
          </IconButton>
        </Tooltip>
        <Textarea
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder={t('footer.typeYourMessage')}
          {...footerStyles.footer.input}
        />
      </Box>
    </InputGroup>
  );
});

MessageInput.displayName = 'MessageInput';

// Main component
function Footer({ isCollapsed = false, onToggle }: FooterProps): JSX.Element {
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    micOn,
  } = useFooter();

  return (
    <Box {...footerStyles.footer.container(isCollapsed)}>
      <ToggleButton isCollapsed={isCollapsed} onToggle={onToggle} />

      <Box pt="24px" pb="24px" px="4">
        <HStack width="100%" gap={3} alignItems="center">
          <Box>
            <ActionButtons
              micOn={micOn}
              onMicToggle={handleMicToggle}
              onInterrupt={handleInterrupt}
            />
          </Box>

          <MessageInput
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </HStack>
      </Box>
    </Box>
  );
}

export default Footer;
