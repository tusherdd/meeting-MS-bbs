"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { t } from "@/messages";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type" | "trailing"> & {
  label: ReactNode;
};

/** Password field with a "দেখুন" / "লুকান" text toggle. */
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
          aria-controls={props.id}
        >
          {visible ? t.common.hide : t.common.show}
        </button>
      }
    />
  );
}
