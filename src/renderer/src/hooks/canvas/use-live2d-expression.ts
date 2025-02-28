import { useCallback } from 'react';
import { ModelInfo } from '@/context/live2d-config-context';

/**
 * Custom hook for handling Live2D model expressions
 */
export const useLive2DExpression = () => {
  /**
   * Set expression for Live2D model
   * @param expressionValue - Expression name (string) or index (number)
   * @param lappAdapter - LAppAdapter instance
   * @param logMessage - Optional message to log on success
   */
  const setExpression = useCallback((
    expressionValue: string | number,
    lappAdapter: any,
    logMessage?: string,
  ) => {
    try {
      if (typeof expressionValue === 'string') {
        // Set expression by name
        lappAdapter.setExpression(expressionValue);
      } else if (typeof expressionValue === 'number') {
        // Set expression by index
        const expressionName = lappAdapter.getExpressionName(expressionValue);
        if (expressionName) {
          lappAdapter.setExpression(expressionName);
        }
      }
      if (logMessage) {
        console.log(logMessage);
      }
    } catch (error) {
      console.error('Failed to set expression:', error);
    }
  }, []);

  /**
   * Reset expression to default
   * @param lappAdapter - LAppAdapter instance
   * @param modelInfo - Current model information
   */
  const resetExpression = useCallback((
    lappAdapter: any,
    modelInfo?: ModelInfo,
  ) => {
    if (!lappAdapter) return;

    try {
      // If model has a default emotion defined, use it
      if (modelInfo?.defaultEmotion !== undefined) {
        setExpression(
          modelInfo.defaultEmotion,
          lappAdapter,
          `Reset expression to default: ${modelInfo.defaultEmotion}`,
        );
      } else {
        // If no default is defined, use the first expression (index 0)
        const defaultExpressionName = lappAdapter.getExpressionName(0);
        if (defaultExpressionName) {
          setExpression(
            defaultExpressionName,
            lappAdapter,
            `Reset expression to first expression: ${defaultExpressionName}`,
          );
        }
      }
    } catch (error) {
      console.error('Failed to reset expression:', error);
    }
  }, [setExpression]);

  return {
    setExpression,
    resetExpression,
  };
};
