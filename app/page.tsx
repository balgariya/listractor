"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { useRouter } from "next/navigation";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const predefinedPdfs = [
    {
      name: "Кагегория 1 БГ",
      url: "/examples/Category_1_Topic_1_13.10.2023 16_53_54_BG.pdf",
    },
    {
      name: "Категория 1 ЕН",
      url: "/examples/Category_1_Topic_1_13.10.2023 16_54_14_EN.pdf",
    },
    {
      name: "Категория 2 ЕН",
      url: "/examples/Category_2_Topic_13_01.06.2023 17_10_29_EN.pdf",
    },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const { fileName } = await response.json();
      router.push(`/анализатор?file=${encodeURIComponent(fileName)}`);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const handlePredefinedPdf = (url: string) => {
    router.push(`/анализатор?file=${encodeURIComponent(url)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">PDF екстрактор</h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium">
              Качи ПДФ файл
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="w-full p-2 border rounded"
            />
          </div>

          <Button
            onPress={handleUpload}
            isDisabled={!file || uploading}
            isLoading={uploading}
            className="w-full">
            Качи и анализирай
          </Button>

          <div className="pt-4">
            <h2 className="text-lg font-semibold mb-2">
              Примерни ПДФ документи
            </h2>
            {predefinedPdfs.map((pdf) => (
              <Button
                key={pdf.url}
                variant="flat"
                className="w-full mb-2"
                onPress={() => handlePredefinedPdf(pdf.url)}>
                {pdf.name}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
