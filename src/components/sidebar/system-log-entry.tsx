import { Box, Text } from "@chakra-ui/react";
import { SystemLogEntry } from "@/types/system-log";
import { sidebarStyles } from "./sidebar-styles";

interface SystemLogEntryProps {
    entry: SystemLogEntry;
}

const SystemLogEntryComponent = ({ entry }: SystemLogEntryProps) => {
    return (
        <Box {...sidebarStyles.systemLogPanel.entry}>
            <Text fontSize="xs" fontFamily="mono" color="whiteAlpha.900">
                {entry.content}
            </Text>
        </Box>
    );
};

export default SystemLogEntryComponent;