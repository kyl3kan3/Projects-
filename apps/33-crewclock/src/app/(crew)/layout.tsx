import { requireCrew } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";
import { t } from "@/lib/i18n";

/**
 * The crew shell. Three tabs, phone-first at every width — desktop crew is the
 * phone layout centred at 480px (DESIGN.md responsive).
 */
export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireCrew();
  const locale = user.locale;

  return (
    <>
      {children}
      <TabBar
        items={[
          { href: "/clock", label: t(locale, "nav.clock"), icon: "clock" },
          { href: "/hours", label: t(locale, "nav.hours"), icon: "hours" },
          { href: "/profile", label: t(locale, "nav.profile"), icon: "profile" },
        ]}
      />
    </>
  );
}
