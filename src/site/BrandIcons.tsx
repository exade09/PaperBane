import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function PaperBaneMark(props: IconProps) {
  return (
    <svg viewBox="0 0 54 54" fill="none" aria-hidden="true" {...props}>
      <path d="M6 9 29 3l19 8 3 21-10 18-25-2L3 34Z" fill="#090B0A" stroke="#343936" />
      <path d="m10 12 17-5 16 6 4 17-9 15-19-2L7 32Z" fill="#151816" stroke="#985CFF" strokeWidth="1.5" />
      <path d="m12 16 8-3-2 7 7 3-7 4 3 6-8 1 2 7-7-5Z" fill="#C5C8C4" opacity=".14" />
      <path d="M31 9v8M31 38v8" stroke="#7DFF48" strokeWidth="3" />
      <path d="M25 16h12v23H25Z" fill="#7DFF48" stroke="#A3FF7D" strokeWidth="1.4" />
      <path d="M28 20h6v15h-6Z" fill="#2D6A35" opacity=".55" />
    </svg>
  )
}

export function PaperBaneLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="pb-logo" aria-label="PaperBane">
      <PaperBaneMark className="pb-logo__mark" />
      {!compact && (
        <span className="pb-logo__word">
          PAPER<span>BANE</span>
        </span>
      )}
    </span>
  )
}

export function PumpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="m6 20 8-11 12 3 1 9-8 6-10-1Z" fill="#111312" stroke="currentColor" strokeWidth="1.7" />
      <path d="m10 19 7-7 7 2-9 10Z" fill="#7DFF48" opacity=".7" />
      <path d="m17 12 7 2-4 4-7-2Z" fill="#C5C8C4" />
      <path d="m12 18 7 2" stroke="#090B0A" strokeWidth="1.5" />
    </svg>
  )
}

export function DexIcon(props: IconProps) {
  return (
    <svg className="pb-dex-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        className="pb-dex-icon__echo"
        d="m5.2 8.2 6.3-4h9l6.3 4-1.7 13.5-9.1 6-9.1-6Z"
        stroke="#985CFF"
        strokeWidth="1.4"
      />
      <path
        className="pb-dex-icon__shell"
        d="m4.7 7.2 6.6-4.1h9.4l6.6 4.1-1.8 14.7-9.5 6.3-9.5-6.3Z"
        fill="#0B0E0C"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        className="pb-dex-icon__eagle"
        d="m7.1 9.1 7.2 2.5 1.7 2.8 1.7-2.8 7.2-2.5-2 8-4.5 1.2L16 23.5l-2.4-5.2-4.5-1.2Z"
        fill="#C5C8C4"
        stroke="#7DFF48"
        strokeWidth="1.25"
        strokeLinejoin="bevel"
      />
      <path d="m9.5 12.2 4.5 1.6-1.5 2-3.5-1Zm13 0L18 13.8l1.5 2 3.5-1Z" fill="#0B0E0C" />
      <path d="m13.2 14 2.8 1 2.8-1-2.8 6.5Z" fill="#985CFF" stroke="#32E6CF" strokeWidth=".55" />
      <path d="m7.5 20.2 4.2 1.3M24.5 20.2l-4.2 1.3M11.2 6.8l-2.1 1.3M20.8 6.8l2.1 1.3" stroke="#313732" strokeWidth=".7" />
    </svg>
  )
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="m4 15 23-9-5 21-7-7-5 5 1-7Z" fill="#111312" stroke="currentColor" strokeWidth="1.7" />
      <path d="m11 18 12-8-8 10" stroke="#7DFF48" strokeWidth="2" />
      <path d="m15 20 7 5-4-8" fill="#985CFF" opacity=".75" />
    </svg>
  )
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M6 6h7l5 7 5-7h3l-7 9 8 11h-7l-6-8-6 8H5l8-10Z" fill="#111312" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10 9 12 14" stroke="#7DFF48" strokeWidth="2" />
      <path d="m8 25 6-8M18 13l5-6" stroke="#985CFF" strokeWidth="1.3" />
    </svg>
  )
}

export function ArrowIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M3 10h13M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function MenuIcon({ open, ...props }: IconProps & { open: boolean }) {
  return (
    <svg viewBox="0 0 28 24" fill="none" aria-hidden="true" {...props}>
      {open ? (
        <path d="m5 4 18 16M23 4 5 20" stroke="currentColor" strokeWidth="2" />
      ) : (
        <path d="M3 5h22M7 12h18M3 19h22" stroke="currentColor" strokeWidth="2" />
      )}
    </svg>
  )
}

export function SoundIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 9v6h4l5 4V5L8 9Z" fill="currentColor" />
      <path d="M16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
