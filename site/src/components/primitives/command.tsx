import { Dialog } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { getPopupSurfaceClassName } from 'weimo-ui-core/components/popup-surface'
import { cn } from 'weimo-ui-core/lib/utils'

import './command.css'

export function CommandDialog(props: Dialog.Root.Props) {
  return <Dialog.Root {...props} />
}

export type CommandDialogPopupProps = Dialog.Popup.Props & {
  dialogTitle?: ReactNode
}

export function CommandDialogPopup({
  children,
  className,
  dialogTitle = 'Command menu',
  ...props
}: CommandDialogPopupProps) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="coss-command__backdrop" />
      <Dialog.Viewport className="coss-command__viewport">
        <Dialog.Popup
          className={getPopupSurfaceClassName('modal', 'coss-command__popup', className)}
          data-slot="command-dialog-popup"
          {...props}
        >
          <Dialog.Title className="coss-command__sr-only">{dialogTitle}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  )
}

export type CommandInputProps = ComponentPropsWithoutRef<'input'> & {
  action?: ReactNode
}

export function CommandInput({ action, className, ...props }: CommandInputProps) {
  return (
    <div className="coss-command__input" data-slot="command-input">
      <Search />
      <input className={className} {...props} />
      {action}
    </div>
  )
}

export function CommandList({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('coss-command__list', className)}
      data-slot="command-list"
      {...props}
    />
  )
}

export function CommandItem({
  className,
  type = 'button',
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={cn('coss-command__item', className)}
      data-slot="command-item"
      type={type}
      {...props}
    />
  )
}

export function CommandEmpty({
  className,
  ...props
}: ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cn('coss-command__empty', className)}
      data-slot="command-empty"
      {...props}
    />
  )
}

export function CommandFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('coss-command__footer', className)}
      data-slot="command-footer"
      {...props}
    />
  )
}
