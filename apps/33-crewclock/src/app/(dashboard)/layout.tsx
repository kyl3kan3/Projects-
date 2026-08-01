import { requireOffice } from "@/lib/auth";
import { SideRail, TabBar, type TabItem } from "@/components/TabBar";
import { t } from "@/lib/i18n";

/**
 * The office shell. Four tabs on a phone; from 1024px a persistent left rail
 * replaces the bar and the content centres at 1120px (DESIGN.md responsive).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireOffice();
  const locale = user.locale;

  const items: TabItem[] = [
    { href: "/jobs", label: t(locale, "nav.jobs"), icon: "jobs" },
    { href: "/crew", label: t(locale, "nav.crew"), icon: "crew" },
    { href: "/review", label: t(locale, "nav.review"), icon: "review" },
    { href: "/export", label: t(locale, "nav.export"), icon: "export" },
  ];

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1280px] lg:gap-8 lg:px-8">
      <SideRail items={items} orgName={org.name} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar items={items} />
    </div>
  );
}
