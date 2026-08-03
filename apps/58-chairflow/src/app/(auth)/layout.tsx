import Link from "next/link";
import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <Link
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32 }}
      >
        <Icon name="chair-seat" size={22} />
        <span className="t-title">ChairFlow</span>
      </Link>
      {children}
    </main>
  );
}
