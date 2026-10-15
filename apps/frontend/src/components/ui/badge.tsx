import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.01em]',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-canvas text-muted',
        success: 'border-success/15 bg-success-soft text-success',
        warning: 'border-warning/20 bg-warning-soft text-warning-strong',
        danger: 'border-danger/15 bg-danger-soft text-danger',
        info: 'border-info/15 bg-info-soft text-info',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
