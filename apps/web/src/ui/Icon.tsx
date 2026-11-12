import type { CSSProperties, ReactNode } from "react";

type IconName =
  | "search"
  | "plus"
  | "trash"
  | "star"
  | "starFilled"
  | "chevronRight"
  | "chevronDown"
  | "more"
  | "check"
  | "doc"
  | "image"
  | "smile"
  | "cloud"
  | "cloudCheck"
  | "grip"
  | "filter"
  | "sort"
  | "columns"
  | "settings"
  | "print";

const paths: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />,
  starFilled: <path fill="currentColor" stroke="none" d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  doc: <><path d="M6 2h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M14 2v5h5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" /></>,
  cloud: <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 6.97" />,
  cloudCheck: <><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.7 9.6" /><path d="m9 15 2.2 2.2L17 11.5" /></>,
  grip: <><circle cx="9" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  sort: <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />,
  columns: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M10 4v16M16 4v16" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  print: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></>,
};

export function Icon({
  name,
  size = 16,
  style,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

export type { IconName };
