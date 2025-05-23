import puppeteer from "puppeteer";
import fs from "fs";
import { exec } from "child_process";

const STREAMER = "ilyaselmaliki";
const URL = `https://kick.com/${STREAMER}/clips?sort=date&range=all`;
const SEEN_FILE = "seen_clips.json";

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
    await new Promise((r) => setTimeout(r, 5000)); // attendre 5s
    const clips = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .map((img) => img.src)
        .filter((src) => src.includes("clips.kick.com/clips/"));
    });
    await browser.close();
    return clips;
  } catch (err) {
    console.error("Erreur de récupération via Puppeteer :", err.message);
    await browser.close();
    return [];
  }
}

function loadSeenClips() {
  if (!fs.existsSync(SEEN_FILE)) return [];
  return JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
}

function saveSeenClips(clips) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(clips, null, 2));
}

function downloadClip(url) {
  // Supprime /thumbnail.webp pour obtenir l'URL du clip
  let clipUrl = url.replace("/thumbnail.webp", "");

  // Extraire l'ID du clip (dernier segment de l'URL)
  const parts = clipUrl.split("/");
  const clipId = parts[parts.length - 1];

  // Reconstruire l'URL correcte pour yt-dlp avec le streamer connu
  clipUrl = `https://kick.com/${STREAMER}/clips/${clipId}`;

  console.log("Téléchargement du clip :", clipUrl);

  // Lancement de yt-dlp en ligne de commande
  exec(`yt-dlp "${clipUrl}" -o "clips/%(title)s.%(ext)s"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur téléchargement : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr : ${stderr}`);
      return;
    }
    console.log(`Téléchargement terminé:\n${stdout}`);
  });
}

async function main() {
  const seen = loadSeenClips();
  const current = await fetchClips();
  console.log("Clips trouvés:", current.length);

  const newClips = current.filter((clip) => !seen.includes(clip));

  if (newClips.length > 0) {
    console.log("🎉 Nouveau clip détecté !");
    newClips.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
      downloadClip(url);
    });

    saveSeenClips([...new Set([...seen, ...newClips])]);
  } else {
    console.log("Aucun nouveau clip.");
  }
}

main();
