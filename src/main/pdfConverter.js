/**
 * PDF to Slide Image Converter
 * Uses Electron offscreen renderer and PDF.js to render PDF pages into high-resolution 1080p slide PNGs.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { BrowserWindow } = require('electron');

async function convertPdfToPngSlides(pdfPath, slidesDir, sendProgress = () => {}) {
  await fsp.mkdir(slidesDir, { recursive: true });

  const pdfBuffer = await fsp.readFile(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  // Load an offscreen BrowserWindow with PDF.js to render pages cleanly to data URLs
  const win = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const pdfJsPath = require.resolve('pdfjs-dist/build/pdf.js');
  const pdfWorkerPath = require.resolve('pdfjs-dist/build/pdf.worker.js');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="file://${pdfJsPath}"></script>
        <style>
          body, html { margin: 0; padding: 0; background: #000; overflow: hidden; }
          canvas { display: block; }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = "file://${pdfWorkerPath}";
          window.renderPdfPage = async function(base64Data, pageNum) {
            const raw = atob(base64Data);
            const uint8Array = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              uint8Array[i] = raw.charCodeAt(i);
            }
            const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
            const doc = await loadingTask.promise;
            const numPages = doc.numPages;
            const page = await doc.getPage(pageNum);
            const initialViewport = page.getViewport({ scale: 1 });
            
            // Render at high resolution (target 1920 width)
            const scale = Math.max(1.5, 1920 / initialViewport.width);
            const viewport = page.getViewport({ scale });
            
            const canvas = document.getElementById('pdf-canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            
            // White background for documents with transparent backgrounds
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            await page.render({ canvasContext: ctx, viewport }).promise;
            return {
              dataUrl: canvas.toDataURL('image/png'),
              numPages: numPages,
              width: canvas.width,
              height: canvas.height,
            };
          };
        </script>
      </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  const slideList = [];
  try {
    // Render first page to get total page count
    const firstPageResult = await win.webContents.executeJavaScript(
      `window.renderPdfPage("${pdfBase64}", 1)`
    );

    const totalPages = firstPageResult?.numPages || 1;

    // Save page 1
    const p1Buffer = Buffer.from(firstPageResult.dataUrl.split(',')[1], 'base64');
    const p1Path = path.join(slidesDir, 'slide_1.png');
    await fsp.writeFile(p1Path, p1Buffer);
    slideList.push({
      slideIndex: 0,
      slideNumber: 1,
      url: `file://${p1Path}`,
      notes: '',
      width: firstPageResult.width || 1920,
      height: firstPageResult.height || 1080,
    });

    sendProgress({
      stage: 'converting',
      current: 1,
      total: totalPages,
      percent: Math.round((1 / totalPages) * 100),
      message: `Rendered page 1 of ${totalPages}...`,
    });

    // Render remaining pages
    for (let p = 2; p <= totalPages; p++) {
      const pageResult = await win.webContents.executeJavaScript(
        `window.renderPdfPage("${pdfBase64}", ${p})`
      );
      const pageBuffer = Buffer.from(pageResult.dataUrl.split(',')[1], 'base64');
      const pagePath = path.join(slidesDir, `slide_${p}.png`);
      await fsp.writeFile(pagePath, pageBuffer);
      slideList.push({
        slideIndex: p - 1,
        slideNumber: p,
        url: `file://${pagePath}`,
        notes: '',
        width: pageResult.width || 1920,
        height: pageResult.height || 1080,
      });

      sendProgress({
        stage: 'converting',
        current: p,
        total: totalPages,
        percent: Math.round((p / totalPages) * 100),
        message: `Rendered page ${p} of ${totalPages}...`,
      });
    }
  } finally {
    try {
      win.close();
    } catch (_) {}
  }

  return {
    totalSlides: slideList.length,
    slideList,
  };
}

module.exports = {
  convertPdfToPngSlides,
};
