// shared-config.js

export const basePageUrl = 'https://automationintesting.online';
export const baseApiUrl = 'https://automationintesting.online'; // or wherever your API lives
export const defaultCustomDarkCSS = `
  body {
    background: grey;
  }
`;
export const defaultViewPortResolution = {
  desktop: {
    width: 1396,
    height: 480,
  },
  mobile: {
    width: 600,
    height: 480,
  },
};

// Optionally, export as a default object if you prefer importing a single config object:
export default {
  basePageUrl,
  baseApiUrl,
  defaultCustomDarkCSS,
  defaultViewPortResolution,
};
