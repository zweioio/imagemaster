const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup.tsx',
    sidebar: './src/sidebar.tsx',
    background: './src/background.ts',
    content: './src/content.ts',
    sandbox: './src/sandbox.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
        ],
      },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './public/sidebar.html',
      filename: 'sidebar.html',
      chunks: ['sidebar'],
      inject: 'body', // 显式指定注入位置
      scriptLoading: 'blocking', // 避免 defer 导致的加载时序问题
    }),
    new HtmlWebpackPlugin({
      template: './public/sandbox.html',
      filename: 'sandbox.html',
      chunks: ['sandbox'],
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.json', to: 'manifest.json' },
        { from: 'public/_locales', to: '_locales', noErrorOnMissing: true },
        { from: 'public/models', to: 'models', noErrorOnMissing: true },
        // Explicitly copy u2netp.onnx if it's not picked up by the folder copy (it should be, but just in case)
        // { from: 'public/models/u2netp.onnx', to: 'models/u2netp.onnx', noErrorOnMissing: true },
        { from: 'src/assets', to: 'assets', noErrorOnMissing: true },
        { from: 'node_modules/gif.js/dist/gif.worker.js', to: 'assets/gif.worker.js' },
        // Gifsicle WASM
        { from: 'node_modules/gifsicle-wasm-browser/dist/gifsicle.wasm', to: 'gifsicle.wasm', noErrorOnMissing: true },
      ],
    }),
  ],
};
