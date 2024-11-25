import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            'unused-imports-ts': unusedImports,
        },
        rules: {
            'unused-imports-ts/no-unused-imports': 'error',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        },
        languageOptions: {
            globals: {
                __filename: 'readonly',
                __dirname: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
                exports: 'readonly',
                process: 'readonly',
                require: 'readonly'
            }
        }
    }
);
