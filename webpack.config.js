import path from 'node:path';
import { fileURLToPath } from 'node:url';

import CopyPlugin from 'copy-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';
import WorkboxPlugin from 'workbox-webpack-plugin';

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
const ONLINECONF_DEV_TARGET = process.env.ONLINECONF_DEV_TARGET || 'http://127.0.0.1:8091';

export default (env, { mode }) => {
  const isProduction = mode === 'production';
  const onlineConfDemo = !isProduction && process.env.ONLINECONF_DEMO === 'true';
  const hash = isProduction ? '.[contenthash]' : '';

  return {
    entry: {
      main: './src/index.ts',
      onlineconf: './src/admin/index.ts',
    },
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
          test: /\.scss$/,
          // Картинки и шрифты лежат в public/ и подключаются по абсолютным путям, их сборка не трогает.
          use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }, 'sass-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: './src/index.html', chunks: ['main'] }),
      new HtmlWebpackPlugin({
        template: './src/admin/index.html',
        filename: 'admin/onlineconf/index.html',
        chunks: ['onlineconf'],
      }),
      new MiniCssExtractPlugin({ filename: `css/[name]${hash}.css` }),
      new CopyPlugin({ patterns: [{ from: 'public' }] }),
      new webpack.DefinePlugin({
        'process.env.API_URL': JSON.stringify(API_URL),
        'process.env.ONLINECONF_DEMO': JSON.stringify(String(onlineConfDemo)),
      }),
      new ForkTsCheckerWebpackPlugin(),
      ...(isProduction ? [new WorkboxPlugin.InjectManifest({
        swSrc: './src/sw.ts',
        swDest: 'sw.js',
        exclude: [/\.map$/, /^manifest.*\.js$/, /^(admin\/onlineconf\/|(?:css|js)\/onlineconf\.)/],
      })] : []),
    ],
    devServer: {
      port: PORT,
      proxy: [{ context: ['/api/onlineconf'], target: ONLINECONF_DEV_TARGET }],
      historyApiFallback: {
        rewrites: [{ from: /^\/admin\/onlineconf\/?$/, to: '/admin/onlineconf/index.html' }],
      },
      static: false,
      ...(isProduction ? {
        hot: false,
        liveReload: false,
        client: false,
        webSocketServer: false,
        devMiddleware: { etag: 'strong' },
      } : {}),
    },
  };
};
