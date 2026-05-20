import { Input } from "@/components/ui/input";
import { parseVndInput } from "@/lib/reports";

const vnd = new Intl.NumberFormat("vi-VN");

/**
 * VND money input. Stores a digit-only string in `value` and shows it
 * formatted with thousand separators (e.g. "6.098.261"). Dots/commas typed
 * by the user are treated as thousand separators, never as decimals.
 */
export function VndInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = "0",
  className,
}: {
  id?: string;
  value: string; // digit-only
  onChange: (digits: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const display = value ? vnd.format(parseVndInput(value)) : "";
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={display}
      disabled={disabled}
      className={className}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits);
      }}
    />
  );
}
