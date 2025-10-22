/* eslint-disable react/require-default-props */
import { useState } from 'react';
import {
  Text, Input, NumberInput, createListCollection, Flex, Box,
} from '@chakra-ui/react';
import { HiQuestionMarkCircle } from 'react-icons/hi';
import { Field } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from '@/components/ui/select';
import { settingStyles } from './setting-styles';

// Help Icon Component
interface HelpIconProps {
  content: string;
}

function HelpIcon({ content }: HelpIconProps): JSX.Element {
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => setIsHovering(false);

  return (
    <Tooltip
      showArrow
      content={
        <Text fontSize="sm" maxW="300px" lineHeight="1.4">
          {content}
        </Text>
      }
      open={isHovering}
    >
      <Box
        as={HiQuestionMarkCircle}
        color="gray.400"
        _hover={{ color: 'gray.600' }}
        cursor="help"
        w="16px"
        h="16px"
        ml="2"
        transition="color 0.2s"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </Tooltip>
  );
}

// Common Props Types
interface SelectFieldProps {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  collection: ReturnType<typeof createListCollection<{ label: string; value: string }>>
  placeholder: string
}

interface NumberFieldProps {
  label: string
  value: number | string
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
  allowMouseWheel?: boolean
  help?: string
}

interface SwitchFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  help?: string
}

interface InputFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  help?: string
  error?: string
  disabled?: boolean
  type?: string
}

// Reusable Components
export function SelectField({
  label,
  value,
  onChange,
  collection,
  placeholder,
}: SelectFieldProps): JSX.Element {
  return (
    <Field
      {...settingStyles.general.field}
      label={<Text {...settingStyles.general.field.label}>{label}</Text>}
    >
      <SelectRoot
        {...settingStyles.general.select.root}
        collection={collection}
        value={value}
        onValueChange={(e) => onChange(e.value)}
      >
        <SelectTrigger {...settingStyles.general.select.trigger}>
          <SelectValueText placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {collection.items.map((item) => (
            <SelectItem key={item.value} item={item}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  allowMouseWheel,
  help,
}: NumberFieldProps): JSX.Element {
  return (
    <Field
      {...settingStyles.common.field}
      label={
        <Flex align="center">
          <Text {...settingStyles.common.fieldLabel}>{label}</Text>
          {help && <HelpIcon content={help} />}
        </Flex>
      }
    >
      <NumberInput.Root
        {...settingStyles.common.numberInput.root}
        value={value.toString()}
        onValueChange={(details) => onChange(details.value)}
        min={min}
        max={max}
        step={step}
        allowMouseWheel={allowMouseWheel}
      >
        <NumberInput.Input {...settingStyles.common.numberInput.input} />
        <NumberInput.Control>
          <NumberInput.IncrementTrigger />
          <NumberInput.DecrementTrigger />
        </NumberInput.Control>
      </NumberInput.Root>
    </Field>
  );
}

export function SwitchField({ label, checked, onChange, help }: SwitchFieldProps): JSX.Element {
  return (
    <Field
      {...settingStyles.common.field}
      label={
        <Flex align="center">
          <Text {...settingStyles.common.fieldLabel}>{label}</Text>
          {help && <HelpIcon content={help} />}
        </Flex>
      }
    >
      <Switch
        {...settingStyles.common.switch}
        checked={checked}
        onCheckedChange={(details) => onChange(details.checked)}
      />
    </Field>
  );
}

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  help,
  error,
  disabled = false,
  type = 'text',
}: InputFieldProps): JSX.Element {
  return (
    <Field
      {...settingStyles.general.field}
      label={
        <Flex align="center">
          <Text {...settingStyles.general.field.label}>{label}</Text>
          {help && <HelpIcon content={help} />}
        </Flex>
      }
      errorText={error}
    >
      <Input
        {...settingStyles.general.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        disabled={disabled}
      />
    </Field>
  );
}
