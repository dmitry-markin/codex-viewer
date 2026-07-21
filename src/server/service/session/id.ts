import { resolve, sep } from "node:path";
import { codexSessionsRootPath } from "../paths";

export const encodeSessionId = (filePath: string) => {
  return Buffer.from(filePath).toString("base64url");
};

export const decodeSessionId = (id: string) => {
  const decoded = Buffer.from(id, "base64url").toString("utf-8");

  // Confine decoded session paths to the Codex sessions directory. All
  // legitimate session ids are encoded from file paths already under this
  // root, so anything outside it is a path-traversal attempt.
  const resolved = resolve(decoded);
  if (
    resolved !== codexSessionsRootPath &&
    !resolved.startsWith(`${codexSessionsRootPath}${sep}`)
  ) {
    throw new Error("Invalid session id: outside sessions directory");
  }

  return decoded;
};
