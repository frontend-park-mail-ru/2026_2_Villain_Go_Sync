import path from 'node:path';
import { fileURLToPath } from 'node:url';

import CopyPlugin from 'copy-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Настройки можно положить в файл .env в корне проекта. Переменные, уже заданные в окружении, он не перекрывает.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

const PORT = Number(process.env.PORT) || 8000;
const API_URL = (process.env.API_URL || 'http://localhost:8080/api').replace(/\/+$/, '');

export default (env, { mode }) => {
  const isProduction = mode === 'production';
  const hash = isProduction ? '.[contenthash]' : '';

  return {
    entry: './src/index.ts',
    output: {
      path: path.join(rootDir, 'dist'),
      filename: `js/[name]${hash}.js`,
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        { test: /\.ts$/, exclude: /node_modules/, loader: 'babel-loader' },
        { test: /\.hbs$/, loader: 'handlebars-loader' },
        {
          test: /\.css$/,
          // Картинки и шрифты лежат в public/ и подключаются по абсолютным путям, их сборка не трогает.
          use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './src/index.html' }),
      new MiniCssExtractPlugin({ filename: `css/[name]${hash}.css` }),
      new CopyPlugin({ patterns: [{ from: 'public' }] }),
      new webpack.DefinePlugin({ 'process.env.API_URL': JSON.stringify(API_URL) }),
      new ForkTsCheckerWebpackPlugin(),
    ],
    devServer: {
      port: PORT,
      historyApiFallback: true,
      static: false,
    },
  };
};
