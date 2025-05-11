"use client";

import React, { useEffect, useState, useRef } from "react";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Document, Page } from "react-pdf";
import { CopyIcon } from "@/components/icons";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

interface Checkbox {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
}

interface Question {
  text: string;
  index: string;
  points: string;
  pageNum: number;
  answers: { text: string; checked: boolean; isImage?: boolean }[];
}

export default function Analyzer() {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [numPages, setNumPages] = useState<number>(0);
  const [checkboxes, setCheckboxes] = useState<Checkbox[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pdfVisible, setPdfVisible] = useState(true);
  const [debugVisible, setDebugVisible] = useState(false);
  const [jsonOutput, setJsonOutput] = useState("");
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const analyzePdfRef = useRef(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const file = urlParams.get("file");
    if (file) {
      setPdfUrl(
        file.includes("http") || file.startsWith("/")
          ? file
          : `/api/pdfs/${file}`
      );
    }
  }, []);

  useEffect(() => {
    canvasRefs.current = Array(numPages)
      .fill(null)
      .map(() => document.createElement("canvas"));
  }, [numPages]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (!jsonOutput) {
      analyzePdf();
    }
  };

  const findCheckboxes = async (
    page: any,
    pageNum: number,
    canvas: HTMLCanvasElement
  ) => {
    const viewport = page.getViewport({ scale: 1.3 });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    let renderTask: any = null;
    try {
      renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const checkboxes: Checkbox[] = [];
      const EXPECTED_SIZE = 18;
      const SIZE_TOLERANCE = 5;
      const BORDER_MATCH_THRESHOLD = 0.3;
      const DUPLICATE_DISTANCE_THRESHOLD = 10;

      const visited = new Uint8Array(canvas.width * canvas.height);
      const idx = (x: number, y: number) => y * canvas.width + x;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const pos = idx(x, y);
          if (visited[pos]) continue;
          const i = pos * 4;
          if (
            !isColorMatch(
              imgData.data[i],
              imgData.data[i + 1],
              imgData.data[i + 2]
            )
          )
            continue;

          const stack = [[x, y]];
          visited[pos] = 1;
          let minX = x,
            maxX = x,
            minY = y,
            maxY = y;
          const pixels: [number, number][] = [];

          while (stack.length) {
            const [cx, cy] = stack.pop()!;
            pixels.push([cx, cy]);
            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);

            const neighbors = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ];

            neighbors.forEach(([dx, dy]) => {
              const nx = cx + dx,
                ny = cy + dy;
              if (
                nx >= 0 &&
                nx < canvas.width &&
                ny >= 0 &&
                ny < canvas.height
              ) {
                const npos = idx(nx, ny);
                const ni = npos * 4;
                if (
                  !visited[npos] &&
                  isColorMatch(
                    imgData.data[ni],
                    imgData.data[ni + 1],
                    imgData.data[ni + 2]
                  )
                ) {
                  visited[npos] = 1;
                  stack.push([nx, ny]);
                }
              }
            });
          }

          const boxWidth = maxX - minX + 1;
          const boxHeight = maxY - minY + 1;

          const fittingSize =
            boxWidth >= EXPECTED_SIZE - SIZE_TOLERANCE &&
            boxWidth <= EXPECTED_SIZE + SIZE_TOLERANCE &&
            boxHeight >= EXPECTED_SIZE - SIZE_TOLERANCE &&
            boxHeight <= EXPECTED_SIZE + SIZE_TOLERANCE;

          if (fittingSize) {
            const totalBorderPixels = 2 * (boxWidth + boxHeight) - 4;
            let matchBorder = 0;

            for (let xx = minX; xx <= maxX; xx++) {
              [minY, maxY].forEach((yy) => {
                const bi = idx(xx, yy) * 4;
                if (
                  isColorMatch(
                    imgData.data[bi],
                    imgData.data[bi + 1],
                    imgData.data[bi + 2]
                  )
                )
                  matchBorder++;
              });
            }

            for (let yy = minY + 1; yy < maxY; yy++) {
              [minX, maxX].forEach((xx) => {
                const bi = idx(xx, yy) * 4;
                if (
                  isColorMatch(
                    imgData.data[bi],
                    imgData.data[bi + 1],
                    imgData.data[bi + 2]
                  )
                )
                  matchBorder++;
              });
            }

            if (matchBorder / totalBorderPixels >= BORDER_MATCH_THRESHOLD) {
              let fillCount = 0;
              for (let yy = minY + 1; yy < maxY; yy++) {
                for (let xx = minX + 1; xx < maxX; xx++) {
                  const fi = idx(xx, yy) * 4;
                  if (
                    isColorMatch(
                      imgData.data[fi],
                      imgData.data[fi + 1],
                      imgData.data[fi + 2]
                    )
                  )
                    fillCount++;
                }
              }
              const area = (boxWidth - 2) * (boxHeight - 2);
              const filled = fillCount / area > 0.5;

              const centerX = (minX + maxX) / 2;
              const centerY = (minY + maxY) / 2;

              const isDuplicate = checkboxes.some((checkbox) => {
                if (checkbox.pageNum !== pageNum) return false;
                const distance = Math.sqrt(
                  Math.pow(checkbox.x - centerX, 2) +
                    Math.pow(checkbox.y - centerY, 2)
                );
                return distance < DUPLICATE_DISTANCE_THRESHOLD;
              });

              if (!isDuplicate) {
                checkboxes.push({
                  pageNum,
                  x: centerX,
                  y: centerY,
                  width: boxWidth,
                  height: boxHeight,
                  filled,
                });
              }
            }
          }
        }
      }

      return checkboxes;
    } catch (error) {
      console.error("Render error:", error);
      return [];
    } finally {
      if (renderTask && renderTask.cancel) {
        renderTask.cancel();
      }
    }
  };

  const isColorMatch = (
    r: number,
    g: number,
    b: number,
    targetColor = "#32B09C"
  ) => {
    const hex = targetColor.replace("#", "");
    const targetR = parseInt(hex.substring(0, 2), 16);
    const targetG = parseInt(hex.substring(2, 4), 16);
    const targetB = parseInt(hex.substring(4, 6), 16);
    const tolerance = 25;
    return (
      Math.abs(r - targetR) < tolerance &&
      Math.abs(g - targetG) < tolerance &&
      Math.abs(b - targetB) < tolerance
    );
  };

  const extractQuestionsAndAnswers = async (page: any, pageNum: number) => {
    const textContent = await page.getTextContent();
    const items = textContent.items.map((item: any) => ({
      x: item.transform[4],
      y: item.transform[5],
      text: item.str,
    }));

    const questions: Question[] = [];
    const questionStartPoints: {
      pointsIndex: number;
      indexIndex: number;
      points: string;
      index: string;
      y: number;
    }[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].text.match(/^\d+$/)) {
        const nextIndex = items
          .slice(i + 1)
          .findIndex((item: any) => item.text.match(/^\d+\/\d+$/));
        if (nextIndex !== -1) {
          const pointsItem = items[i];
          const indexItem = items[i + nextIndex + 1];
          questionStartPoints.push({
            pointsIndex: i,
            indexIndex: i + nextIndex + 1,
            points: pointsItem.text,
            index: indexItem.text,
            y: pointsItem.y,
          });
        }
      }
    }

    for (let q = 0; q < questionStartPoints.length; q++) {
      const startPoint = questionStartPoints[q];
      const nextStartPoint = questionStartPoints[q + 1] || {
        pointsIndex: items.length,
      };

      let questionTextStart = startPoint.indexIndex + 1;
      let questionText = "";

      while (
        questionTextStart < nextStartPoint.pointsIndex &&
        questionTextStart < items.length &&
        items[questionTextStart].text.trim() !== ""
      ) {
        questionText +=
          (questionText ? " " : "") + items[questionTextStart].text;
        questionTextStart++;
      }

      if (questionText) {
        const currentQuestion: Question = {
          text: questionText,
          index: startPoint.index,
          points: startPoint.points,
          pageNum: pageNum,
          answers: [],
        };

        while (
          questionTextStart < nextStartPoint.pointsIndex &&
          questionTextStart < items.length &&
          items[questionTextStart].text.trim() === ""
        ) {
          questionTextStart++;
        }

        let hasTextAnswers = false;
        for (let i = questionTextStart; i < nextStartPoint.pointsIndex; i++) {
          if (items[i] && items[i].text && items[i].text.trim() !== "") {
            hasTextAnswers = true;
            break;
          }
        }

        if (hasTextAnswers) {
          while (
            questionTextStart < nextStartPoint.pointsIndex &&
            questionTextStart < items.length
          ) {
            if (items[questionTextStart].text.trim() === "") {
              questionTextStart++;
              continue;
            }
            currentQuestion.answers.push({
              text: items[questionTextStart].text,
              checked: false,
            });
            questionTextStart++;
          }
        } else {
          let checkboxStartIndex = questions.reduce(
            (sum, q) => sum + q.answers.length,
            0
          );
          const relevantCheckboxes: Checkbox[] = [];
          let lastY: number | null = null;
          let groupCount = 0;

          for (let i = checkboxStartIndex; i < checkboxes.length; i++) {
            const cb = checkboxes[i];
            if (cb.pageNum !== pageNum) continue;
            if (lastY === null || Math.abs(cb.y - lastY) < 20) {
              relevantCheckboxes.push(cb);
              lastY = cb.y;
              groupCount++;
            } else if (groupCount > 0) {
              break;
            }
          }

          for (let i = 0; i < relevantCheckboxes.length; i++) {
            currentQuestion.answers.push({
              text: `[Image ${i + 1}]`,
              isImage: true,
              checked: false,
            });
          }
        }

        if (currentQuestion.answers.length > 0) {
          questions.push(currentQuestion);
        }
      }
    }

    return questions;
  };

  const analyzePdf = async () => {
    if (analyzePdfRef.current) return;
    analyzePdfRef.current = true;

    try {
      const pdf = await pdfjs.getDocument(pdfUrl).promise;
      const allCheckboxes: Checkbox[] = [];
      const allQuestions: Question[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const canvas =
          canvasRefs.current[pageNum - 1] || document.createElement("canvas");
        const pageCheckboxes = await findCheckboxes(page, pageNum, canvas);
        allCheckboxes.push(...pageCheckboxes);
        const pageQuestions = await extractQuestionsAndAnswers(page, pageNum);
        allQuestions.push(...pageQuestions);
      }

      const checkboxesByPage: { [key: number]: Checkbox[] } = {};
      allCheckboxes.forEach((cb) => {
        if (!checkboxesByPage[cb.pageNum]) checkboxesByPage[cb.pageNum] = [];
        checkboxesByPage[cb.pageNum].push(cb);
      });

      const questionsByPage: { [key: number]: Question[] } = {};
      allQuestions.forEach((q) => {
        if (!questionsByPage[q.pageNum]) questionsByPage[q.pageNum] = [];
        questionsByPage[q.pageNum].push(q);
      });

      Object.keys(questionsByPage).forEach((pageNum: any) => {
        const pageQuestions = questionsByPage[pageNum];
        const pageCheckboxes = checkboxesByPage[pageNum] || [];
        let checkboxIndex = 0;
        for (const question of pageQuestions) {
          for (let i = 0; i < question.answers.length; i++) {
            if (checkboxIndex < pageCheckboxes.length) {
              question.answers[i].checked =
                pageCheckboxes[checkboxIndex].filled;
              checkboxIndex++;
            }
          }
        }
      });

      setCheckboxes(allCheckboxes);
      setQuestions(allQuestions);
      setJsonOutput(
        JSON.stringify(
          { totalQuestions: allQuestions.length, questions: allQuestions },
          null,
          2
        )
      );
    } catch (error) {
      console.error("Analyze PDF error:", error);
    } finally {
      analyzePdfRef.current = false;
    }
  };

  const toggleDebugOverlay = () => {
    setDebugVisible(!debugVisible);
    if (debugVisible) {
      canvasRefs.current.forEach((canvas) => {
        if (canvas) {
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            analyzePdf(); 
          }
        }
      });
    }
  };

  useEffect(() => {
    if (!debugVisible || !checkboxes.length) return;

    canvasRefs.current.forEach((canvas, index) => {
      if (canvas) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const pageNum = index + 1;
          const pageCheckboxes = checkboxes.filter(
            (cb) => cb.pageNum === pageNum
          );
          pageCheckboxes.forEach((cb, i) => {
            ctx.strokeStyle = cb.filled ? "blue" : "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(
              cb.x - cb.width / 2,
              cb.y - cb.height / 2,
              cb.width,
              cb.height
            );
            ctx.fillStyle = cb.filled ? "blue" : "red";
            ctx.font = "12px Arial";
            ctx.fillText(
              i.toString(),
              cb.x - cb.width / 2 - 15,
              cb.y - cb.height / 2 - 3 + 15
            );
          });
        }
      }
    });
  }, [debugVisible, checkboxes]);

  const copyJson = () => {
    navigator.clipboard.writeText(jsonOutput);
  };

  const downloadJson = () => {
    const blob = new Blob([jsonOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz_results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-4">
      <Card className="w-full max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">PDF екстрактор</h1>

        <div className="flex gap-2 mb-4">
          <Button onPress={analyzePdf} disabled={!numPages}>
            Анализирай ПДФ
          </Button>
          <Button variant="flat" onPress={() => setPdfVisible(!pdfVisible)}>
            {pdfVisible ? "Скрий ПДФ" : "Покажи ПДФ"}
          </Button>
          <Button variant="flat" onPress={toggleDebugOverlay}>
            {debugVisible ? "Скрий Debug" : "Покажи Debug"}
          </Button>
        </div>

        {jsonOutput && (
          <Card className="p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">
                Данни за отметките (JSON)
              </h2>
              <div className="flex gap-2">
                <Button isIconOnly onPress={copyJson}>
                  <CopyIcon className="h-5 w-5" />
                </Button>
                <Button onPress={downloadJson}>Изтегли JSON</Button>
              </div>
            </div>
            <textarea
              value={jsonOutput}
              readOnly
              className="w-full h-96 font-mono text-sm p-2 border rounded"
            />
          </Card>
        )}

        {pdfVisible && (
          <div className="mb-6">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              className="flex flex-col gap-4">
              {Array.from({ length: numPages }, (_, i) => (
                <div key={i} className="relative">
                  <Page
                    pageNumber={i + 1}
                    scale={1.3}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-md"
                  />
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current[i] = el;
                    }}
                    className="absolute top-0 left-0 pointer-events-none"
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </Card>
    </div>
  );
}
