module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!src/config/database.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};