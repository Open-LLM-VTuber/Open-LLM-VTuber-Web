import { SystemStyleObject } from '@chakra-ui/react';

interface FooterStyles {
  container: (isCollapsed: boolean) => SystemStyleObject
  toggleButton: SystemStyleObject
  actionButton: SystemStyleObject
  input: SystemStyleObject
  attachButton: SystemStyleObject
}

interface AIIndicatorStyles {
  container: SystemStyleObject
  text: SystemStyleObject
}

export const footerStyles: {
  footer: FooterStyles
  aiIndicator: AIIndicatorStyles
} = {
  footer: {
    container: (isCollapsed) => ({
      bg: isCollapsed ? 'transparent' : 'gray.800',
      borderTopRadius: isCollapsed ? 'none' : 'lg',
      transform: isCollapsed ? 'translateY(calc(100% - 20px))' : 'translateY(0)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      height: '100%',
      position: 'relative',
      overflow: isCollapsed ? 'visible' : 'hidden',
    }),
    toggleButton: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '20px',
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
    actionButton: {
      borderRadius: '12px',
      width: '44px',
      height: '44px',
      minW: '44px',
    },
    input: {
      bg: 'gray.700',
      border: 'none',
      height: '50px',
      borderRadius: '12px',
      fontSize: '16px',
      pl: '12',
      pr: '4',
      color: 'whiteAlpha.900',
      _placeholder: {
        color: 'whiteAlpha.500',
      },
      _focus: {
        border: 'none',
        bg: 'gray.700',
      },
      resize: 'none',
      minHeight: '50px',
      maxHeight: '50px',
      py: '0',
      display: 'flex',
      alignItems: 'center',
      paddingTop: '14px',
      lineHeight: '1.4',
    },
    attachButton: {
      position: 'absolute',
      left: '1',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'whiteAlpha.700',
      zIndex: 2,
      _hover: {
        bg: 'transparent',
        color: 'white',
      },
    },
  },
  aiIndicator: {
    container: {
      bg: '#7C5CFF',
      color: 'white',
      width: '110px',
      height: '30px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      overflow: 'hidden',
    },
    text: {
      fontSize: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  },
};
