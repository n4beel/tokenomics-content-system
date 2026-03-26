import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="tm-dashboard flex h-screen overflow-hidden">
      <Sidebar />
      <main className="tm-main flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 lg:px-12">
        <div className="max-w-[1320px] mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}
