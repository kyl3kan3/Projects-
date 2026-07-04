import Link from "next/link";

export function Brand({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2 font-semibold">
      <span className="grid h-7 w-7 place-items-center rounded-[8px] border border-[var(--color-hairline)] text-[var(--color-banknote)]">
        $
      </span>
      <span>Dunly</span>
    </Link>
  );
}
