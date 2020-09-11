const path = require('path')
const { merge } = require('webpack-merge')
const baseConfig = require('./webpack.base.conf')

module.exports = merge(baseConfig, {
  mode: 'development',
  devtool: 'source-map',

  devServer: {
    contentBase: path.join(__dirname, '../dist'),
    publicPath:'/',
    host: 'localhost',
    port: '8089',
    overlay: true, // 浏览器页面上显示错误
    // open: true, // 开启自动打开浏览器
    // stats: 'errors-only', //stats: "errors-only"表示只打印错误：
    hot: true,// 开启热更新
  }
})