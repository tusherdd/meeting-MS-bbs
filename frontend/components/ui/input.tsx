import type { ComponentProps, ReactNode } from "react";
import { Field, controlClass, describedBy } from "./field";

interface InputProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Shown inside the field on the right (e.g. a show-password button). */
  trailing?: ReactNode;
}

export function Input({
  id,
  label,
  error,
  hint,
  required,
  trailing,
  className,
  ...rest
}: InputProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={controlClass(!!error, `h-10 ${trailing ? "pr-16" : ""} ${className ?? ""}`)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </Field>
  );
}
