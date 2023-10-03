import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import BundleDeclarationsWebpackPlugin from "bundle-declarations-webpack-plugin";
import type { Configuration } from "webpack";

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";

export default <Configuration>{
  mode: nodeEnv,
  optimization: {
    minimize: isProd,
    innerGraph: true,
    usedExports: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
    ],
  },
  plugins: [new BundleDeclarationsWebpackPlugin()],
  entry: {
    dist: "./src/index.ts",
  },
  output: {
    filename: "h5p-shared-state-client.js",
    path: path.resolve(__dirname, "dist"),
  },
  target: ["web", "es5"], // IE11
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  stats: {
    colors: true,
  },
  devtool: isProd ? undefined : "eval-cheap-module-source-map",
};
