import Link from "next/link";
import { IconBeltBar } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="screen-narrow" style={{ paddingTop: 80 }}>
      <span className="fg-3">
        <IconBeltBar size={22} />
      </span>
      <h1 className="t-h2" style={{ marginTop: 16 }}>
        Nothing here
      </h1>
      <p className="t-body fg-2" style={{ marginTop: 12 }}>
        That page does not exist, or it belongs to another school. If you followed a link from an
        email, the student or event it pointed at may since have been removed.
      </p>
      <div className="flex items-center gap-3" style={{ marginTop: 24, flexWrap: "wrap" }}>
        <Link href="/roster" className="btn btn-primary">
          Back to the roster
        </Link>
        <Link href="/" className="btn btn-secondary">
          MatPass home
        </Link>
      </div>
    </main>
  );
}
