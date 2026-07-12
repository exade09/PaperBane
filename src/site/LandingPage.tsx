import { useCallback, useEffect, useState } from 'react'
import { ArrowIcon, MenuIcon, PaperBaneLogo } from './BrandIcons'
import CinematicHeroScene from './CinematicHeroScene'
import SiteModal from './SiteModal'
import { SocialLinks } from './SocialLinks'
import '../styles/site.css'

type ModalName = 'story' | 'tokenomics' | 'community' | null

const controls = [
  ['WASD', 'Move'],
  ['MOUSE', 'Look'],
  ['LEFT CLICK', 'Attack'],
  ['RIGHT CLICK', 'Heavy Attack'],
  ['SPACE', 'Dodge'],
  ['F', 'Wick Surge'],
  ['Q', 'Medkit'],
  ['ESC', 'Pause'],
]

const tokenFacts = [
  ['NAME', 'PaperBane'],
  ['TICKER', 'PBANE'],
  ['SUPPLY', '1B'],
  ['BLOCKCHAIN', 'Solana'],
  ['LAUNCH', 'Pump.fun'],
  ['TAX', '0%'],
]

const roadmap = [
  {
    phase: 'PHASE 01',
    title: 'THE FOG OPENS',
    items: ['Website launch', 'Community launch', 'Gameplay reveal'],
  },
  {
    phase: 'PHASE 02',
    title: 'GREEN WICK',
    items: ['Pump.fun launch', 'Playable browser game'],
  },
  {
    phase: 'PHASE 03',
    title: 'DEEPER FOG',
    items: ['New enemies', 'New area', 'Community challenges'],
  },
]

function Header({ onOpenModal }: { onOpenModal: (modal: Exclude<ModalName, null>) => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 24)
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])

  useEffect(() => {
    const closeOnWideScreen = () => {
      if (window.innerWidth > 920) setMenuOpen(false)
    }
    window.addEventListener('resize', closeOnWideScreen)
    return () => window.removeEventListener('resize', closeOnWideScreen)
  }, [])

  const openModal = (modal: Exclude<ModalName, null>) => {
    setMenuOpen(false)
    onOpenModal(modal)
  }

  return (
    <header className={`pb-header${scrolled || menuOpen ? ' pb-header--solid' : ''}`}>
      <div className="pb-header__inner">
        <a className="pb-header__brand" href="/" aria-label="PaperBane home">
          <PaperBaneLogo />
        </a>

        <nav className={`pb-nav${menuOpen ? ' pb-nav--open' : ''}`} aria-label="Main navigation">
          <a href="/play" onClick={() => setMenuOpen(false)}>GAME</a>
          <button type="button" onClick={() => openModal('story')}>STORY</button>
          <button type="button" onClick={() => openModal('tokenomics')}>TOKENOMICS</button>
          <button type="button" onClick={() => openModal('community')}>COMMUNITY</button>
          <div className="pb-nav__socials">
            <SocialLinks compact />
          </div>
          <a className="pb-button pb-button--small" href="/play" onClick={() => setMenuOpen(false)}>
            PLAY GAME
            <ArrowIcon />
          </a>
        </nav>

        <button
          className="pb-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </div>
    </header>
  )
}

function StoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SiteModal open={open} onClose={onClose} title="THE FOG OF BLACKWICK" eyebrow="ARCHIVE 01" variant="story">
      <div className="pb-story-copy">
        <p>A corrupted sell signal spread through Blackwick and filled the city with fog</p>
        <p>Those who panicked became Paper Hands wandering the streets and hunting anyone still willing to hold</p>
        <p>The last green signal is carried by a survivor known as The Holder</p>
        <p>Armed with a candlestick forged from the final green wick he must cross the infected district reach the old exchange and destroy the Paper King</p>
        <p>If the signal returns Blackwick may survive</p>
      </div>
      <a className="pb-button pb-button--primary" href="/play">
        ENTER THE FOG
        <ArrowIcon />
      </a>
    </SiteModal>
  )
}

function TokenomicsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SiteModal open={open} onClose={onClose} title="TOKENOMICS" eyebrow="GREEN SIGNAL DATA" variant="token">
      <dl className="pb-token-grid pb-token-grid--modal">
        {tokenFacts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="pb-contract-note">Contract will appear after launch</p>
    </SiteModal>
  )
}

function CommunityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SiteModal open={open} onClose={onClose} title="JOIN THE COMMUNITY" eyebrow="SIGNAL TERMINAL" variant="terminal">
      <div className="pb-terminal-readout" aria-hidden="true">
        <span>SIGNAL</span>
        <i />
        <strong>ACTIVE</strong>
      </div>
      <p className="pb-community-copy">Enter the fog with the PaperBane community</p>
      <div className="pb-modal__actions">
        <a className="pb-button pb-button--primary" href="https://t.me" target="_blank" rel="noopener noreferrer">
          JOIN TELEGRAM
          <ArrowIcon />
        </a>
        <a className="pb-button pb-button--ghost" href="https://x.com" target="_blank" rel="noopener noreferrer">
          FOLLOW ON X
          <ArrowIcon />
        </a>
      </div>
    </SiteModal>
  )
}

function Hero() {
  return (
    <section className="pb-hero" aria-labelledby="paperbane-title">
      <CinematicHeroScene />
      <div className="pb-hero__grain" aria-hidden="true" />
      <div className="pb-hero__vignette" aria-hidden="true" />
      <div className="pb-hero__content pb-shell">
        <div className="pb-hero__copy">
          <p className="pb-kicker"><span /> BLACKWICK SIGNAL DETECTED</p>
          <h1 id="paperbane-title" data-text="PAPERBANE">PAPERBANE</h1>
          <p className="pb-hero__slogan">Kill the panic Hold the wick</p>
          <p className="pb-hero__support">A low-poly survival horror game built around the PaperBane community on Solana</p>
          <div className="pb-hero__actions">
            <a className="pb-button pb-button--primary pb-button--hero" href="/play">
              PLAY GAME
              <ArrowIcon />
            </a>
            <a className="pb-button pb-button--ghost pb-button--hero" href="/play">
              EXPLORE BLACKWICK
              <ArrowIcon />
            </a>
          </div>
        </div>

        <div className="pb-hero__status" aria-label="PaperBane status">
          <div><span>ASSET</span><strong>PBANE</strong></div>
          <div><span>NETWORK</span><strong>SOLANA</strong></div>
          <div><span className="pb-live-dot" /> <strong>GAME ONLINE</strong></div>
        </div>
      </div>
      <a className="pb-scroll-cue" href="#game-preview" aria-label="Scroll to game preview">
        <span>ENTER THE DISTRICT</span>
        <i />
      </a>
    </section>
  )
}

function GamePreview() {
  return (
    <section className="pb-preview pb-section" id="game-preview" aria-labelledby="preview-title">
      <div className="pb-shell">
        <div className="pb-section-heading">
          <div>
            <p className="pb-kicker">SURVIVAL PROTOCOL</p>
            <h2 id="preview-title">ENTER BLACKWICK</h2>
          </div>
          <p>Paper hands entered the fog None returned</p>
        </div>

        <div className="pb-preview__art-grid">
          <figure className="pb-art-panel pb-art-panel--city">
            <img src="/assets/paper-city.png" alt="Low-poly concept views of Blackwick streets the Pump Station and the Old Solana Exchange" loading="lazy" decoding="async" />
            <figcaption>
              <span>LOCATION ARCHIVE</span>
              <strong>BLACKWICK DISTRICT</strong>
            </figcaption>
          </figure>
          <figure className="pb-art-panel pb-art-panel--holder">
            <img src="/assets/holder-reference.png" alt="The Holder character reference with dark jacket green seams and candlestick weapon" loading="lazy" decoding="async" />
            <figcaption>
              <span>SURVIVOR FILE</span>
              <strong>THE HOLDER</strong>
            </figcaption>
          </figure>
          <figure className="pb-art-panel pb-art-panel--enemy">
            <img src="/assets/paper-hands-reference.png" alt="Paper Hands enemy reference with infected trader poses and weathered clothing" loading="lazy" decoding="async" />
            <figcaption>
              <span>THREAT FILE</span>
              <strong>PAPER HANDS</strong>
            </figcaption>
          </figure>
        </div>

        <div className="pb-feature-strip" aria-label="Game features">
          {[
            ['01', 'Fight Paper Hands'],
            ['02', 'Survive the Fog'],
            ['03', 'Hold the Green Wick'],
            ['04', 'Destroy the Paper King'],
          ].map(([number, title]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
            </article>
          ))}
        </div>

        <div className="pb-controls-block">
          <div className="pb-controls-block__intro">
            <p className="pb-kicker">KEYBOARD AND MOUSE</p>
            <h3>CONTROLS</h3>
            <p>Cross three connected areas Restore the signal Survive the Paper King</p>
            <a className="pb-button pb-button--primary" href="/play">
              ENTER BLACKWICK
              <ArrowIcon />
            </a>
          </div>
          <dl className="pb-controls-grid">
            {controls.map(([key, action]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function TokenSection() {
  return (
    <section className="pb-token-section pb-section" aria-labelledby="token-title">
      <div className="pb-token-section__glow" aria-hidden="true" />
      <div className="pb-shell pb-token-section__inner">
        <div className="pb-token-section__identity">
          <PaperBaneLogo compact />
          <p className="pb-kicker">THE GREEN SIGNAL</p>
          <h2 id="token-title">PaperBane</h2>
          <strong>PBANE</strong>
        </div>
        <dl className="pb-token-grid">
          <div><dt>SUPPLY</dt><dd>1B</dd></div>
          <div><dt>BLOCKCHAIN</dt><dd>Solana</dd></div>
          <div><dt>TAX</dt><dd>0%</dd></div>
          <div><dt>LAUNCH</dt><dd>Pump.fun</dd></div>
        </dl>
        <div className="pb-token-section__actions">
          <a className="pb-button pb-button--primary" href="https://pump.fun" target="_blank" rel="noopener noreferrer">
            VIEW ON PUMP.FUN
            <ArrowIcon />
          </a>
          <a className="pb-button pb-button--ghost" href="https://dexscreener.com" target="_blank" rel="noopener noreferrer">
            VIEW ON DEXSCREENER
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  )
}

function Roadmap() {
  return (
    <section className="pb-roadmap pb-section" aria-labelledby="roadmap-title">
      <div className="pb-shell">
        <div className="pb-section-heading">
          <div>
            <p className="pb-kicker">BLACKWICK TRANSMISSION</p>
            <h2 id="roadmap-title">ROADMAP</h2>
          </div>
          <p>The signal moves deeper into the fog</p>
        </div>
        <div className="pb-roadmap__line" aria-hidden="true" />
        <div className="pb-roadmap__grid">
          {roadmap.map((stage) => (
            <article key={stage.phase}>
              <span className="pb-roadmap__node" aria-hidden="true" />
              <p>{stage.phase}</p>
              <h3>{stage.title}</h3>
              <ul>
                {stage.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer({ onCommunity }: { onCommunity: () => void }) {
  return (
    <footer className="pb-footer">
      <div className="pb-shell pb-footer__top">
        <div>
          <a href="/" className="pb-footer__logo" aria-label="PaperBane home"><PaperBaneLogo /></a>
          <p>Kill the panic Hold the wick</p>
        </div>
        <div className="pb-footer__signal">
          <span>PBANE</span>
          <span>SOLANA</span>
        </div>
        <nav className="pb-footer__nav" aria-label="Footer navigation">
          <a href="/play">PLAY GAME</a>
          <button type="button" onClick={onCommunity}>COMMUNITY</button>
        </nav>
        <SocialLinks />
      </div>
      <div className="pb-shell pb-footer__bottom">
        <p>PaperBane is a community-driven entertainment project Crypto assets involve risk</p>
        <span>COPYRIGHT 2026 PAPERBANE</span>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const [activeModal, setActiveModal] = useState<ModalName>(null)
  const closeModal = useCallback(() => setActiveModal(null), [])

  return (
    <div className="pb-site">
      <a className="pb-skip-link" href="#main-content">SKIP TO CONTENT</a>
      <Header onOpenModal={setActiveModal} />
      <main id="main-content">
        <Hero />
        <GamePreview />
        <TokenSection />
        <Roadmap />
      </main>
      <Footer onCommunity={() => setActiveModal('community')} />

      <StoryModal open={activeModal === 'story'} onClose={closeModal} />
      <TokenomicsModal open={activeModal === 'tokenomics'} onClose={closeModal} />
      <CommunityModal open={activeModal === 'community'} onClose={closeModal} />
    </div>
  )
}
