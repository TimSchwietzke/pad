import { X as XIcon } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { shortcutSections } from './shortcuts'

/**
 * The help sheet: what pad answers to without a mouse. Opened with "?" or from
 * the sidebar, dismissed with Escape or a click outside.
 *
 * A modal earns its place here — it's a reference the user calls up mid-task and
 * dismisses seconds later, and it must not push the list around while they read
 * it. Each section is a definition list (keys define, text describes), so it
 * reads as "c: start a new task" to a screen reader too.
 *
 * @param open whether the sheet is showing
 * @param onOpenChange called with false when the sheet asks to close
 */
export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shortcuts" aria-describedby="shortcuts-intro">
        {/* escape and a click outside both close it — this is the visible way out */}
        <DialogClose className="shortcuts__x" aria-label="close">
          <XIcon size={16} />
        </DialogClose>
        <DialogTitle className="shortcuts__title">keyboard shortcuts</DialogTitle>
        <DialogDescription id="shortcuts-intro" className="shortcuts__intro">
          every task can be reached, edited and reordered without a mouse. keys are ignored while you type.
        </DialogDescription>

        {shortcutSections.map((section) => (
          <section className="shortcuts__group" key={section.title}>
            <h3 className="shortcuts__section">{section.title}</h3>
            <dl className="shortcuts__list">
              {section.items.map((item) => (
                <div className="shortcuts__row" key={item.what}>
                  <dt className="shortcuts__keys">
                    {item.keys.map((key) => (
                      <kbd className="kbd" key={key}>
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="shortcuts__what">{item.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  )
}
