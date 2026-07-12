import { DexIcon, PumpIcon, TelegramIcon, XIcon } from './BrandIcons'

const socialLinks = [
  { label: 'Pump.fun', href: 'https://pump.fun', icon: PumpIcon },
  { label: 'Dexscreener', href: 'https://dexscreener.com', icon: DexIcon },
  { label: 'Telegram', href: 'https://t.me', icon: TelegramIcon },
  { label: 'X', href: 'https://x.com', icon: XIcon },
]

export function SocialLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`pb-socials${compact ? ' pb-socials--compact' : ''}`} aria-label="PaperBane social links">
      {socialLinks.map(({ label, href, icon: Icon }) => (
        <a
          className="pb-social-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          key={label}
        >
          <Icon />
          <span className="pb-tooltip" role="tooltip">{label}</span>
        </a>
      ))}
    </div>
  )
}
