import { appendFile, cp, lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFolder = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptFolder, "..");
const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const checkOnly = args.has("--check");
const configPath = resolve(scriptFolder, "config.json");
const statePath = resolve(scriptFolder, "state.json");
const outputPath = process.env.GITHUB_OUTPUT || "";
const protectedPaths = ["catalog.js", "music/", "covers/", ".release-train/"];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const normalize = (value) => value.split(sep).join("/").replace(/^\.\//, "");
const isProtected = (path) => protectedPaths.some((protectedPath) => path === protectedPath.replace(/\/$/, "") || path.startsWith(protectedPath));
const emit = async (name, value) => {
  const safe = String(value ?? "").replace(/[\r\n]+/g, " ");
  if (outputPath) await appendFile(outputPath, `${name}=${safe}\n`);
  else console.log(`${name}=${safe}`);
};
const finish = async ({ promoted = false, reason = "", release = null } = {}) => {
  await emit("promoted", promoted ? "true" : "false");
  await emit("reason", reason);
  await emit("release_id", release?.id || "");
  await emit("release_label", release?.label || "");
  await emit("release_version", release?.version || "");
};

const walk = async (folder, base = folder) => {
  const paths = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const absolute = resolve(folder, entry.name);
    const item = await lstat(absolute);
    if (item.isSymbolicLink()) throw new Error(`Release bundle contains a symbolic link: ${normalize(relative(base, absolute))}`);
    if (entry.isDirectory()) paths.push(...await walk(absolute, base));
    else if (entry.isFile()) paths.push(normalize(relative(base, absolute)));
  }
  return paths;
};

const validateRelease = async (release) => {
  if (!release || typeof release.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(release.id)) throw new Error("Release train contains an invalid release ID.");
  if (!Number.isFinite(Date.parse(release.dueAt))) throw new Error(`Release train contains an invalid date for ${release.id}.`);
  const bundle = resolve(root, release.bundle || "");
  if (!normalize(relative(root, bundle)).startsWith(".release-train/bundles/")) throw new Error(`Bundle path escaped the protected release folder for ${release.id}.`);
  const files = await walk(bundle);
  if (!files.includes("index.html") || !files.includes("package.json")) throw new Error(`${release.id} is missing its player or test package.`);
  const blocked = files.filter(isProtected);
  if (blocked.length) throw new Error(`${release.id} contains protected live data: ${blocked.join(", ")}`);
  return { bundle, files };
};

const config = await readJson(configPath);
const state = await readJson(statePath);
if (config.version !== 1 || state.version !== 1 || !Array.isArray(config.releases) || !Array.isArray(state.completed)) throw new Error("Release train configuration is not supported.");
if (!Number.isFinite(config.minimumHoursBetweenPromotions) || config.minimumHoursBetweenPromotions < 24) throw new Error("Release spacing must be at least 24 hours.");
if (new Set(config.releases.map((release) => release.id)).size !== config.releases.length) throw new Error("Release train IDs must be unique.");

const validated = new Map();
for (const release of config.releases) validated.set(release.id, await validateRelease(release));
if (checkOnly) {
  await finish({ reason: `Validated ${validated.size} protected release bundles.` });
  process.exit(0);
}

const release = config.releases.find((candidate) => !state.completed.includes(candidate.id));
if (!release) {
  await finish({ reason: "Every scheduled update pair has already been promoted." });
  process.exit(0);
}

const now = new Date();
if (!force && now.getTime() < Date.parse(release.dueAt)) {
  await finish({ reason: `${release.label} are waiting until ${release.dueAt}.`, release });
  process.exit(0);
}

const minimumGap = config.minimumHoursBetweenPromotions * 60 * 60 * 1000;
const lastPromoted = Date.parse(state.lastPromotedAt || "");
if (!force && Number.isFinite(lastPromoted) && now.getTime() - lastPromoted < minimumGap) {
  const nextAllowed = new Date(lastPromoted + minimumGap).toISOString();
  await finish({ reason: `${release.label} are waiting for the protected spacing window until ${nextAllowed}.`, release });
  process.exit(0);
}

const { bundle } = validated.get(release.id);
for (const entry of await readdir(bundle, { withFileTypes: true })) {
  if (entry.name === ".github") continue;
  const source = resolve(bundle, entry.name);
  const destination = resolve(root, entry.name);
  const relativeDestination = normalize(relative(root, destination));
  if (isProtected(relativeDestination)) throw new Error(`Promotion attempted to write protected data: ${relativeDestination}`);
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false, preserveTimestamps: true });
}

const promotedAt = now.toISOString();
const nextState = {
  version: 1,
  lastPromotedAt: promotedAt,
  completed: [...state.completed, release.id],
};
const temporaryState = `${statePath}.next`;
await writeFile(temporaryState, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
await rename(temporaryState, statePath);
await writeFile(resolve(root, "release-train-status.json"), `${JSON.stringify({
  currentVersion: release.version,
  releaseId: release.id,
  releaseLabel: release.label,
  promotedAt,
  nextReleaseId: config.releases.find((candidate) => !nextState.completed.includes(candidate.id))?.id || null,
}, null, 2)}\n`, "utf8");

await finish({ promoted: true, reason: `${release.label} copied into the live app.`, release });
