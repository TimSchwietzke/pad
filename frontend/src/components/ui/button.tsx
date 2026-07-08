import type { ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui Button, retuned to pad's tokens so the variants match the existing look:
 * `outline` == the old `.ghost-btn`, `icon`+`ghost` == the old `.icon-btn`. Colours/radii
 * resolve through the Tailwind→token mapping, so it themes with preset × mode automatically.
 * The keyboard focus ring is the app-wide one from App.scss (`:focus-visible`), so no ring here.
 */
const buttonVariants = cva(
  // preflight is off in this project, so reset the native button chrome here (border/bg)
  'appearance-none border-0 bg-transparent inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        outline:
          'border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-input',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        default: 'h-9 rounded-button px-4 text-sm',
        sm: 'h-8 rounded-button px-3 text-[0.85rem]',
        icon: 'h-9 w-9 rounded-sm text-[0.8rem]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (Radix Slot) instead of a `<button>`. */
  asChild?: boolean
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
export type { ButtonProps }
