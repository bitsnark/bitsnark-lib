import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        },
        languageOptions: {
            globals: {
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
