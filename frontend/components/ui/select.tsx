import type { ComponentProps, ReactNode } from "react";
import { Field, controlClass, describedBy } from "./field";

interface SelectProps extends Omit<ComponentProps<"select">, "id"> {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  id,
  label,
  error,
  hint,
  required,
  options,
  placeholder,
  className,
  ...rest
}: SelectProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(!!error, `h-10 ${className ?? ""}`)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
