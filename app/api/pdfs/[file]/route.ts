import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params;

  try {
    const filePath = path.join(
      process.cwd(),
      file.startsWith("public/examples") ? "" : "public/uploads",
      file
    );
    const fileBuffer = await fs.readFile(filePath);

    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error(`Error deleting file ${file}:`, error);
      }
    }, 60_000);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
