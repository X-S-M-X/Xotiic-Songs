const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../admin/audio-files.js"), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const audio = context.window.XotiicAudioFiles;

test("artist console recognizes MP3 and WAV masters", () => {
  assert.equal(audio.extension({ name: "anthem.MP3", type: "" }), "mp3");
  assert.equal(audio.extension({ name: "anthem.WAV", type: "" }), "wav");
  assert.equal(audio.extension({ name: "master", type: "audio/x-wav" }), "wav");
  assert.equal(audio.isSupported({ name: "notes.txt", type: "text/plain" }), false);
});

test("new and replacement audio keep the selected format", () => {
  assert.equal(audio.path("new-song", { name: "master.wav" }), "music/new-song.wav");
  assert.equal(audio.path("new-song", { name: "master.mp3" }), "music/new-song.mp3");
  assert.equal(audio.path("../unsafe", { name: "master.wav" }), "");
});
