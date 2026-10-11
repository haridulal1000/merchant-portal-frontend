/**
 * Runtime configuration.
 *
 * For a take-home we keep a single environment file. In a larger project
 * we would split into environment.ts (prod) and environment.development.ts
 * with fileReplacements in angular.json.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
} as const;