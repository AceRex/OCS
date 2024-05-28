const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  entry: {
    controller: path.resolve(__dirname, 'src/App/controller/index.js'),
  },
  output: {
    filename: 'controller.bundle.js',
    path: path.resolve(__dirname, 'dist/controller'),
  },
});
