import { useCallback, useState } from 'react'

function readCollapsedState(storageKey: string) {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.sessionStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

/** Keeps a desktop sidebar preference only for the current browser session. */
export function useSessionSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsedState(storageKey))

  const setPersistedCollapsed = useCallback(
    (nextCollapsed: boolean) => {
      setCollapsed(nextCollapsed)

      try {
        window.sessionStorage.setItem(storageKey, String(nextCollapsed))
      } catch {
        // Storage can be unavailable in private or embedded browser contexts.
      }
    },
    [storageKey],
  )

  return [collapsed, setPersistedCollapsed] as const
}
