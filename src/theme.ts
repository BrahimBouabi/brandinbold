import { theme as antdTheme } from 'antd'

// Rea brand: violet accent, our own identity — same layout language as the
// reference design, different name/logo/color.
export const BRAND = {
  name: 'Brandinbold',
  accent: '#8952ef',
  accentHover: '#7440e0'
}

export const lightTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND.accent,
    borderRadius: 8,
    fontFamily:
      "-apple-system, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif",
    colorBgLayout: '#f6f7f9',
    colorBgContainer: '#ffffff'
  },
  components: {
    Menu: { itemBorderRadius: 8 },
    Table: { headerBg: 'transparent' }
  }
}

export const darkTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: BRAND.accent,
    borderRadius: 8,
    fontFamily:
      "-apple-system, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif",
    colorBgLayout: '#101216',
    colorBgContainer: '#171a21',
    colorBgElevated: '#1c2028'
  },
  components: {
    Menu: { itemBorderRadius: 8 },
    Table: { headerBg: 'transparent' }
  }
}
