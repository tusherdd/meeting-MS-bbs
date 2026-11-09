import { Brand } from "@/components/layout/brand";

/** Public pages (login, password links, email verification): centered card, no menu. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="px-4 pt-8 pb-4 sm:pt-12">
        <div className="mx-auto flex max-w-md justify-center">
          <Brand href="/login" />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-12">{children}</main>
    </div>
  );
}
