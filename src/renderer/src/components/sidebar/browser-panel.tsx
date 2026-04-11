/* eslint-disable jsx-a11y/iframe-has-title */
import { Box, Text } from "@chakra-ui/react";
import { FiGlobe } from "react-icons/fi";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@/components/ui/tooltip";
import { sidebarStyles } from "./sidebar-styles";
import { useBrowser } from "@/context/browser-context";

function BrowserPlaceholder() {
  const { t } = useTranslation();

  return (
    <Box
      position="absolute"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={2}
    >
      <FiGlobe size={24} />
      <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
        {t('sidebar.noBrowserSession')}
      </Text>
    </Box>
  );
}

function BrowserPanel(): JSX.Element {
  const { t } = useTranslation();
  const { browserViewData } = useBrowser();
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  return (
    <Box {...sidebarStyles.browserPanel.container}>
      <Tooltip
        showArrow
        content={
          browserViewData
            ? "Interactive browser view"
            : t('sidebar.noBrowserSession')
        }
        open={isHovering}
      >
        <Box
          {...sidebarStyles.browserPanel.browserContainer}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          position="relative"
        >
          {browserViewData && (
            <Box position="absolute" top="8px" left="10px" zIndex={1}>
              <Text fontSize="sm" color="blue.300">{t('sidebar.browserSession')}</Text>
            </Box>
          )}
          {browserViewData ? (
            <iframe
              src={browserViewData.debuggerFullscreenUrl}
              style={sidebarStyles.browserPanel.iframe}
              sandbox="allow-same-origin allow-scripts"
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <BrowserPlaceholder />
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export default BrowserPanel;
