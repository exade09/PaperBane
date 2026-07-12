import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from './BrandIcons'

type SiteModalProps = {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  variant?: 'story' | 'token' | 'terminal'
  children: ReactNode
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function SiteModal({
  open,
  onClose,
  title,
  eyebrow,
  variant = 'story',
  children,
}: SiteModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const dialog = dialogRef.current
    const initialTarget = dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog
    requestAnimationFrame(() => initialTarget?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className={`pb-modal-backdrop pb-modal-backdrop--${variant}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <div
        className={`pb-modal pb-modal--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="pb-modal__noise" aria-hidden="true" />
        <div className="pb-modal__signal" aria-hidden="true" />
        <button className="pb-modal__close" type="button" onClick={onClose} aria-label="Close dialog" data-autofocus>
          <CloseIcon />
        </button>
        <div className="pb-modal__content">
          {eyebrow && <p className="pb-kicker">{eyebrow}</p>}
          <h2 id={titleId}>{title}</h2>
          {children}
        </div>
      </div>
    </div>
  )
}
