export const getTranslator = () => {
  try {
    const i18next = require('i18next').default;
    return i18next.t.bind(i18next);
  } catch (error) {
    return (key: string) => key;
  }
};
