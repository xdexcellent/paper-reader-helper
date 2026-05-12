import { useRef } from 'react'
import { Icon } from './UiIcon'
import { Button } from '@/components/ui/button'

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return

  const maybePickerInput = input as HTMLInputElement & { showPicker?: () => void }
  if (typeof maybePickerInput.showPicker === 'function') {
    maybePickerInput.showPicker()
    return
  }

  input.focus()
  input.click()
}

export function BriefingDateField({
  label,
  value,
  helperText,
  ariaLabel,
  onChange,
  buttonLabel,
  variant = 'card',
}: {
  label: string
  value: string
  helperText: string
  ariaLabel: string
  onChange: (next: string) => void
  buttonLabel?: string
  variant?: 'card' | 'compact'
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className={`briefing-date-field briefing-date-field-${variant}`}>
      <span className="briefing-date-field-label">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={ariaLabel}
        onClick={() => openNativeDatePicker(inputRef.current)}
      >
        <span className="briefing-date-field-copy">
          <strong>{buttonLabel ?? value}</strong>
          <small>{helperText}</small>
        </span>
        <Icon name="calendar" className="briefing-date-field-icon" />
      </Button>
      <input
        ref={inputRef}
        className="briefing-date-field-native"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
