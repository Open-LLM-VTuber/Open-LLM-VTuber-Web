/* eslint-disable @typescript-eslint/ban-ts-comment */
import { memo, useRef } from "react";
import { useLive2DConfig } from "@/context/live2d-config-context";
import { useIpcHandlers } from "@/hooks/utils/use-ipc-handlers";
import { useInterrupt } from "@/hooks/utils/use-interrupt";
import { useAudioTask } from "@/hooks/utils/use-audio-task";
import { useLive2DModel } from "@/hooks/canvas/use-live2d-model";
import { useLive2DResize } from "@/hooks/canvas/use-live2d-resize";

interface Live2DProps {
  isPet: boolean;
}

export const Live2D = memo(({ isPet }: Live2DProps): JSX.Element => {
  const { isLoading, modelInfo } = useLive2DConfig();
  const { position, handlers } = useLive2DModel({ isPet, modelInfo });
  const containerRef = useRef<HTMLDivElement>(null);

  // Add resize hook
  useLive2DResize({ containerRef, isPet, modelInfo });

  // Register IPC handlers
  useIpcHandlers({ isPet });

  // Export these hooks for global use
  useInterrupt();
  useAudioTask();

  return (
    <div
      ref={containerRef}
      id="live2d"
      style={{
        width: isPet ? "100vw" : "100%",
        height: isPet ? "100vh" : "100%",
        pointerEvents: "auto",
        overflow: "hidden",
        opacity: isLoading ? 0 : 1,
        transition: "opacity 0.3s ease-in-out",
        position: "relative",
        zIndex: 10,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: "move",
      }}
      {...handlers}
    >
      <canvas
        id="canvas"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
          display: "block",
        }}
      />
    </div>
  );
});

Live2D.displayName = "Live2D";

export { useInterrupt, useAudioTask };
