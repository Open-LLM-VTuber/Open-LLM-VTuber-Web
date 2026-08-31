import {
  LuBell, LuSend, LuMic, LuMicOff, LuHand, LuX,
} from 'react-icons/lu';
import {
  Box,
  Button,
  Flex,
  Input,
  Stack,
  Text,
  VStack,
  IconButton,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useInputSubtitle } from '@/hooks/electron/use-input-subtitle';
import { useDraggable } from '@/hooks/electron/use-draggable';
import { inputSubtitleStyles } from './electron-style';
import { useMode } from '@/context/mode-context';

export function InputSubtitle() {
  const {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    handleSend,
    lastAIMessage,
    hasAIMessages,
    aiState,
    micOn,
  } = useInputSubtitle();

  const { mode } = useMode();
  const isPet = mode === 'pet';

  const {
    elementRef,
    isDragging,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
  } = useDraggable({
    componentId: 'input-subtitle',
  });

  const [isVisible, setIsVisible] = useState(true);

  // Used by the Linux/Windows cursor-poll fallback below so the hover state
  // stays accurate while the window is click-through (no real mouse events).
  const isSubtitleHoveredRef = useRef(false);
  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  // Linux/Windows: while the pet window ignores mouse events the renderer gets
  // no enter/leave events; the main process polls the cursor and forwards its
  // window-local position here, so hovering/clicking the subtitle still works.
  useEffect(() => {
    if (!isPet) return undefined;
    const unsubscribe = (window.api as any)?.onPetCursorPosition?.(
      (position: { x: number; y: number }) => {
        const container = elementRef.current;
        if (!container || !isVisibleRef.current) {
          if (isSubtitleHoveredRef.current) {
            isSubtitleHoveredRef.current = false;
            (window.api as any)?.updateComponentHover('input-subtitle', false);
          }
          return;
        }
        const target = document.elementFromPoint(position.x, position.y);
        const hovered = target !== null && container.contains(target);
        // [PetDebug] renderer: subtitle hover -> ${hovered}
        if (hovered !== isSubtitleHoveredRef.current) {
          isSubtitleHoveredRef.current = hovered;
          (window.api as any)?.updateComponentHover('input-subtitle', hovered);
        }
      },
    );
    return unsubscribe;
  }, [isPet]);

  const handleClose = useCallback(() => {
    if (isPet) {
      (window.api as any)?.updateComponentHover('input-subtitle', false);
    }
    setIsVisible(false);
  }, [isPet]);

  const handleOpen = () => {
    setIsVisible(true);
  };

  useEffect(() => {
    if (isPet) {
      const cleanup = (window.api as any)?.onToggleInputSubtitle(() => {
        if (isVisible) {
          handleClose();
        } else {
          handleOpen();
        }
      });
      return () => cleanup?.();
    }
    return () => {};
  }, [handleClose, isPet, isVisible]);

  useEffect(() => {
    (window as any).inputSubtitle = {
      open: handleOpen,
      close: handleClose,
    };

    return () => {
      delete (window as any).inputSubtitle;
    };
  }, [isPet, handleClose]);

  if (!isVisible) return null;

  return (
    <Box
      ref={elementRef}
      {...inputSubtitleStyles.container}
      {...inputSubtitleStyles.draggableContainer(isDragging)}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Box {...inputSubtitleStyles.box}>
        <IconButton
          aria-label="Close subtitle"
          onClick={handleClose}
          {...inputSubtitleStyles.closeButton}
        >
          <LuX size={12} />
        </IconButton>

        {hasAIMessages && (
          <VStack
            minH={lastAIMessage ? '32px' : '0px'}
            {...inputSubtitleStyles.messageStack}
          >
            {lastAIMessage && (
              <Text {...inputSubtitleStyles.messageText}>
                {lastAIMessage}
              </Text>
            )}
          </VStack>
        )}

        <Box {...inputSubtitleStyles.statusBox}>
          <Flex align="center" justify="space-between" color="whiteAlpha.700">
            <Flex align="center" gap="2">
              <LuBell size={16} />
              <Text {...inputSubtitleStyles.statusText}>
                {aiState}
              </Text>
            </Flex>

            <Flex gap="2">
              <IconButton
                aria-label="Toggle microphone"
                onClick={handleMicToggle}
                {...inputSubtitleStyles.iconButton}
              >
                {micOn ? <LuMic size={16} /> : <LuMicOff size={16} />}
              </IconButton>
              <IconButton
                aria-label="Interrupt"
                onClick={handleInterrupt}
                {...inputSubtitleStyles.iconButton}
              >
                <LuHand size={16} />
              </IconButton>
            </Flex>
          </Flex>
        </Box>

        <Box {...inputSubtitleStyles.inputBox}>
          <Stack direction="row" gap="2" p="2">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="Type your message..."
              {...inputSubtitleStyles.input}
            />
            <Button
              onClick={handleSend}
              {...inputSubtitleStyles.sendButton}
            >
              <LuSend size={16} />
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
