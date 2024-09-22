import type { Config } from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
    verbose: true,
    transform: {
        "^.+\\.tsx?$": "ts-jest"
    },
    testPathIgnorePatterns: [ "<rootDir>/node_modules/", "<rootDir>/dist/", "<rootDir>/src/" ]
};
export default config;
