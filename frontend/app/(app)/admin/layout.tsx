import { AdminGate } from "@/components/admin/admin-gate";

/** /admin/*: ADMIN or SUPER_ADMIN only (others see the 404 page); admin sub-menu on top. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminGate>{children}</AdminGate>;
}
