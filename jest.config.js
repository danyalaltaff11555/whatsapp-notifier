module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/packages'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
        'packages/**/src/**/*.ts',
        '!packages/**/src/**/*.d.ts',
        '!packages/**/src/**/*.spec.ts',
        '!packages/**/src/**/*.test.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    moduleNameMapper: {
        '^@whatsapp-notif/shared$': '<rootDir>/packages/shared/src',
        '^@whatsapp-notif/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    },
    modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/build/'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    verbose: true,
};
