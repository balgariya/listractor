import { NextResponse } from "next/server";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

const upload = multer({ dest: "public/uploads/" });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = path.join(process.cwd(), "public/uploads", fileName);

    await fs.writeFile(filePath, new Uint8Array(await file.arrayBuffer()));

    return NextResponse.json({ fileName });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

