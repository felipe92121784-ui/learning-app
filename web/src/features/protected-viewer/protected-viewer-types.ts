export type AbsoluteApiUrl = `http://${string}` | `https://${string}`

export interface ProtectedDerivative {
  id: number
  pageNumber: number | null
  width: number
  height: number
  position: number
  contentUrl: AbsoluteApiUrl
}

export type ProtectedViewer =
  | { kind: 'PDF_PAGES'; derivatives: ProtectedDerivative[] }
  | { kind: 'IMAGE_PREVIEW'; derivatives: [ProtectedDerivative] }

export interface ProtectedMaterialView {
  id: number
  title: string
  type: 'PDF' | 'IMAGE' | 'ZIP'
  viewer: ProtectedViewer | null
  download: { allowed: boolean }
}

export interface OriginalDownload {
  url: string
  expiresAt: string
}
