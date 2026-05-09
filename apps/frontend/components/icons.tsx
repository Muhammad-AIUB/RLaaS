/**
 * Lightweight inline SVG icon set.
 *
 * We avoid pulling in an icon library to keep the dashboard bundle
 * small. Each icon takes a `className` so callers control sizing.
 * Stroke-based icons share a single visual style.
 */
import * as React from 'react';

export type IconProps = {
  className?: string;
};

export type IconComponent = (props: IconProps) => React.ReactElement;

function Stroke({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const OverviewIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M3 13h8V3H3z" />
    <path d="M13 21h8V11h-8z" />
    <path d="M3 21h8v-6H3z" />
    <path d="M13 9h8V3h-8z" />
  </Stroke>
);

export const ProjectsIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Stroke>
);

export const MenuIcon: IconComponent = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
    aria-hidden
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const CloseIcon: IconComponent = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
    aria-hidden
  >
    <path d="M6 6l12 12M6 18L18 6" />
  </svg>
);

export const SearchIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Stroke>
);

export const HelpIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
    <path d="M12 17h.01" />
  </Stroke>
);

export const SignOutIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Stroke>
);

export const ArrowRightIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </Stroke>
);

export const ChevronRightIcon: IconComponent = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden
  >
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PlusIcon: IconComponent = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
    aria-hidden
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const KeyIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="7.5" cy="15.5" r="3.5" />
    <path d="M21 2 9 14M16 7l3 3" />
  </Stroke>
);

export const RulesIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M4 6h16M4 12h10M4 18h7" />
    <circle cx="18" cy="12" r="2" />
    <circle cx="14" cy="18" r="2" />
  </Stroke>
);

export const AnalyticsIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 4 4 5-6" />
  </Stroke>
);

export const MembersIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="9" cy="9" r="3.5" />
    <path d="M2 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    <circle cx="17" cy="8" r="3" />
    <path d="M22 18c-.7-2-2-3.2-4-3.7" />
  </Stroke>
);

export const WebhooksIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M9 6h6M6 9v6" />
  </Stroke>
);

export const AuditIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h4" />
  </Stroke>
);

export const ClockIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
);

export const AlertIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Stroke>
);

export const InfoCircleIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Stroke>
);

export const FileIcon: IconComponent = ({ className }) => (
  <Stroke className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M12 18v-6M9 15h6" />
  </Stroke>
);

export const LogoMark: IconComponent = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#rlaas-logo-grad)" />
    <path
      d="M7 12h10M7 8h10M7 16h6"
      stroke="white"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <defs>
      <linearGradient
        id="rlaas-logo-grad"
        x1="0"
        y1="0"
        x2="24"
        y2="24"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#4338ca" />
      </linearGradient>
    </defs>
  </svg>
);
