import { useState, useEffect, useRef } from 'react';
import {
  Box, Text, Button, IconButton, Image, Spinner, SimpleGrid, Flex,
} from '@chakra-ui/react';
import {
  LuMonitor, LuCrop, LuArrowLeft, LuRefreshCw, LuCircleStop,
} from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { Toaster, toaster } from '@/components/ui/toaster';
import { CaptureSourceInfo, CaptureRegion } from '@/context/screen-capture-context';

/** Minimum size (normalized) for a drag to count as a region selection. */
const MIN_REGION_SIZE = 0.02;

const FULL_REGION: CaptureRegion = { x: 0, y: 0, width: 1, height: 1 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const isFullRegion = (region: CaptureRegion) =>
  region.x <= 0.001 && region.y <= 0.001 && region.width >= 0.999 && region.height >= 0.999;

function SourceCard({
  source,
  onSelect,
}: {
  source: CaptureSourceInfo;
  onSelect: (source: CaptureSourceInfo) => void;
}) {
  const { t } = useTranslation();

  return (
    <Box
      onClick={() => onSelect(source)}
      borderRadius="lg"
      overflow="hidden"
      cursor="pointer"
      border="1px solid"
      borderColor="whiteAlpha.200"
      bg="whiteAlpha.50"
      transition="all 0.15s"
      _hover={{ borderColor: 'cyan.300', transform: 'translateY(-2px)' }}
    >
      {source.thumbnail ? (
        <Image
          src={source.thumbnail}
          alt={source.name}
          width="100%"
          aspectRatio="16/9"
          objectFit="cover"
        />
      ) : (
        <Box
          width="100%"
          aspectRatio="16/9"
          bg="blackAlpha.400"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <LuMonitor size={28} />
        </Box>
      )}
      <Box p={2}>
        <Text fontSize="sm" truncate>
          {source.name}
        </Text>
        <Text fontSize="xs" color="cyan.300">
          {source.type === 'screen' ? t('sidebar.sourceScreen') : t('sidebar.sourceWindow')}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Region step: live preview of the selected source with an adjustable
 * selection rectangle (default: the full area — same as plain sharing).
 */
function RegionStep({
  source,
  onBack,
  onConfirm,
}: {
  source: CaptureSourceInfo;
  onBack: () => void;
  onConfirm: (region: CaptureRegion | null) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [rect, setRect] = useState<CaptureRegion>(FULL_REGION);
  const [isDragging, setIsDragging] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [videoBox, setVideoBox] = useState<{ width: number; height: number } | null>(null);

  // Local preview stream of the selected source (this window only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mandatory = source.id.startsWith('window:')
          ? {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              maxWidth: 1920,
              maxHeight: 1080,
            }
          : {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1280,
              minHeight: 720,
              maxHeight: 720,
            };
        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mandatory,
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(displayMediaOptions);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to start preview stream:', err);
        toaster.create({
          title: `${t('error.failedStartScreenCapture')}: ${err}`,
          type: 'error',
          duration: 2000,
        });
      }
    })();
    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [source, t]);

  // Reset the selection when switching sources.
  useEffect(() => {
    setRect(FULL_REGION);
    dragStartRef.current = null;
  }, [source]);

  // Letterbox sizing: keep the video box and the drag overlay aligned.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleMetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoAspect(video.videoWidth / video.videoHeight);
      }
    };
    handleMetadata();
    video.addEventListener('loadedmetadata', handleMetadata);
    return () => video.removeEventListener('loadedmetadata', handleMetadata);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const bounds = container.getBoundingClientRect();
      if (bounds.width < 10 || bounds.height < 10 || !videoAspect) {
        setVideoBox(null);
        return;
      }
      let width = bounds.width;
      let height = width / videoAspect;
      if (height > bounds.height) {
        height = bounds.height;
        width = height * videoAspect;
      }
      setVideoBox({ width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoAspect]);

  const normalizePoint = (e: React.PointerEvent): { x: number; y: number } => {
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: clamp01((e.clientX - bounds.left) / bounds.width),
      y: clamp01((e.clientY - bounds.top) / bounds.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    const point = normalizePoint(e);
    dragStartRef.current = point;
    setIsDragging(true);
    setRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.preventDefault();
    const point = normalizePoint(e);
    const start = dragStartRef.current;
    setRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    dragStartRef.current = null;
    setIsDragging(false);
    setRect((prev) =>
      prev.width < MIN_REGION_SIZE || prev.height < MIN_REGION_SIZE ? FULL_REGION : prev,
    );
  };

  const handlePointerCancel = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleConfirm = () => {
    onConfirm(isFullRegion(rect) ? null : rect);
  };

  return (
    <Box display="flex" flexDirection="column" flex={1} minH={0}>
      <Flex align="center" gap={3} mb={3}>
        <IconButton
          aria-label={t('sidebar.back')}
          size="sm"
          variant="ghost"
          onClick={onBack}
        >
          <LuArrowLeft />
        </IconButton>
        <Box flex={1} minW={0}>
          <Text fontSize="md" fontWeight="bold" truncate>
            {source.name}
          </Text>
          <Text fontSize="xs" color="whiteAlpha.600">
            {source.type === 'screen' ? t('sidebar.sourceScreen') : t('sidebar.sourceWindow')}
            {' · '}
            {t('sidebar.regionAdjustHint')}
          </Text>
        </Box>
        <Button
          size="sm"
          variant="surface"
          colorPalette="gray"
          onClick={() => setRect(FULL_REGION)}
        >
          <LuRefreshCw />
          {t('sidebar.resetRegion')}
        </Button>
      </Flex>

      <Box
        ref={containerRef}
        flex={1}
        minH={0}
        bg="blackAlpha.600"
        borderRadius="lg"
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative"
        overflow="hidden"
      >
        <Box
          style={
            videoBox ? { width: `${videoBox.width}px`, height: `${videoBox.height}px` } : undefined
          }
          position="relative"
          overflow="hidden"
          borderRadius="md"
          bg="black"
          cursor="crosshair"
          touchAction="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
          <Box
            position="absolute"
            left={`${rect.x * 100}%`}
            top={`${rect.y * 100}%`}
            width={`${rect.width * 100}%`}
            height={`${rect.height * 100}%`}
            border="2px solid"
            borderColor={isDragging ? 'red.400' : 'cyan.300'}
            boxShadow="0 0 0 100000px rgba(0, 0, 0, 0.45)"
            pointerEvents="none"
          />
        </Box>
      </Box>

      <Flex gap={3} mt={3} justifyContent="flex-end">
        <Button size="sm" colorPalette="cyan" onClick={handleConfirm}>
          <LuCrop />
          {t('sidebar.confirmShare')}
        </Button>
      </Flex>
    </Box>
  );
}

/**
 * Standalone page rendered in the share-picker BrowserWindow: pick a screen
 * or window from large thumbnails, optionally adjust the region to share,
 * then confirm. Runs in its own window, independent of the main UI.
 */
export function SharePickerPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<'sources' | 'region'>('sources');
  const [sources, setSources] = useState<CaptureSourceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<CaptureSourceInfo | null>(null);

  useEffect(() => {
    document.title = t('sidebar.selectShareSource');
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await window.electron?.ipcRenderer.invoke('get-capture-sources');
        if (!cancelled) {
          setSources(((list as CaptureSourceInfo[]) ?? []).filter((s) => s.id));
        }
      } catch (err) {
        console.error('Failed to fetch capture sources:', err);
        toaster.create({
          title: `${t('error.failedFetchSources')}: ${err}`,
          type: 'error',
          duration: 2000,
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Escape goes back one step (and closes the window from the first step).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (step === 'region') {
        setStep('sources');
        setSelected(null);
      } else {
        window.close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step]);

  const handleSelectSource = (source: CaptureSourceInfo) => {
    setSelected(source);
    setStep('region');
  };

  const handleBack = () => {
    setStep('sources');
    setSelected(null);
  };

  const handleConfirm = (region: CaptureRegion | null) => {
    if (!selected) return;
    window.electron?.ipcRenderer.send('share-picker-confirm', {
      sourceId: selected.id,
      sourceName: selected.name,
      region,
    });
  };

  const handleStopSharing = () => {
    window.electron?.ipcRenderer.send('share-picker-stop');
  };

  return (
    <Box
      width="100vw"
      height="100vh"
      bg="gray.900"
      color="white"
      p={5}
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
      {step === 'region' && selected ? (
        <RegionStep source={selected} onBack={handleBack} onConfirm={handleConfirm} />
      ) : (
        <Box display="flex" flexDirection="column" flex={1} minH={0}>
          <Flex align="center" justifyContent="space-between" mb={4}>
            <Text fontSize="lg" fontWeight="bold">
              {t('sidebar.selectShareSource')}
            </Text>
            <Button
              size="sm"
              variant="surface"
              colorPalette="red"
              onClick={handleStopSharing}
            >
              <LuCircleStop />
              {t('sidebar.stopShare')}
            </Button>
          </Flex>

          {isLoading ? (
            <Box flex={1} display="flex" alignItems="center" justifyContent="center">
              <Spinner />
            </Box>
          ) : sources.length === 0 ? (
            <Box flex={1} display="flex" alignItems="center" justifyContent="center">
              <Text color="whiteAlpha.600">{t('sidebar.noShareSources')}</Text>
            </Box>
          ) : (
            <SimpleGrid
              columns={{ base: 2, lg: 3 }}
              gap={4}
              overflowY="auto"
              flex={1}
              pb={2}
              alignContent="start"
            >
              {sources.map((source) => (
                <SourceCard key={source.id} source={source} onSelect={handleSelectSource} />
              ))}
            </SimpleGrid>
          )}
        </Box>
      )}
      <Toaster />
    </Box>
  );
}
