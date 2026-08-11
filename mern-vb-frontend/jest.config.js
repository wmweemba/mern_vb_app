// jest.config.js
export default {
  testEnvironment: 'jsdom',
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: ['**/src/**/*.test.js', '**/?(*.)+(spec|test).js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  }
};
