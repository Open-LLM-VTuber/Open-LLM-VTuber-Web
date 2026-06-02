import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { useConfig } from '@/context/character-config-context';
import { wsService } from '@/services/websocket-service';

export interface FormData {
  conf_name: string;
  conf_uid: string;
  character_name: string;
  human_name: string;
  avatar: string;
  live2d_model_name: string;
  persona_prompt: string;
}

const emptyFormData: FormData = {
  conf_name: '',
  conf_uid: '',
  character_name: '',
  human_name: 'Human',
  avatar: '',
  live2d_model_name: '',
  persona_prompt: '',
};

export function useCharacterManager() {
  const { sendMessage } = useWebSocket();
  const { configFiles } = useConfig();
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [systemPromptPreview, setSystemPromptPreview] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const subscription = wsService.onMessage((message: any) => {
      switch (message.type) {
        case 'character-config-detail':
          if (message.config?.character_config) {
            const cc = message.config.character_config;
            setFormData({
              conf_name: cc.conf_name || '',
              conf_uid: cc.conf_uid || '',
              character_name: cc.character_name || '',
              human_name: cc.human_name || 'Human',
              avatar: cc.avatar || '',
              live2d_model_name: cc.live2d_model_name || '',
              persona_prompt: cc.persona_prompt || '',
            });
          }
          break;
        case 'system-prompt-preview':
          setSystemPromptPreview(message.system_prompt || '');
          break;
        case 'character-config-created':
        case 'character-config-updated':
        case 'character-config-deleted':
          break;
        default:
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadConfigForEdit = useCallback((filename: string) => {
    setEditingFile(filename);
    setIsLoading(true);
    sendMessage({
      type: 'fetch-character-config-detail',
      file: filename,
    });
    setIsLoading(false);
  }, [sendMessage]);

  const resetForm = useCallback(() => {
    setFormData(emptyFormData);
    setEditingFile(null);
    setSystemPromptPreview('');
    setShowPreview(false);
  }, []);

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveCharacter = useCallback(() => {
    if (!formData.conf_name || !formData.conf_uid || !formData.persona_prompt) {
      return;
    }

    const config = {
      character_config: {
        conf_name: formData.conf_name,
        conf_uid: formData.conf_uid,
        persona_prompt: formData.persona_prompt,
        character_name: formData.character_name || formData.conf_name,
        human_name: formData.human_name || 'Human',
        avatar: formData.avatar || '',
        live2d_model_name: formData.live2d_model_name || '',
      },
    };

    const filename = editingFile || `${formData.conf_uid}.yaml`;

    if (editingFile) {
      sendMessage({
        type: 'update-character-config',
        filename,
        config,
      });
    } else {
      sendMessage({
        type: 'create-character-config',
        filename,
        config,
      });
    }

    resetForm();
  }, [formData, editingFile, sendMessage, resetForm]);

  const deleteCharacter = useCallback((filename: string) => {
    sendMessage({
      type: 'delete-character-config',
      file: filename,
    });
  }, [sendMessage]);

  const previewSystemPrompt = useCallback(() => {
    if (!formData.persona_prompt) {
      setSystemPromptPreview('(Persona prompt is empty)');
      setShowPreview(true);
      return;
    }

    const config = {
      character_config: {
        persona_prompt: formData.persona_prompt,
        live2d_model_name: formData.live2d_model_name || '',
      },
    };

    sendMessage({
      type: 'preview-system-prompt',
      config,
    });
    setShowPreview(true);
  }, [formData, sendMessage]);

  return {
    configFiles,
    editingFile,
    formData,
    isLoading,
    systemPromptPreview,
    showPreview,
    loadConfigForEdit,
    resetForm,
    updateField,
    saveCharacter,
    deleteCharacter,
    previewSystemPrompt,
    setShowPreview,
  };
}