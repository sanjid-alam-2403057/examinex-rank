import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export interface PdfExportOptions {
  elementId: string;
  filename?: string;
  reportTitle?: string;
}

/**
 * Downloads a rendered HTML report container as a high-fidelity PDF without needing window.print().
 * Uses html-to-image which natively supports modern CSS (Tailwind v4 oklch colors) via browser SVG rasterization.
 * Includes multi-layer fallbacks so it never fails.
 */
export async function downloadReportAsPdf(
  options: PdfExportOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const element = document.getElementById(options.elementId);
    if (!element) {
      return {
        success: false,
        error: `Element with id #${options.elementId} was not found in DOM.`,
      };
    }

    let imgData: string;

    try {
      // Primary high-fidelity render with native Tailwind v4 oklch support
      imgData = await toPng(element, {
        quality: 0.95,
        backgroundColor: '#FFFFFF',
        pixelRatio: 1.5,
        cacheBust: true,
        filter: (node: Node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-print')) {
            return false;
          }
          return true;
        },
      });
    } catch (renderErr) {
      console.warn('Initial html-to-image capture failed, retrying with skipFonts:', renderErr);
      // Secondary capture with web font embedding disabled to avoid any CORS stylesheet restrictions
      imgData = await toPng(element, {
        quality: 0.92,
        backgroundColor: '#FFFFFF',
        pixelRatio: 1.2,
        skipFonts: true,
        filter: (node: Node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-print')) {
            return false;
          }
          return true;
        },
      });
    }

    // Load image into HTMLImageElement to accurately measure dimensions
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error('Failed to load captured canvas into image'));
      img.src = imgData;
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = 595.28; // A4 width in pt
    const pageHeight = 841.89; // A4 height in pt
    const imgWidth = pageWidth;
    const imgHeight = (img.height * pageWidth) / img.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Render first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    // Handle subsequent pages if report exceeds one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    pdf.save(options.filename || 'examinex_academic_report.pdf');
    return { success: true };
  } catch (err: unknown) {
    console.error('PDF generation error, falling back to vector text PDF:', err);

    // Fallback: Generate a clean, readable vector text PDF directly via jsPDF
    try {
      const fallbackPdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const element = document.getElementById(options.elementId);
      const textContent = element?.innerText || 'Academic Performance Report';

      fallbackPdf.setFont('helvetica', 'bold');
      fallbackPdf.setFontSize(16);
      fallbackPdf.setTextColor(26, 35, 126);
      fallbackPdf.text('EXAMINEX RANK - ACADEMIC DOSSIER', 40, 50);

      fallbackPdf.setFont('helvetica', 'normal');
      fallbackPdf.setFontSize(10);
      fallbackPdf.setTextColor(100, 116, 139);
      fallbackPdf.text(`Generated on ${new Date().toLocaleString()} | Deterministic Grade Analytics`, 40, 68);

      fallbackPdf.setDrawColor(226, 232, 240);
      fallbackPdf.line(40, 78, 555, 78);

      fallbackPdf.setFont('helvetica', 'normal');
      fallbackPdf.setFontSize(9);
      fallbackPdf.setTextColor(15, 23, 42);

      const lines = fallbackPdf.splitTextToSize(textContent, 515);
      let cursorY = 100;
      const lineHeight = 13;

      for (const line of lines) {
        if (cursorY > 800) {
          fallbackPdf.addPage();
          cursorY = 50;
        }
        fallbackPdf.text(line, 40, cursorY);
        cursorY += lineHeight;
      }

      fallbackPdf.save(options.filename || 'examinex_academic_report.pdf');
      return { success: true };
    } catch (fallbackErr) {
      console.error('Even vector PDF fallback failed:', fallbackErr);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Copies the plain-text academic dossier to clipboard as an immediate fallback
 * if iFrame security restricts file downloads.
 */
export async function copyReportToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback using textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}
