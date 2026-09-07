import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useScreenCaptureContext, CaptureRegion } from '@/context/screen-capture-context';

/** Minimum size (normalized) for a drag to count as a region selection. */
const MIN_REGION_SIZE = 0.02;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function useCaptureScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const {
    stream,
    isStreaming,
    error,
    sharedSourceName,
    captureRegion,
    setCaptureRegion,
    startCapture,
    stopCapture,
  } = useScreenCaptureContext();

  const isElectron = useMemo(() => typeof window !== 'undefined' && !!window.electron, []);

  // --- Legacy toggle (click panel to start/stop). Web mode keeps this. ---
  const toggleCapture = () => {
    if (isStreaming) {
      stopCapture();
    } else {
      startCapture();
    }
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // --- Region selection (draw a rectangle over the preview) ---
  //
  // The drag rectangle is rendered imperatively (direct DOM style writes) and
  // tracked with Pointer Events + setPointerCapture so that:
  //  * no React re-render happens per pointermove (the main window runs
  //    Live2D/audio work — state updates per move made the drag feel laggy);
  //  * the drag keeps tracking (and clamps to the edges) when the cursor
  //    leaves the small preview, instead of ending prematurely.
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const draftRectRef = useRef<CaptureRegion | null>(null);
  const draftOverlayRef = useRef<HTMLDivElement | null>(null);

  const hideDraftOverlay = useCallback(() => {
    const overlay = draftOverlayRef.current;
    if (overlay) {
      overlay.style.display = 'none';
    }
  }, []);

  const showDraftOverlay = useCallback((rect: CaptureRegion) => {
    const overlay = draftOverlayRef.current;
    if (!overlay) return;
    overlay.style.display = 'block';
    overlay.style.left = `${rect.x * 100}%`;
    overlay.style.top = `${rect.y * 100}%`;
    overlay.style.width = `${rect.width * 100}%`;
    overlay.style.height = `${rect.height * 100}%`;
  }, []);

  const toggleRegionSelection = useCallback(() => {
    // Exiting selection mode discards any in-flight draft overlay.
    hideDraftOverlay();
    isDraggingRef.current = false;
    dragStartRef.current = null;
    draftRectRef.current = null;
    setIsSelectingRegion((prev) => !prev);
  }, [hideDraftOverlay]);

  const clearRegion = useCallback(() => {
    setCaptureRegion(null);
  }, [setCaptureRegion]);

  const stopShare = useCallback(() => {
    hideDraftOverlay();
    setIsSelectingRegion(false);
    isDraggingRef.current = false;
    dragStartRef.current = null;
    draftRectRef.current = null;
    stopCapture();
  }, [stopCapture, hideDraftOverlay]);

  const normalizePoint = (e: React.PointerEvent): { x: number; y: number } => {
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: clamp01((e.clientX - bounds.left) / bounds.width),
      y: clamp01((e.clientY - bounds.top) / bounds.height),
    };
  };

  const handleRegionPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isSelectingRegion || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is best-effort */
      }
      const point = normalizePoint(e);
      dragStartRef.current = point;
      isDraggingRef.current = true;
      draftRectRef.current = { x: point.x, y: point.y, width: 0, height: 0 };
      showDraftOverlay(draftRectRef.current);
    },
    [isSelectingRegion, showDraftOverlay],
  );

  const handleRegionPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      e.preventDefault();
      const start = dragStartRef.current;
      const point = normalizePoint(e);
      draftRectRef.current = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      };
      showDraftOverlay(draftRectRef.current);
    },
    [showDraftOverlay],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      hideDraftOverlay();
      const draft = draftRectRef.current;
      draftRectRef.current = null;
      // Releasing the drag commits the region right away and exits selection
      // mode, so the committed range is previewed immediately (red = draft
      // while dragging, cyan = committed).
      if (
        commit &&
        draft &&
        draft.width >= MIN_REGION_SIZE &&
        draft.height >= MIN_REGION_SIZE
      ) {
        setCaptureRegion(draft);
        setIsSelectingRegion(false);
      }
    },
    [hideDraftOverlay, setCaptureRegion],
  );

  const handleRegionPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture is best-effort */
      }
      finishDrag(true);
    },
    [finishDrag],
  );

  const handleRegionPointerCancel = useCallback(() => {
    if (!isDraggingRef.current) return;
    finishDrag(false);
  }, [finishDrag]);

  // --- Preview sizing: keep the video and the region overlay aligned ---
  const [videoBox, setVideoBox] = useState<{ width: number; height: number } | null>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  useEffect(() => {
    setVideoAspect(null);
    setVideoBox(null);
  }, [stream]);

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
  }, [stream]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10 || !videoAspect) {
        setVideoBox(null);
        return;
      }
      let width = rect.width;
      let height = width / videoAspect;
      if (height > rect.height) {
        height = rect.height;
        width = height * videoAspect;
      }
      setVideoBox({ width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoAspect, isStreaming]);

  const videoBoxStyle = useMemo(
    () =>
      videoBox
        ? { width: `${videoBox.width}px`, height: `${videoBox.height}px` }
        : undefined,
    [videoBox],
  );

  return {
    videoRef,
    containerRef,
    error,
    isHovering,
    isStreaming,
    stream,
    isElectron,
    sharedSourceName,
    captureRegion,
    toggleCapture,
    handleMouseEnter,
    handleMouseLeave,
    // region
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
  };
}
