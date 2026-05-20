// This layout is now handled by the root Layout.tsx component
// All admin pages use the same sidebar navigation from /components/Layout.tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
