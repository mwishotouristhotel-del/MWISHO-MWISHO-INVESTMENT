import globals from 'globals';
export default [{
  files: ['src/WebsiteManager.jsx'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {ecmaFeatures:{jsx:true}},
    globals: {...globals.browser, ...globals.es2024}
  },
  rules: {'no-undef':'error'}
}];
