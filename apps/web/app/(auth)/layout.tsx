// Auth surface: login, register, forgot-password. No app chrome.
// Phase 1 will populate these routes — see VENTLY_PLAN.md §6.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="relative min-h-screen flex items-center justify-center p-6">{children}</main>;
}
