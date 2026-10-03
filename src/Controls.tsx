import * as Select from '@radix-ui/react-select';
import { CaretDown, CaretUp, Check } from '@phosphor-icons/react';
import { useId, useState, type ReactNode } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Shared select: keeps Radix's focus, typeahead, escape and scroll behavior. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  required = false,
  id,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled || !options.length}
      required={required}
      name={name}
    >
      <Select.Trigger id={id} className="select-trigger" aria-label={label}>
        <span className="select-value">
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon className="select-icon">
          <CaretDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={8} collisionPadding={16}>
          <Select.ScrollUpButton className="select-scroll">
            <CaretUp size={16} />
          </Select.ScrollUpButton>
          <Select.Viewport className="select-viewport">
            {options.map((option) => (
              <Select.Item
                className="select-option"
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                textValue={option.label}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="select-check">
                  <Check size={16} weight="bold" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            <CaretDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'selected' : ''}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className = '',
  onOpenChange,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`disclosure ${className}`} data-open={open}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          onOpenChange?.(!open);
        }}
      >
        <span className="disclosure-label">{title}</span>
        <CaretDown size={18} />
      </button>
      <div id={id} className="disclosure-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
