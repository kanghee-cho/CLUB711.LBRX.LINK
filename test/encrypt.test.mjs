import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { encryptHtml, renderPage } from "../tools/encrypt.mjs";

const password = "test711";
const html = '<!doctype html><html><body>PRIVATE_MARKER<script src="assets/site.js"></script></body></html>';
const ledger = { marker: "PRIVATE_LEDGER" };
const ledgerPayload = await encryptHtml(JSON.stringify(ledger), password);

test("the public page contains no plaintext and uses fresh salt and IV", async () => {
  const first = await encryptHtml(html, password);
  const second = await encryptHtml(html, password);
  const page = renderPage(first);
  assert.ok(!page.includes("PRIVATE_MARKER"));
  assert.ok(!page.includes(password));
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test("short passphrases are rejected", async () => {
  for (const short of ["", "short6", "\u{1F512}".repeat(6)]) {
    await assert.rejects(encryptHtml(html, short), /at least 7/);
  }
});

async function loadUnlock(payload, enteredPassword, options = {}) {
  const elements = {
    password: { value: enteredPassword, focus() { this.focused = true; } },
    button: { disabled: false },
    status: {
      textContent: "",
      dataset: {},
      removeAttribute() { delete this.dataset.error; },
    },
  };
  let submit;
  const writes = [];
  const errors = [];
  const requests = [];
  const window = {};
  const form = {
    querySelector: () => elements.button,
    addEventListener(event, callback) {
      assert.equal(event, "submit");
      submit = callback;
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === "#unlock-form") return form;
      if (selector === "#encrypted-page") return { textContent: JSON.stringify(payload) };
      return elements[selector.slice(1)];
    },
    open() { writes.push("open"); },
    write(content) { writes.push(content); },
    close() { writes.push("close"); },
  };
  const script = await readFile(new URL("../assets/unlock.js", import.meta.url), "utf8");
  vm.runInNewContext(script, {
    document, window, crypto: options.crypto ?? webcrypto,
    TextEncoder, TextDecoder, Uint8Array, atob,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: options.httpStatus === undefined || options.httpStatus === 200,
        status: options.httpStatus ?? 200,
        json: async () => options.ledgerPayload ?? ledgerPayload,
      };
    },
    console: { error: (...args) => errors.push(args) },
  });
  if (submit) await submit({ preventDefault() {} });
  return { elements, writes, errors, requests, window };
}

test("a seven-character password decrypts HTML and external JSON, preserving script markup", async () => {
  const result = await loadUnlock(await encryptHtml(html, password), password);
  assert.deepEqual(result.writes, ["open", html, "close"]);
  assert.equal(result.elements.password.value, "");
  assert.equal(result.errors.length, 0);
  assert.equal(JSON.stringify(result.window.club711Ledger), JSON.stringify(ledger));
  assert.equal(result.requests[0].url, "data/payments.json");
  assert.equal(result.requests[0].init.cache, "no-store");
});

test("wrong passwords and tampered ciphertext never render protected HTML", async () => {
  const payload = await encryptHtml(html, password);
  const tampered = Buffer.from(payload.ciphertext, "base64");
  tampered[0] ^= 1;
  for (const [data, input] of [
    [payload, "wrong-password"],
    [{ ...payload, ciphertext: tampered.toString("base64") }, password],
  ]) {
    const result = await loadUnlock(data, input);
    assert.deepEqual(result.writes, []);
    assert.equal(result.elements.button.disabled, false);
    assert.equal(result.elements.password.value, "");
    assert.equal(result.elements.password.focused, true);
    assert.equal(result.errors.length, 1);
    assert.equal(result.requests.length, 0);
    assert.match(result.elements.status.textContent, /비밀번호/);
  }
});

test("missing Web Crypto displays an error instead of pretending to unlock", async () => {
  const result = await loadUnlock({}, password, { crypto: {} });
  assert.equal(result.elements.button.disabled, true);
  assert.match(result.elements.status.textContent, /HTTPS.*Web Crypto/);
  assert.deepEqual(result.writes, []);
});

test("missing or undecryptable external JSON blocks opening instead of showing false totals", async () => {
  const payload = await encryptHtml(html, password);
  const wrongKey = await encryptHtml(JSON.stringify(ledger), "another-test-passphrase");
  const malformed = await encryptHtml("{broken json", password);
  for (const options of [
    { httpStatus: 404 },
    { ledgerPayload: wrongKey },
    { ledgerPayload: malformed },
  ]) {
    const result = await loadUnlock(payload, password, options);
    assert.deepEqual(result.writes, []);
    assert.equal(result.window.club711Ledger, undefined);
    assert.equal(result.elements.button.disabled, false);
    assert.equal(result.elements.password.value, "");
    assert.equal(result.errors.length, 1);
    assert.match(result.elements.status.textContent, /JSON/);
  }
});
