import { type ReactNode } from 'react'
import { Icon } from './UiIcon'

export type DrawerTab = {
  key: string
  label: string
}

type DrawerProps = {
  isOpen: boolean
  onClose: () => void
  width?: number
  title?: string
  tabs?: DrawerTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  children: ReactNode
}

export function Drawer({
  isOpen,
  onClose,
  width = 380,
  title,
  tabs,
  activeTab,
  onTabChange,
  children,
}: DrawerProps) {
  return (
    <div
      className={`drawer-overlay${isOpen ? ' open' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      aria-hidden={!isOpen}
    >
      <div
        className="drawer-panel"
        style={{ width: `${width}px`, maxWidth: '100vw' }}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '抽屉面板'}
      >
        <header className="drawer-header">
          <h2>{title ?? ''}</h2>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            type="button"
            aria-label="关闭抽屉"
          >
            <Icon name="close" />
          </button>
        </header>
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
      </div>
    </div>
  )
}
