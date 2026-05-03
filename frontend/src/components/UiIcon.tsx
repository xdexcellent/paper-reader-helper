import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'assistant'
  | 'book'
  | 'calendar'
  | 'chart'
  | 'check'
  | 'close'
  | 'dashboard'
  | 'download'
  | 'file'
  | 'fileText'
  | 'gear'
  | 'key'
  | 'library'
  | 'link'
  | 'logOut'
  | 'microscope'
  | 'moon'
  | 'pdf'
  | 'paperclip'
  | 'refresh'
  | 'rss'
  | 'search'
  | 'send'
  | 'spark'
  | 'sun'
  | 'target'
  | 'upload'
  | 'vector'
  | 'warning'

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName
}

const iconPaths: Record<IconName, ReactNode> = {
  assistant: (
    <>
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="M12 3v2" />
      <rect x="4" y="5" width="16" height="12" rx="4" />
      <path d="M8 21l4-4 4 4" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5V4.5Z" />
      <path d="M5 4.5A2.5 2.5 0 0 0 2.5 2H4v17H2.5A2.5 2.5 0 0 1 5 21.5" />
      <path d="M8 6h8" />
      <path d="M8 10h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 18h3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="m7 9 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </>
  ),
  fileText: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M4.9 4.9 7 7" />
      <path d="m17 17 2.1 2.1" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M4.9 19.1 7 17" />
      <path d="m17 7 2.1-2.1" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8" />
      <path d="m16 4 4 4" />
      <path d="m14 6 2 2" />
    </>
  ),
  library: (
    <>
      <path d="M4 5h4v14H4z" />
      <path d="M10 5h4v14h-4z" />
      <path d="m16 6 3-1 3 13-3 1z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 5" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-1.4 1.4a5 5 0 0 0 7.1 7.1l.9-.9" />
    </>
  ),
  logOut: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </>
  ),
  microscope: (
    <>
      <path d="M6 18h12" />
      <path d="M9 22h6" />
      <path d="M14 18a6 6 0 0 0 6-6" />
      <path d="m6 7 6 6" />
      <path d="m8 5 6 6 3-3-6-6z" />
    </>
  ),
  moon: (
    <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
  ),
  pdf: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 16h1.5a1.5 1.5 0 0 0 0-3H9v5" />
      <path d="M14 13v5h1a2.5 2.5 0 0 0 0-5z" />
    </>
  ),
  paperclip: (
    <path d="m21 11-8.5 8.5a5 5 0 0 1-7.1-7.1L14 3.8a3 3 0 0 1 4.2 4.2L9.7 16.5a1 1 0 0 1-1.4-1.4L16 7.4" />
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 9A7 7 0 0 1 18 7l2 2" />
      <path d="M17.9 15A7 7 0 0 1 6 17l-2-2" />
    </>
  ),
  rss: (
    <>
      <path d="M5 19h.01" />
      <path d="M5 12a7 7 0 0 1 7 7" />
      <path d="M5 5a14 14 0 0 1 14 14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7 18-4-8-8-4z" />
      <path d="m21 3-11 10" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 3h14" />
    </>
  ),
  vector: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h8" />
      <path d="M6 8v8" />
      <path d="M18 8v8" />
      <path d="M8 18h8" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </>
  ),
}

export function Icon({ name, className = '', ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={['ui-icon', className].filter(Boolean).join(' ')}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  )
}
