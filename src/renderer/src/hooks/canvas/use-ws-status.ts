import { useMemo, useCallback } from 'react';
import { useWebSocket } from '@/context/websocket-context';

interface WSStatusInfo {
  color: string
  textKey: string
  isDisconnected: boolean
  handleClick: () => void
}

export const useWSStatus = () => {
  const { wsState, reconnect } = useWebSocket();

  const handleClick = useCallback(() => {
    if (wsState !== 'OPEN' && wsState !== 'CONNECTING') {
      reconnect();
    }
  }, [wsState, reconnect]);

  const statusInfo = useMemo((): WSStatusInfo => {
    switch (wsState) {
      case 'OPEN':
        return {
          color: 'green.500',
          textKey: 'wsStatus.connected',
          isDisconnected: false,
          handleClick,
        };
      case 'CONNECTING':
        return {
          color: 'yellow.500',
          textKey: 'wsStatus.connecting',
          isDisconnected: false,
          handleClick,
        };
      case 'UNAUTHORIZED':
        return {
          color: 'red.500',
          textKey: 'wsStatus.authFailed',
          isDisconnected: true,
          handleClick,
        };
      default:
        return {
          color: 'red.500',
          textKey: 'wsStatus.clickToReconnect',
          isDisconnected: true,
          handleClick,
        };
    }
  }, [wsState, handleClick]);

  return statusInfo;
};
