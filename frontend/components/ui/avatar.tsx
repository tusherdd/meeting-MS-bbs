import clsx from "clsx";

/** Profile photo from /uploads (proxied to the backend), or the first letter of the name. */
export function Avatar({
  name,
  photoPath,
  size = "md",
}: {
  name: string;
  photoPath?: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  if (photoPath) {
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
  return (
    <span
      aria-hidden="true"
      className={clsx(
        box,
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800",
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
