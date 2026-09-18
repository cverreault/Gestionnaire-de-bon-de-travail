module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // drizzle migrations are bundled as .sql text (B38.4)
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
