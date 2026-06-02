import { css } from '@emotion/react';

const isElectron = window.api !== undefined;

const commonStyles = {
  scrollbar: {
    '&::-webkit-scrollbar': {
      width: '4px',
    },
    '&::-webkit-scrollbar-track': {
      bg: 'whiteAlpha.100',
      borderRadius: 'full',
    },
    '&::-webkit-scrollbar-thumb': {
      bg: 'whiteAlpha.300',
      borderRadius: 'full',
    },
  },
  panel: {
    border: '1px solid',
    borderColor: 'whiteAlpha.200',
    borderRadius: 'lg',
    bg: 'blackAlpha.400',
  },
  title: {
    fontSize: 'lg',
    fontWeight: 'semibold',
    color: 'white',
    mb: 4,
  },
};

export const sidebarStyles = {
  sidebar: {
    container: (isCollapsed: boolean) => ({
      position: 'absolute' as const,
      left: 0,
      top: 0,
      height: '100%',
      width: '440px',
      bg: 'gray.900',
      transform: isCollapsed
        ? 'translateX(calc(-100% + 24px))'
        : 'translateX(0)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
      overflow: isCollapsed ? 'visible' : 'hidden',
      pb: '4',
    }),
    toggleButton: {
      position: 'absolute',
      right: 0,
      top: 0,
      width: '24px',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: 'whiteAlpha.700',
      _hover: { color: 'white' },
      bg: 'transparent',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 1,
    },
    content: {
      flex: 1,
      width: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
      overflow: 'hidden',
    },
    header: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      p: 2,
    },
  },

  chatHistoryPanel: {
    container: {
      flex: 1,
      overflow: 'hidden',
      px: 4,
      display: 'flex',
      flexDirection: 'column',
    },
    title: commonStyles.title,
    messageList: {
      ...commonStyles.panel,
      p: 4,
      width: '97%',
      flex: 1,
      overflowY: 'auto',
      css: {
        ...commonStyles.scrollbar,
        scrollPaddingBottom: '1rem',
      },
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
  },

  systemLogPanel: {
    container: {
      width: '100%',
      overflow: 'hidden',
      px: 4,
      minH: '200px',
      marginTop: 'auto',
    },
    title: commonStyles.title,
    logList: {
      ...commonStyles.panel,
      p: 4,
      height: '200px',
      overflowY: 'auto',
      fontFamily: 'mono',
      css: commonStyles.scrollbar,
    },
    entry: {
      p: 2,
      borderRadius: 'md',
      _hover: {
        bg: 'whiteAlpha.50',
      },
    },
  },

  chatBubble: {
    container: {
      display: 'flex',
      position: 'relative',
      _hover: {
        bg: 'whiteAlpha.50',
      },
      py: 1,
      px: 2,
      borderRadius: 'md',
    },
    message: {
      maxW: '90%',
      bg: 'transparent',
      p: 2,
    },
    text: {
      fontSize: 'xs',
      color: 'whiteAlpha.900',
    },
    dot: {
      position: 'absolute',
      w: '2',
      h: '2',
      borderRadius: 'full',
      bg: 'white',
      top: '2',
    },
  },

  historyDrawer: {
    listContainer: {
      flex: 1,
      overflowY: 'auto',
      px: 4,
      py: 2,
      css: commonStyles.scrollbar,
    },
    historyItem: {
      mb: 4,
      p: 3,
      borderRadius: 'md',
      bg: 'whiteAlpha.50',
      cursor: 'pointer',
      transition: 'all 0.2s',
      _hover: {
        bg: 'whiteAlpha.100',
      },
    },
    historyItemSelected: {
      bg: 'whiteAlpha.200',
      borderLeft: '3px solid',
      borderColor: 'blue.500',
    },
    historyHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: 2,
    },
    timestamp: {
      fontSize: 'sm',
      color: 'whiteAlpha.700',
      fontFamily: 'mono',
    },
    deleteButton: {
      variant: 'ghost' as const,
      colorScheme: 'red' as const,
      size: 'sm' as const,
      color: 'red.300',
      opacity: 0.8,
      _hover: {
        opacity: 1,
        bg: 'whiteAlpha.200',
      },
    },
    messagePreview: {
      fontSize: 'sm',
      color: 'whiteAlpha.900',
      noOfLines: 2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    drawer: {
      content: {
        background: 'var(--chakra-colors-gray-900)',
        maxWidth: '440px',
        marginTop: isElectron ? '30px' : '0',
        height: isElectron ? 'calc(100vh - 30px)' : '100vh',
      },
      title: {
        color: 'white',
      },
      closeButton: {
        color: 'white',
      },
      actionButton: {
        color: 'white',
        borderColor: 'white',
        variant: 'outline' as const,
      },
    },
  },

  cameraPanel: {
    container: {
      width: '100%',
      overflow: 'hidden',
      minH: '240px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: 4,
    },
    title: commonStyles.title,
    videoContainer: {
      ...commonStyles.panel,
      width: '100%',
      height: '240px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      transition: 'all 0.2s',
    },
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      transform: 'scaleX(-1)',
      borderRadius: '8px',
      display: 'block',
    } as const,
  },

  screenPanel: {
    container: {
      width: '100%',
      overflow: 'hidden',
      minH: '240px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: 4,
    },
    title: commonStyles.title,
    screenContainer: {
      ...commonStyles.panel,
      width: '100%',
      height: '240px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      transition: 'all 0.2s',
    },
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      borderRadius: '8px',
      display: 'block',
    } as const,
  },

  // Add Browser Panel Styles
  browserPanel: {
    container: {
      width: '100%',
      overflow: 'hidden',
      minH: '240px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: 4,
    },
    title: commonStyles.title,
    browserContainer: {
      ...commonStyles.panel,
      width: '100%',
      height: '240px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      transition: 'all 0.2s',
      cursor: 'pointer',
      _hover: {
        bg: 'whiteAlpha.100',
      },
    },
    iframe: {
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: '8px',
    } as const,
  },

  bottomTab: {
    container: {
      width: '100%',
      px: 4,
      position: 'relative' as const,
      zIndex: 0,
    },
    tabs: {
      width: '100%',
      bg: 'whiteAlpha.50',
      borderRadius: 'lg',
      p: '1',
    },
    list: {
      borderBottom: 'none',
      gap: '2',
    },
    trigger: {
      color: 'whiteAlpha.700',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      px: 3,
      py: 2,
      borderRadius: 'md',
      _hover: {
        color: 'white',
        bg: 'whiteAlpha.50',
      },
      _selected: {
        color: 'white',
        bg: 'whiteAlpha.200',
      },
    },
  },

  groupDrawer: {
    section: {
      mb: 6,
    },
    sectionTitle: {
      fontSize: 'lg',
      fontWeight: 'semibold',
      color: 'white',
      mb: 3,
    },
    inviteBox: {
      display: 'flex',
      gap: 2,
    },
    input: {
      bg: 'whiteAlpha.100',
      border: 'none',
      color: 'white',
      _placeholder: {
        color: 'whiteAlpha.400',
      },
    },
    memberList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    memberItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      p: 2,
      borderRadius: 'md',
      bg: 'whiteAlpha.100',
    },
    memberText: {
      color: 'white',
      fontSize: 'sm',
    },
    removeButton: {
      size: 'sm',
      color: 'red.300',
      bg: 'transparent',
      _hover: {
        bg: 'whiteAlpha.200',
      },
    },
    button: {
      color: 'white',
      bg: 'whiteAlpha.100',
      _hover: {
        bg: 'whiteAlpha.200',
      },
    },
    clipboardButton: {
      color: 'white',
      bg: 'transparent',
      _hover: {
        bg: 'whiteAlpha.200',
      },
      size: 'sm',
    },
  },

  // Add styles for the Tool Call Indicator
  toolCallIndicator: {
    container: {
      pl: '44px', // Indent to align with message content (avatar width + gap)
      my: '1', // Reduced vertical margin (e.g., 4px if theme space 1 = 4px)
      gap: 2,
      width: '100%',
      minHeight: '24px', // Ensure minimum height
      display: 'flex', // Ensure display is flex
      alignItems: 'center', // Keep vertical alignment
      justifyContent: 'center', // Center items horizontally
    },
    icon: {
      color: 'blue.300',
      boxSize: '14px',
    },
    text: {
      fontSize: 'xs',
      color: 'whiteAlpha.700',
      fontStyle: 'italic',
    },
    spinner: {
      size: 'xs',
      color: 'blue.300',
      ml: 0,
    },
    completedIcon: {
      color: 'green.300',
      boxSize: '14px',
      ml: 0,
    },
    errorIcon: {
      color: 'red.300',
      boxSize: '14px',
      ml: 0,
    },
  },
};

export const chatPanelStyles = css`
  .cs-message-list {
    background: var(--chakra-colors-gray-900) !important;
    padding: var(--chakra-space-4);
  }
  
  .cs-message {
    margin: 12px 0;
    // padding-top: 20px !important;
  }

  .cs-message__content {
    background-color: var(--chakra-colors-gray-700) !important;
    border-radius: var(--chakra-radii-md);
    padding: 8px !important;
    color: var(--chakra-colors-white) !important;
    font-size: 0.95rem !important;
    line-height: 1.5 !important;
    margin-top: 4px !important;
  }

  .cs-message__text {
    padding: 8px 0 !important;
  }

  .cs-message--outgoing .cs-message__content {
    background-color: var(--chakra-colors-gray-600) !important;
  }

  .cs-chat-container {
    background: transparent !important;
    border: 1px solid var(--chakra-colors-whiteAlpha-200);
    border-radius: var(--chakra-radii-lg);
    padding: var(--chakra-space-2);
  }

  .cs-main-container {
    border: none !important;
    background: transparent !important;
    width: calc(100% - 48px) !important;
    margin: 0 auto !important;
  }

  .cs-message__sender {
    position: absolute !important;
    top: 0 !important;
    left: 36px !important;
    font-size: 0.875rem !important;
    font-weight: 600 !important;
    color: var(--chakra-colors-whiteAlpha-900) !important;
  }

  .cs-message__content-wrapper {
    max-width: 80%;
    margin: 0 8px;
  }

  .cs-avatar {
    background-color: var(--chakra-colors-blue-500) !important;
    color: white !important;
    width: 28px !important;
    height: 28px !important;
    font-size: 14px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 50% !important;
  }

  .cs-message--outgoing .cs-avatar {
    background-color: var(--chakra-colors-green-500) !important;
  }

  .cs-message__header {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
`;
