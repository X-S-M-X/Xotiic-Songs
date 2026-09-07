/* Shared release rules. Browser and publishing tools use the same allowlist. */
((root) => {
  "use strict";
  const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
  const values = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(/[,;\n]/))
    .map((part) => clean(part)).filter(Boolean))];
  const key = (value) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const aliases = [
    ["Tensura", ["tensura", "that time i got reincarnated as a slime"], {
      "Rimuru Tempest": ["rimuru"], "Milim Nava": ["milim"], "Shizu Izawa": ["shizu"],
      "Hinata Sakaguchi": ["hinata sakaguchi"], "Chloe Aubert": ["chloe", "chronoa"],
      "Diablo": ["diablo"], "Testarossa": ["testarossa"], "Carrera": ["carrera", "carerra"],
      "Ultima": ["ultima tensura"], "Raine": ["raine"], "Mizeri": ["mizeri"],
      "Yuuki Kagurazaka": ["yuuki"], "Veldora Tempest": ["veldora"], "Shion": ["shion"]
    }],
    ["Bleach", ["bleach"], {"Ichigo Kurosaki": ["ichigo"], "Sosuke Aizen": ["aizen"], "Rukia Kuchiki": ["rukia"]}],
    ["Black Clover", ["black clover"], {"Asta": ["asta"], "Yuno": ["yuno"]}],
    ["Naruto", ["naruto"], {"Naruto Uzumaki": ["naruto"], "Sasuke Uchiha": ["sasuke"], "Itachi Uchiha": ["itachi"], "Pain": ["pain vs", "vs pain", "nagato"]}],
    ["One Piece", ["one piece"], {"Monkey D. Luffy": ["luffy"], "Roronoa Zoro": ["zoro"], "Bartholomew Kuma": ["kuma"], "Donquixote Doflamingo": ["doflamingo"]}],
    ["Attack on Titan", ["attack on titan", "aot"], {"Eren Yeager": ["eren"]}],
    ["Tokyo Ghoul", ["tokyo ghoul"], {"Ken Kaneki": ["kaneki"]}],
    ["Overlord", ["overlord"], {"Ainz Ooal Gown": ["ainz"]}],
    ["Tsukimichi", ["tsukimichi"], {"Makoto Misumi": ["makoto misumi"]}],
    ["The Eminence in Shadow", ["eminence in shadow", "eminience in shadow"], {"Cid Kagenou": ["cid kagenou"]}],
    ["Mushoku Tensei", ["mushoku tensei"], {"Rudeus Greyrat": ["rudeus", "oldeus"]}],
    ["The Seven Deadly Sins", ["seven deadly sins"], {"Meliodas": ["meliodas"], "Zeldris": ["zeldris"]}]
  ];
  const contains = (text, phrase) => (` ${key(text).replace(/[^a-z0-9]+/g, " ")} `)
    .includes(` ${key(phrase).replace(/[^a-z0-9]+/g, " ")} `);
  const normalizeFranchise = (value) => values(value).map((name) =>
    aliases.find(([canonical, names]) => [canonical, ...names].some((alias) => key(alias) === key(name)))?.[0] || name);
  const suggest = (record) => {
    // Titles, filenames and explicit metadata are evidence. Lyrics alone can mention unrelated characters.
    const text = [record.title, record.franchise, record.character, record.description, record.filename].flat().join(" ");
    const franchises = new Set(normalizeFranchise(record.franchise));
    const characters = new Set(values(record.character));
    const evidence = [];
    for (const [franchise, names, cast] of aliases) {
      if (names.some((alias) => contains(text, alias))) franchises.add(franchise);
      for (const [character, names] of Object.entries(cast)) {
        const found = names.find((alias) => contains(text, alias));
        if (found) { characters.add(character); franchises.add(franchise); evidence.push(`${character}: “${found}”`); }
      }
    }
    return { franchise: [...franchises].join(", "), character: [...characters].join(", "), evidence };
  };
  const publicNow = (record, now = Date.now()) => record.status === "published"
    || (record.status === "scheduled" && Number.isFinite(Date.parse(record.releaseAt)) && Date.parse(record.releaseAt) <= now);
  const fields = new Set(["id", "title", "artist", "album", "genre", "year", "duration", "audio", "cover", "status",
    "releaseType", "collection", "trackNumber", "discNumber", "franchise", "character", "mood", "energy", "vocalStyle", "performance", "tags",
    "credits", "explicit", "youtubeUrl", "spotifyUrl", "appleMusicUrl", "description", "lyrics", "lyricTimings", "relatedReleaseIds",
    "similarReleaseIds", "versionLabel", "createdAt", "updatedAt", "publishedAt", "releaseDate", "releaseAt"]);
  const publicRecord = (record, now = Date.now()) => {
    if (!publicNow(record, now)) throw new Error("Unreleased records must remain in private storage.");
    const output = Object.fromEntries(Object.entries(record).filter(([name]) => fields.has(name)));
    output.status = "published";
    delete output.releaseAt;
    return output;
  };
  const safeAssetPath = (value) => typeof value === "string" && /^(music|covers)\/[a-zA-Z0-9._/-]+$/.test(value)
    && !value.includes("..") && !value.includes("//");
  const safeUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; } };
  const api = { values, key, suggest, normalizeFranchise, publicNow, publicRecord, safeAssetPath, safeUrl };
  root.XotiicReleaseModel = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
