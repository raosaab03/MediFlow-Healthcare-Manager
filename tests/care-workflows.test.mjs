import assert from "node:assert/strict";
import test from "node:test";
import { fallbackChat, fallbackPostVisit, fallbackSummary, generateCareChat, generatePostVisitSummary, generatePreVisitSummary } from "../lib/ai.ts";
import { decryptSecret, encryptSecret, signState, verifyState } from "../lib/secrets.ts";

test("red-flag symptoms are always escalated and include three clinician questions", () => {
  const summary = fallbackSummary("New severe chest pain and difficulty breathing");
  assert.equal(summary.urgency, "high");
  assert.equal(summary.suggestedQuestions.length, 3);
  assert.equal(summary.source, "fallback");
});

test("care assistant recommends the appropriate specialty without diagnosing", () => {
  const reply = fallbackChat("I have an itchy skin rash on my arm");
  assert.equal(reply.suggestedSpecialty, "Dermatology");
  assert.ok(reply.nextSteps.length >= 2);
  assert.match(reply.disclaimer, /not a diagnosis/i);
});

test("care assistant directs emergency symptoms to immediate medical care", () => {
  const reply = fallbackChat("I have chest pain and feel like I might faint");
  assert.equal(reply.urgency, "high");
  assert.match(reply.message, /emergency/i);
});

test("patient-friendly summaries retain only the prescribed medication details", () => {
  const summary = fallbackPostVisit("Discussed hydration and follow-up next week", ["Vitamin D 1000 IU — once daily for 7 days"]);
  assert.equal(summary.source, "fallback");
  assert.deepEqual(summary.medicationSchedule, ["Vitamin D 1000 IU — once daily for 7 days"]);
  assert.ok(summary.followUpSteps.length >= 2);
});

test("all AI workflows remain operational without an external model key", async () => {
  const [preVisit, chat, postVisit] = await Promise.all([
    generatePreVisitSummary("Persistent headache for two days"),
    generateCareChat("Persistent headache for two days"),
    generatePostVisitSummary("Monitor symptoms and return if they worsen", []),
  ]);
  assert.equal(preVisit.source, "fallback");
  assert.equal(chat.source, "fallback");
  assert.equal(chat.suggestedSpecialty, "Neurology");
  assert.equal(postVisit.source, "fallback");
});

test("Google OAuth tokens are encrypted and can only be decrypted with the configured secret", async () => {
  const encrypted = await encryptSecret("sensitive-google-token", "a-long-demo-job-runner-secret");
  assert.match(encrypted, /^v1:/);
  assert.doesNotMatch(encrypted, /sensitive-google-token/);
  assert.equal(await decryptSecret(encrypted, "a-long-demo-job-runner-secret"), "sensitive-google-token");
  await assert.rejects(() => decryptSecret(encrypted, "incorrect-secret"));
});

test("Google OAuth state signatures reject tampering", async () => {
  const payload = JSON.stringify({ email: "patient@example.com", issuedAt: Date.now() });
  const signed = await signState(payload, "a-long-demo-job-runner-secret");
  assert.equal(await verifyState(signed, "a-long-demo-job-runner-secret"), payload);
  assert.equal(await verifyState(signed, "incorrect-secret"), null);
});
