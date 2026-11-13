"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { profileApi, queryKeys } from "@/lib/endpoints";
import { toBanglaDigits } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { t } from "@/messages";

/** Same limits as the backend (SPEC.md §8: jpeg/png/webp, MAX_UPLOAD_MB = 2). The server decides. */
export const PHOTO_MAX_MB = 2;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Client-side check only; the backend re-checks the real type (magic bytes) and the size. */
export function checkPhotoFile(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return t.profile.photoWrongType;
  if (file.size > PHOTO_MAX_MB * 1024 * 1024)
    return t.profile.photoTooLarge(toBanglaDigits(PHOTO_MAX_MB));
  return null;
}

export function PhotoSection({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Release the preview's object URL when it is replaced or the section unmounts.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(next: File | null) {
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  function clearChoice() {
    choose(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const upload = useMutation({
    mutationFn: (f: File) => profileApi.uploadPhoto(f),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      clearChoice();
      toast.show(t.profile.photoUploaded);
    },
  });
  const remove = useMutation({
    mutationFn: profileApi.deletePhoto,
    onSuccess: () => {
      queryClient.setQueryData<Profile>(queryKeys.profile, (p) =>
        p ? { ...p, photoPath: null } : p,
      );
      setConfirmRemove(false);
      toast.show(t.profile.photoRemoved);
    },
  });

  function onPick(picked: File | undefined) {
    upload.reset();
    if (!picked) {
      choose(null);
      setCheckError(null);
      return;
    }
    const problem = checkPhotoFile(picked);
    setCheckError(problem);
    choose(problem ? null : picked);
    if (problem && inputRef.current) inputRef.current.value = "";
  }

  const current = profile.photoPath ? `/uploads/${profile.photoPath.replace(/^\/+/, "")}` : null;

  return (
    <Card>
      <CardHeader title={t.profile.photoTitle} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start gap-6">
          <figure className="space-y-1">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current}
                alt={t.profile.photoAlt(profile.nameBn)}
                className="size-32 rounded-xl border border-slate-200 object-cover"
                data-testid="profile-photo"
              />
            ) : (
              <p className="flex size-32 items-center justify-center rounded-xl border border-dashed border-slate-300 px-2 text-center text-xs text-slate-500">
                {t.profile.photoNone}
              </p>
            )}
            <figcaption className="text-xs text-slate-600">{t.profile.photoCurrent}</figcaption>
          </figure>
          {preview && (
            <figure className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={t.profile.photoPreview}
                className="size-32 rounded-xl border border-brand-300 object-cover"
              />
              <figcaption className="text-xs text-slate-600">{t.profile.photoPreview}</figcaption>
            </figure>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="photo-file" className="block text-sm font-medium text-slate-800">
            {t.profile.photoChoose}
          </label>
          <input
            ref={inputRef}
            id="photo-file"
            type="file"
            accept={PHOTO_TYPES.join(",")}
            aria-describedby="photo-file-hint"
            onChange={(e) => onPick(e.target.files?.[0])}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
          />
          <p id="photo-file-hint" className="text-xs text-slate-600">
            {t.profile.photoHint}
          </p>
        </div>

        {checkError && <Alert tone="error">{checkError}</Alert>}
        {upload.isError && <ErrorAlert error={upload.error} />}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!file}
            loading={upload.isPending}
            loadingText={t.profile.photoUploading}
            onClick={() => file && upload.mutate(file)}
          >
            {t.profile.photoUpload}
          </Button>
          {current && (
            <Button
              variant="secondary"
              className="text-red-700"
              onClick={() => setConfirmRemove(true)}
            >
              {t.profile.photoRemove}
            </Button>
          )}
        </div>

        <ConfirmModal
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          onConfirm={() => remove.mutate()}
          title={t.profile.photoRemoveTitle}
          confirmLabel={t.profile.photoRemove}
          busy={remove.isPending}
          error={remove.error}
          danger
        >
          <p>{t.profile.photoRemoveBody}</p>
        </ConfirmModal>
      </CardBody>
    </Card>
  );
}
