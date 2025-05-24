// ✅ Patch fetch pour Node.js 18+ et Supabase Storage (duplex: 'half')
import fetch from 'node-fetch';
globalThis.fetch = (input, init = {}) => {
  if (init.body && !init.duplex) {
    init.duplex = 'half';
  }
  return fetch(input, init);
};

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;
const REMOTE_SEEN_FILE = 'seen_clips.json';
const TEMP_PATH = './seen_clips.json';

/**
 * Télécharge et charge le fichier seen_clips.json depuis Supabase Storage.
 * Retourne un tableau d'URLs de clips déjà vus.
 */
export async function loadSeenClips() {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(REMOTE_SEEN_FILE);

    if (error || !data) {
      console.warn("⚠️ Aucun fichier seen_clips.json trouvé dans Supabase. Utilisation d'une liste vide.");
      return [];
    }

    const buffer = await data.arrayBuffer();
    const text = Buffer.from(buffer).toString();
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch (err) {
    console.error("❌ Erreur lors du chargement de seen_clips.json :", err.message);
    return [];
  }
}

/**
 * Sauvegarde le tableau `clips` dans Supabase Storage sous seen_clips.json.
 * Écrase l'ancien fichier (upsert).
 */
export async function uploadSeenClips(clips) {
  try {
    // Sauvegarde temporaire locale
    fs.writeFileSync(TEMP_PATH, JSON.stringify(clips, null, 2));

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(REMOTE_SEEN_FILE, fs.createReadStream(TEMP_PATH), {
        contentType: 'application/json',
        upsert: true,
      });

    if (error) {
      console.error("❌ Erreur upload seen_clips.json :", error.message);
    } else {
      console.log("📤 seen_clips.json mis à jour sur Supabase.");
    }
  } catch (err) {
    console.error("❌ Erreur lors de l’upload de seen_clips.json :", err.message);
  }
}
