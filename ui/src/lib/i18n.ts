import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getInitialLocale } from './locales';
import en from './i18n/en.json';
import ptBR from './i18n/pt-BR.json';
import zhCN from './i18n/zh-CN.json';
import vi from './i18n/vi.json';
import ja from './i18n/ja.json';
import ko from './i18n/ko.json';

const resources = {
  en: en,
  'pt-BR': ptBR,
  'zh-CN': zhCN,
  vi: vi,
  ja: ja,
  ko: ko,
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLocale(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
