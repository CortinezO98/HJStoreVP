// Configuración base compatible con ESLint 9.
// Reglas de seguridad sintáctica para el frontend legado y los nuevos componentes.
// Se puede endurecer gradualmente con react-hooks y react-refresh.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-unsafe-finally': 'error',
      'valid-typeof': 'error',
    },
  },
]
