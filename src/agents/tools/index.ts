import { ToolDef } from '../types';
import {
  readFileTool,
  readFileHandler,
  listDirTool,
  listDirHandler,
  writeFileTool,
  writeFileHandler,
  deleteFileTool,
  deleteFileHandler,
  buildToolCallDiff,
} from './fileTools';
import { runTerminalCommandTool, runTerminalCommandHandler } from './terminalTools';
import { gitStatusTool, gitStatusHandler, gitDiffTool, gitDiffHandler } from './gitTools';

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export const allTools: ToolDef[] = [
  readFileTool,
  listDirTool,
  writeFileTool,
  deleteFileTool,
  runTerminalCommandTool,
  gitStatusTool,
  gitDiffTool,
];

export { buildToolCallDiff };

export const toolHandlers: Record<string, ToolHandler> = {
  read_file: readFileHandler,
  list_dir: listDirHandler,
  write_file: writeFileHandler,
  delete_file: deleteFileHandler,
  run_terminal_command: runTerminalCommandHandler,
  git_status: gitStatusHandler,
  git_diff: gitDiffHandler,
};
