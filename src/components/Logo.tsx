import logoPath from '../assets/boldin.svg?raw'

/** Brandinbold logo. Inherits currentColor, so it adapts to light/dark. */
export function BrandLogo({ size = 30, color }: { size?: number; color?: string }) {
  const svg = logoPath
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<title>.*?<\/title>/, '')
    .replace(
      '<svg ',
      `<svg width="${size}" height="${size}" style="color:${color ?? 'inherit'};flex:none" `
    )
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}
