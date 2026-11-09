import clsx from "clsx";

/**
 * Profile photo from /uploads (proxied to the backend). Nothing when there is no photo:
 * the name is always shown as text next to it (no decorative letter circles).
 */
export function Avatar({
  photoPath,
  size = "md",
}: {
  photoPath?: string | null;
  size?: "sm" | "md";
}) {
  if (!photoPath) return null;
  const box = size === "sm" ? "size-7" : "size-9";
  return (
    // Plain <img>: small, already-resized WebP files; Next image optimisation adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/uploads/${photoPath.replace(/^\/+/, "")}`}
      alt=""
      loading="lazy"
      className={clsx(box, "shrink-0 rounded-full object-cover")}
    />
  );
}
