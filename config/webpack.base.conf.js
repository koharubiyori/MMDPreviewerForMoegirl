const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')   // webpack4+的插件，替代extract-text-webpack-plugin
const webpackRules = require('./webpack.rules')

const devMode = process.env.NODE_ENV === 'development'

module.exports = {
  entry: {
    main: path.resolve(__dirname, '../src/main.ts'),
    worker: path.resolve(__dirname, '../src/worker.ts')
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '../dist')
  },

  module: {
    rules: webpackRules
  },

  // externals: {
  //   three: 'three',
  //   jszip: 'JSZip'
  // },

  resolve: {
    extensions: ['.ts', '.js', '.json'], // 如果引入时没带后缀名，则会依次尝试这里定义的后缀名
    alias: {
      stream: 'stream-browserify'
    }
  },

  plugins: [
    // 将样式抽离到单独的css文件
    new MiniCssExtractPlugin({
      filename: devMode ? '[name].css' : '[name].[hash].css',
      chunkFilename: devMode ? '[id].css' : '[id].[hash].css',
    }),
    
    // 创建html文件
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/index.html'),
      hash: true,
      chunks: ['vendors', 'main'],
      minify: devMode ? false : {
        removeComments: true, //移除HTML中的注释
        collapseWhitespace: true, //折叠空白区域 也就是压缩代码
        removeAttributeQuotes: true, //去除属性引用
      }
    }),

    // 拷贝目录
    new CopyWebpackPlugin({
      patterns: [{
        from: path.resolve(__dirname, '../src/static'),
        to: path.resolve(__dirname, '../dist')
      }]
    })
  ],

  optimization: {
    splitChunks: {
      // 建立缓存块，这些生成的文件hash值不会变化，不会导致部署后重新加载
      // cacheGroups: {
      //   vendors: {
      //     test: /[\\/]node_modules[\\/]/,  // 为什么使用[\\/]作为分隔符：防止跨平台分隔符不一致导致出现问题
      //     name: 'vendors',
      //     chunks: 'all'
      //   },

      //   styles: {
      //     test: /[\\/]src[\\/]styles$/,
      //     name: 'styles',
      //     chunks: 'all'
      //   }
      // }
    }
  },
}