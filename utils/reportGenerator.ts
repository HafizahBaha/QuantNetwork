export const printElement = (element: HTMLElement, title: string = 'TMFG Analysis Report'): void => {
  // Try standard window.print first if not in a restrictive iframe
  let printedDirectly = false;
  try {
    if (window.self === window.top) {
      window.print();
      return;
    }
  } catch (e) {
    // Restricted by cross-origin iframe security
  }

  // Create an isolated printable iframe or print window to reliably trigger print dialog
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';
  document.body.appendChild(printFrame);

  const frameDoc = printFrame.contentWindow?.document;
  if (!frameDoc) {
    // Fallback directly to window.print
    window.print();
    return;
  }

  // Collect active Tailwind styles and SVG styles
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('\n');

  frameDoc.open();
  frameDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://cdn.tailwindcss.com"></script>
        ${styles}
        <style>
          @page {
            margin: 15mm 15mm;
            size: auto;
          }
          body {
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #ffffff !important;
            color: #1e293b !important;
            padding: 20px;
            margin: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, button, nav, header, footer {
            display: none !important;
          }
          section, table, tr, .bg-white, .rounded-xl {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        </style>
      </head>
      <body>
        <div class="print-content">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `);
  frameDoc.close();

  // Wait for stylesheets and elements to render, then print
  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (err) {
      console.warn("Iframe print blocked, falling back to window.print()", err);
      window.print();
    } finally {
      // Remove temporary iframe after delay
      setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      }, 2000);
    }
  }, 400);
};

export const generatePdfReport = async (element: HTMLElement): Promise<void> => {
  const { jsPDF } = (window as any).jspdf || {};
  const html2canvas = (window as any).html2canvas;

  if (!jsPDF || !html2canvas) {
    // If libraries aren't loaded, trigger standard print dialog which saves to PDF natively
    printElement(element, 'TMFG_Analysis_Report');
    return;
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    logging: false,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  let finalWidth = pdfWidth - 20; // 10mm margins on each side
  let finalHeight = finalWidth / canvasAspectRatio;

  if (finalHeight > (pdfHeight - 20)) {
    finalHeight = pdfHeight - 20;
    finalWidth = finalHeight * canvasAspectRatio;
  }

  const x = (pdfWidth - finalWidth) / 2;
  const y = 10;

  pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
  pdf.save('TMFG_Analysis_Report.pdf');
};
