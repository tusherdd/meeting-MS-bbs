"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { t } from "@/messages";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type" | "trailing"> & {
  label: ReactNode;
};

/** Password field with a show/hide toggle. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          aria-pressed={visible}
          aria-label={visible ? t.common.hidePassword : t.common.showPassword}
          aria-controls={props.id}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
            <path
              d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            {visible && (
              <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      }
    />
  );
}
