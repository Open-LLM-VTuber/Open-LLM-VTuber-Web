/* eslint-disable no-use-before-define */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-underscore-dangle */
import { useEffect, useCallback, RefObject, useRef } from 'react';
import { ModelInfo } from '@/context/live2d-config-context';
import { LAppDelegate } from '../../../WebSDK/src/lappdelegate';
import { LAppLive2DManager } from '../../../WebSDK/src/lapplive2dmanager';
import { useMode } from '@/context/mode-context';

// Constants for model scaling behavior
const MIN_SCALE = 0.1;
const MAX_SCALE = 5.0;
const EASING_FACTOR = 0.3; // Controls animation smoothness
const WHEEL_SCALE_STEP = 0.03; // Scale change per wheel tick
const DEFAULT_SCALE = 1.0; // Default scale if not specified
const SCALE_EPSILON = 0.0005; // Convergence threshold for animation loop

interface UseLive2DResizeProps {
  containerRef: RefObject<HTMLDivElement>;
  modelInfo?: ModelInfo;
  showSidebar?: boolean; // Sidebar collapse state
}

/**
 * Applies scale to both model and view matrices
 * @param scale - The scale value to apply
 */
export const applyScale = (scale: number) => {
  try {
    const manager = LAppLive2DManager.getInstance();
    if (!manager) return;

    const model = manager.getModel(0);
    if (!model) return;

    // @ts-ignore
    model._modelMatrix.scale(scale, scale);
  } catch (error) {
    console.debug('Model not ready for scaling yet');
  }
};

/**
 * Reads the current model matrix scale (X axis).
 * Returns undefined if the model isn't ready.
 */
const readModelScale = (): number | undefined => {
  try {
    const manager = LAppLive2DManager.getInstance();
    if (!manager) return undefined;
    const model = manager.getModel(0);
    if (!model) return undefined;
    // @ts-ignore
    return model._modelMatrix.getScaleX();
  } catch {
    return undefined;
  }
};

/**
 * Hook to handle Live2D model resizing and scaling
 * Provides smooth scaling animation and window resize handling
 */
export const useLive2DResize = ({
  containerRef,
  modelInfo,
  showSidebar,
}: UseLive2DResizeProps) => {
  const { mode } = useMode();
  const isPet = mode === 'pet';
  const animationFrameIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isResizingRef = useRef<boolean>(false);

  // Initialize scale references
  const initialScale = modelInfo?.kScale || DEFAULT_SCALE;
  const lastScaleRef = useRef<number>(initialScale);
  const targetScaleRef = useRef<number>(initialScale);
  const animationFrameRef = useRef<number>();
  const isAnimatingRef = useRef<boolean>(false);
  const hasAppliedInitialScale = useRef<boolean>(false);

  // Previous container dimensions for change detection
  const lastContainerDimensionsRef = useRef<{width: number, height: number}>({ width: 0, height: 0 });

  // Previous sidebar state
  const prevSidebarStateRef = useRef<boolean | undefined>(showSidebar);

  /**
   * Reset scale state when model changes
   */
  useEffect(() => {
    const newInitialScale = modelInfo?.kScale || DEFAULT_SCALE;
    lastScaleRef.current = newInitialScale;
    targetScaleRef.current = newInitialScale;
    hasAppliedInitialScale.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      isAnimatingRef.current = false;
    }

    const resizeHandle = requestAnimationFrame(() => {
      handleResize();
    });

    return () => cancelAnimationFrame(resizeHandle);
  }, [modelInfo?.url, modelInfo?.kScale]);

  /**
   * Smooth animation loop for scaling
   * Uses linear interpolation for smooth transitions
   */
  const animateEase = useCallback(() => {
    const clampedTargetScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, targetScaleRef.current),
    );

    const currentScale = lastScaleRef.current;
    const diff = clampedTargetScale - currentScale;

    if (Math.abs(diff) < SCALE_EPSILON) {
      applyScale(clampedTargetScale);
      lastScaleRef.current = clampedTargetScale;
      isAnimatingRef.current = false;
      return;
    }

    const newScale = currentScale + diff * EASING_FACTOR;
    applyScale(newScale);
    lastScaleRef.current = newScale;

    animationFrameRef.current = requestAnimationFrame(animateEase);
  }, []);

  /**
   * Handles mouse wheel events for scaling
   * Initiates smooth scaling animation
   */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!modelInfo?.scrollToResize) return;

    // Sync from actual model scale before computing new target to prevent
    // jumps when refs drifted (e.g. after model reload while animation was stopped).
    if (!isAnimatingRef.current) {
      const actual = readModelScale();
      if (actual !== undefined && actual > 0) {
        lastScaleRef.current = actual;
      }
    }

    const direction = e.deltaY > 0 ? -1 : 1;
    const increment = WHEEL_SCALE_STEP * direction;

    const currentActualScale = lastScaleRef.current;
    const newTargetScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, currentActualScale + increment),
    );

    targetScaleRef.current = newTargetScale;

    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      animationFrameRef.current = requestAnimationFrame(animateEase);
    }
  }, [modelInfo?.scrollToResize, animateEase]);

  /**
   * Pre-process container resize
   * Preserve aspect ratio temporarily before actual change
   */
  const beforeResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isResizingRef.current = true;

    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);

  /**
   * Handles window/container resize events
   * Updates canvas dimensions and model scaling
   */
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (!isResizingRef.current) {
      beforeResize();
    }

    try {
      const containerBounds = containerRef.current?.getBoundingClientRect();
      const { width, height } = isPet
        ? { width: window.innerWidth, height: window.innerHeight }
        : containerBounds || { width: 0, height: 0 };

      const lastDimensions = lastContainerDimensionsRef.current;
      const sidebarChanged = prevSidebarStateRef.current !== showSidebar;
      const dimensionsChanged = Math.abs(lastDimensions.width - width) > 1 || Math.abs(lastDimensions.height - height) > 1;
      const hasChanged = dimensionsChanged || sidebarChanged;

      if (!hasChanged && hasAppliedInitialScale.current) {
        isResizingRef.current = false;
        return;
      }

      lastContainerDimensionsRef.current = { width, height };
      prevSidebarStateRef.current = showSidebar;

      if (!containerBounds && !isPet) {
        console.warn('[Resize] Container bounds not available in window mode.');
      }
      if (width === 0 || height === 0) {
        console.warn('[Resize] Width or Height is zero, skipping canvas/delegate update.');
        isResizingRef.current = false;
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const delegate = LAppDelegate.getInstance();
      if (delegate) {
        delegate.onResize();
      } else {
        console.warn('[Resize] LAppDelegate instance not found.');
      }

      // Sync scale refs with the actual model matrix to prevent desync
      // after model reloads or external scale changes (e.g. onUpdate setWidth).
      if (!isAnimatingRef.current) {
        const actualScale = readModelScale();
        if (actualScale !== undefined && actualScale > 0) {
          lastScaleRef.current = actualScale;
          targetScaleRef.current = actualScale;
        }
      }

      isResizingRef.current = false;
    } catch (error) {
      isResizingRef.current = false;
    }
  }, [isPet, containerRef, modelInfo?.kScale, modelInfo?.initialXshift, modelInfo?.initialYshift, showSidebar, beforeResize, canvasRef]);

  // Immediately respond to sidebar state changes
  useEffect(() => {
    if (prevSidebarStateRef.current !== showSidebar) {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      animationFrameIdRef.current = requestAnimationFrame(() => {
        handleResize();
        animationFrameIdRef.current = null;
      });
    }
  }, [showSidebar, handleResize]);

  // Set up event listeners and cleanup for wheel scaling
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (canvasElement) {
      canvasElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        canvasElement.removeEventListener('wheel', handleWheel);
      };
    }
    return undefined;
  }, [handleWheel, canvasRef]);

  // Clean up animations on unmount
  useEffect(() => () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);


  // Monitor container size changes using ResizeObserver
  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) {
      return undefined;
    }

    if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
    animationFrameIdRef.current = requestAnimationFrame(() => {
      handleResize();
      animationFrameIdRef.current = null;
    });

    const observer = new ResizeObserver(() => {
      if (!isResizingRef.current) {
        if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(() => {
          handleResize();
          animationFrameIdRef.current = null;
        });
      }
    });

    observer.observe(containerElement);

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      observer.disconnect();
    };
  }, [containerRef, handleResize]);

  // Monitor window size changes (mainly for 'pet' mode or fallback)
  useEffect(() => {
    const handleWindowResize = () => {
      if (!isResizingRef.current) {
        if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(() => {
          handleResize();
          animationFrameIdRef.current = null;
        });
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [handleResize]);

  return { canvasRef, handleResize };
};

/**
 * Helper function to set model scale with device pixel ratio consideration
 * @deprecated This logic might be better handled within the view matrix scaling
 */
export const setModelScale = (
  model: any,
  kScale: string | number | undefined,
) => {
  if (!model || kScale === undefined) return;
  console.warn("setModelScale is potentially deprecated; scaling is primarily handled by view matrix now.");
};

/**
 * Helper function to center model in container with optional offset
 * This is now primarily handled within handleResize
 */
export const resetModelPosition = (
  model: any,
  width: number, // Logical width (CSS pixels)
  height: number, // Logical height (CSS pixels)
  initialXshift: number | undefined, // Shift in logical pixels
  initialYshift: number | undefined, // Shift in logical pixels
) => {
  if (!model || typeof model.setPosition !== 'function') return;

  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = width * dpr; // Calculate canvas pixel dimensions
  const canvasHeight = height * dpr;

  const initXshiftPixels = Number(initialXshift || 0) * dpr; // Convert shift to canvas pixels
  const initYshiftPixels = Number(initialYshift || 0) * dpr;

  const centerX = canvasWidth / 2 + initXshiftPixels;
  const centerY = canvasHeight / 2 + initYshiftPixels;

  // @ts-ignore
  model.setPosition(centerX, centerY);
};
