// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `src/generated/**` lo escribe `prisma generate`, no una persona: lintearlo son
    // decenas de errores sobre código que nadie revisa ni puede arreglar, y que tapan
    // los que sí importan. Reaparecen en cuanto se regenera el cliente.
    ignores: ['eslint.config.mjs', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // Sacar una propiedad copiando el resto —`const { clave: _, ...resto } = x`— es la
      // forma de armar un objeto sin ella; la variable que se descarta no es un olvido.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // En los specs, `expect(doble.metodo).toHaveBeenCalled()` es como Jest revisa las
    // llamadas: el método no se invoca suelto y no hay `this` que perder. La propia
    // documentación de typescript-eslint sugiere apagarla en los tests de Jest.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
