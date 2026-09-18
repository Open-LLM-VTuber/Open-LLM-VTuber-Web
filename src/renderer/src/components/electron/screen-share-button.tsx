import { IconButton } from '@chakra-ui/react';
import { LuMonitor } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { inputSubtitleStyles } from './electron-style';
import { useScreenCaptureContext } from '@/context/screen-capture-context';

/**
 * Pet-mode screen share button. Opens the dedicated share-picker window
 * (source selection with large thumbnails + adjustable region); the button
 * turns green while sharing. Stop/clear actions live inside the picker.
 */
export function ScreenShareButton() {
  const { t } = useTranslation();
  const { isStreaming } = useScreenCaptureContext();

  const openPicker = () => {
    window.electron?.ipcRenderer.invoke('open-share-picker');
  };

  return (
    <IconButton
      aria-label={t('sidebar.screenShare')}
      onClick={openPicker}
      {...inputSubtitleStyles.iconButton}
      color={isStreaming ? 'green.400' : 'whiteAlpha.800'}
    >
      <LuMonitor size={16} />
    </IconButton>
  );
}
