import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { promptPassword } from "../tools/encrypt.mjs";

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => { input.isRaw = raw; };
  let transcript = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      transcript += chunk.toString();
      callback();
    },
  });
  output.isTTY = true;
  return { input, output, transcript: () => transcript };
}

function nextPrompt() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("seven typed characters and Korean input are captured without echoing the password", async () => {
  for (const password of ["test711", "\uD14C\uC2A4\uD2B8\uBE44\uBC00\uBC88\uD638"]) {
    const term = terminal();
    const result = promptPassword(term.input, term.output);
    for (const character of password) term.input.write(character);
    term.input.write("\r");
    await nextPrompt();
    assert.match(term.transcript(), /\[7 characters\][\s\S]*Confirm passphrase/);
    term.input.write(`${password}\r`);
    assert.equal(await result, password);
    assert.ok(!term.transcript().includes(password));
    assert.equal(term.input.isRaw, false);
  }
});

test("short input retries before confirmation and a mismatch restarts both prompts", async () => {
  const term = terminal();
  const result = promptPassword(term.input, term.output);
  term.input.write("short6\r");
  await nextPrompt();
  assert.match(term.transcript(), /\[6 characters\]/);
  assert.ok(!term.transcript().includes("Confirm passphrase"));
  term.input.write("test711\r");
  await nextPrompt();
  term.input.write("wrong77\r");
  await nextPrompt();
  assert.match(term.transcript(), /do not match/);
  term.input.write("test711\r");
  await nextPrompt();
  term.input.write("test711\r");
  assert.equal(await result, "test711");
  assert.ok(!term.transcript().includes("short6"));
  assert.ok(!term.transcript().includes("wrong77"));
});

test("standard terminal editing does not count cursor escape sequences as password characters", async () => {
  const term = terminal();
  const result = promptPassword(term.input, term.output);
  term.input.write("test71x\u007f1\u001b[D\u001b[C\r");
  await nextPrompt();
  term.input.write("test711\r");
  assert.equal(await result, "test711");
});

test("Windows CRLF input is handled across both prompts", async () => {
  const term = terminal();
  const result = promptPassword(term.input, term.output);
  term.input.write("test711\r\n");
  await nextPrompt();
  term.input.write("test711\r\n");
  assert.equal(await result, "test711");
});

test("cancellation restores terminal mode without echoing input", async () => {
  const term = terminal();
  const result = promptPassword(term.input, term.output);
  const rejected = assert.rejects(result, /cancelled/);
  term.input.write("test711\u0003");
  await rejected;
  assert.equal(term.input.isRaw, false);
  assert.ok(!term.transcript().includes("test711"));
});

test("non-interactive streams fail explicitly", async () => {
  const term = terminal();
  term.input.isTTY = false;
  await assert.rejects(promptPassword(term.input, term.output), /interactive terminal/);
});
