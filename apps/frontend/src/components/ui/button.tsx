import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background,color,border-color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        default: 'bg-ink text-white shadow-sm hover:bg-ink/90',
        brand: 'bg-brand text-white shadow-sm hover:bg-brand-strong',
        outline: 'border border-line bg-surface text-ink hover:bg-canvas',
        ghost: 'text-muted hover:bg-white/8 hover:text-white',
        subtle: 'bg-canvas text-ink hover:bg-line/70',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 px-5',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export function Button({ className, variant, size, asChild, loading = false, loadingText, children, disabled, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return <Slot aria-busy={loading || undefined} className={classes} {...props}>{children}</Slot>;
  }
  return <button aria-busy={loading || undefined} disabled={disabled || loading} className={classes} {...props}>{loading && <LoaderCircle className="size-4 animate-spin" />}{loading && loadingText ? loadingText : children}</button>;
}
