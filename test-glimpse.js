const fs = require('fs');
const { convertPptxToPng } = require('pptx-glimpse');

const buffer = fs.readFileSync('/Users/rex/Library/Application Support/ocs/media/TFe33beb5d-e502-4448-a67e-cd378462b5dc6e91a826_wac-a9d6f1bb7ba4.pptx');
try {
  convertPptxToPng(buffer).then(pngBuffers => {
    console.log(`Extracted ${pngBuffers.length} pages.`);
    pngBuffers.forEach((buf, i) => {
      fs.writeFileSync(`/tmp/slide-${i}.png`, buf);
      console.log(`Saved slide-${i}.png`);
    });
  });
} catch (e) {
  console.error("Test failed: ", e);
}
