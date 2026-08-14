const React = require('react');
const ReactDOMServer = require('react-dom/server');
require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react'],
  plugins: ['@babel/plugin-transform-runtime']
});
try {
  const MiniPreview = require('./src/App/controller/MiniPreview').default;
  const SettingsController = require('./src/App/controller/SettingsController').default;
  console.log("MiniPreview rendering:");
  ReactDOMServer.renderToString(React.createElement(MiniPreview, { mode: 'general' }));
  console.log("SettingsController rendering:");
  ReactDOMServer.renderToString(React.createElement(SettingsController));
  console.log("Both rendered successfully.");
} catch (e) {
  console.error("Crash during render:", e);
}
