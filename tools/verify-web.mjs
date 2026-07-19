import { access, readFile } from "node:fs/promises";

const required = ["public/index.html", "public/app.js", "public/styles.css", "public/preflop-model.json"];
await Promise.all(required.map((file) => access(file)));
const model = JSON.parse(await readFile("public/preflop-model.json", "utf8"));
if (Object.keys(model).length < 1000) throw new Error("Preflop model export looks incomplete");
const spots = new Map();
for (const key of Object.keys(model)) {
  const spot = key.split("|").slice(1).join("|");
  spots.set(spot, (spots.get(spot) || 0) + 1);
}
if ([...spots.values()].some((count) => count !== 169)) throw new Error("A range-explorer spot is missing starting hands");
console.log(`Static app ready (${Object.keys(model).length} strategy nodes across ${spots.size} complete spots).`);
