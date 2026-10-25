import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const features = [
  'dashboard',
  'knowledge',
  'plotting',
  'mistakes',
  'assistant',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },
  ...features.map((feature) => ({
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app',
                '@/app/**',
                ...features
                  .filter((name) => name !== feature)
                  .flatMap((name) => [
                    `@/features/${name}`,
                    `@/features/${name}/**`,
                    `**/../${name}`,
                    `**/../${name}/**`,
                  ]),
              ],
              message:
                '功能模块不能引用其他模块或 app；使用 shared 契约与路由通信。',
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/content/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/features/**',
            '@/app/**',
            '**/features/**',
            '**/app/**',
          ],
        },
      ],
    },
  },
);
