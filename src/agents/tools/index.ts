import { ToolDef } from '../types';
import {
  readFileTool,
  readFileHandler,
  listDirTool,
  listDirHandler,
  writeFileTool,
  writeFileHandler,
  editFileTool,
  editFileHandler,
  deleteFileTool,
  deleteFileHandler,
  buildToolCallDiff,
  computeFileChange,
  FileChange,
  setLiveEditorPreviewEnabled,
} from './fileTools';
import { runTerminalCommandTool, runTerminalCommandHandler } from './terminalTools';
import { gitStatusTool, gitStatusHandler, gitDiffTool, gitDiffHandler } from './gitTools';
import { askUserTool, ASK_USER_TOOL_NAME } from './askUserTool';

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export { ASK_USER_TOOL_NAME };

export const allTools: ToolDef[] = [
  readFileTool,
  listDirTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  runTerminalCommandTool,
  gitStatusTool,
  gitDiffTool,
  askUserTool,
];

export { buildToolCallDiff, computeFileChange, FileChange, setLiveEditorPreviewEnabled };

export const toolHandlers: Record<string, ToolHandler> = {
  read_file: readFileHandler,
  list_dir: listDirHandler,
  write_file: writeFileHandler,
  edit_file: editFileHandler,
  delete_file: deleteFileHandler,
  run_terminal_command: runTerminalCommandHandler,
  git_status: gitStatusHandler,
  git_diff: gitDiffHandler,
};
