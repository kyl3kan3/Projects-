import {
  IconFolder,
  IconInvoice,
  IconLink,
  IconMessage,
  IconStamp,
  IconTimeline,
  type IconProps,
} from "@/components/icons";
import type { ModuleId } from "@/db/schema";

/**
 * One place for each module's name, one-line explanation and glyph, so the
 * composer, the portal home and the agency page can never disagree about what a
 * module is called.
 */
export const MODULE_COPY: Record<
  ModuleId,
  { title: string; blurb: string; Icon: (p: IconProps) => React.ReactElement; empty: string }
> = {
  timeline: {
    title: "Timeline",
    blurb: "Phases with progress and a last-updated stamp",
    Icon: IconTimeline,
    empty: "No phases yet — the plan will appear here.",
  },
  files: {
    title: "Files",
    blurb: "Versioned deliverables, newest on top",
    Icon: IconFolder,
    empty: "Nothing here yet.",
  },
  approvals: {
    title: "Approvals",
    blurb: "One tap to approve, or send it back with a note",
    Icon: IconStamp,
    empty: "Nothing waiting on you.",
  },
  messages: {
    title: "Messages",
    blurb: "Threads you can answer straight from your inbox",
    Icon: IconMessage,
    empty: "No messages yet.",
  },
  invoices: {
    title: "Invoices",
    blurb: "See what's due and pay it here",
    Icon: IconInvoice,
    empty: "No invoices yet.",
  },
  links: {
    title: "Links",
    blurb: "The Figma, the doc, the staging site",
    Icon: IconLink,
    empty: "No links yet.",
  },
};
