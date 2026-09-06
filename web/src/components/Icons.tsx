import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 16, ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...rest,
})

export const InboxIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4h16v12H4z" />
    <path d="M4 12h5l1.5 2h3L15 12h5" />
    <path d="M4 16v4h16v-4" />
  </svg>
)
export const BookmarkIcon = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  )
}
export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const RefreshIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </svg>
)
export const CheckAllIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12l4 4L14 9" />
    <path d="M12 16l2 2 7-7" />
  </svg>
)
export const ExternalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 13v7H4V6h7" />
  </svg>
)
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </svg>
)
export const ChevronIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
export const BackIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
)
export const KeyboardIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </svg>
)
export const FolderIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7h6l2 2h10v10H3z" />
  </svg>
)
export const ImportIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v3h16v-3" />
  </svg>
)
export const DotsIcon = (p: IconProps) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </svg>
)
export const CircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" />
  </svg>
)
export const ColumnsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M11 5v14" />
  </svg>
)
export const RowsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M3 14.5h18" />
  </svg>
)
export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M12 8v7M9 12.5l3 3 3-3" />
  </svg>
)
export const CompassIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
)
export const CompactIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
)
export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
)
