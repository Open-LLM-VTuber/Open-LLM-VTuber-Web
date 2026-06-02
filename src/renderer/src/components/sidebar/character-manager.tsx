import { Box, Button, Flex, Text, Textarea, Stack, Input } from '@chakra-ui/react';
import {
  FiTrash2, FiEdit3, FiUserPlus, FiEye, FiChevronLeft,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  DrawerRoot,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerActionTrigger,
  DrawerBackdrop,
  DrawerCloseTrigger,
} from '@/components/ui/drawer';
import { toaster } from '@/components/ui/toaster';
import { useCharacterManager, FormData } from '@/hooks/sidebar/use-character-manager';
import { ConfigFile } from '@/context/character-config-context';

interface CharacterManagerProps {
  children: React.ReactNode;
}

const formFieldStyle = {
  label: {
    fontSize: 'sm',
    color: 'whiteAlpha.700',
    mb: 1,
  } as const,
  input: {
    bg: 'whiteAlpha.100',
    border: '1px solid',
    borderColor: 'whiteAlpha.200',
    color: 'white',
    _hover: { bg: 'whiteAlpha.200' },
    _focus: { bg: 'whiteAlpha.200', borderColor: 'blue.500' },
  } as const,
  textarea: {
    bg: 'whiteAlpha.100',
    border: '1px solid',
    borderColor: 'whiteAlpha.200',
    color: 'white',
    minH: '120px',
    _hover: { bg: 'whiteAlpha.200' },
    _focus: { bg: 'whiteAlpha.200', borderColor: 'blue.500' },
  } as const,
};

function CharacterListItem({
  config,
  isSelected,
  onEdit,
  onDelete,
  isDefault,
}: {
  config: ConfigFile;
  isSelected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDefault: boolean;
}) {
  return (
    <Box
      px={4}
      py={3}
      borderRadius="md"
      bg={isSelected ? 'whiteAlpha.100' : 'transparent'}
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ bg: 'whiteAlpha.50' }}
      onClick={onEdit}
    >
      <Flex justify="space-between" align="center">
        <Box>
          <Text fontSize="sm" fontWeight="medium" color="white">
            {config.name}
          </Text>
          <Text fontSize="xs" color="whiteAlpha.500">
            {config.filename}
          </Text>
        </Box>
        <Flex gap={1}>
          <Button
            size="xs"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <FiEdit3 />
          </Button>
          {!isDefault && (
            <Button
              size="xs"
              variant="ghost"
              color="red.300"
              _hover={{ color: 'red.200', bg: 'whiteAlpha.100' }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <FiTrash2 />
            </Button>
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

function CharacterForm({
  formData,
  updateField,
  editingFile,
}: {
  formData: FormData;
  updateField: (field: keyof FormData, value: string) => void;
  editingFile: string | null;
}) {
  const { t } = useTranslation();

  return (
    <Stack gap={4}>
      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.name')} *</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.conf_name}
          onChange={(e) => updateField('conf_name', e.target.value)}
          placeholder="e.g. My Character"
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.uid')} *</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.conf_uid}
          onChange={(e) => updateField('conf_uid', e.target.value)}
          placeholder="e.g. my_char_01"
          disabled={!!editingFile}
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.characterName')}</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.character_name}
          onChange={(e) => updateField('character_name', e.target.value)}
          placeholder={formData.conf_name || 'Defaults to conf_name'}
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.humanName')}</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.human_name}
          onChange={(e) => updateField('human_name', e.target.value)}
          placeholder="Human"
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.avatar')}</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.avatar}
          onChange={(e) => updateField('avatar', e.target.value)}
          placeholder="avatar.png"
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.live2dModel')}</Text>
        <Input
          {...formFieldStyle.input}
          value={formData.live2d_model_name}
          onChange={(e) => updateField('live2d_model_name', e.target.value)}
          placeholder="Live2D model name"
        />
      </Box>

      <Box>
        <Text {...formFieldStyle.label}>{t('characterManager.personaPrompt')} *</Text>
        <Textarea
          {...formFieldStyle.textarea}
          value={formData.persona_prompt}
          onChange={(e) => updateField('persona_prompt', e.target.value)}
          placeholder={t('characterManager.personaPromptPlaceholder')}
        />
      </Box>
    </Stack>
  );
}

function SystemPromptPreview({
  previewText,
  onBack,
}: {
  previewText: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Box>
      <Flex align="center" mb={4} gap={2}>
        <Button
          size="sm"
          variant="ghost"
          color="whiteAlpha.700"
          onClick={onBack}
        >
          <FiChevronLeft /> {t('common.back')}
        </Button>
        <Text fontSize="md" fontWeight="semibold" color="white">
          {t('characterManager.systemPromptPreview')}
        </Text>
      </Flex>
      <Box
        p={4}
        borderRadius="md"
        bg="gray.800"
        border="1px solid"
        borderColor="whiteAlpha.200"
        maxH="calc(100vh - 220px)"
        overflowY="auto"
        css={{
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-track': { bg: 'whiteAlpha.100', borderRadius: 'full' },
          '&::-webkit-scrollbar-thumb': { bg: 'whiteAlpha.300', borderRadius: 'full' },
        }}
      >
        <Text
          fontSize="sm"
          color="white"
          fontFamily="mono"
          whiteSpace="pre-wrap"
          lineHeight="1.6"
        >
          {previewText}
        </Text>
      </Box>
    </Box>
  );
}

const isElectron = (window as any).api !== undefined;

function CharacterManager({ children }: CharacterManagerProps): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'edit' | 'preview'>('list');

  const {
    configFiles,
    editingFile,
    formData,
    systemPromptPreview,
    loadConfigForEdit,
    resetForm,
    updateField,
    saveCharacter,
    deleteCharacter,
    previewSystemPrompt,
  } = useCharacterManager();

  const handleSwitchToList = () => {
    resetForm();
    setViewMode('list');
  };

  const handleNewCharacter = () => {
    resetForm();
    setViewMode('edit');
  };

  const handleEdit = (filename: string) => {
    loadConfigForEdit(filename);
    setViewMode('edit');
  };

  const handlePreview = () => {
    previewSystemPrompt();
    setViewMode('preview');
  };

  const handleBackFromPreview = () => {
    setViewMode('edit');
  };

  const handleSave = () => {
    if (!formData.conf_name || !formData.conf_uid || !formData.persona_prompt) {
      toaster.create({
        title: t('characterManager.validationError'),
        type: 'error',
        duration: 2000,
      });
      return;
    }
    saveCharacter();
    toaster.create({
      title: editingFile
        ? t('characterManager.updated')
        : t('characterManager.created'),
      type: 'success',
      duration: 2000,
    });
    setViewMode('list');
  };

  const handleDelete = (filename: string, name: string) => {
    deleteCharacter(filename);
    toaster.create({
      title: t('characterManager.deleted', { name }),
      type: 'success',
      duration: 2000,
    });
  };

  return (
    <DrawerRoot
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open);
        if (!e.open) {
          handleSwitchToList();
        }
      }}
      placement="start"
    >
      <DrawerBackdrop />
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent
        bg="gray.900"
        maxWidth="440px"
        marginTop={isElectron ? '30px' : '0'}
        height={isElectron ? 'calc(100vh - 30px)' : '100vh'}
        borderLeft="1px solid"
        borderColor="whiteAlpha.200"
      >
        <DrawerHeader
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          position="relative"
          px={6}
          py={4}
        >
          <DrawerTitle color="white" fontSize="lg" fontWeight="semibold">
            {viewMode === 'list'
              ? t('characterManager.title')
              : viewMode === 'preview'
                ? t('characterManager.systemPromptPreview')
                : editingFile
                  ? t('characterManager.editCharacter')
                  : t('characterManager.newCharacter')}
          </DrawerTitle>
          <DrawerCloseTrigger color="white" onClick={handleSwitchToList} />
        </DrawerHeader>

        <DrawerBody px={6}>
          {viewMode === 'list' && (
            <Box>
              <Flex justify="space-between" align="center" mb={4}>
                <Text fontSize="sm" color="whiteAlpha.600">
                  {configFiles.length} {t('characterManager.characters')}
                </Text>
                <Button
                  size="sm"
                  colorPalette="blue"
                  onClick={handleNewCharacter}
                >
                  <FiUserPlus /> {t('characterManager.addNew')}
                </Button>
              </Flex>

              <Box
                overflowY="auto"
                maxH="calc(100vh - 220px)"
                css={{
                  '&::-webkit-scrollbar': { width: '4px' },
                  '&::-webkit-scrollbar-track': { bg: 'whiteAlpha.100', borderRadius: 'full' },
                  '&::-webkit-scrollbar-thumb': { bg: 'whiteAlpha.300', borderRadius: 'full' },
                }}
              >
                {configFiles.map((config) => (
                  <CharacterListItem
                    key={config.filename}
                    config={config}
                    isSelected={false}
                    onEdit={() => handleEdit(config.filename)}
                    onDelete={() => handleDelete(config.filename, config.name)}
                    isDefault={config.filename === 'conf.yaml'}
                  />
                ))}
              </Box>
            </Box>
          )}

          {viewMode === 'edit' && (
            <Box
              overflowY="auto"
              maxH="calc(100vh - 220px)"
              css={{
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-track': { bg: 'whiteAlpha.100', borderRadius: 'full' },
                '&::-webkit-scrollbar-thumb': { bg: 'whiteAlpha.300', borderRadius: 'full' },
              }}
              pr={2}
            >
              <CharacterForm
                formData={formData}
                updateField={updateField}
                editingFile={editingFile}
              />
            </Box>
          )}

          {viewMode === 'preview' && (
            <SystemPromptPreview
              previewText={systemPromptPreview}
              onBack={handleBackFromPreview}
            />
          )}
        </DrawerBody>

        <DrawerFooter>
          {viewMode === 'list' && (
            <DrawerActionTrigger asChild>
              <Button
                color="white"
                borderColor="white"
                variant="outline"
              >
                {t('common.close')}
              </Button>
            </DrawerActionTrigger>
          )}

          {viewMode === 'edit' && (
            <>
              <Button
                color="whiteAlpha.700"
                variant="ghost"
                onClick={handleSwitchToList}
              >
                {t('common.cancel')}
              </Button>
              <Button
                colorPalette="blue"
                variant="ghost"
                onClick={handlePreview}
              >
                <FiEye /> {t('characterManager.preview')}
              </Button>
              <Button colorPalette="blue" onClick={handleSave}>
                {t('common.save')}
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </DrawerRoot>
  );
}

export default CharacterManager;