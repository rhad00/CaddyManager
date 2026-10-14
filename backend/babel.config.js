// Used by Jest only (babel-jest): it strips the types from .ts files and turns their
// import/export into CommonJS. The production build is tsc (tsconfig.build.json).
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      '@babel/preset-typescript',
    ],
  };
};
