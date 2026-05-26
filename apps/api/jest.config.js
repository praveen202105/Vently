/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { lib: ['ES2022', 'DOM'], experimentalDecorators: true, emitDecoratorMetadata: true } }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    // Strip .js suffixes so Jest resolves TypeScript source files.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve workspace package from source.
    '^@vently/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
};
