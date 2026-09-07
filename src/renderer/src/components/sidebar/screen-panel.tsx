/* eslint-disable */
import { Box, Text, Button } from "@chakra-ui/react";
import { FiMonitor, FiCrop, FiX, FiStopCircle } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/ui/tooltip";
import { sidebarStyles } from "./sidebar-styles";
import { useCaptureScreen } from "@/hooks/sidebar/use-capture-screen";
import { CaptureRegion } from "@/context/screen-capture-context";

// Reusable components
function ScreenIndicator() {
  const { t } = useTranslation();

  return (
    <Box color="red.500" display="flex" alignItems="center" gap={2}>
      <Box
        w="8px"
        h="8px"
        borderRadius="full"
        bg="red.500"
        animation="pulse 2s infinite"
      />
      <Text fontSize="sm">{t('sidebar.screen')}</Text>
    </Box>
  );
}

function ScreenPlaceholder({ text }: { text: string }) {
  return (
    <Box
      position="absolute"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={2}
    >
      <FiMonitor size={24} />
      <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
        {text}
      </Text>
    </Box>
  );
}

function VideoStream({
  videoRef,
  isStreaming,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  isStreaming: boolean;
}) {
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={sidebarStyles.screenPanel.video}
      {...(isStreaming ? {} : { display: "none" })}
    />
  );
}

/** Draft rectangle while dragging (red border). Rendered imperatively via
 *  draftOverlayRef — pointermove updates its styles directly, without
 *  triggering React re-renders. */
function RegionDraftOverlay({
  draftOverlayRef,
}: {
  draftOverlayRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <Box
      ref={draftOverlayRef}
      position="absolute"
      display="none"
      border="2px solid"
      borderColor="red.400"
      boxShadow="0 0 0 2000px rgba(0, 0, 0, 0.55)"
      pointerEvents="none"
    />
  );
}

/** Static outline marking the committed share region. */
function RegionHighlight({ region }: { region: CaptureRegion }) {
  return (
    <Box
      position="absolute"
      left={`${region.x * 100}%`}
      top={`${region.y * 100}%`}
      width={`${region.width * 100}%`}
      height={`${region.height * 100}%`}
      border="2px solid"
      borderColor="cyan.300"
      bg="rgba(103, 232, 249, 0.12)"
      pointerEvents="none"
    />
  );
}

function ScreenPanel(): JSX.Element {
  const { t } = useTranslation();
  const {
    videoRef,
    containerRef,
    error,
    isHovering,
    isStreaming,
    isElectron,
    sharedSourceName,
    captureRegion,
    toggleCapture,
    handleMouseEnter,
    handleMouseLeave,
    isSelectingRegion,
    draftOverlayRef,
    toggleRegionSelection,
    clearRegion,
    stopShare,
    videoBoxStyle,
    handleRegionPointerDown,
    handleRegionPointerMove,
    handleRegionPointerUp,
    handleRegionPointerCancel,
  } = useCaptureScreen();

  // Electron: open the dedicated share-picker window (large thumbnails +
  // region step). Web: browser picker via getDisplayMedia.
  const handleContainerClick = () => {
    if (isStreaming) return;
    if (isElectron) {
      window.electron?.ipcRenderer.invoke('open-share-picker');
    } else {
      toggleCapture();
    }
  };

  const placeholderText = isElectron
    ? t('sidebar.chooseShareSource')
    : t('footer.screenControl');

  return (
    <Box {...sidebarStyles.screenPanel.container}>
      <Box {...sidebarStyles.screenPanel.header}>
        {isStreaming && <ScreenIndicator />}
      </Box>

      <Tooltip
        showArrow
        content={
          isStreaming
            ? t('sidebar.sharingHint')
            : placeholderText
        }
        open={isHovering && !error && !isSelectingRegion}
      >
        <Box
          ref={containerRef}
          {...sidebarStyles.screenPanel.screenContainer}
          onClick={handleContainerClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          cursor={isStreaming ? "default" : "pointer"}
          position="relative"
          _hover={{
            bg: "whiteAlpha.100",
          }}
        >
          {error ? (
            <Text color="red.300" fontSize="sm" textAlign="center">
              {error}
            </Text>
          ) : (
            <>
              {isStreaming && (
                <Box
                  style={videoBoxStyle}
                  {...sidebarStyles.screenPanel.videoWrapper}
                  onPointerDown={handleRegionPointerDown}
                  onPointerMove={handleRegionPointerMove}
                  onPointerUp={handleRegionPointerUp}
                  onPointerCancel={handleRegionPointerCancel}
                  cursor={isSelectingRegion ? "crosshair" : "default"}
                >
                  <VideoStream videoRef={videoRef} isStreaming={isStreaming} />
                  {isSelectingRegion && (
                    <RegionDraftOverlay draftOverlayRef={draftOverlayRef} />
                  )}
                  {captureRegion && <RegionHighlight region={captureRegion} />}
                </Box>
              )}
              {!isStreaming && <ScreenPlaceholder text={placeholderText} />}
            </>
          )}
        </Box>
      </Tooltip>

      {isStreaming && (
        <Box {...sidebarStyles.screenPanel.actionRow}>
          <Button
            size="xs"
            colorPalette={isSelectingRegion ? "cyan" : "gray"}
            variant={isSelectingRegion ? "solid" : "surface"}
            onClick={toggleRegionSelection}
          >
            <FiCrop />
            {isSelectingRegion
              ? t('sidebar.cancelRegionSelect')
              : t('sidebar.selectRegion')}
          </Button>
          {captureRegion && (
            <Button size="xs" colorPalette="gray" variant="surface" onClick={clearRegion}>
              <FiX />
              {t('sidebar.clearRegion')}
            </Button>
          )}
          <Button size="xs" colorPalette="red" variant="surface" onClick={stopShare}>
            <FiStopCircle />
            {t('sidebar.stopShare')}
          </Button>
        </Box>
      )}

      {isStreaming && (
        <Text {...sidebarStyles.screenPanel.statusText}>
          {sharedSourceName
            ? t('sidebar.sharingSource', { name: sharedSourceName })
            : t('sidebar.sharingActive')}
          {captureRegion ? ` · ${t('sidebar.regionSelected')}` : ""}
        </Text>
      )}

      {isStreaming && isSelectingRegion && (
        <Text {...sidebarStyles.screenPanel.statusText}>
          {t('sidebar.regionSelectHint')}
        </Text>
      )}
    </Box>
  );
}

export default ScreenPanel;
