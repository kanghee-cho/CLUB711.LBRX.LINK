const form = document.querySelector("#unlock-form");
const password = document.querySelector("#password");
const button = form.querySelector("button");
const status = document.querySelector("#status");

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function decryptPayload(payload, passphrase) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64(payload.salt),
      iterations: payload.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(payload.iv) },
    key,
    decodeBase64(payload.ciphertext),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

function showError(message, error) {
  console.error("Unable to open CLUB711:", error);
  status.textContent = message;
  status.dataset.error = "";
  password.value = "";
  button.disabled = false;
  password.focus();
}

if (!globalThis.crypto?.subtle) {
  status.textContent = "HTTPS와 Web Crypto를 지원하는 브라우저에서 열어주세요.";
  status.dataset.error = "";
  button.disabled = true;
} else {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.removeAttribute("data-error");
    status.textContent = "공지와 입금현황을 열고 있습니다...";

    let html;
    try {
      const payload = JSON.parse(document.querySelector("#encrypted-page").textContent);
      html = await decryptPayload(payload, password.value);
    } catch (error) {
      showError("페이지를 열지 못했습니다. 비밀번호를 확인해주세요. 파일이 손상된 경우에도 열리지 않습니다.", error);
      return;
    }

    try {
      const response = await fetch("data/payments.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Payment data request failed: HTTP ${response.status}`);
      const payload = await response.json();
      window.club711Ledger = JSON.parse(await decryptPayload(payload, password.value));
    } catch (error) {
      showError("입금현황을 열지 못했습니다. HTML과 JSON을 같은 비밀번호로 암호화해 함께 게시했는지 확인하세요.", error);
      return;
    }

    password.value = "";
    // Replace the document so inline and external scripts run as in the original HTML.
    document.open();
    document.write(html);
    document.close();
  });
}
