// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismDefaultParameterId } from "@framework/cubismdefaultparameterid";
import { CubismModelSettingJson } from "@framework/cubismmodelsettingjson";
import {
  BreathParameterData,
  CubismBreath,
} from "@framework/effect/cubismbreath";
import { CubismEyeBlink } from "@framework/effect/cubismeyeblink";
import { ICubismModelSetting } from "@framework/icubismmodelsetting";
import { CubismIdHandle } from "@framework/id/cubismid";
import { CubismFramework } from "@framework/live2dcubismframework";
import { CubismMatrix44 } from "@framework/math/cubismmatrix44";
import { CubismUserModel } from "@framework/model/cubismusermodel";
import {
  ACubismMotion,
  FinishedMotionCallback,
} from "@framework/motion/acubismmotion";
import { CubismMotion } from "@framework/motion/cubismmotion";
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue,
} from "@framework/motion/cubismmotionqueuemanager";
import { csmMap } from "@framework/type/csmmap";
import { csmRect } from "@framework/type/csmrectf";
import { csmString } from "@framework/type/csmstring";
import { csmVector } from "@framework/type/csmvector";
import {
  CSM_ASSERT,
  CubismLogError,
  CubismLogInfo,
} from "@framework/utils/cubismdebug";

import * as LAppDefine from "./lappdefine";
import { frameBuffer, LAppDelegate } from "./lappdelegate";
import { canvas, gl } from "./lappglmanager";
import { LAppPal } from "./lapppal";
import { TextureInfo } from "./lapptexturemanager";
import { LAppWavFileHandler } from "./lappwavfilehandler";
import { getStreamingLipSyncRms } from "../../src/utils/stream-audio-player";
import { CubismMoc } from "@framework/model/cubismmoc";

enum LoadStep {
  LoadAssets,
  LoadModel,
  WaitLoadModel,
  LoadExpression,
  WaitLoadExpression,
  LoadPhysics,
  WaitLoadPhysics,
  LoadPose,
  WaitLoadPose,
  SetupEyeBlink,
  SetupBreath,
  LoadUserData,
  WaitLoadUserData,
  SetupEyeBlinkIds,
  SetupLipSyncIds,
  SetupLayout,
  LoadMotion,
  WaitLoadMotion,
  CompleteInitialize,
  CompleteSetupModel,
  LoadTexture,
  WaitLoadTexture,
  CompleteSetup,
}

/**
 * ユーザーが実際に使用するモデルの実装クラス<br>
 * モデル生成、機能コンポーネント生成、更新処理とレンダリングの呼び出しを行う。
 */
export class LAppModel extends CubismUserModel {
  /**
   * model3.jsonが置かれたディレクトリとファイルパスからモデルを生成する
   * @param dir
   * @param fileName
   */
  public loadAssets(dir: string, fileName: string): void {
    this._modelHomeDir = dir;

    fetch(`${this._modelHomeDir}${fileName}`)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        const setting: ICubismModelSetting = new CubismModelSettingJson(
          arrayBuffer,
          arrayBuffer.byteLength
        );

        // ステートを更新
        this._state = LoadStep.LoadModel;

        // 結果を保存
        this.setupModel(setting);
      })
      .catch((error) => {
        // model3.json読み込みでエラーが発生した時点で描画は不可能なので、setupせずエラーをcatchして何もしない
        CubismLogError(`Failed to load file ${this._modelHomeDir}${fileName}`);
      });
  }

  /**
   * model3.jsonからモデルを生成する。
   * model3.jsonの記述に従ってモデル生成、モーション、物理演算などのコンポーネント生成を行う。
   *
   * @param setting ICubismModelSettingのインスタンス
   */
  private setupModel(setting: ICubismModelSetting): void {
    this._updating = true;
    this._initialized = false;

    this._modelSetting = setting;

    // Log hit areas information
    const hitAreasCount = this._modelSetting.getHitAreasCount();
    console.log(`Model has ${hitAreasCount} hit areas`);

    // CubismModel
    if (this._modelSetting.getModelFileName() != "") {
      const modelFileName = this._modelSetting.getModelFileName();

      fetch(`${this._modelHomeDir}${modelFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${modelFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then((arrayBuffer) => {
          this.loadModel(arrayBuffer, this._mocConsistency, LAppDefine.CurrentKScale);
          this._state = LoadStep.LoadExpression;

          // callback
          loadCubismExpression();
        });

      this._state = LoadStep.WaitLoadModel;
    } else {
      LAppPal.printMessage("Model data does not exist.");
    }

    // Expression
    const loadCubismExpression = (): void => {
      if (this._modelSetting.getExpressionCount() > 0) {
        const count: number = this._modelSetting.getExpressionCount();

        for (let i = 0; i < count; i++) {
          const expressionName = this._modelSetting.getExpressionName(i);
          const expressionFileName =
            this._modelSetting.getExpressionFileName(i);

          fetch(`${this._modelHomeDir}${expressionFileName}`)
            .then((response) => {
              if (response.ok) {
                return response.arrayBuffer();
              } else if (response.status >= 400) {
                CubismLogError(
                  `Failed to load file ${this._modelHomeDir}${expressionFileName}`
                );
                // ファイルが存在しなくてもresponseはnullを返却しないため、空のArrayBufferで対応する
                return new ArrayBuffer(0);
              }
            })
            .then((arrayBuffer) => {
              const motion: ACubismMotion = this.loadExpression(
                arrayBuffer,
                arrayBuffer.byteLength,
                expressionName
              );

              if (this._expressions.getValue(expressionName) != null) {
                ACubismMotion.delete(
                  this._expressions.getValue(expressionName)
                );
                this._expressions.setValue(expressionName, null);
              }

              this._expressions.setValue(expressionName, motion);

              this._expressionCount++;

              if (this._expressionCount >= count) {
                this._state = LoadStep.LoadPhysics;

                // callback
                loadCubismPhysics();
              }
            });
        }
        this._state = LoadStep.WaitLoadExpression;
      } else {
        this._state = LoadStep.LoadPhysics;

        // callback
        loadCubismPhysics();
      }
    };

    // Physics
    const loadCubismPhysics = (): void => {
      if (this._modelSetting.getPhysicsFileName() != "") {
        const physicsFileName = this._modelSetting.getPhysicsFileName();

        fetch(`${this._modelHomeDir}${physicsFileName}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${physicsFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then((arrayBuffer) => {
            this.loadPhysics(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.LoadPose;

            // callback
            loadCubismPose();
          });
        this._state = LoadStep.WaitLoadPhysics;
      } else {
        this._state = LoadStep.LoadPose;

        // callback
        loadCubismPose();
      }
    };

    // Pose
    const loadCubismPose = (): void => {
      if (this._modelSetting.getPoseFileName() != "") {
        const poseFileName = this._modelSetting.getPoseFileName();

        fetch(`${this._modelHomeDir}${poseFileName}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${poseFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then((arrayBuffer) => {
            this.loadPose(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlink;

            // callback
            setupEyeBlink();
          });
        this._state = LoadStep.WaitLoadPose;
      } else {
        this._state = LoadStep.SetupEyeBlink;

        // callback
        setupEyeBlink();
      }
    };

    // EyeBlink
    const setupEyeBlink = (): void => {
      if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
        this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
        this._state = LoadStep.SetupBreath;
      }

      // callback
      setupBreath();
    };

    // Breath
    const setupBreath = (): void => {
      this._breath = CubismBreath.create();

      const breathParameters: csmVector<BreathParameterData> = new csmVector();
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5)
      );
      breathParameters.pushBack(
        new BreathParameterData(this._idParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5)
      );

      // Add null check for CubismFramework.getIdManager()
      const idManager = CubismFramework.getIdManager();
      if (idManager) {
        const breathParameterId = idManager.getId(CubismDefaultParameterId.ParamBreath);
        if (breathParameterId) {
          breathParameters.pushBack(
            new BreathParameterData(breathParameterId, 0.5, 0.5, 3.2345, 1)
          );
        }
      }

      this._breath.setParameters(breathParameters);
      this._state = LoadStep.LoadUserData;

      // callback
      loadUserData();
    };

    // UserData
    const loadUserData = (): void => {
      if (this._modelSetting.getUserDataFile() != "") {
        const userDataFile = this._modelSetting.getUserDataFile();

        fetch(`${this._modelHomeDir}${userDataFile}`)
          .then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${userDataFile}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then((arrayBuffer) => {
            this.loadUserData(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlinkIds;

            // callback
            setupEyeBlinkIds();
          });

        this._state = LoadStep.WaitLoadUserData;
      } else {
        this._state = LoadStep.SetupEyeBlinkIds;

        // callback
        setupEyeBlinkIds();
      }
    };

    // EyeBlinkIds
    const setupEyeBlinkIds = (): void => {

      const eyeBlinkIdCount: number =
        this._modelSetting.getEyeBlinkParameterCount();

      for (let i = 0; i < eyeBlinkIdCount; ++i) {
        this._eyeBlinkIds.pushBack(
          this._modelSetting.getEyeBlinkParameterId(i)
        );
      }

      this._state = LoadStep.SetupLipSyncIds;

      // callback
      setupLipSyncIds();
    };

    // LipSyncIds
    const setupLipSyncIds = (): void => {

      const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();

      for (let i = 0; i < lipSyncIdCount; ++i) {
        this._lipSyncIds.pushBack(this._modelSetting.getLipSyncParameterId(i));
      }

      // Fallback if no LipSync IDs are defined in the model setting
      if (this._lipSyncIds.getSize() === 0) {
        console.warn('[Fallback] No LipSync IDs defined in model setting. Attempting fallback to "ParamMouthOpenY".');
        
        const idManager = CubismFramework.getIdManager();
        if (idManager) {
          const fallbackId: CubismIdHandle = idManager.getId(CubismDefaultParameterId.ParamMouthOpenY);

          // Check if the model actually has this parameter before adding it
          if (this._model && fallbackId && this._model.getParameterIndex(fallbackId) !== -1) {
            this._lipSyncIds.pushBack(fallbackId);
            console.log('[Fallback] Successfully added "ParamMouthOpenY" as LipSync ID.');
          } else {
            console.warn('[Fallback] Fallback ID "ParamMouthOpenY" not found in the current model or model not loaded.');
          }
        } else {
          console.warn('[Fallback] Could not access IdManager. LipSync fallback unavailable.');
        }
      }

      this._state = LoadStep.SetupLayout;

      // callback
      setupLayout();
    };

    // Layout
    const setupLayout = (): void => {
      const layout: csmMap<string, number> = new csmMap<string, number>();

      if (this._modelSetting == null || this._modelMatrix == null) {
        CubismLogError("Failed to setupLayout().");
        return;
      }

      this._modelSetting.getLayoutMap(layout);
      this._modelMatrix.setupFromLayout(layout);
      this._state = LoadStep.LoadMotion;

      // callback
      loadCubismMotion();
    };

    // Motion
    const loadCubismMotion = (): void => {
      this._state = LoadStep.WaitLoadMotion;
      this._model.saveParameters();
      this._allMotionCount = 0;
      this._motionCount = 0;
      const group: string[] = [];

      const motionGroupCount: number = this._modelSetting.getMotionGroupCount();

      // モーションの総数を求める
      for (let i = 0; i < motionGroupCount; i++) {
        group[i] = this._modelSetting.getMotionGroupName(i);
        this._allMotionCount += this._modelSetting.getMotionCount(group[i]);
      }

      // Check if there are no actual motions to load, even if groups exist
      if (this._allMotionCount == 0) {
        this._state = LoadStep.LoadTexture;

        // 全てのモーションを停止する
        this._motionManager.stopAllMotions();

        this._updating = false;
        this._initialized = true;

        this.createRenderer();
        this.setupTextures();
        this.getRenderer().startUp(gl);
        return;
      }

      // モーションの読み込み
      for (let i = 0; i < motionGroupCount; i++) {
        this.preLoadMotionGroup(group[i]);
      }

      // モーションがない場合 (Original check, now might be redundant but kept for safety)
      if (motionGroupCount == 0) {
        this._state = LoadStep.LoadTexture;

        // 全てのモーションを停止する
        this._motionManager.stopAllMotions();

        this._updating = false;
        this._initialized = true;

        this.createRenderer();
        this.setupTextures();
        this.getRenderer().startUp(gl);
      }
    };
  }

  /**
   * テクスチャのセットアップ
   */
  private setupTextures(): void {
    console.log('Setting up textures for model:', this._modelHomeDir);

    // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用 (Reverted to likely original)
    const usePremultiply = true;

    if (this._state == LoadStep.LoadTexture) {
      // テクスチャ読み込み用
      const textureCount: number = this._modelSetting.getTextureCount();

      for (
        let modelTextureNumber = 0;
        modelTextureNumber < textureCount;
        modelTextureNumber++
      ) {
        // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
        if (this._modelSetting.getTextureFileName(modelTextureNumber) == "") {
          console.log("getTextureFileName null");
          continue;
        }

        // WebGLのテクスチャユニットにテクスチャをロードする
        let texturePath =
          this._modelSetting.getTextureFileName(modelTextureNumber);
        texturePath = this._modelHomeDir + texturePath;

        // ロード完了時に呼び出すコールバック関数
        const onLoad = (textureInfo: TextureInfo): void => {
          this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);

          this._textureCount++;

          if (this._textureCount >= textureCount) {
            // ロード完了
            this._state = LoadStep.CompleteSetup;
          }
        };

        // 読み込み
        LAppDelegate.getInstance()
          .getTextureManager()
          .createTextureFromPngFile(texturePath, usePremultiply, onLoad);
        this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      }

      this._state = LoadStep.WaitLoadTexture;
    }
  }

  /**
   * レンダラを再構築する
   */
  public reloadRenderer(): void {
    this.deleteRenderer();
    this.createRenderer();
    this.setupTextures();
  }

  /**
   * 更新
   */
  public update(): void {
    if (this._state != LoadStep.CompleteSetup) return;

    const deltaTimeSeconds: number = LAppPal.getDeltaTime();
    this._userTimeSeconds += deltaTimeSeconds;

    this._dragManager.update(deltaTimeSeconds);
    this._dragX = this._dragManager.getX();
    this._dragY = this._dragManager.getY();

    // モーションによるパラメータ更新の有無
    let motionUpdated = false;

    //--------------------------------------------------------------------------
    this._model.loadParameters(); // 前回セーブされた状態をロード
    if (this._motionManager.isFinished()) {
      // モーションの再生がない場合、待機モーションの中からランダムで再生する
      this.startRandomMotion(
        LAppDefine.MotionGroupIdle,
        LAppDefine.PriorityIdle
      );
    } else {
      motionUpdated = this._motionManager.updateMotion(
        this._model,
        deltaTimeSeconds
      ); // モーションを更新
    }
    this._model.saveParameters(); // 状態を保存
    //--------------------------------------------------------------------------

    // まばたき
    if (!motionUpdated) {
      if (this._eyeBlink != null) {
        // メインモーションの更新がないとき
        this._eyeBlink.updateParameters(this._model, deltaTimeSeconds); // 目パチ
      }
    }

    if (this._expressionManager != null) {
      this._expressionManager.updateMotion(this._model, deltaTimeSeconds); // 表情でパラメータ更新（相対変化）
    }

    // ドラッグによる変化
    // ドラッグによる顔の向きの調整
    this._model.addParameterValueById(this._idParamAngleX, this._dragX * 30); // -30から30の値を加える
    this._model.addParameterValueById(this._idParamAngleY, this._dragY * 30);
    this._model.addParameterValueById(
      this._idParamAngleZ,
      this._dragX * this._dragY * -30
    );

    // ドラッグによる体の向きの調整
    this._model.addParameterValueById(
      this._idParamBodyAngleX,
      this._dragX * 10
    ); // -10から10の値を加える

    // ドラッグによる目の向きの調整
    this._model.addParameterValueById(this._idParamEyeBallX, this._dragX); // -1から1の値を加える
    this._model.addParameterValueById(this._idParamEyeBallY, this._dragY);

    // 呼吸など
    if (this._breath != null) {
      this._breath.updateParameters(this._model, deltaTimeSeconds);
    }

    // 物理演算の設定
    if (this._physics != null) {
      this._physics.evaluate(this._model, deltaTimeSeconds);
    }

    // Lip sync settings
    if (this._lipsync) {
      let value = 0.0;
      this._wavFileHandler.update(deltaTimeSeconds);
      value = this._wavFileHandler.getRms();
      // Streamed (chunked PCM) playback bypasses the wav file handler;
      // take whichever source is currently louder.
      value = Math.max(value, getStreamingLipSyncRms());
      value = Math.min(1.0, value * 1.5);

      const lipSyncWeight = 4.0;

      for (let i = 0; i < this._lipSyncIds.getSize(); ++i) {
        this._model.addParameterValueById(
          this._lipSyncIds.at(i),
          value,
          lipSyncWeight
        );
      }
    }

    // ポーズの設定
    if (this._pose != null) {
      this._pose.updateParameters(this._model, deltaTimeSeconds);
    }

    this._model.update();
  }

  /**
   * 引数で指定したモーションの再生を開始する
   * @param group モーショングループ名
   * @param no グループ内の番号
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback
  ): CubismMotionQueueEntryHandle {
    // Add a log specifically when trying to start a tap motion (which uses priority 3)
    if (priority === 3 && LAppDefine.DebugLogEnable) {
      console.log(`[APP] startMotion: Attempting to start tap motion. Group: '${group}', Index: ${no}`);
    }

    if (priority == LAppDefine.PriorityForce) {
      this._motionManager.setReservePriority(priority);
    } else if (!this._motionManager.reserveMotion(priority)) {
      if (this._debugMode) {
        LAppPal.printMessage("[APP]can't start motion.");
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const motionFileName = this._modelSetting.getMotionFileName(group, no);

    // ex) idle_0 or _0 if group is ""
    const name = `${group}_${no}`;
    let motion: CubismMotion = this._motions.getValue(name) as CubismMotion;
    let autoDelete = false;

    if (motion == null) {
      if (LAppDefine.DebugLogEnable) {
        console.log(`[APP] startMotion: Motion '${name}' not found in cache, fetching: ${motionFileName}`);
      }
      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then((arrayBuffer) => {
          motion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            null, // Pass null for name here? Original code did. Let's keep it for now.
            onFinishedMotionHandler
          );

          if (motion == null) {
             if (LAppDefine.DebugLogEnable) {
                console.error(`[APP] startMotion: Failed to load motion from fetched data for '${name}'`);
             }
            return;
          }

          let fadeTime: number = this._modelSetting.getMotionFadeInTimeValue(
            group,
            no
          );

          if (fadeTime >= 0.0) {
            motion.setFadeInTime(fadeTime);
          }

          fadeTime = this._modelSetting.getMotionFadeOutTimeValue(group, no);
          if (fadeTime >= 0.0) {
            motion.setFadeOutTime(fadeTime);
          }

          motion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);
          autoDelete = true; // 終了時にメモリから削除

          // Start the motion *after* it's loaded (moved from outside)
          if (LAppDefine.DebugLogEnable) {
            console.log(`[APP] startMotion: Starting fetched motion '${name}'`);
          }
          this._motionManager.startMotionPriority(
            motion,
            autoDelete,
            priority
          );
        });
      // Return InvalidHandle immediately because the motion starts asynchronously
      // This might be an issue if the caller expects a valid handle right away.
      // Let's reconsider this. Maybe startMotion should return a Promise? For now, keep original logic.
       return InvalidMotionQueueEntryHandleValue; 
    } else {
      if (LAppDefine.DebugLogEnable) {
        console.log(`[APP] startMotion: Motion '${name}' found in cache. Starting.`);
      }
      motion.setFinishedMotionHandler(onFinishedMotionHandler);
      // Start the motion if found in cache
      return this._motionManager.startMotionPriority(
          motion,
          autoDelete, // Should be false for cached motions? Let's assume true based on original code.
          priority
      );
    }

    // Original code had voice logic and startMotionPriority call here, moved inside blocks
  }

  /**
   * ランダムに選ばれたモーションの再生を開始する。
   * @param group モーショングループ名
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startRandomMotion(
    group: string,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startRandomMotion called. Group: '${group}', Priority: ${priority}`);
    }
    if (this._modelSetting.getMotionCount(group) == 0) {
      if (LAppDefine.DebugLogEnable) {
         console.warn(`[APP] startRandomMotion: No motions found in group '${group}'`);
      }
      return InvalidMotionQueueEntryHandleValue;
    }

    const no: number = Math.floor(
      Math.random() * this._modelSetting.getMotionCount(group)
    );

    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startRandomMotion: Selected random index ${no} from group '${group}'`);
    }

    return this.startMotion(group, no, priority, onFinishedMotionHandler);
  }

  /**
   * 引数で指定した表情モーションをセットする
   *
   * @param expressionId 表情モーションのID
   */
  public setExpression(expressionId: string): void {
    const motion: ACubismMotion = this._expressions.getValue(expressionId);

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
    }

    if (motion != null) {
      this._expressionManager.startMotionPriority(
        motion,
        false,
        LAppDefine.PriorityForce
      );
    } else {
      if (this._debugMode) {
        LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
      }
    }
  }

  /**
   * ランダムに選ばれた表情モーションをセットする
   */
  public setRandomExpression(): void {
    if (this._expressions.getSize() == 0) {
      return;
    }

    const no: number = Math.floor(Math.random() * this._expressions.getSize());

    for (let i = 0; i < this._expressions.getSize(); i++) {
      if (i == no) {
        const name: string = this._expressions._keyValues[i].first;
        this.setExpression(name);
        return;
      }
    }
  }

  /**
   * イベントの発火を受け取る
   */
  public motionEventFired(eventValue: csmString): void {
    CubismLogInfo("{0} is fired on LAppModel!!", eventValue.s);
  }

  /**
   * 当たり判定テスト
   * 指定ＩＤの頂点リストから矩形を計算し、座標をが矩形範囲内か判定する。
   *
   * @param hitArenaName  当たり判定をテストする対象のID
   * @param x             判定を行うX座標
   * @param y             判定を行うY座標
   */
  public hitTest(hitArenaName: string, x: number, y: number): boolean {
    // 透明時は当たり判定無し。
    if (this._opacity < 1) {
      return false;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
        const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
        return this.isHit(drawId, x, y);
      }
    }

    return false;
  }

  /**
   * Test if a point hits any part of the model's defined hit areas.
   * @param x X coordinate to test
   * @param y Y coordinate to test
   * @returns The name of the hit area if hit, otherwise null.
   */
  public anyhitTest(x: number, y: number): string | null {
    // If opacity is less than 1, no hit detection
    if (this._opacity < 1) {
      return null;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
      const hit = this.isHit(drawId, x, y);
      if (hit) {
        // Get the CubismIdHandle for the hit area
        const hitAreaIdHandle = this._modelSetting.getHitAreaId(i);
        
        // Attempt to access the string via the internal _id.s structure
        // Accessing private members like this is generally discouraged but necessary if no public API exists
        const idString = (hitAreaIdHandle as any)?._id?.s; // Cast to any to bypass potential type errors

        // Debug log for hit area detection
        if (LAppDefine.DebugLogEnable) {
          console.log(`[APP] anyhitTest: Hit detected. ID Handle:`, hitAreaIdHandle, ` Extracted ID String: ${idString}`);
        }
        // Return the ID string which should match the tapMotions keys
        return idString || null; // Return the extracted string, or null if it failed
      }
    }
    // Debug log if no hit area detected
    if (LAppDefine.DebugLogEnable) {
       // console.log(`[APP] anyhitTest: No specific hit area detected.`);
    }
    return null; // No hit area was hit
  }

  /**
   * Load motions for the model
   * @param group Motion group name
   */
  public preLoadMotionGroup(group: string): void {
    for (let i = 0; i < this._modelSetting.getMotionCount(group); i++) {
      const motionFileName = this._modelSetting.getMotionFileName(group, i);

      // ex) idle_0
      const name = `${group}_${i}`;
      if (this._debugMode) {
        LAppPal.printMessage(
          `[APP]load motion: ${motionFileName} => [${name}]`
        );
      }

      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return null; // Return null instead of empty ArrayBuffer
          }
        })
        .then((arrayBuffer) => {
          // Add null check before loading motion
          if (!arrayBuffer) {
            // If buffer is null, reduce motion count and return
            this._allMotionCount--;
            return;
          }

          const tmpMotion: CubismMotion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            name
          );

          if (tmpMotion != null) {
            let fadeTime = this._modelSetting.getMotionFadeInTimeValue(
              group,
              i
            );
            if (fadeTime >= 0.0) {
              tmpMotion.setFadeInTime(fadeTime);
            }

            fadeTime = this._modelSetting.getMotionFadeOutTimeValue(group, i);
            if (fadeTime >= 0.0) {
              tmpMotion.setFadeOutTime(fadeTime);
            }
            tmpMotion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);

            if (this._motions.getValue(name) != null) {
              ACubismMotion.delete(this._motions.getValue(name));
            }

            this._motions.setValue(name, tmpMotion);

            this._motionCount++;
            if (this._motionCount >= this._allMotionCount) {
              this._state = LoadStep.LoadTexture;

              // 全てのモーションを停止する
              this._motionManager.stopAllMotions();

              this._updating = false;
              this._initialized = true;

              this.createRenderer();
              this.setupTextures();
              this.getRenderer().startUp(gl);
            }
          } else {
            // loadMotionできなかった場合はモーションの総数がずれるので1つ減らす
            this._allMotionCount--;
          }
        })
        .catch((error) => {
          // Add error handling
          CubismLogError(`Failed to load motion: ${error}`);
          this._allMotionCount--;
        });
    }
  }

  /**
   * すべてのモーションデータを解放する。
   */
  public releaseMotions(): void {
    this._motions.clear();
  }

  /**
   * 全ての表情データを解放する。
   */
  public releaseExpressions(): void {
    this._expressions.clear();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public doDraw(): void {
    if (this._model == null) return;

    // キャンバスサイズを渡す
    const viewport: number[] = [0, 0, canvas.width, canvas.height];

    this.getRenderer().setRenderState(frameBuffer, viewport);
    this.getRenderer().drawModel();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public draw(matrix: CubismMatrix44): void {
    if (this._model == null) {
      return;
    }

    // 各読み込み終了後
    if (this._state == LoadStep.CompleteSetup) {
      matrix.multiplyByMatrix(this._modelMatrix);

      this.getRenderer().setMvpMatrix(matrix);

      this.doDraw();
    }
  }

  public async hasMocConsistencyFromFile() {
    CSM_ASSERT(this._modelSetting.getModelFileName().localeCompare(``));

    // CubismModel
    if (this._modelSetting.getModelFileName() != "") {
      const modelFileName = this._modelSetting.getModelFileName();

      const response = await fetch(`${this._modelHomeDir}${modelFileName}`);
      const arrayBuffer = await response.arrayBuffer();

      this._consistency = CubismMoc.hasMocConsistency(arrayBuffer);

      if (!this._consistency) {
        CubismLogInfo("Inconsistent MOC3.");
      } else {
        CubismLogInfo("Consistent MOC3.");
      }

      return this._consistency;
    } else {
      LAppPal.printMessage("Model data does not exist.");
    }
  }

  /**
   * Test if a point hits the model's rendered area
   * This is a fallback method when no hit areas are defined
   * @param x X coordinate to test
   * @param y Y coordinate to test
   */
  public isHitOnModel(x: number, y: number): boolean {
    // Skip if model is transparent
    if (this._opacity < 1) {
      return false;
    }

    // Get drawable count
    const drawableCount = this._model.getDrawableCount();
    
    // Get model matrix
    const matrix = this._modelMatrix.getArray();
    
    // Calculate determinant
    const det = 
      matrix[0] * matrix[5] - 
      matrix[1] * matrix[4];
    
    if (Math.abs(det) < 0.0001) {
      return false; // Matrix is not invertible
    }

    // Calculate inverse matrix elements
    const invDet = 1.0 / det;
    const invMatrix = {
      a: matrix[5] * invDet,
      b: -matrix[1] * invDet,
      c: -matrix[4] * invDet,
      d: matrix[0] * invDet,
      tx: (matrix[4] * matrix[13] - matrix[5] * matrix[12]) * invDet,
      ty: (matrix[1] * matrix[12] - matrix[0] * matrix[13]) * invDet
    };
    
    // Transform point
    const transformedPoint = {
      x: x * invMatrix.a + y * invMatrix.c + invMatrix.tx,
      y: x * invMatrix.b + y * invMatrix.d + invMatrix.ty
    };

    // Check each drawable area
    for (let i = 0; i < drawableCount; i++) {
      // Skip if drawable is not visible
      if (!this._model.getDrawableDynamicFlagIsVisible(i)) {
        continue;
      }

      // Get drawable vertex positions
      const vertices = this._model.getDrawableVertices(i);
      
      // Calculate bounds
      let minX = vertices[0];
      let minY = vertices[1];
      let maxX = vertices[0];
      let maxY = vertices[1];

      for (let j = 2; j < vertices.length; j += 2) {
        const vx = vertices[j];
        const vy = vertices[j + 1];
        minX = Math.min(minX, vx);
        minY = Math.min(minY, vy);
        maxX = Math.max(maxX, vx);
        maxY = Math.max(maxY, vy);
      }

      // Check if point is inside bounds
      if (
        transformedPoint.x >= minX &&
        transformedPoint.x <= maxX &&
        transformedPoint.y >= minY &&
        transformedPoint.y <= maxY
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Performs a hit test with fallback if the first one fails.
   * 
   * @param x - X coordinate to test
   * @param y - Y coordinate to test
   * @returns boolean indicating if any hit was detected
   */
  public anyHitTestWithFallback(x: number, y: number): boolean {
    // First check named hit areas
    const hitAreaName = this.anyhitTest(x, y);
    
    // If a hit area was found, return true, otherwise fall back to general hit test
    return hitAreaName !== null || this.isHitOnModel(x, y);
  }

  /**
   * Starts a tap motion based on the hit area and configuration.
   * @param hitAreaName The name of the hit area that was tapped, or null if no specific area was hit
   * @param tapMotionsConfig The tap motion configuration from modelInfo
   */
  public startTapMotion(hitAreaName: string | null, tapMotionsConfig: any): void {
    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startTapMotion called. Hit area: ${hitAreaName}`);
    }

    if (!tapMotionsConfig || Object.keys(tapMotionsConfig).length === 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log('[APP] No tap motions configured.');
      }
      return;
    }

    let motionsToConsider: { [key: string]: number } = {};
    let areaSpecificHit = false;

    // 1. Check if a specific, configured hit area was tapped
    if (hitAreaName && tapMotionsConfig[hitAreaName]) {
      motionsToConsider = tapMotionsConfig[hitAreaName];
      areaSpecificHit = true;
      if (LAppDefine.DebugLogEnable) {
        console.log(`[APP] startTapMotion: Using motions for specific area: ${hitAreaName}`, motionsToConsider);
      }
    }

    // 2. If no specific area hit OR the hit area has no config, combine all motions with weight summation
    if (!areaSpecificHit) {
      motionsToConsider = {};
      Object.values(tapMotionsConfig).forEach((areaMotions: any) => {
        for (const [motionName, weight] of Object.entries(areaMotions)) {
          if (motionsToConsider[motionName]) {
            motionsToConsider[motionName] += Number(weight);
          } else {
            motionsToConsider[motionName] = Number(weight);
          }
        }
      });
      if (LAppDefine.DebugLogEnable) {
        console.log('[APP] startTapMotion: Using combined motions:', motionsToConsider);
      }
    }

    // 3. Check if there are any motions to play
    if (Object.keys(motionsToConsider).length === 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log('[APP] startTapMotion: No motions found to consider.');
      }
      return;
    }

    // 4. Weighted random selection
    const motionGroups = Object.keys(motionsToConsider);
    const weights = Object.values(motionsToConsider).map(Number);
    const totalWeight = weights.reduce((sum, w) => sum + (isNaN(w) ? 0 : w), 0);

    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startTapMotion: Motion groups: ${motionGroups}, Weights: ${weights}, Total weight: ${totalWeight}`);
    }

    if (totalWeight <= 0) {
      if (LAppDefine.DebugLogEnable) {
        console.log('[APP] startTapMotion: Total weight is zero or invalid.');
      }
      return;
    }

    let random = Math.random() * totalWeight;
    let selectedGroupName: string | null = null;

    for (let i = 0; i < motionGroups.length; i++) {
      const weight = isNaN(weights[i]) ? 0 : weights[i];
      if (random < weight) {
        selectedGroupName = motionGroups[i];
        break;
      }
      random -= weight;
    }

    if (LAppDefine.DebugLogEnable) {
      console.log(`[APP] startTapMotion: Selected group: ${selectedGroupName}`);
    }

    // 5. Play the selected motion group
    if (selectedGroupName !== null) {
      // Use PriorityForce (3) to ensure the motion plays
      this.startRandomMotion(selectedGroupName, 3);
    } else {
      if (LAppDefine.DebugLogEnable) {
        console.log('[APP] startTapMotion: Could not select a motion group.');
      }
    }
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super();

    this._modelSetting = null;
    this._modelHomeDir = null;
    this._userTimeSeconds = 0.0;

    this._eyeBlinkIds = new csmVector<CubismIdHandle>();
    this._lipSyncIds = new csmVector<CubismIdHandle>();

    this._motions = new csmMap<string, ACubismMotion>();
    this._expressions = new csmMap<string, ACubismMotion>();

    this._hitArea = new csmVector<csmRect>();
    this._userArea = new csmVector<csmRect>();

    const idManager = CubismFramework.getIdManager();
    
    if (idManager) {
      this._idParamAngleX = idManager.getId(
        CubismDefaultParameterId.ParamAngleX
      );
      this._idParamAngleY = idManager.getId(
        CubismDefaultParameterId.ParamAngleY
      );
      this._idParamAngleZ = idManager.getId(
        CubismDefaultParameterId.ParamAngleZ
      );
      this._idParamEyeBallX = idManager.getId(
        CubismDefaultParameterId.ParamEyeBallX
      );
      this._idParamEyeBallY = idManager.getId(
        CubismDefaultParameterId.ParamEyeBallY
      );
      this._idParamBodyAngleX = idManager.getId(
        CubismDefaultParameterId.ParamBodyAngleX
      );
    } else {
      // Initialize handles with null to avoid undefined errors
      this._idParamAngleX = null;
      this._idParamAngleY = null;
      this._idParamAngleZ = null;
      this._idParamEyeBallX = null;
      this._idParamEyeBallY = null;
      this._idParamBodyAngleX = null;
    }

    if (LAppDefine.MOCConsistencyValidationEnable) {
      this._mocConsistency = true;
    }

    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._wavFileHandler = new LAppWavFileHandler();
    this._consistency = false;
  }

  _modelSetting: ICubismModelSetting; // モデルセッティング情報
  _modelHomeDir: string; // モデルセッティングが置かれたディレクトリ
  _userTimeSeconds: number; // デルタ時間の積算値[秒]

  _eyeBlinkIds: csmVector<CubismIdHandle>; // モデルに設定された瞬き機能用パラメータID
  _lipSyncIds: csmVector<CubismIdHandle>; // モデルに設定されたリップシンク機能用パラメータID

  _motions: csmMap<string, ACubismMotion>; // 読み込まれているモーションのリスト
  _expressions: csmMap<string, ACubismMotion>; // 読み込まれている表情のリスト

  _hitArea: csmVector<csmRect>;
  _userArea: csmVector<csmRect>;

  _idParamAngleX: CubismIdHandle; // パラメータID: ParamAngleX
  _idParamAngleY: CubismIdHandle; // パラメータID: ParamAngleY
  _idParamAngleZ: CubismIdHandle; // パラメータID: ParamAngleZ
  _idParamEyeBallX: CubismIdHandle; // パラメータID: ParamEyeBallX
  _idParamEyeBallY: CubismIdHandle; // パラメータID: ParamEyeBAllY
  _idParamBodyAngleX: CubismIdHandle; // パラメータID: ParamBodyAngleX

  _state: LoadStep; // 現在のステータス管理用
  _expressionCount: number; // 表情データカウント
  _textureCount: number; // テクスチャカウント
  _motionCount: number; // モーションデータカウント
  _allMotionCount: number; // モーション総数
  _wavFileHandler: LAppWavFileHandler; //wavファイルハンドラ
  _consistency: boolean; // MOC3一貫性チェック管理用
}
