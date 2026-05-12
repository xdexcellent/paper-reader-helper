import { type ReactNode } from 'react'
import { Icon } from './UiIcon'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'

export type DrawerTab = {
  key: string
  label: string
}

type AppDrawerProps = {
  isOpen: boolean
  onClose: () => void
  width?: number
  title?: string
  tabs?: DrawerTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  children: ReactNode
}

export function AppDrawer({
  isOpen,
  onClose,
  width,
  title,
  tabs,
  activeTab,
  onTabChange,
  children,
}: AppDrawerProps) {
  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }} direction="right">
      <DrawerContent style={width ? { maxWidth: width } : undefined}>
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>{title ?? ''}</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="关闭抽屉">
              <Icon name="close" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        {tabs && tabs.length > 0 && (
          <nav className="drawer-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`drawer-tab${activeTab === tab.key ? ' active' : ''}`}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => onTabChange?.(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <div className="drawer-body">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
