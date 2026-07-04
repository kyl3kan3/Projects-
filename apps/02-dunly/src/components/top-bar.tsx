import { Brand } from "./brand";

export function TopBar({ action }: { action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex min-h-11 items-center justify-between gap-4">
      <Brand />
      {action}
    </header>
  );
}
