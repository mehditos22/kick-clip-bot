// Patch fetch pour Node.js 18+ et supabase (fix duplex option)
import fetch from "node-fetch";
globalThis.fetch = (input, init = {}) => {
  if (init.body && !init.duplex) {
    init.duplex = "half";
  }
  return fetch(input, init);
};

import puppeteer from "puppeteer";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import path from "path";
import dotenv from "dotenv";
import { loadSeenClips, uploadSeenClips } from "./seenClipUtils.js";

dotenv.config();

const execPromise = util.promisify(exec);

const STREAMER = "ilyaselmaliki";
const URL = `https://kick.com/${STREAMER}/clips?sort=date&range=all`;
const CLIPS_DIR = "./clips";

// Supabase config
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
    await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

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
    console.error("❌ Erreur Puppeteer pendant le chargement de la page :", err.message);
    await browser.close();
    return [];
  }
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
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const { error } = await supabase.storage
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
  const seen = await loadSeenClips();
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

  await uploadSeenClips([...new Set([...seen, ...newClips])]);
}

main();
