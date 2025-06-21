// Load environment variables from .env file for real tests
require('dotenv').config();

// Jest configuration for real integration tests
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/real-*.test.js'],
  collectCoverageFrom: [
    'supabase.js',
    'server.js',
    'src/**/*.js'
  ],
  // Don't use the setup file for real tests - we want real environment variables
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 30000
}; 