export const INSIGHT_CSS = `
.min-h-screen {
  min-height: 100vh;
}
`;

export const INSIGHT_JS = `
(() => {
  const root = document.getElementById('react-root');
  if (root) {
    root.textContent = 'Insights are unavailable in this build.';
  }
})();
`;

export const EXPORT_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aether Code Export</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
