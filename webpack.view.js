const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  entry: {
    view: path.resolve(__dirname, 'src/App/View/index.js'),
  },
  output: {
    filename: 'view.bundle.js',
    path: path.resolve(__dirname, 'dist/view'),
  },
});
