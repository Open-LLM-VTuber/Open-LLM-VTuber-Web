import { useState } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { useAiState } from '@/context/ai-state-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatHistory } from '@/context/chat-history-context';
import { useVAD } from '@/context/vad-context';
import { ImageData, useMediaCapture } from '@/hooks/utils/use-media-capture';

export function useTextInput() {
  const [inputText, setInputText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<ImageData[]>([]);
  const clearAttachments = () => setAttachedImages([]);


  const wsContext = useWebSocket();
  const { aiState } = useAiState();
  const { interrupt } = useInterrupt();
  const { appendHumanMessage } = useChatHistory();
  const { stopMic, autoStopMic } = useVAD();
  const { captureAllMedia } = useMediaCapture();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { items } = e.clipboardData;
    let foundImage = false;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          foundImage = true;
          const reader = new FileReader();
          reader.onload = () => {
            setAttachedImages(prev => [
              ...prev,
              {
                source: 'clipboard',
                data: reader.result as string,
                mime_type: file.type,
              },
            ]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
    // Prevent the raw image from being inserted as text
    if (foundImage) e.preventDefault();
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachedImages.length === 0) return;
    if (!wsContext) return;

    if (aiState === 'thinking-speaking') {
      interrupt();
    }

    const captured = await captureAllMedia();
    const images = [...attachedImages, ...captured];


    appendHumanMessage(inputText.trim());
    wsContext.sendMessage({
      type: 'text-input',
      text: inputText.trim(),
      images,
    });

    if (autoStopMic) stopMic();
    setInputText('');
    setAttachedImages([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  return {
    inputText,
    setInputText: handleInputChange,
    handleSend,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handlePaste,
    attachmentsCount: attachedImages.length,
    clearAttachments,
  };
}
