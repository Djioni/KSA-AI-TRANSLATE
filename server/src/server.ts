import express, { Request, Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200 MB

// Use venv Python or fallback to system python3
const PYTHON_BIN = process.env.PYTHON_BIN || path.resolve(__dirname, "..", "..", ".venv", "bin", "python");
console.log("Using Python:", PYTHON_BIN);

function mkTempDir(prefix = "rtl_api_"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeBuf(dir: string, name: string, buf: Buffer): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}

function runPython(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const py = spawn(PYTHON_BIN, args, { cwd });
    let out = "";
    let err = "";
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (err += d.toString()));
    py.on("close", (code) => resolve({ code: code ?? 1, stdout: out, stderr: err }));
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /dump-map  (multipart: pptx file field name 'pptx')
app.post("/dump-map", upload.fields([{ name: "pptx", maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    if (!req.files || !(req.files as any).pptx) return res.status(400).json({ error: "Missing pptx file" });
    const pptx = (req.files as any).pptx[0] as Express.Multer.File;

    const tmp = mkTempDir();
    const inPath = writeBuf(tmp, "in.pptx", pptx.buffer);

    const scriptPath = path.resolve(path.join(__dirname, "..", "..", "rtl_pptx_transformer.py"));
    const outMapPath = path.join(tmp, "map.json");
    const { code, stdout, stderr } = await runPython([scriptPath, "dump-map", inPath, "--out", outMapPath], tmp);
    if (code !== 0) {
      console.error(stderr || stdout);
      return res.status(500).json({ error: "dump-map failed", details: stderr || stdout });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(fs.readFileSync(outMapPath, "utf-8"));
    // cleanup
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
});

// POST /transform  (multipart: 'pptx' required, 'map' optional; boolean flags optional)
app.post(
  "/transform",
  upload.fields([
    { name: "pptx", maxCount: 1 },
    { name: "map", maxCount: 1 }
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.files || !(req.files as any).pptx) return res.status(400).json({ error: "Missing pptx file" });
      const pptx = (req.files as any).pptx[0] as Express.Multer.File;
      const map = ((req.files as any).map?.[0] as Express.Multer.File) || null;

      // Query/form flags (default behaviors)
      const flipIcons = (req.body.flipIcons ?? "true").toString().toLowerCase() === "true";
      const arabicDigits = (req.body.arabicDigits ?? "true").toString().toLowerCase() === "true";
      const contrastFix = (req.body.contrastFix ?? "true").toString().toLowerCase() === "true";
      const mirrorPositions = (req.body.mirrorPositions ?? "true").toString().toLowerCase() === "true";
      const arabicFont = (req.body.arabicFont as string) || "Noto Naskh Arabic";

      const tmp = mkTempDir();
      const inPath = writeBuf(tmp, "in.pptx", pptx.buffer);
      const outPath = path.join(tmp, "out_AR.pptx");
      const mapPath = map ? writeBuf(tmp, "map.json", map.buffer) : null;

      const scriptPath = path.resolve(path.join(__dirname, "..", "..", "rtl_pptx_transformer.py"));
      const args = [scriptPath, "transform", inPath, "--out", outPath, "--arabic-font", arabicFont];
      if (mapPath) args.push("--map", mapPath);
      if (flipIcons) args.push("--flip-icons");
      if (arabicDigits) args.push("--arabic-digits");
      if (!contrastFix) args.push("--no-contrast-fix");
      if (!mirrorPositions) args.push("--no-mirror");

      const { code, stdout, stderr } = await runPython(args, tmp);
      if (code !== 0) {
        console.error(stderr || stdout);
        return res.status(500).json({ error: "transform failed", details: stderr || stdout });
      }

      const fileName = (pptx.originalname || "slides").replace(/\.pptx$/i, "") + "_AR.pptx";
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      fs.createReadStream(outPath)
        .on("close", () => fs.rmSync(tmp, { recursive: true, force: true }))
        .pipe(res);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e?.message || "internal error" });
    }
  }
);

// POST /transform-full  (two-agent pipeline: translate+RTL then design fix)
app.post(
  "/transform-full",
  upload.fields([
    { name: "pptx", maxCount: 1 },
    { name: "map", maxCount: 1 }
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.files || !(req.files as any).pptx) return res.status(400).json({ error: "Missing pptx file" });
      const pptx = (req.files as any).pptx[0] as Express.Multer.File;
      const map = ((req.files as any).map?.[0] as Express.Multer.File) || null;

      // Agent T (Translation + RTL) parameters
      const flipIcons = (req.body.flipIcons ?? "false").toString().toLowerCase() === "true";
      const arabicDigits = (req.body.arabicDigits ?? "false").toString().toLowerCase() === "true";
      const mirrorPositions = (req.body.mirrorPositions ?? "false").toString().toLowerCase() === "true";
      const arabicFont = (req.body.arabicFont as string) || "Cairo";

      // Agent D (Designer) parameters
      const brandDark = (req.body.brandDark as string) || "#0D2A47";
      const brandLight = (req.body.brandLight as string) || "#FFFFFF";
      const minContrast = parseFloat(req.body.minContrast || "4.5");
      const flipDirectionalIcons = (req.body.flipDirectionalIcons ?? "true").toString().toLowerCase() === "true";
      const snapIcons = (req.body.snapIcons ?? "true").toString().toLowerCase() === "true";
      const iconMarginEmu = parseInt(req.body.iconMarginEmu || "80000");

      const tmp = mkTempDir();
      const inPath = writeBuf(tmp, "in.pptx", pptx.buffer);
      const rtlPath = path.join(tmp, "rtl.pptx");
      const finalPath = path.join(tmp, "final.pptx");
      const mapPath = map ? writeBuf(tmp, "map.json", map.buffer) : null;
      const auditPath = path.join(tmp, "audit.json");

      const transformerScript = path.resolve(path.join(__dirname, "..", "..", "rtl_pptx_transformer.py"));
      const designerScript = path.resolve(path.join(__dirname, "..", "..", "designer_agent.py"));

      // Step 1: Agent T - Translation + RTL
      const argsT = [transformerScript, "transform", inPath, "--out", rtlPath, "--arabic-font", arabicFont];
      if (mapPath) argsT.push("--map", mapPath);
      if (flipIcons) argsT.push("--flip-icons");
      if (arabicDigits) argsT.push("--arabic-digits");
      argsT.push("--no-contrast-fix"); // Let Agent D handle contrast
      if (!mirrorPositions) argsT.push("--no-mirror");

      const resultT = await runPython(argsT, tmp);
      if (resultT.code !== 0) {
        console.error("Agent T failed:", resultT.stderr || resultT.stdout);
        return res.status(500).json({ error: "Translation/RTL failed", details: resultT.stderr || resultT.stdout });
      }

      // Step 2: Agent D - Design fix
      const argsD = [
        designerScript,
        "--in", rtlPath,
        "--out", finalPath,
        "--brand-dark", brandDark,
        "--brand-light", brandLight,
        "--min-contrast", minContrast.toString(),
        "--icon-margin-emu", iconMarginEmu.toString(),
        "--audit-out", auditPath
      ];
      if (flipDirectionalIcons) argsD.push("--flip-directional-icons");
      if (snapIcons) argsD.push("--snap-icons");

      const resultD = await runPython(argsD, tmp);
      if (resultD.code !== 0) {
        console.error("Agent D failed:", resultD.stderr || resultD.stdout);
        return res.status(500).json({ error: "Design fix failed", details: resultD.stderr || resultD.stdout });
      }

      const fileName = (pptx.originalname || "slides").replace(/\.pptx$/i, "") + "_AR_polished.pptx";
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      fs.createReadStream(finalPath)
        .on("close", () => fs.rmSync(tmp, { recursive: true, force: true }))
        .pipe(res);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e?.message || "internal error" });
    }
  }
);

// POST /transform-vision  (three-agent pipeline: T + D + Vision QA)
app.post(
  "/transform-vision",
  upload.fields([
    { name: "pptx", maxCount: 1 },
    { name: "map", maxCount: 1 }
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.files || !(req.files as any).pptx) return res.status(400).json({ error: "Missing pptx file" });
      const pptx = (req.files as any).pptx[0] as Express.Multer.File;
      const map = ((req.files as any).map?.[0] as Express.Multer.File) || null;

      // Agent T parameters
      const flipIcons = (req.body.flipIcons ?? "false").toString().toLowerCase() === "true";
      const arabicDigits = (req.body.arabicDigits ?? "false").toString().toLowerCase() === "true";
      const mirrorPositions = (req.body.mirrorPositions ?? "false").toString().toLowerCase() === "true";
      const arabicFont = (req.body.arabicFont as string) || "Cairo";

      // Agent D parameters
      const brandDark = (req.body.brandDark as string) || "#0D2A47";
      const brandLight = (req.body.brandLight as string) || "#FFFFFF";
      const minContrast = parseFloat(req.body.minContrast || "4.5");
      const flipDirectionalIcons = (req.body.flipDirectionalIcons ?? "true").toString().toLowerCase() === "true";
      const snapIcons = (req.body.snapIcons ?? "true").toString().toLowerCase() === "true";

      // Agent V parameters
      const apiKey = (req.body.apiKey as string) || process.env.ANTHROPIC_API_KEY || "";
      if (!apiKey) {
        return res.status(400).json({ error: "Missing Anthropic API key. Provide via apiKey param or ANTHROPIC_API_KEY env var" });
      }

      const tmp = mkTempDir();
      const inPath = writeBuf(tmp, "in.pptx", pptx.buffer);
      const rtlPath = path.join(tmp, "rtl.pptx");
      const designPath = path.join(tmp, "design.pptx");
      const mapPath = map ? writeBuf(tmp, "map.json", map.buffer) : null;
      const ocrReportPath = path.join(tmp, "ocr_report.json");
      const visionReportPath = path.join(tmp, "vision_report.json");

      const transformerScript = path.resolve(path.join(__dirname, "..", "..", "rtl_pptx_transformer.py"));
      const designerScript = path.resolve(path.join(__dirname, "..", "..", "designer_agent.py"));
      const visionScript = path.resolve(path.join(__dirname, "..", "..", "vision_qa_agent.py"));

      // Step 1: Agent T
      const argsT = [transformerScript, "transform", inPath, "--out", rtlPath, "--arabic-font", arabicFont];
      if (mapPath) argsT.push("--map", mapPath);
      if (flipIcons) argsT.push("--flip-icons");
      if (arabicDigits) argsT.push("--arabic-digits");
      argsT.push("--no-contrast-fix");
      if (!mirrorPositions) argsT.push("--no-mirror");

      const resultT = await runPython(argsT, tmp);
      if (resultT.code !== 0) {
        return res.status(500).json({ error: "Agent T failed", details: resultT.stderr || resultT.stdout });
      }

      // Step 2: Agent D with OCR validation
      const argsD = [
        designerScript,
        "--in", rtlPath,
        "--out", designPath,
        "--brand-dark", brandDark,
        "--brand-light", brandLight,
        "--min-contrast", minContrast.toString(),
        "--ocr-report", ocrReportPath
      ];
      if (flipDirectionalIcons) argsD.push("--flip-directional-icons");
      if (snapIcons) argsD.push("--snap-icons");

      const resultD = await runPython(argsD, tmp);
      if (resultD.code !== 0) {
        return res.status(500).json({ error: "Agent D failed", details: resultD.stderr || resultD.stdout });
      }

      // Step 3: Agent V (Vision QA)
      const argsV = [
        visionScript,
        "--in", designPath,
        "--report", visionReportPath,
        "--api-key", apiKey,
        "--slides", "all"
      ];

      const resultV = await runPython(argsV, tmp);
      if (resultV.code !== 0) {
        console.warn("Agent V failed (non-fatal):", resultV.stderr || resultV.stdout);
      }

      // Read reports
      let ocrReport = {};
      let visionReport = {};
      try {
        ocrReport = JSON.parse(fs.readFileSync(ocrReportPath, "utf-8"));
      } catch (e) {
        console.warn("Could not read OCR report:", e);
      }
      try {
        visionReport = JSON.parse(fs.readFileSync(visionReportPath, "utf-8"));
      } catch (e) {
        console.warn("Could not read Vision report:", e);
      }

      // Return PPTX with embedded QA reports in headers
      const fileName = (pptx.originalname || "slides").replace(/\.pptx$/i, "") + "_AR_QA.pptx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-OCR-Report", Buffer.from(JSON.stringify(ocrReport)).toString("base64"));
      res.setHeader("X-Vision-Report", Buffer.from(JSON.stringify(visionReport)).toString("base64"));

      fs.createReadStream(designPath)
        .on("close", () => fs.rmSync(tmp, { recursive: true, force: true }))
        .pipe(res);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e?.message || "internal error" });
    }
  }
);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`RTL PPTX API listening on http://localhost:${PORT}`);
});