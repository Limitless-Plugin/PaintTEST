const canvas = document.querySelector("#paintCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const toolButtons = [...document.querySelectorAll(".tool-button")];
const swatches = [...document.querySelectorAll(".swatch")];
const colorInput = document.querySelector("#colorInput");
const sizeInput = document.querySelector("#sizeInput");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");
const statusText = document.querySelector("#statusText");
const sizeText = document.querySelector("#sizeText");

let tool = "pencil";
let color = colorInput.value;
let brushSize = Number(sizeInput.value);
let isDrawing = false;
let startPoint = null;
let lastPoint = null;
let snapshot = null;
let undoStack = [];
let redoStack = [];

const MAX_HISTORY = 40;

function setInitialCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveHistory();
  updateHistoryButtons();
}

function saveHistory() {
  undoStack.push(canvas.toDataURL("image/png"));
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  updateHistoryButtons();
}

function restoreFromDataUrl(dataUrl, callback) {
  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    if (callback) callback();
  };
  image.src = dataUrl;
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length <= 1;
  redoButton.disabled = redoStack.length === 0;
}

function updateStatus(message) {
  statusText.textContent = message;
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: Math.round((event.clientX - rect.left) * scaleX),
    y: Math.round((event.clientY - rect.top) * scaleY),
  };
}

function configureStroke() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushSize;
  ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
  ctx.fillStyle = color;
}

function drawSegment(from, to) {
  configureStroke();
  ctx.beginPath();

  if (from.x === to.x && from.y === to.y) {
    ctx.arc(from.x, from.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.fill();
  } else {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function drawPreviewShape(from, to) {
  ctx.putImageData(snapshot, 0, 0);
  configureStroke();

  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);

  ctx.beginPath();

  if (tool === "line") {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }

  if (tool === "rectangle") {
    ctx.rect(x, y, width, height);
  }

  if (tool === "ellipse") {
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  }

  ctx.stroke();
}

function colorsMatch(data, index, target) {
  return data[index] === target[0]
    && data[index + 1] === target[1]
    && data[index + 2] === target[2]
    && data[index + 3] === target[3];
}

function hexToRgba(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function floodFill(point) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const targetIndex = (point.y * canvas.width + point.x) * 4;
  const targetColor = [
    data[targetIndex],
    data[targetIndex + 1],
    data[targetIndex + 2],
    data[targetIndex + 3],
  ];
  const replacement = hexToRgba(color);

  if (colorsMatch([...targetColor], 0, replacement)) return;

  const stack = [point];
  const seen = new Uint8Array(canvas.width * canvas.height);

  while (stack.length) {
    const current = stack.pop();

    if (current.x < 0 || current.x >= canvas.width || current.y < 0 || current.y >= canvas.height) {
      continue;
    }

    const pixel = current.y * canvas.width + current.x;
    if (seen[pixel]) continue;
    seen[pixel] = 1;

    const index = pixel * 4;
    if (!colorsMatch(data, index, targetColor)) continue;

    data[index] = replacement[0];
    data[index + 1] = replacement[1];
    data[index + 2] = replacement[2];
    data[index + 3] = replacement[3];

    stack.push({ x: current.x + 1, y: current.y });
    stack.push({ x: current.x - 1, y: current.y });
    stack.push({ x: current.x, y: current.y + 1 });
    stack.push({ x: current.x, y: current.y - 1 });
  }

  ctx.putImageData(imageData, 0, 0);
}

function beginDraw(event) {
  const point = getCanvasPoint(event);

  if (tool === "fill") {
    floodFill(point);
    saveHistory();
    updateStatus(`Filled at ${point.x}, ${point.y}`);
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  startPoint = point;
  lastPoint = point;
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (tool === "pencil" || tool === "eraser") {
    drawSegment(point, point);
  }
}

function continueDraw(event) {
  if (!isDrawing) return;

  const point = getCanvasPoint(event);
  updateStatus(`${tool} ${point.x}, ${point.y}`);

  if (tool === "pencil" || tool === "eraser") {
    drawSegment(lastPoint, point);
    lastPoint = point;
    return;
  }

  drawPreviewShape(startPoint, point);
}

function endDraw(event) {
  if (!isDrawing) return;

  if (tool !== "pencil" && tool !== "eraser") {
    drawPreviewShape(startPoint, getCanvasPoint(event));
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  isDrawing = false;
  snapshot = null;
  saveHistory();
  updateStatus("Ready");
}

function setTool(nextTool) {
  tool = nextTool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  updateStatus(`${buttonLabel(nextTool)} selected`);
}

function buttonLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setColor(nextColor) {
  color = nextColor;
  colorInput.value = nextColor;
  swatches.forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.color.toLowerCase() === nextColor.toLowerCase());
  });
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

swatches.forEach((swatch) => {
  swatch.style.setProperty("--swatch", swatch.dataset.color);
  swatch.addEventListener("click", () => setColor(swatch.dataset.color));
});

colorInput.addEventListener("input", () => setColor(colorInput.value));

sizeInput.addEventListener("input", () => {
  brushSize = Number(sizeInput.value);
  updateStatus(`Size ${brushSize}px`);
});

undoButton.addEventListener("click", () => {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  restoreFromDataUrl(undoStack[undoStack.length - 1], updateHistoryButtons);
  updateStatus("Undo");
});

redoButton.addEventListener("click", () => {
  if (!redoStack.length) return;
  const dataUrl = redoStack.pop();
  undoStack.push(dataUrl);
  restoreFromDataUrl(dataUrl, updateHistoryButtons);
  updateStatus("Redo");
});

clearButton.addEventListener("click", () => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  saveHistory();
  updateStatus("Canvas cleared");
});

saveButton.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "paint-drawing.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  updateStatus("PNG saved");
});

canvas.addEventListener("pointerdown", beginDraw);
canvas.addEventListener("pointermove", continueDraw);
canvas.addEventListener("pointerup", endDraw);
canvas.addEventListener("pointercancel", endDraw);
canvas.addEventListener("pointerleave", (event) => {
  if (isDrawing) endDraw(event);
});

sizeText.textContent = `${canvas.width} x ${canvas.height} px`;
setInitialCanvas();
