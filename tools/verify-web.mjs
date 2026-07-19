import { access, readFile } from "node:fs/promises";

const required = ["public/index.html", "public/app.js", "public/styles.css", "public/preflop-model.json"];
await Promise.all(required.map((file) => access(file)));
const model = JSON.parse(await readFile("public/preflop-model.json", "utf8"));
if (Object.keys(model).length < 1000) throw new Error("Preflop model export looks incomplete");
console.log(`Static app ready (${Object.keys(model).length} strategy nodes).`);
