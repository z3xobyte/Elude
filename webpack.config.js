const path = require("path");
const nodeExternals = require("webpack-node-externals");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const mode =
  process.env.NODE_ENV === "development" ? "development" : "production";

const clientConfig = {
  name: "client",
  mode: mode,
  entry: {
    game: "./public/js/game.js",
  },
  output: {
    path: path.resolve(__dirname, "dist/public/js"),
    filename: "[name].js",
    publicPath: "/js/",
  },
  resolve: {
    extensions: [".js", ".mjs"],
    modules: ["node_modules"],
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules\/(?!(pako)\/).*/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  modules: false,
                  targets: "defaults",
                },
              ],
            ],
          },
        },
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "public",
          to: "../",
          globOptions: {
            ignore: ["**/js/**"],
          },
        },
      ],
    }),
  ],
  optimization:
    mode === "production"
      ? {
          minimize: true,
          minimizer: [
            new TerserPlugin({
              terserOptions: {
                format: {
                  comments: false,
                },
                compress: {
                  drop_console: true,
                },
              },
              extractComments: false,
            }),
          ],
        }
      : undefined,
};

const serverConfig = {
  name: "server",
  mode: mode,
  target: "node",
  node: {
    __dirname: false,
  },
  externals: [nodeExternals()],
  entry: {
    server: "./game_server.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".js"],
    modules: ["node_modules"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "game/maps",
          to: "maps",
        },
      ],
    }),
  ],
};

module.exports = [clientConfig, serverConfig];
