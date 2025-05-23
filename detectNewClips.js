import puppeteer from "puppeteer";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const execPromise = util.promisify(exec);

const STREAMER = "ilyaselmaliki";
const URL = `https://kick.com/${STREAMER}/clips?sort=date&range=all`;
const SEEN_FILE = "seen_clips.json";
const CLIPS_DIR = "./clips";

// Supabase config
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

// Crée le dossier clips s'il n'existe pas
if (!fs.existsSync(CLIPS_DIR)) {
  fs.mkdirSync(CLIPS_DIR);
}

async function fetchClips() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(URL, { waitUntil: "networkidle2" });
    await page.waitForTimeout(5000);

    const clips = await page.evaluate(() => {
      const clipUrls = new Set();
      document.querySelectorAll("img").forEach((img) => {
        const src = img.src;
        if (src.includes("clips.kick.com/clips/")) {
          const clipUrl = src.replace("/thumbnail.webp", "");
          clipUrls.add(clipUrl);
        }
      });
      return Array.from(clipUrls);
    });

    await browser.close();
    return clips;
  } catch (err) {
    console.error("Erreur Puppeteer :", err.message);
    await browser.close();
    return [];
  }
}

function loadSeenClips() {
  if (!fs.existsSync(SEEN_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveSeenClips(clips) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(clips, null, 2));
}

async function downloadClip(clipUrl) {
  const clipId = clipUrl.split("/").pop();
  const ytDlpUrl = `https://kick.com/${STREAMER}/clips/${clipId}`;
  const outputPath = `${CLIPS_DIR}/${clipId}.mp4`;

  const command = `yt-dlp "${ytDlpUrl}" -o "${outputPath}"`;

  try {
    await execPromise(command);
    console.log(`✅ Clip téléchargé : ${clipId}`);
    return outputPath;
  } catch (error) {
    console.error(`❌ Erreur téléchargement ${clipId} :`, error.message);
    return null;
  }
}

async function uploadToSupabase(filePath) {
  const fileName = path.basename(filePath);
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(`clips/${fileName}`, fs.createReadStream(filePath), {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    console.error("❌ Erreur upload Supabase :", error.message);
  } else {
    console.log(`📤 Upload réussi : ${fileName}`);
  }
}

async function main() {
  const seen = loadSeenClips();
  const current = await fetchClips();

  const newClips = current.filter((clip) => !seen.includes(clip));
  if (newClips.length === 0) {
    console.log("Aucun nouveau clip.");
    return;
  }

  console.log(`🎉 ${newClips.length} nouveau(x) clip(s) détecté(s) !`);

  for (const clipUrl of newClips) {
    const localPath = await downloadClip(clipUrl);
    if (localPath) await uploadToSupabase(localPath);
  }

  saveSeenClips([...new Set([...seen, ...newClips])]);
}

main();