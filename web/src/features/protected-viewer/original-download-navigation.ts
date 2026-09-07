export function navigateToOriginalDownload(url: string): void {
  const link = document.createElement('a')
  try {
    link.href = url
    link.target = '_self'
    link.rel = 'noopener noreferrer'
    link.referrerPolicy = 'no-referrer'
    // The authorized URL returns Content-Disposition: attachment. A same-context
    // navigation works even after a slow request has exhausted click activation.
    link.click()
  } finally {
    // Keep the capability only for the immediate navigation, never in the DOM/state.
    link.removeAttribute('href')
    link.remove()
  }
}
