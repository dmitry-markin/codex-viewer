import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import { readLatestHistoryEntry } from "../codex/history";
import {
  findSessionRecordByUuid,
  getCachedSessionRecord,
  readSessionHeader,
} from "../codex/sessionFiles";
import { codexHistoryFilePath, codexSessionsRootPath } from "../paths";
import { encodeProjectId } from "../project/id";
import { encodeSessionId } from "../session/id";
import { type EventBus, getEventBus } from "./EventBus";

export class FileWatcherService {
  private watcher: FSWatcher | null = null;
  private projectWatchers: Map<string, FSWatcher> = new Map();
  private historyWatcher: FSWatcher | null = null;
  private eventBus: EventBus;

  constructor() {
    this.eventBus = getEventBus();
  }

  public startWatching(): void {
    if (this.watcher) {
      return;
    }

    try {
      console.log("Starting file watcher on:", codexSessionsRootPath);
      // Watch the Codex sessions directory
      this.watcher = watch(
        codexSessionsRootPath,
        { persistent: false, recursive: true },
        async (eventType, filename) => {
          if (!filename || !filename.endsWith(".jsonl")) return;

          const absolutePath = join(codexSessionsRootPath, filename);
          let projectId: string | null = null;

          if (existsSync(absolutePath)) {
            const header = await readSessionHeader(absolutePath);
            if (header?.workspacePath) {
              projectId = encodeProjectId(header.workspacePath);
            }
          }

          if (!projectId) {
            const cached = getCachedSessionRecord(absolutePath);
            if (cached?.workspacePath) {
              projectId = encodeProjectId(cached.workspacePath);
            }
          }

          const sessionId = encodeSessionId(absolutePath);

          this.eventBus.emit("project_changed", {
            type: "project_changed",
            data: {
              fileEventType: eventType,
              projectId,
            },
          });

          this.eventBus.emit("session_changed", {
            type: "session_changed",
            data: {
              projectId,
              sessionId,
              fileEventType: eventType,
            },
          });
        },
      );
      console.log("File watcher initialization completed");

      if (!this.historyWatcher && existsSync(codexHistoryFilePath)) {
        this.historyWatcher = watch(
          codexHistoryFilePath,
          { persistent: false },
          () => {
            void this.handleHistoryChange();
          },
        );
      }
    } catch (error) {
      console.error("Failed to start file watching:", error);
    }
  }

  private async handleHistoryChange(): Promise<void> {
    try {
      const latestEntry = await readLatestHistoryEntry();
      if (!latestEntry?.sessionId) {
        return;
      }

      const record = await findSessionRecordByUuid(latestEntry.sessionId);
      if (!record?.workspacePath) {
        return;
      }

      const projectId = encodeProjectId(record.workspacePath);
      const sessionId = encodeSessionId(record.filePath);

      this.eventBus.emit("project_changed", {
        type: "project_changed",
        data: {
          projectId,
          fileEventType: "change",
        },
      });

      this.eventBus.emit("session_changed", {
        type: "session_changed",
        data: {
          projectId,
          sessionId,
          fileEventType: "change",
        },
      });
    } catch (error) {
      console.error("Failed to process history change", error);
    }
  }

  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const [, watcher] of this.projectWatchers) {
      watcher.close();
    }
    this.projectWatchers.clear();

    if (this.historyWatcher) {
      this.historyWatcher.close();
      this.historyWatcher = null;
    }
  }
}

// Singleton instance
let watcherInstance: FileWatcherService | null = null;

export const getFileWatcher = (): FileWatcherService => {
  if (!watcherInstance) {
    console.log("Creating new FileWatcher instance");
    watcherInstance = new FileWatcherService();
  }
  return watcherInstance;
};
