import { PublicBrand } from "@/components/layout/brand";
import { LanguageSwitch } from "@/components/layout/language-switch";

/** Public pages (login, password links, email verification): centered card, no menu. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      {/* Public pages have no app header: the language button sits at the top right (v1.6). */}
      <div className="flex justify-end px-4 pt-4">
        <LanguageSwitch />
      </div>
      <header className="px-4 pt-4 pb-4 sm:pt-6">
        <div className="mx-auto flex max-w-md justify-center">
          <PublicBrand />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12">{children}</main>
    </div>
  );
}
