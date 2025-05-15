// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { LogLevel } from "@framework/live2dcubismframework";

/**
 * Sample Appで使用する定数
 */

// Canvas width and height pixel values, or dynamic screen size ('auto').
export const CanvasSize: { width: number; height: number } | "auto" = "auto";

export const ViewScale = 1.0;
export let CurrentKScale = ViewScale;
export const ViewMaxScale = 2.0;
export const ViewMinScale = 0.8;

export const ViewLogicalLeft = -1.0;
export const ViewLogicalRight = 1.0;
export const ViewLogicalBottom = -1.0;
export const ViewLogicalTop = 1.0;

export const ViewLogicalMaxLeft = -2.0;
export const ViewLogicalMaxRight = 2.0;
export const ViewLogicalMaxBottom = -2.0;
export const ViewLogicalMaxTop = 2.0;

// Dynamic resource path that will be set by the model loader
export let ResourcesPath = "";

// Model directory and filename storage
export let ModelDir: string[] = [];
export let ModelFileNames: string[] = []; // New array to store model file names

// Function to update model configuration with both directory and file name
export function updateModelConfig(
  resourcePath: string,
  modelDirectory: string,
  modelFileName: string,
  kScale?: number
) {
  console.log("Updating model config:", {
    resourcePath,
    modelDirectory,
    modelFileName,
    kScale,
  });
  ResourcesPath = resourcePath;
  ModelDir = [modelDirectory];
  ModelFileNames = [modelFileName]; // Store the actual model file name
  if (kScale !== undefined) {
    CurrentKScale = kScale;
  }
  // Update ModelDirSize when ModelDir changes
  ModelDirSize = ModelDir.length;
}

// Export ModelDirSize as a variable instead of a constant
export let ModelDirSize = ModelDir.length;

// モデルの後ろにある背景の画像ファイル
export const BackImageName = "back_class_normal.png";

// 歯車
export const GearImageName = "icon_gear.png";

// 終了ボタン
export const PowerImageName = "CloseNormal.png";

// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと

// 外部定義ファイル（json）と合わせる
// 外部定义文件（json）与之匹配
export const MotionGroupIdle = "Idle"; // アイドリング  // 空闲
export const MotionGroupTapBody = "TapBody"; // 体をタップしたとき  // 点击身体时

// 外部定義ファイル（json）と合わせる
// 外部定义文件（json）与之匹配
export const HitAreaNameHead = "Head";
export const HitAreaNameBody = "Body";

// モーションの優先度定数
export const PriorityNone = 0;
export const PriorityIdle = 1;
export const PriorityNormal = 2;
export const PriorityForce = 3;

// MOC3の整合性検証オプション
export const MOCConsistencyValidationEnable = true;
// motion3.jsonの整合性検証オプション
export const MotionConsistencyValidationEnable = true;

// デバッグ用ログの表示オプション
export const DebugLogEnable = true;
export const DebugTouchLogEnable = false;

// Frameworkから出力するログのレベル設定
export const CubismLoggingLevel: LogLevel = LogLevel.LogLevel_Verbose;

// デフォルトのレンダーターゲットサイズ
export const RenderTargetWidth = 1900;
export const RenderTargetHeight = 1000;
