import zh from './zh';
import en from './en';

export const locales = {
  zh,
  en
};

export type LocaleKey = keyof typeof zh;

export const getLocale = (lang: string) => {
  if (lang.startsWith('zh')) {
    return locales.zh;
  }
  return locales.en;
};
