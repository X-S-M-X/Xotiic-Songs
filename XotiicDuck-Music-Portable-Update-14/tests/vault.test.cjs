const test = require("node:test");
const assert = require("node:assert/strict");
const { createVault, unlockVault } = require("../admin/crypto.js");

test("encrypted vault unlocks only with matching credentials and repository", async () => {
  const input = { username: "artist", password: "a-strong-test-password", token: "github_pat_test_secret", owner: "x-s-m-x", repository: "Xotiic-Songs" };
  const vault = await createVault(input);
  assert.equal(vault.ciphertext.includes(input.token), false);
  assert.equal(await unlockVault({ vault, username: input.username, password: input.password, owner: input.owner, repository: input.repository }), input.token);
  await assert.rejects(unlockVault({ vault, username: input.username, password: "wrong-password-value", owner: input.owner, repository: input.repository }));
});
