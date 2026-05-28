import baseConfig from '@vently/config/eslint';

export default [
  ...baseConfig,
  {
    ignores: ['node_modules', '.next', 'build', 'coverage', 'public'],
  },
];
