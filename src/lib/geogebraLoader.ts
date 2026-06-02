declare global {
  interface Window {
    GGBApplet?: new (
      params: Record<string, unknown>,
      useBrowserForJS?: boolean,
    ) => {
      inject: (target: string | HTMLElement) => void
      getAppletObject: () => GeoGebraApi | null
    }
  }
}

export interface GeoGebraApi {
  exportSVG: (callback: (svg: string | null) => void) => void
  getPNGBase64?: (exportScale: number, transparent: boolean, dpi: number) => string
}

let deployScriptPromise: Promise<void> | null = null

export function loadGeoGebraDeploy(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve()
  if (deployScriptPromise) return deployScriptPromise

  deployScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-geogebra-deploy]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GeoGebra 脚本加载失败')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://www.geogebra.org/apps/deployggb.js'
    script.async = true
    script.dataset.geogebraDeploy = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GeoGebra 脚本加载失败'))
    document.head.appendChild(script)
  })

  return deployScriptPromise
}
