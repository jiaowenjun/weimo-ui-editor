import type { ComponentPropsWithoutRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { getCardSurfaceClassName } from 'weimo-ui-core/components/card-surface'
import { cn } from 'weimo-ui-core/lib/utils'

import './card.css'

const cardVariants = cva('coss-card', {
  variants: {
    variant: {
      default: '',
      interactive: 'coss-card--interactive',
      strip: 'coss-card--strip',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

const cardPanelVariants = cva('coss-card__panel', {
  variants: {
    variant: {
      default: '',
      code: 'coss-card__panel--code',
      stage: 'coss-card__panel--stage',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export type CardProps = ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof cardVariants>

export type CardPanelProps = ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof cardPanelVariants>

type DivSlotProps = ComponentPropsWithoutRef<'div'> & {
  slot: string
  slotClassName: string
}

function DivSlot({
  className,
  slot,
  slotClassName,
  ...props
}: DivSlotProps) {
  return (
    <div
      className={cn(slotClassName, className)}
      data-slot={slot}
      {...props}
    />
  )
}

export function Card({ className, variant, ...props }: CardProps) {
  return (
    <div
      className={getCardSurfaceClassName(cardVariants({ variant }), className)}
      data-slot="card"
      {...props}
    />
  )
}

export function CardFrame({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={getCardSurfaceClassName('coss-card-frame', className)}
      data-slot="card-frame"
      {...props}
    />
  )
}

export function CardFrameHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-frame-header"
      slotClassName="coss-card-frame__header"
      {...props}
    />
  )
}

export function CardFrameTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-frame-title"
      slotClassName="coss-card-frame__title"
      {...props}
    />
  )
}

export function CardFrameDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-frame-description"
      slotClassName="coss-card-frame__description"
      {...props}
    />
  )
}

export function CardFrameAction({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-frame-action"
      slotClassName="coss-card-frame__action"
      {...props}
    />
  )
}

export function CardFrameFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-frame-footer"
      slotClassName="coss-card-frame__footer"
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-header"
      slotClassName="coss-card__header"
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-title"
      slotClassName="coss-card__title"
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-description"
      slotClassName="coss-card__description"
      {...props}
    />
  )
}

export function CardAction({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-action"
      slotClassName="coss-card__action"
      {...props}
    />
  )
}

export function CardPanel({ className, variant, ...props }: CardPanelProps) {
  return (
    <div
      className={cn(cardPanelVariants({ variant }), className)}
      data-slot="card-panel"
      {...props}
    />
  )
}

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <DivSlot
      className={className}
      slot="card-footer"
      slotClassName="coss-card__footer"
      {...props}
    />
  )
}

export { CardPanel as CardContent }
