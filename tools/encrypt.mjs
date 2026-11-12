import { webcrypto, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateLedger } from "../assets/ledger.js";

const root = new URL("../", import.meta.url);
const iterations = 600_000;

export async function encryptHtml(html, password) {
  if ([...password].length < 7) {
    throw new Error("Use a unique password or passphrase of at least 7 characters.");
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(html),
  );
  return {
    iterations,
    salt: Buffer.from(salt).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  };
}

export function renderPage(payload) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="no-referrer">
    <title>세븐일레븐</title>
    <link rel="stylesheet" href="assets/styles.css">
    <script src="assets/unlock.js" defer></script>
  </head>
  <body class="unlock-page">
    <main class="unlock-shell" aria-labelledby="unlock-title">
      <h1 id="unlock-title">세븐일레븐</h1>
      <p class="intro">전달받은 비밀번호를 입력하면, 공지와 입금현황을 확인할 수 있습니다.</p>
      <form id="unlock-form">
        <label for="password" class="sr-only">비밀번호</label>
        <div class="password-row">
          <input id="password" type="password" autocomplete="current-password" placeholder="비밀번호" required>
          <button type="submit">확인</button>
        </div>
        <p id="status" class="status" role="status" aria-live="polite"></p>
      </form>
      <noscript>이 페이지를 열려면 JavaScript를 허용해주세요.</noscript>
    </main>
    <script id="encrypted-page" type="application/json">${JSON.stringify(payload)}</script>
  </body>
</html>
`;
}

export async function promptPassword(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Run npm run encrypt in an interactive terminal. Password input is hidden.");
  }
  const muted = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const reader = createInterface({
    input,
    output: muted,
    terminal: true,
    historySize: 0,
    crlfDelay: Infinity,
  });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  reader.on("SIGINT", cancel);
  reader.on("close", cancel);
  const ask = async (prompt) => {
    output.write(prompt);
    const answer = await reader.question("", { signal: controller.signal });
    output.write(` [${[...answer].length} characters]\n`);
    return answer;
  };
  try {
    while (true) {
      const password = await ask("Passphrase (7+ characters, hidden): ");
      if ([...password].length < 7) {
        output.write("At least 7 characters are required. Please try again.\n");
        continue;
      }
      const confirmation = await ask("Confirm passphrase (hidden): ");
      const first = Buffer.from(password);
      const second = Buffer.from(confirmation);
      if (first.length === second.length && timingSafeEqual(first, second)) return password;
      output.write("Passphrases do not match. Please enter both again.\n");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      output.write("\n");
      throw new Error("Encryption cancelled.", { cause: error });
    }
    throw error;
  } finally {
    reader.removeListener("SIGINT", cancel);
    reader.removeListener("close", cancel);
    reader.close();
    input.pause();
    muted.end();
  }
}

async function main() {
  const source = new URL("private/club711.html", root);
  const destination = new URL("club711.html", root);
  const html = await readFile(source, "utf8");
  const ledger = validateLedger(JSON.parse(
    await readFile(new URL("private/payments.json", root), "utf8"),
  ));
  const password = await promptPassword();
  const payload = await encryptHtml(html, password);
  const encryptedLedger = await encryptHtml(JSON.stringify(ledger), password);
  const ledgerDestination = new URL("data/payments.json", root);
  await mkdir(new URL("data/", root), { recursive: true });
  await writeFile(ledgerDestination, `${JSON.stringify(encryptedLedger, null, 2)}\n`, "utf8");
  await writeFile(destination, renderPage(payload), "utf8");
  console.log(`Created ${fileURLToPath(destination)}`);
  console.log(`Created ${fileURLToPath(ledgerDestination)}`);
  console.log("Publish club711.html, data/payments.json and assets together. Never publish the private folder.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Encryption failed: ${error.message}`);
    process.exitCode = 1;
  });
}
