import React from 'react';

const paths: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  cup: (
    <>
      <path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z" />
      <path d="M17 9h2.2a2.8 2.8 0 1 1 0 5.6H17" />
      <path d="M4 21h14" />
      <path d="M9.5 3.5c-.7.9-.7 1.8 0 2.7M13 3.5c-.7.9-.7 1.8 0 2.7" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8h13l1 12.5h-15L5.5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 20.5a6.4 6.4 0 0 1 12.4 0" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.4 14.6a6.4 6.4 0 0 1 3.8 5.9" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h2.5v2.5h-2.5zM19 19h1.5v1.5H19zM14.5 20.5H17M20.5 14.5V17" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  store: (
    <>
      <path d="M4 9 5.5 4h13L20 9" />
      <path d="M5 9v11h14V9" />
      <path d="M9.5 20v-6h5v6" />
      <path d="M4 9a2.4 2.4 0 0 0 4 1.6A2.4 2.4 0 0 0 12 10a2.4 2.4 0 0 0 4 .6A2.4 2.4 0 0 0 20 9" />
    </>
  ),
  menu: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
      <path d="m7.5 5.5 9 5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9v5M12 17.2v.1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  list: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M7 12h10" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-4L3 10" />
      <path d="M3 5v5h5M4 13a8 8 0 0 0 14.5 4L21 14" />
      <path d="M21 19v-5h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M20 12H4" />
      <path d="m10 6-6 6 6 6" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  printer: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="4" y="8" width="16" height="8" rx="1.5" />
      <path d="M7 13h10v8H7z" />
      <path d="M17 11h.01" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6L4.5 10.8 10.2 9 12 3.5Z" />
      <path d="M18.5 16.5 19.3 19l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5Z" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10 18.5h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c-8 0-14 4-14 10a5 5 0 0 0 5 5c6 0 9-6 9-15Z" />
      <path d="M4 21c1-6 5-9 10-11" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9.5h6M9 14.5h6M12 7v10" />
    </>
  ),
  tray: (
    <>
      <path d="M4 13h16l-2 7H6l-2-7Z" />
      <path d="M7 13V7h10v6M9 4h6" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4h3l8 4V6L7 10H4Z" />
      <path d="M18 9a4 4 0 0 1 0 6" />
      <path d="M7 14v6" />
    </>
  ),
  grid: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
    </>
  ),
  package: (
    <>
      <path d="m3.5 7 8.5-4.5L20.5 7 12 11.5 3.5 7Z" />
      <path d="M3.5 7v10l8.5 4.5 8.5-4.5V7" />
      <path d="M12 11.5v10M7.5 4.8l9 4.7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3.4V13c0 4.5-8 8-8 8s-8-3.5-8-8V6.4L12 3Z" />
      <path d="m8.8 12 2.2 2.2 4.4-4.4" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9a13 13 0 0 1 18 0M6.5 12.5a8 8 0 0 1 11 0M10 16a3.5 3.5 0 0 1 4 0" />
      <path d="M12 19.5h.01" />
    </>
  )
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.6,
  style
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
