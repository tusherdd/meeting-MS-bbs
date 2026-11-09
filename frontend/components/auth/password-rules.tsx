import clsx from "clsx";
import { checkPasswordRules } from "@/lib/schemas";
import { t } from "@/messages";

/** Live checklist under a new-password field (same rules as the backend). */
export function PasswordRules({ password, email }: { password: string; email?: string | null }) {
  const rules = checkPasswordRules(password, email);
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5" id="password-rules">
      <p className="text-xs font-semibold text-slate-600">{t.passwordRules.title}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={clsx(
              "flex items-center gap-2",
              rule.ok ? "text-brand-800" : "text-slate-600",
            )}
          >
            <span>{t.passwordRules[rule.key]}</span>
            <span
              className={clsx(
                "rounded px-1.5 text-[11px] font-semibold",
                rule.ok ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-600",
              )}
            >
              {rule.ok ? t.passwordRules.met : t.passwordRules.notMet}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
