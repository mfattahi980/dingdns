import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string
  /** Optional override for the button class (icon-only mode) */
  className?: string
  /** Tooltip title attribute */
  title?: string
  /** If provided, the button renders as a labeled button (icon + text) instead of icon-only */
  label?: string
  /** Optional callback fired after a successful copy */
  onCopied?: () => void
  /** Hide the floating "Copied!" tooltip (useful when the label itself flips to "Copied!") */
  hideTooltip?: boolean
}

/**
 * Reusable copy-to-clipboard button.
 *
 * - Icon-only mode (default): renders a small icon button that swaps Copy ↔ Check
 *   on success, and pops a "Copied!" tooltip above the button. The tooltip uses
 *   z-[60] so it renders above z-50 modals.
 * - Labeled mode: pass `label` to render a full button (e.g. "Copy All & Close").
 *   The label itself flips to "Copied!" for 2s.
 *
 * Falls back to `document.execCommand('copy')` on browsers/contexts where
 * `navigator.clipboard` is unavailable (e.g. plain HTTP in dev).
 */
export default function CopyButton({
  text,
  className,
  title = 'Copy',
  label,
  onCopied,
  hideTooltip,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    let ok = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        ok = true
      } else {
        // Fallback for non-secure contexts (e.g. http://localhost over LAN)
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch (err) {
      console.error('Copy failed:', err)
    }
    if (ok) {
      setCopied(true)
      onCopied?.()
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const iconOnlyClass =
    className ??
    'p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors'
  const labelClass =
    className ??
    'w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors'

  if (label) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={labelClass}
        title={title}
      >
        {copied ? (
          <Check className="w-4 h-4" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
        <span>{copied ? 'Copied!' : label}</span>
      </button>
    )
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleCopy}
        className={iconOnlyClass}
        title={title}
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      {copied && !hideTooltip && (
        <span
          role="status"
          className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap shadow-lg z-[60]"
        >
          Copied!
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}
