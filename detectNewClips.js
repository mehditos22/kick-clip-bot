import axios from "axios";
import { load } from "cheerio";
import fs from "fs";

const STREAMER = "ilyaselmaliki";
const URL = `https://kick.com/${STREAMER}/clips?sort=date&range=all`;
const SEEN_FILE = "seen_clips.json";

async function fetchClips() {
  try {
    const res = await axios.get(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const $ = load(res.data);
    const clips = [];

    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("/clip/")) {
        const fullUrl = "https://kick.com" + href;
        clips.push(fullUrl);
      }
    });

    return [...new Set(clips)];
  } catch (err) {
    console.error("Erreur de récupération :", err.message);
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

async function main() {
  const seen = loadSeenClips();
  const current = await fetchClips();
  const newClips = current.filter(clip => !seen.includes(clip));

  if (newClips.length > 0) {
    console.log("🎉 Nouveau clip détecté !");
    newClips.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));

    // Ici on pourrait lancer un téléchargement ou envoyer vers Insta/TikTok

    saveSeenClips([...new Set([...seen, ...newClips])]);
  } else {
    console.log("Aucun nouveau clip.");
  }
}

main();
