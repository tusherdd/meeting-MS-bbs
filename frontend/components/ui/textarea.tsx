import type { ComponentProps, ReactNode } from "react";
import { Field, controlClass, describedBy } from "./field";

interface TextareaProps extends Omit<ComponentProps<"textarea">, "id"> {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
}

export function Textarea({
  id,
  label,
  error,
  hint,
  required,
  className,
  rows = 4,
  ...rest
}: TextareaProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={controlClass(!!error, `py-2 ${className ?? ""}`)}
        {...rest}
      />
    </Field>
  );
}
