/// <reference types="node" />

let input = "";

process.stdin.on("data", (d) => {
  input += String(d);
});

process.stdin.on("end", () => {
  const lines = input.replaceAll("\r", "").split("\n");
  let inTags = false;

  for (const line of lines) {
    if (line === "tags:") {
      inTags = true;
      continue;
    }

    if (inTags && line.length > 0 && !line.startsWith(" ")) {
      break;
    }

    if (inTags) {
      const m = /^\s{2}- name:\s*(?<name>.+)/u.exec(line);

      if (m) {
        console.log(m.groups.name);
      }
    }
  }
});
