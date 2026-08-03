/**
 * One consistent icon set: 20×20 viewBox, 1.75px stroke, round caps and joins,
 * `currentColor` throughout. No emoji anywhere in this product — an emoji in a
 * shipped screen is a build failure (DESIGN_LANGUAGE rule 1).
 *
 * Nav icons render at 22px; everything else at 20 or 16.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.75 5.25h9.5v8H1.75z" />
      <path d="M11.25 8h3.2l3.8 3.1v2.15h-7z" />
      <circle cx="5.5" cy="15.5" r="1.75" />
      <circle cx="14" cy="15.5" r="1.75" />
    </Icon>
  );
}

export function BoardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h15M2.5 10h15M2.5 15.5h15" />
      <path d="M6 2.75v3.5M12.5 8.25v3.5" />
    </Icon>
  );
}

export function DocIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.75 2.25h6.5l4 4v11.5h-10.5z" />
      <path d="M11.25 2.25v4h4" />
      <path d="M7.25 10.5h5.5M7.25 13.5h3.5" />
    </Icon>
  );
}

export function InvoiceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.75 2.25h12.5v15.5l-2.1-1.4-2.1 1.4-2.05-1.4-2.1 1.4-2.05-1.4-2.1 1.4z" />
      <path d="M7 6.75h6M7 10h6" />
    </Icon>
  );
}

export function LedgerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.25 2.75h13.5v14.5H3.25z" />
      <path d="M3.25 7.25h13.5M3.25 11.75h13.5M8.5 2.75v14.5" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 16.5h14.5" />
      <path d="M4.75 13.5V9M9 13.5V4.5M13.25 13.5v-6" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 6.5h3l1.25-2h6.5l1.25 2h3v10h-15z" />
      <circle cx="10" cy="11" r="3.25" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 5.75V10l3 1.75" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.75 10.5l4 4 8.5-9.5" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.75l7.25 13.5H2.75z" />
      <path d="M10 7.5v4M10 14h.01" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.25 10h13.5M11.5 5l5.25 5-5.25 5" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.75 10H3.25M8.5 5L3.25 10l5.25 5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.75v12.5M3.75 10h12.5" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 1.75v2.1M10 16.15v2.1M3.17 3.17l1.48 1.48M15.35 15.35l1.48 1.48M1.75 10h2.1M16.15 10h2.1M3.17 16.83l1.48-1.48M15.35 4.65l1.48-1.48" />
    </Icon>
  );
}

export function FuelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.25 17.25V3.5a1.25 1.25 0 011.25-1.25h4.5a1.25 1.25 0 011.25 1.25v13.75" />
      <path d="M2.5 17.25h9" />
      <path d="M10.25 7.25h2.5a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 001.5 1.5 1.5 1.5 0 001.5-1.5V6.5l-2.5-2.75" />
      <path d="M4.75 6.75h3.5" />
    </Icon>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.75 17.25V3.5h8.5v13.75" />
      <path d="M12.25 8.25h4v9M2.5 17.25h15" />
      <path d="M6.5 6.75h3M6.5 10h3M6.5 13.25h3" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 17.25H3.75V2.75H8" />
      <path d="M12.5 6.25L16.25 10l-3.75 3.75M7.25 10h9" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.75v9.5M6.25 8.75L10 12.5l3.75-3.75" />
      <path d="M3.25 16.25h13.5" />
    </Icon>
  );
}

export function ThreadMarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.75v14.5" />
      <circle cx="10" cy="5.5" r="1.75" />
      <circle cx="10" cy="14.5" r="1.75" />
    </Icon>
  );
}
