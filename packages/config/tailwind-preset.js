/**
 * Tailwind v4 preset for Vently.
 *
 * v4 uses CSS-first configuration via @theme blocks in your globals.css,
 * so this preset is intentionally minimal. It exists as the single source
 * of truth for any shared content paths and plugin requirements.
 *
 * Color tokens live in apps/web/src/styles/globals.css (and packages/ui/styles
 * if/when we add Storybook). Do not duplicate them here.
 */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/**/*.{ts,tsx}',
  ],
};
