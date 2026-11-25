"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { adminApi, queryKeys } from "@/lib/endpoints";
import type { NoticeExtractionMethod } from "@/lib/types";
import { useT } from "@/providers/locale-provider";

const METHODS: NoticeExtractionMethod[] = ["OCR", "AI"];

/**
 * /admin/settings (v1.21 part 2, SPEC.md §6.13): app-wide settings. Now one radio group: how the
 * notice is read for "fill the form from the notice". AI is disabled while the server has no key.
 */
export function SettingsAdmin() {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<NoticeExtractionMethod | null>(null);

  const settings = useQuery({ queryKey: queryKeys.adminSettings, queryFn: adminApi.settings });
  const save = useMutation({
    mutationFn: (method: NoticeExtractionMethod) =>
      adminApi.updateSettings({ noticeExtractionMethod: method }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.adminSettings, data);
      setChoice(null);
      toast.show(t.admin.settings.saved);
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.settings.title}</h1>
      <Card>
        <CardBody>
          {settings.isPending ? (
            <LoadingBlock />
          ) : settings.isError ? (
            <ErrorAlert error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (choice) save.mutate(choice);
              }}
            >
              <fieldset>
                <legend className="text-base font-semibold text-slate-900">
                  {t.admin.settings.noticeMethod}
                </legend>
                <div className="mt-3 space-y-3">
                  {METHODS.map((method) => {
                    const current = choice ?? settings.data.noticeExtractionMethod;
                    const disabled = method === "AI" && !settings.data.aiAvailable;
                    const noteId = `notice-method-${method}-note`;
                    return (
                      <div key={method}>
                        <label className="flex items-start gap-2 text-sm text-slate-800">
                          <input
                            type="radio"
                            name="noticeExtractionMethod"
                            value={method}
                            className="mt-0.5 size-4 accent-brand-700"
                            checked={current === method}
                            disabled={disabled || save.isPending}
                            aria-describedby={disabled ? noteId : undefined}
                            onChange={() => setChoice(method)}
                          />
                          <span className={disabled ? "text-slate-600" : undefined}>
                            {t.admin.settings.methods[method]}
                          </span>
                        </label>
                        {disabled && (
                          <p id={noteId} className="mt-1 ml-6 text-sm text-slate-600">
                            {t.admin.settings.aiNoKey}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              {save.isError && <ErrorAlert error={save.error} />}
              <Button
                type="submit"
                loading={save.isPending}
                disabled={!choice || choice === settings.data.noticeExtractionMethod}
              >
                {t.common.save}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
