/* eslint-disable operator-assignment */
/* eslint-disable object-shorthand */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCamera } from '@/context/camera-context';
import { useScreenCaptureContext } from '@/context/screen-capture-context';
import { toaster } from "@/components/ui/toaster";
import {
  IMAGE_COMPRESSION_QUALITY_KEY,
  DEFAULT_IMAGE_COMPRESSION_QUALITY,
  IMAGE_MAX_WIDTH_KEY,
  DEFAULT_IMAGE_MAX_WIDTH,
} from '@/hooks/sidebar/setting/use-general-settings';

// Add type definition for ImageCapture
declare class ImageCapture {
  constructor(track: MediaStreamTrack);

  grabFrame(): Promise<ImageBitmap>;
}

interface ImageData {
  source: 'camera' | 'screen';
  data: string;
  mime_type: string;
}

export function useMediaCapture() {
  const { t } = useTranslation();
  const { stream: cameraStream } = useCamera();
  const { stream: screenStream } = useScreenCaptureContext();

  const getCompressionQuality = useCallback(() => {
    const storedQuality = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
    if (storedQuality) {
      const quality = parseFloat(storedQuality);
      if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
        return quality;
      }
    }
    return DEFAULT_IMAGE_COMPRESSION_QUALITY;
  }, []);

  const getImageMaxWidth = useCallback(() => {
    const storedMaxWidth = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
    if (storedMaxWidth) {
      const maxWidth = parseInt(storedMaxWidth, 10);
      if (!Number.isNaN(maxWidth) && maxWidth > 0) {
        return maxWidth;
      }
    }
    return DEFAULT_IMAGE_MAX_WIDTH;
  }, []);

  const captureFrame = useCallback(async (stream: MediaStream | null, source: 'camera' | 'screen') => {
    if (!stream) {
      console.warn(`No ${source} stream available`);
      return null;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn(`No video track in ${source} stream`);
      return null;
    }

    const imageCapture = new ImageCapture(videoTrack);
    try {
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement('canvas');
      let { width, height } = bitmap;

      const maxWidth = getImageMaxWidth();
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context');
        return null;
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      const quality = getCompressionQuality();
      return canvas.toDataURL('image/jpeg', quality);
    } catch (error) {
      console.error(`Error capturing ${source} frame:`, error);
      toaster.create({
        title: `${t('error.failedCapture', { source: source })}: ${error}`,
        type: 'error',
        duration: 2000,
      });
      return null;
    }
  }, [t, getCompressionQuality, getImageMaxWidth]);

  const captureAllMedia = useCallback(async () => {
    const images: ImageData[] = [];

    // Capture camera frame
    if (cameraStream) {
      const cameraFrame = await captureFrame(cameraStream, 'camera');
      if (cameraFrame) {
        images.push({
          source: 'camera',
          data: cameraFrame,
          mime_type: 'image/jpeg',
        });
      }
    }

    // Capture screen frame
    if (screenStream) {
      const screenFrame = await captureFrame(screenStream, 'screen');
      if (screenFrame) {
        images.push({
          source: 'screen',
          data: screenFrame,
          mime_type: 'image/jpeg',
        });
      }
    }

    console.log("images: ", images);

    return images;
  }, [cameraStream, screenStream, captureFrame]);

  return {
    captureAllMedia,
  };
}
