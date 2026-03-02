const DEFAULT_GOTENBERG_URL = "https://gotenberg-8-71g5.onrender.com";
const GOTENBERG_URL = import.meta.env.VITE_GOTENBERG_URL || DEFAULT_GOTENBERG_URL;

type ExportRenderedDiscussionParams = {
  title: string;
  element: HTMLElement;
};

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "discussion";
}

function cloneWithCanvasAsImage(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const sourceCanvases = source.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");

  sourceCanvases.forEach((canvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) return;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "chart";
      img.style.width = `${canvas.clientWidth || canvas.width}px`;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      cloneCanvas.replaceWith(img);
    } catch {
      // If canvas is tainted, keep original canvas element.
    }
  });

  clone.querySelectorAll("button, input, textarea, select").forEach((node) => node.remove());
  return clone;
}

function collectHeadStyles(): string {
  const nodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
  return nodes
    .map((node) => {
      if (node.tagName.toLowerCase() === "style") {
        return node.outerHTML;
      }
      const link = node as HTMLLinkElement;
      const href = link.href;
      if (!href) return "";
      return `<link rel="stylesheet" href="${href}">`;
    })
    .join("\n");
}

function buildRenderedHtmlDocument(title: string, html: string): string {
  const headStyles = collectHeadStyles();

  return `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${headStyles}
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #ffffff;
    }
    .pdf-root {
      max-width: 1200px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="pdf-root">${html}</div>
</body>
</html>
`;
}

export async function exportRenderedDiscussionToPdf({
  title,
  element
}: ExportRenderedDiscussionParams): Promise<{ blob: Blob; fileName: string }> {
  const renderedClone = cloneWithCanvasAsImage(element);
  const htmlDocument = buildRenderedHtmlDocument(title, renderedClone.outerHTML);

  const formData = new FormData();
  const htmlBlob = new Blob([htmlDocument], { type: "text/html" });
  formData.append("files", htmlBlob, "index.html");

  const response = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Export PDF impossible (${response.status}): ${text || "reponse vide"}`);
  }

  return {
    blob: await response.blob(),
    fileName: `${sanitizeFileName(title)}.pdf`
  };
}
