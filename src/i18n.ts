import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import fr from './locales/fr'
import es from './locales/es'
import pt from './locales/pt'
import ru from './locales/ru'
import zh from './locales/zh'
import vi from './locales/vi'

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' }
]

void i18n.use(initReactI18next).init({
  resources: { en, fr, es, pt, ru, zh, vi },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
