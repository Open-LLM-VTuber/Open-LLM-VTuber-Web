import {
  Box,
  Button,
  CloseButton,
  Flex,
  Image,
  Input,
  Select,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useImportCard from '@/hooks/sidebar/setting/use-import-card';

interface ImportCardDialogProps {
  open: boolean;
  onClose: () => void;
}

interface InfoSectionProps {
  label: string;
  value?: string | string[];
  placeholder?: string;
}

function InfoSection({ label, value, placeholder }: InfoSectionProps) {
  console.debug('[ImportCardDialog] Rendering section:', label, value);

  const normalizeItem = (item: unknown, path: string): string => {
    if (item === null || item === undefined) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
    if (Array.isArray(item)) {
      console.debug('[ImportCardDialog] Normalizing array for', path, item);
      return item.map((subItem, index) => normalizeItem(subItem, `${path}[${index}]`)).join('\n');
    }
    console.debug('[ImportCardDialog] Normalizing object for', path, item);
    try {
      return JSON.stringify(item, null, 2);
    } catch (error) {
      console.warn('[ImportCardDialog] Failed to stringify value for InfoSection:', path, item, error);
      return String(item);
    }
  };

  const normalizedValue = Array.isArray(value)
    ? value.map((item, index) => normalizeItem(item, `${label}[${index}]`)).filter((item) => item !== '')
    : normalizeItem(value, label);

  const hasContent = Array.isArray(normalizedValue)
    ? normalizedValue.length > 0
    : Boolean(normalizedValue && normalizedValue.trim());

  if (!hasContent && !placeholder) return null;

  return (
    <Box>
      <Text
        fontSize="xs"
        fontWeight="semibold"
        textTransform="uppercase"
        letterSpacing="0.08em"
        color="whiteAlpha.600"
      >
        {label}
      </Text>
      {Array.isArray(normalizedValue) ? (
        normalizedValue.length > 0 ? (
          <Stack mt={2} spacing={2}>
            {normalizedValue.map((item, index) => (
              <Box
                key={`${label}-${index.toString()}`}
                borderWidth="1px"
                borderRadius="md"
                borderColor="whiteAlpha.200"
                px={3}
                py={2}
                bg="whiteAlpha.50"
              >
                <Text whiteSpace="pre-wrap" fontSize="sm">
                  {item}
                </Text>
              </Box>
            ))}
          </Stack>
        ) : (
          placeholder && (
            <Text mt={1} fontSize="sm" color="whiteAlpha.500">
              {placeholder}
            </Text>
          )
        )
      ) : hasContent ? (
        <Text mt={1} fontSize="sm" whiteSpace="pre-wrap">
          {normalizedValue}
        </Text>
      ) : (
        placeholder && (
          <Text mt={1} fontSize="sm" color="whiteAlpha.500">
            {placeholder}
          </Text>
        )
      )}
    </Box>
  );
}

export function ImportCardDialog({ open, onClose }: ImportCardDialogProps) {
  console.log('[ImportCardDialog] rendering', { open });
  const {
    modelOptions,
    selectedModel,
    setSelectedModel,
    modelLoading,
    parsing,
    saving,
    cardPreview,
    cardError,
    fileName,
    canSaveAvatar,
    saveAvatar,
    setSaveAvatar,
    avatarPreviewUrl,
    handleFile,
    createCharacter,
    reset,
  } = useImportCard();
  const { t } = useTranslation();

  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    console.log('[ImportCardDialog] effect: open changed', open);
    if (!open) {
      reset();
      setFileKey((prev) => prev + 1);
    }
  }, [open, reset]);

  const isCreateDisabled = useMemo(
    () => !cardPreview || !selectedModel || parsing || saving,
    [cardPreview, parsing, saving, selectedModel],
  );

  const handleDialogClose = () => {
    reset();
    setFileKey((prev) => prev + 1);
    onClose();
  };

  const handleCreate = async () => {
    const success = await createCharacter();
    if (success) {
      handleDialogClose();
    }
  };

  const descriptionBlock = useMemo(() => {
    if (!cardPreview) return '';
    const parts = [cardPreview.description, cardPreview.personality]
      .map((part) => (part ? part.trim() : ''))
      .filter(Boolean);
    return parts.join('\n\n');
  }, [cardPreview]);

  if (!open) {
    console.log('[ImportCardDialog] not open -> null');
    return null;
  }

  console.log('[ImportCardDialog] ready to render dialog (debug placeholder)', {
    cardPreview,
    cardError,
    modelOptionsLength: modelOptions.length,
    parsing,
    saving,
    fileName,
    avatarPreviewUrl,
  });

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex="modal"
      bg="blackAlpha.600"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Box
        bg="gray.900"
        color="white"
        borderRadius="lg"
        borderWidth="1px"
        borderColor="whiteAlpha.200"
        p={6}
        maxW="520px"
        width="100%"
      >
        <Stack spacing={4}>
          <Flex align="center" justify="space-between">
            <Text fontSize="lg" fontWeight="bold">
              {t('settings.live2d.import.title')}
            </Text>
            <CloseButton onClick={handleDialogClose} />
          </Flex>

          <Text fontSize="sm" color="whiteAlpha.700">
            {t('settings.live2d.import.description')}
          </Text>

          <Stack spacing={3}>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                {t('settings.live2d.import.fileLabel')}
              </Text>
              <Input
                key={fileKey}
                type="file"
                accept=".png,.json"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  await handleFile(file);
                  event.target.value = '';
                }}
                bg="gray.800"
                borderColor="whiteAlpha.300"
              />
              {fileName && (
                <Text mt={2} fontSize="sm" color="whiteAlpha.600">
                  {t('settings.live2d.import.fileName', { name: fileName })}
                </Text>
              )}
              {parsing && (
                <Flex mt={2} align="center" gap={2} color="whiteAlpha.700">
                  <Spinner size="sm" />
                  <Text fontSize="sm">
                    {t('settings.live2d.import.parsing')}
                  </Text>
                </Flex>
              )}
              {cardError && !parsing && (
                <Text mt={2} fontSize="sm" color="red.300">
                  {cardError}
                </Text>
              )}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                {t('settings.live2d.import.model')}
              </Text>
              {modelLoading ? (
                <Flex align="center" gap={2} color="whiteAlpha.700">
                  <Spinner size="sm" />
                  <Text fontSize="sm">
                    {t('settings.live2d.import.loadingModels')}
                  </Text>
                </Flex>
              ) : (
                <Stack spacing={2}>
                  {modelOptions.map((model) => {
                    const isSelected = model.name === selectedModel;
                    return (
                      <Button
                        key={model.name}
                        size="sm"
                        variant={isSelected ? 'solid' : 'outline'}
                        colorPalette={isSelected ? 'blue' : 'gray'}
                        onClick={() => setSelectedModel(model.name)}
                        justifyContent="flex-start"
                      >
                        {model.name}
                      </Button>
                    );
                  })}
                  {modelOptions.length === 0 && (
                    <Text fontSize="sm" color="red.300">
                      {t('settings.live2d.import.modelLoadError')}
                    </Text>
                  )}
                </Stack>
              )}
            </Box>
          </Stack>

          <Flex justify="flex-end" gap={3}>
            <Button variant="outline" onClick={handleDialogClose}>
              {t('common.cancel')}
            </Button>
            <Button
              colorPalette="blue"
              onClick={handleCreate}
              isLoading={saving}
              disabled={!cardPreview || !selectedModel || parsing}
            >
              {t('settings.live2d.import.create')}
            </Button>
          </Flex>
        </Stack>
      </Box>
    </Box>
  );
}

export default ImportCardDialog;
