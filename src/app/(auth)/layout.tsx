// src/app/(auth)/layout.tsx

import PublicLayout from "../(public)/layout";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicLayout>{children}</PublicLayout>;
}
