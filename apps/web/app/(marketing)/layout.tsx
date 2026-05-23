// Marketing surface: splash, welcome, home. No app chrome.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <main className="relative min-h-screen overflow-x-hidden">{children}</main>;
}
