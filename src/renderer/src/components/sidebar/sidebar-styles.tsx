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
      width: '97%',
      overflow: 'hidden',
      px: 4,
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
      width: '97%',
      overflow: 'hidden',
      px: 4,
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

  bottomTab: {
    container: {
      width: '100%',
      px: 4,
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
};
