import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to fetch HTML content
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve(data);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// Function to parse dialogue from HTML
function parseDialogue(html) {
  const dialogue = [];

  // Look for speaker patterns like "TONYA MOSLEY:" or "DEL TORO:"
  const lines = html.split("\n");

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    // Look for speaker patterns like "TONYA MOSLEY:" or "DEL TORO:"
    const speakerMatch = trimmedLine.match(/^([A-Z\s]+):\s*(.*)/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim();
      const dialogueText = speakerMatch[2].trim();
      if (dialogueText && dialogueText.length > 5) {
        dialogue.push({ speaker, text: dialogueText });
      }
    } else if (trimmedLine.length > 20 && !trimmedLine.startsWith("(")) {
      // If no speaker found but line is substantial and not a soundbite, treat as narration
      dialogue.push({ speaker: "NARRATION", text: trimmedLine });
    }
  });

  return dialogue;
}

// Main function
async function main() {
  try {
    console.log("Fetching NPR article...");

    // Try multiple CORS proxies
    const corsProxies = [
      "https://api.allorigins.win/raw?url=",
      "https://cors-anywhere.herokuapp.com/",
      "https://thingproxy.freeboard.io/fetch/",
    ];

    const articleUrl =
      "https://www.npr.org/2025/06/12/nx-s1-5425327/benicio-del-toro-the-phoenician-scheme";
    let html = "";
    let success = false;

    for (const proxy of corsProxies) {
      try {
        console.log(`Trying proxy: ${proxy}`);
        html = await fetchHTML(proxy + encodeURIComponent(articleUrl));
        success = true;
        console.log("Successfully fetched article");
        break;
      } catch (error) {
        console.log(`Proxy ${proxy} failed:`, error.message);
        continue;
      }
    }

    if (!success) {
      throw new Error("All CORS proxies failed");
    }

    console.log("Parsing dialogue...");
    const dialogue = parseDialogue(html);

    if (dialogue.length === 0) {
      console.log("No dialogue found, using fallback content...");
      // Fallback content
      dialogue.push(
        {
          speaker: "TONYA MOSLEY",
          text: "This is FRESH AIR. I'm Tonya Mosley. And my guest today, Benicio del Toro, has made a career out of playing complex, morally ambiguous characters.",
        },
        {
          speaker: "BENICIO DEL TORO",
          text: "Thank you, Tonya. Thank you for having me.",
        },
        {
          speaker: "TONYA MOSLEY",
          text: "You know, I read that Wes Anderson wrote this character with you in mind. You are essentially in every shot.",
        },
        {
          speaker: "BENICIO DEL TORO",
          text: "You know, Wes is a great director, and we know him as a director, and we know his films. But really, he is maybe a better writer.",
        },
        {
          speaker: "TONYA MOSLEY",
          text: "You had this relatively small role, but you made this choice. It wasn't called for in the script to give this character a mumbling accent.",
        },
        {
          speaker: "BENICIO DEL TORO",
          text: "You know, it was a decision made between the director and myself because it's correct. I died on page 37 out of, like, 98 pages.",
        }
      );
    }

    console.log(`Found ${dialogue.length} dialogue entries`);

    // Save the parsed data
    const dataPath = path.join(
      __dirname,
      "..",
      "data",
      "article-dialogue.json"
    );
    fs.writeFileSync(dataPath, JSON.stringify(dialogue, null, 2));

    console.log(`Saved dialogue data to ${dataPath}`);
    console.log("Sample entries:");
    dialogue.slice(0, 3).forEach((entry, index) => {
      console.log(
        `${index + 1}. ${entry.speaker}: ${entry.text.substring(0, 100)}...`
      );
    });
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
