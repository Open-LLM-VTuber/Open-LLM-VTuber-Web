import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { inflate } from 'pako';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/context/websocket-context';

interface ModelInfo {
  name: string;
  description?: string;
  url?: string;
}

export interface CardPreview {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  exampleMessages: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  personaPrompt: string;
}

interface UseImportCardResult {
  modelOptions: ModelInfo[];
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  modelLoading: boolean;
  parsing: boolean;
  saving: boolean;
  cardPreview: CardPreview | null;
  cardError: string | null;
  fileName: string;
  sourceType: 'png' | 'json' | null;
  canSaveAvatar: boolean;
  saveAvatar: boolean;
  setSaveAvatar: (value: boolean) => void;
  avatarPreviewUrl: string | null;
  handleFile: (file: File | null) => Promise<void>;
  createCharacter: () => Promise<boolean>;
  reset: () => void;
}

const DEFAULT_MODEL = 'mao_pro';
const JSON_KEYWORDS = [
  'chara',
  'json',
  'ai_card',
  'card',
  'character',
  'chara_card_v2',
];

const textDecoder = new TextDecoder('utf-8');

const sanitizeName = (value: string | undefined | null, fallback = 'character') => {
  if (!value) return fallback;
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return sanitized || fallback;
};

const toStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringValue(item).trim())
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
};

const normalizeExampleMessages = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringValue(item).trim())
      .filter(Boolean);
  }

  const asString = toStringValue(value).trim();
  if (!asString) return [];

  const segments = asString
    .split(/\r?\n\s*\r?\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [asString];
};

const tryParseJsonString = (candidate: string): unknown | null => {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // ignore direct parse failure
  }

  try {
    const decoded = atob(trimmed);
    try {
      return JSON.parse(decoded);
    } catch {
      const binary = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      try {
        const inflated = inflate(binary, { to: 'string' });
        if (inflated) {
          return JSON.parse(inflated);
        }
      } catch {
        // ignore inflate failure
      }
    }
  } catch {
    // not base64 encoded, ignore
  }

  return null;
};

const extractTextChunk = (
  chunkType: string,
  chunkData: Uint8Array,
): Array<{ keyword: string; text: string }> => {
  if (chunkType === 'tEXt') {
    const nullIndex = chunkData.indexOf(0);
    if (nullIndex === -1) return [];
    const keyword = textDecoder.decode(chunkData.slice(0, nullIndex));
    const text = textDecoder.decode(chunkData.slice(nullIndex + 1));
    return [{ keyword, text }];
  }

  if (chunkType === 'zTXt') {
    const nullIndex = chunkData.indexOf(0);
    if (nullIndex === -1 || nullIndex + 2 > chunkData.length) return [];
    const keyword = textDecoder.decode(chunkData.slice(0, nullIndex));
    const compressionMethod = chunkData[nullIndex + 1];
    if (compressionMethod !== 0) return [];
    const compressed = chunkData.slice(nullIndex + 2);
    const text = textDecoder.decode(inflate(compressed));
    return [{ keyword, text }];
  }

  if (chunkType === 'iTXt') {
    let offset = 0;

    const keywordEnd = chunkData.indexOf(0, offset);
    if (keywordEnd === -1) return [];
    const keyword = textDecoder.decode(chunkData.slice(0, keywordEnd));
    offset = keywordEnd + 1;

    const compressionFlag = chunkData[offset];
    const compressionMethod = chunkData[offset + 1];
    offset += 2;

    const languageEnd = chunkData.indexOf(0, offset);
    if (languageEnd === -1) return [];
    offset = languageEnd + 1;

    const translatedEnd = chunkData.indexOf(0, offset);
    if (translatedEnd === -1) return [];
    offset = translatedEnd + 1;

    const textBytes = chunkData.slice(offset);
    let text: string;
    if (compressionFlag === 1) {
      if (compressionMethod !== 0) return [];
      text = textDecoder.decode(inflate(textBytes));
    } else {
      text = textDecoder.decode(textBytes);
    }
    return [{ keyword, text }];
  }

  return [];
};

const extractJsonFromPng = async (file: File): Promise<unknown> => {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (!signature.every((byte, index) => data[index] === byte)) {
    throw new Error('Invalid PNG file');
  }

  const candidates: string[] = [];
  let offset = 8;

  while (offset + 8 <= data.length) {
    const length = (
      (data[offset] << 24)
      | (data[offset + 1] << 16)
      | (data[offset + 2] << 8)
      | data[offset + 3]
    ) >>> 0;
    offset += 4;

    if (offset + 4 > data.length) break;
    const chunkType = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3],
    );
    offset += 4;

    if (offset + length > data.length) break;
    const chunkData = data.slice(offset, offset + length);
    offset += length;

    // Skip CRC
    offset += 4;

    if (['tEXt', 'zTXt', 'iTXt'].includes(chunkType)) {
      const entries = extractTextChunk(chunkType, chunkData);
      entries.forEach(({ keyword, text }) => {
        const lowerKey = keyword.toLowerCase();
        if (
          JSON_KEYWORDS.includes(lowerKey)
          || text.trim().startsWith('{')
        ) {
          candidates.push(text);
        }
      });
    }
  }

  for (const candidate of candidates) {
    const parsed = tryParseJsonString(candidate);
    if (parsed) return parsed;
  }

  throw new Error('No embedded character JSON found in PNG');
};

const extractJsonFromJsonFile = async (file: File): Promise<unknown> => {
  const text = await file.text();
  const parsed = tryParseJsonString(text);
  if (!parsed) {
    throw new Error('Invalid character card JSON file');
  }
  return parsed;
};

const normalizeCard = (raw: any, fallbackName: string): CardPreview => {
  const dataSection = raw?.data ?? raw?.chara ?? raw?.char ?? raw ?? {};

  const name = toStringValue(dataSection.name).trim() || fallbackName;
  const description = toStringValue(
    dataSection.description ?? dataSection.desc ?? dataSection.short_description,
  ).trim();
  const personality = toStringValue(
    dataSection.personality ?? dataSection.character ?? dataSection.traits,
  ).trim();
  const scenario = toStringValue(
    dataSection.scenario ?? dataSection.setting ?? dataSection.world,
  ).trim();
  const systemPrompt = toStringValue(
    dataSection.system_prompt ?? dataSection.system ?? dataSection.prompt ?? dataSection.systemPrompt,
  ).trim();
  const postHistoryInstructions = toStringValue(
    dataSection.post_history_instructions ?? dataSection.post_history ?? dataSection.extra_instructions,
  ).trim();
  const firstMessage = toStringValue(
    dataSection.first_mes
      ?? dataSection.first_message
      ?? dataSection.greeting
      ?? dataSection.firstMessage
      ?? dataSection.opening_message,
  ).trim();
  const exampleMessages = normalizeExampleMessages(
    dataSection.mes_example
      ?? dataSection.example_messages
      ?? dataSection.mesExamples
      ?? dataSection.example_dialogue
      ?? dataSection.conversation_examples,
  );

  let personaPrompt = '';
  if (systemPrompt) {
    personaPrompt = systemPrompt;
    if (postHistoryInstructions) {
      personaPrompt = `${personaPrompt}\n\n${postHistoryInstructions}`;
    }
  } else {
    const parts = [description, personality, scenario]
      .map((part) => part.trim())
      .filter(Boolean);
    personaPrompt = parts.join('\n\n');
  }

  personaPrompt = personaPrompt.trim();

  return {
    name,
    description,
    personality,
    scenario,
    firstMessage,
    exampleMessages,
    systemPrompt,
    postHistoryInstructions,
    personaPrompt,
  };
};

export const useImportCard = (): UseImportCardResult => {
  const { t } = useTranslation();
  const { baseUrl, sendMessage } = useWebSocket();

  const [modelOptions, setModelOptions] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [parsing, setParsing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [cardPreview, setCardPreview] = useState<CardPreview | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [sourceType, setSourceType] = useState<'png' | 'json' | null>(null);
  const [saveAvatar, setSaveAvatar] = useState<boolean>(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const avatarPreviewRef = useRef<string | null>(null);

  const canSaveAvatar = useMemo(
    () => sourceType === 'png' && !!cardPreview,
    [sourceType, cardPreview],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchModels = async () => {
      setModelLoading(true);
      try {
        const response = await fetch(`${baseUrl}/api/live2d/models`);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (cancelled) return;

        const models: ModelInfo[] = Array.isArray(data.models) ? data.models : [];
        setModelOptions(models);
        if (models.length > 0) {
          const hasDefault = models.some((model: ModelInfo) => model.name === DEFAULT_MODEL);
          setSelectedModel(hasDefault ? DEFAULT_MODEL : models[0].name);
        }
      } catch (error) {
        if (!cancelled) {
          toaster.create({
            title: t('settings.live2d.import.toastModelError'),
            description: error instanceof Error ? error.message : String(error),
            type: 'error',
            duration: 4000,
          });
          setModelOptions([]);
        }
      } finally {
        if (!cancelled) {
          setModelLoading(false);
        }
      }
    };

    fetchModels();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, t]);

  const resetAvatarPreview = useCallback(() => {
    if (avatarPreviewRef.current) {
      URL.revokeObjectURL(avatarPreviewRef.current);
      avatarPreviewRef.current = null;
    }
    setAvatarPreviewUrl(null);
  }, []);

  const reset = useCallback(() => {
    setCardPreview(null);
    setCardError(null);
    setFileName('');
    setSourceType(null);
    setSaveAvatar(false);
    setAvatarFile(null);
    resetAvatarPreview();
  }, [resetAvatarPreview]);

  useEffect(() => () => {
    resetAvatarPreview();
  }, [resetAvatarPreview]);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) {
      reset();
      return;
    }

    setParsing(true);
    setCardError(null);

    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      let rawJson: unknown;
      if (extension === 'png') {
        rawJson = await extractJsonFromPng(file);
        setSourceType('png');
        setAvatarFile(file);

        resetAvatarPreview();
        const previewUrl = URL.createObjectURL(file);
        avatarPreviewRef.current = previewUrl;
        setAvatarPreviewUrl(previewUrl);
      } else if (extension === 'json') {
        rawJson = await extractJsonFromJsonFile(file);
        setSourceType('json');
        setAvatarFile(null);
        setSaveAvatar(false);
        resetAvatarPreview();
      } else {
        throw new Error('Unsupported file type. Please choose a .png or .json card.');
      }

      const preview = normalizeCard(rawJson, file.name.replace(/\.[^.]+$/, ''));
      if (!preview.personaPrompt) {
        throw new Error(t('settings.live2d.import.toastPersonaPromptError'));
      }

      setCardPreview(preview);
      setFileName(file.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCardPreview(null);
      setCardError(message);
      setSaveAvatar(false);
      setAvatarFile(null);
      resetAvatarPreview();

      toaster.create({
        title: t('settings.live2d.import.toastParseError'),
        description: message,
        type: 'error',
        duration: 4000,
      });
    } finally {
      setParsing(false);
    }
  }, [reset, resetAvatarPreview, t]);

  const createCharacter = useCallback(async () => {
    if (!cardPreview) return false;
    if (!selectedModel) {
      toaster.create({
        title: t('settings.live2d.import.toastModelError'),
        type: 'error',
        duration: 3000,
      });
      return false;
    }
    if (!cardPreview.personaPrompt.trim()) {
      toaster.create({
        title: t('settings.live2d.import.toastPersonaPromptError'),
        type: 'error',
        duration: 3000,
      });
      return false;
    }

    setSaving(true);
    try {
      let avatarFilename = '';
      const shouldSaveAvatar = saveAvatar && sourceType === 'png' && avatarFile;
      if (shouldSaveAvatar) {
        const baseName = sanitizeName(cardPreview.name);
        const formData = new FormData();
        formData.append('file', avatarFile, `${baseName}.png`);
        formData.append('base_name', baseName);

        const uploadResponse = await fetch(`${baseUrl}/api/avatars/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadResponse.ok) {
          const errorBody = await uploadResponse.json().catch(() => ({}));
          throw new Error(
            errorBody.detail
            ?? `${uploadResponse.status} ${uploadResponse.statusText}`,
          );
        }
        const uploadJson = await uploadResponse.json();
        avatarFilename = uploadJson.filename ?? '';
      }

      const characterName = cardPreview.name.trim()
        || sanitizeName(fileName.replace(/\.[^.]+$/, ''));

      const payload = {
        character_name: characterName,
        persona_prompt: cardPreview.personaPrompt,
        live2d_model_name: selectedModel,
        avatar: avatarFilename,
        human_name: 'Human',
      };

      const response = await fetch(`${baseUrl}/api/characters/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.detail
          ?? `${response.status} ${response.statusText}`,
        );
      }

      toaster.create({
        title: t('settings.live2d.import.toastSuccess', { name: characterName }),
        type: 'success',
        duration: 3000,
      });

      sendMessage({ type: 'fetch-configs' });
      return true;
    } catch (error) {
      toaster.create({
        title: t('settings.live2d.import.toastCreateError'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        duration: 4000,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    avatarFile,
    baseUrl,
    cardPreview,
    fileName,
    saveAvatar,
    selectedModel,
    sendMessage,
    t,
  ]);

  return {
    modelOptions,
    selectedModel,
    setSelectedModel,
    modelLoading,
    parsing,
    saving,
    cardPreview,
    cardError,
    fileName,
    sourceType,
    canSaveAvatar,
    saveAvatar: canSaveAvatar ? saveAvatar : false,
    setSaveAvatar: (value: boolean) => setSaveAvatar(canSaveAvatar ? value : false),
    avatarPreviewUrl,
    handleFile,
    createCharacter,
    reset,
  };
};

export default useImportCard;
