import express, { Request, Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import { Queue, Worker, FlowProducer, Job } from "bullmq";
import * as fs from "fs";
import * as path from "path";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

// Load .env file
dotenv.config();

// ========== Configuration ==========
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

// Project root: go up from server/src or server/dist to KSA-AI-TRANSLATE
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, "..", "..");
const PYTHON_BIN = process.env.PYTHON_BIN || path.join(PROJECT_ROOT, ".venv", "bin", "python");
const JOBS_DIR = process.env.JOBS_DIR || path.join(PROJECT_ROOT, "jobs");
const PORT = parseInt(process.env.PORT || "3000");

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

// ========== Ensure jobs directory exists ==========
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

console.log("Configuration:", {
  PROJECT_ROOT,
  REDIS_HOST,
  REDIS_PORT,
  PYTHON_BIN,
  JOBS_DIR,
  PORT
});

// ========== Types ==========
interface JobData {
  jobId: string;
  inputPptx?: string;
  mapJson?: string;
  brandDark?: string;
  brandLight?: string;
  minContrast?: string;
  flipDirectionalIcons?: boolean;
  snapIcons?: boolean;
  apiKey?: string;
}

interface Manifest {
  jobId: string;
  createdAt: string;
  status: string;
  input: {
    pptx: string;
    map?: string;
  };
  outputs: {
    rtl?: string;
    design?: string;
    audit?: string;
    visionReport?: string;
  };
  errors: string[];
}

// ========== Helper Functions ==========
function runPython(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const py = spawn(PYTHON_BIN, args, { cwd });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));
    py.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function getJobDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

function getManifestPath(jobId: string): string {
  return path.join(getJobDir(jobId), "manifest.json");
}

function readManifest(jobId: string): Manifest {
  const manifestPath = getManifestPath(jobId);
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

function updateManifest(jobId: string, updates: Partial<Manifest>) {
  const manifestPath = getManifestPath(jobId);
  const manifest = readManifest(jobId);
  const updated = { ...manifest, ...updates };
  fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2));
}

// ========== BullMQ Queues ==========
const agentTQueue = new Queue<JobData>("agent-t", { connection });
const agentDQueue = new Queue<JobData>("agent-d", { connection });
const agentVQueue = new Queue<JobData>("agent-v", { connection });
const flowProducer = new FlowProducer({ connection });

// ========== Worker: Agent T (Translation + RTL) - LangGraph Pipeline ==========
const agentTWorker = new Worker<JobData>(
  "agent-t",
  async (job: Job<JobData>) => {
    const { jobId } = job.data;
    const jobDir = getJobDir(jobId);
    const manifest = readManifest(jobId);

    console.log(`[Agent T] Processing job ${jobId} with LangGraph pipeline`);

    try {
      updateManifest(jobId, { status: "running_agent_t" });

      const inputPptx = manifest.input.pptx;
      const mapJson = manifest.input.map;
      const outputPptx = path.join(jobDir, "rtl.pptx");

      // Use LangGraph multi-agent pipeline
      const pipelineScript = path.join(PROJECT_ROOT, "graph_rtl_pipeline.py");
      const args = [
        pipelineScript,
        "--in",
        inputPptx,
        "--out",
        outputPptx,
        "--mirror",                          // Mirror shape positions for RTL
        "--flip-icons",                      // Flip directional icons
        "--arabic-font", "Noto Naskh Arabic", // Apply Arabic font
        "--arabic-digits",                   // Convert to Arabic-Indic digits (٠-٩)
      ];

      if (mapJson) {
        args.push("--map", mapJson);
      }

      const result = await runPython(args, jobDir);

      if (result.code !== 0) {
        const error = `Agent T (LangGraph) failed: ${result.stderr || result.stdout}`;
        manifest.errors.push(error);
        updateManifest(jobId, { errors: manifest.errors, status: "failed_agent_t" });
        throw new Error(error);
      }

      manifest.outputs.rtl = outputPptx;
      updateManifest(jobId, {
        outputs: manifest.outputs,
        status: "completed_agent_t"
      });

      console.log(`[Agent T] Completed job ${jobId} - LangGraph pipeline succeeded`);
      console.log(`[Agent T] Pipeline logs:\n${result.stdout}`);
      return { rtlPath: outputPptx };
    } catch (error: any) {
      console.error(`[Agent T] Error:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 1000,
    },
  }
);

// ========== Worker: Agent D (Designer + Pixel-Based Contrast Fixes) ==========
const agentDWorker = new Worker<JobData>(
  "agent-d",
  async (job: Job<JobData>) => {
    const { jobId, brandDark, brandLight, minContrast, flipDirectionalIcons, snapIcons } = job.data;
    const jobDir = getJobDir(jobId);
    const manifest = readManifest(jobId);

    console.log(`[Agent D] Processing job ${jobId}`);

    try {
      updateManifest(jobId, { status: "running_agent_d" });

      const inputPptx = manifest.outputs.rtl!;
      const outputPptx = path.join(jobDir, "design.pptx");
      const auditPath = path.join(jobDir, "audit_pixel.json");

      // Use pixel-based contrast agent with icon features
      const pixelContrastScript = path.join(PROJECT_ROOT, "pixel_contrast_agent.py");
      const args = [
        pixelContrastScript,
        "--in",
        inputPptx,
        "--out",
        outputPptx,
        "--brand-dark",
        brandDark || "#0D2A47",
        "--brand-light",
        brandLight || "#FFFFFF",
        "--min-contrast",
        minContrast || "4.5",
        "--dpi",
        "300",
        "--pad",
        "6",
        "--audit-out",
        auditPath,
      ];

      // Add icon flipping (enabled by default, can be disabled)
      if (flipDirectionalIcons !== false) {
        args.push("--flip-icons");
      }

      // Icon snapping is disabled by default (breaks layout sometimes)
      if (snapIcons === true) {
        args.push("--snap-icons");
      }

      const result = await runPython(args, jobDir);

      if (result.code !== 0) {
        const error = `Agent D failed: ${result.stderr || result.stdout}`;
        manifest.errors.push(error);
        updateManifest(jobId, { errors: manifest.errors, status: "failed_agent_d" });
        throw new Error(error);
      }

      manifest.outputs.design = outputPptx;
      manifest.outputs.audit = auditPath;
      updateManifest(jobId, {
        outputs: manifest.outputs,
        status: "completed_agent_d"
      });

      console.log(`[Agent D] Completed job ${jobId}`);
      return { designPath: outputPptx, auditPath };
    } catch (error: any) {
      console.error(`[Agent D] Error:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

// ========== Worker: Agent V (Vision QA) ==========
const agentVWorker = new Worker<JobData>(
  "agent-v",
  async (job: Job<JobData>) => {
    const { jobId, apiKey } = job.data;
    const jobDir = getJobDir(jobId);
    const manifest = readManifest(jobId);

    console.log(`[Agent V] Processing job ${jobId}`);

    try {
      updateManifest(jobId, { status: "running_agent_v" });

      const inputPptx = manifest.outputs.design!;
      const visionReportPath = path.join(jobDir, "vision_report.json");

      const visionScript = path.join(PROJECT_ROOT, "vision_qa_agent.py");
      const args = [
        visionScript,
        "--in",
        inputPptx,
        "--report",
        visionReportPath,
        "--slides",
        "all",
      ];

      if (apiKey) {
        args.push("--api-key", apiKey);
      }

      const result = await runPython(args, jobDir);

      // Vision QA is non-fatal - we log but don't fail the job
      if (result.code !== 0) {
        console.warn(`[Agent V] Warning for job ${jobId}:`, result.stderr || result.stdout);
        fs.writeFileSync(
          visionReportPath,
          JSON.stringify({ error: "Vision QA failed", details: result.stderr || result.stdout }, null, 2)
        );
      }

      manifest.outputs.visionReport = visionReportPath;
      updateManifest(jobId, {
        outputs: manifest.outputs,
        status: "completed"
      });

      console.log(`[Agent V] Completed job ${jobId}`);
      return { visionReportPath };
    } catch (error: any) {
      console.error(`[Agent V] Error:`, error);
      // Non-fatal for Vision QA
      updateManifest(jobId, { status: "completed_without_vision" });
      return { error: error.message };
    }
  },
  {
    connection,
    concurrency: 1, // Vision is slow, limit concurrency
  }
);

// ========== Express API ==========
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    redis: `${REDIS_HOST}:${REDIS_PORT}`,
    python: PYTHON_BIN,
    jobsDir: JOBS_DIR,
  });
});

// Submit a new job (creates flow: T → D → V)
app.post(
  "/submit",
  upload.fields([
    { name: "pptx", maxCount: 1 },
    { name: "map", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const pptxFile = files.pptx?.[0];

      if (!pptxFile) {
        return res.status(400).json({ error: "Missing pptx file" });
      }

      const mapFile = files.map?.[0];

      // Create job ID and directory
      const jobId = nanoid();
      const jobDir = getJobDir(jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      // Save uploaded files
      const inputPptxPath = path.join(jobDir, "input.pptx");
      fs.writeFileSync(inputPptxPath, pptxFile.buffer);

      let mapPath: string | undefined;
      if (mapFile) {
        mapPath = path.join(jobDir, "map.json");
        fs.writeFileSync(mapPath, mapFile.buffer);
      }

      // Create manifest
      const manifest: Manifest = {
        jobId,
        createdAt: new Date().toISOString(),
        status: "queued",
        input: {
          pptx: inputPptxPath,
          map: mapPath,
        },
        outputs: {},
        errors: [],
      };
      fs.writeFileSync(getManifestPath(jobId), JSON.stringify(manifest, null, 2));

      // Extract options
      const brandDark = (req.body.brandDark as string) || "#0D2A47";
      const brandLight = (req.body.brandLight as string) || "#FFFFFF";
      const minContrast = (req.body.minContrast as string) || "4.5";
      const flipDirectionalIcons = req.body.flipDirectionalIcons !== "false";
      const snapIcons = req.body.snapIcons !== "false";
      const apiKey = (req.body.apiKey as string) || process.env.OPENAI_API_KEY;

      // Create dependency flow: V → D → T (inverted because parent waits for children in BullMQ)
      // Agent T is the parent and runs LAST (after children complete)
      // Agent D is a child of T and runs AFTER T
      // Agent V is a child of D and runs AFTER D
      // So execution order is: V completes → D completes → T runs
      // NO! This is wrong. Let me use the correct BullMQ pattern.

      // In BullMQ FlowProducer:
      // - Parent runs FIRST
      // - Children run AFTER parent completes
      // So for T → D → V, we need: T is parent of D, D is parent of V
      await flowProducer.add({
        name: `agent-v-${jobId}`,
        queueName: "agent-v",
        data: {
          jobId,
          apiKey,
        },
        opts: {
          attempts: 2,
        },
        children: [
          {
            name: `agent-d-${jobId}`,
            queueName: "agent-d",
            data: {
              jobId,
              brandDark,
              brandLight,
              minContrast,
              flipDirectionalIcons,
              snapIcons,
            },
            opts: {
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 2000,
              },
            },
            children: [
              {
                name: `job-${jobId}`,
                queueName: "agent-t",
                data: { jobId },
                opts: {
                  attempts: 3,
                  backoff: {
                    type: "exponential",
                    delay: 2000,
                  },
                },
              },
            ],
          },
        ],
      });

      console.log(`[API] Created job ${jobId} with flow`);

      return res.json({
        ok: true,
        jobId,
        status: "queued",
        checkStatus: `/status/${jobId}`,
        download: `/download/${jobId}`,
      });
    } catch (error: any) {
      console.error("[API] Submit error:", error);
      return res.status(500).json({ error: error.message || "Internal error" });
    }
  }
);

// Get job status
app.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const manifestPath = getManifestPath(jobId);

    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: "Job not found" });
    }

    const manifest = readManifest(jobId);
    return res.json({
      ok: true,
      jobId: manifest.jobId,
      status: manifest.status,
      createdAt: manifest.createdAt,
      outputs: manifest.outputs,
      errors: manifest.errors,
    });
  } catch (error: any) {
    console.error("[API] Status error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Download final PPTX
app.get("/download/:jobId", (req, res) => {
  try {
    const { jobId } = req.params;
    const manifest = readManifest(jobId);

    const outputPath = manifest.outputs.design || manifest.outputs.rtl;
    if (!outputPath || !fs.existsSync(outputPath)) {
      return res.status(404).json({ error: "Output not ready yet" });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${jobId}_AR.pptx"`);
    fs.createReadStream(outputPath).pipe(res);
  } catch (error: any) {
    console.error("[API] Download error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Download QA reports
app.get("/reports/:jobId", (req, res) => {
  try {
    const { jobId } = req.params;
    const manifest = readManifest(jobId);

    const reports: any = {};

    if (manifest.outputs.audit && fs.existsSync(manifest.outputs.audit)) {
      reports.pixelContrast = JSON.parse(fs.readFileSync(manifest.outputs.audit, "utf-8"));
    }

    if (manifest.outputs.visionReport && fs.existsSync(manifest.outputs.visionReport)) {
      reports.vision = JSON.parse(fs.readFileSync(manifest.outputs.visionReport, "utf-8"));
    }

    return res.json({ ok: true, jobId, reports });
  } catch (error: any) {
    console.error("[API] Reports error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 RTL PPTX Orchestrator running on http://localhost:${PORT}`);
  console.log(`📊 Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`🐍 Python: ${PYTHON_BIN}`);
  console.log(`📁 Jobs: ${JOBS_DIR}\n`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing workers and queues...");
  await agentTWorker.close();
  await agentDWorker.close();
  await agentVWorker.close();
  await agentTQueue.close();
  await agentDQueue.close();
  await agentVQueue.close();
  await flowProducer.close();
  process.exit(0);
});
