// Used by Jest only (babel-jest): it strips the types from .ts files and turns their
// import/export into CommonJS. The production build is tsc (tsconfig.build.json).
// Only .ts files are transformed with these presets: the .js files run in Jest as they
// run in production (plain CommonJS scripts, no implicit "use strict"); babel-jest adds
// jest.mock hoisting to every file on its own.
module.exports = (api) => {
  api.cache(true);
  return {
    overrides: [
      {
        test: /\.ts$/,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  };
};
