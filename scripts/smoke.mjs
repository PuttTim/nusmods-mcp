import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverEntry = resolve(fileURLToPath(import.meta.url), "../../dist/index.js");

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({
  command: "node",
  args: [serverEntry],
}));

const tools = (await client.listTools()).tools.map(t => t.name);
console.log("tools:", tools.join(", "));

const calls = [
  ["search_modules", { query: "linear algebra", acadYear: "2025-2026" }],
  ["get_module_info", { moduleCode: "MA2104", acadYear: "2025-2026" }],
  ["get_module_info", { moduleCode: "CS2103T", acadYear: "2025-2026" }],
  ["get_module_timetable", { moduleCode: "MA2104", semester: 1, acadYear: "2025-2026" }],
  ["list_academic_calendar", { acadYear: "2025-2026" }],
  ["decode_share_url", { url: "https://nusmods.com/timetable/sem-1/share?CS2103T=LEC:G12&CS2101=", acadYear: "2025-2026" }],
  ["encode_share_url", { semester: 1, selections: [{ moduleCode: "CS2103T", lessonType: "Lecture", classNo: "G12" }, { moduleCode: "MA2104", lessonType: "TUT", classNo: "1" }] }],
  ["get_faculty_schedule", { faculty: "soc", moduleCode: "CS2103T" }],
  ["get_faculty_schedule", { faculty: "math" }],
  ["get_module_reviews", { moduleCode: "CS2103T" }],
];
for (const [name, args] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  console.log(`\n=== ${name} (${text.length}B) ===\n${text.slice(0, 600)}`);
}
await client.close();
