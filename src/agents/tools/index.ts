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
  moveFileTool,
  moveFileHandler,
  buildToolCallDiff,
  computeFileChange,
  FileChange,
  setLiveEditorPreviewEnabled,
} from './fileTools';
import { runTerminalCommandTool, runTerminalCommandHandler } from './terminalTools';
import {
  gitStatusTool,
  gitStatusHandler,
  gitDiffTool,
  gitDiffHandler,
  gitAddTool,
  gitAddHandler,
  gitCommitTool,
  gitCommitHandler,
  gitBranchTool,
  gitBranchHandler,
  gitStashTool,
  gitStashHandler,
  generateCommitMessageTool,
  buildGenerateCommitMessageHandler,
} from './gitTools';
import { searchFilesTool, searchFilesHandler } from './searchTools';
import { getDiagnosticsTool, getDiagnosticsHandler } from './diagnosticsTools';
import { goToDefinitionTool, goToDefinitionHandler, findReferencesTool, findReferencesHandler } from './lspTools';
import { fetchUrlTool, fetchUrlHandler } from './webTools';
import { useSkillTool, useSkillHandler } from './skillTools';
import { askUserTool, ASK_USER_TOOL_NAME } from './askUserTool';

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export { ASK_USER_TOOL_NAME };

export const allTools: ToolDef[] = [
  readFileTool,
  listDirTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  moveFileTool,
  searchFilesTool,
  getDiagnosticsTool,
  goToDefinitionTool,
  findReferencesTool,
  fetchUrlTool,
  useSkillTool,
  runTerminalCommandTool,
  gitStatusTool,
  gitDiffTool,
  gitAddTool,
  gitCommitTool,
  gitBranchTool,
  gitStashTool,
  generateCommitMessageTool,
  askUserTool,
];

export { buildToolCallDiff, computeFileChange, FileChange, setLiveEditorPreviewEnabled, buildGenerateCommitMessageHandler };

export const toolHandlers: Record<string, ToolHandler> = {
  read_file: readFileHandler,
  list_dir: listDirHandler,
  write_file: writeFileHandler,
  edit_file: editFileHandler,
  delete_file: deleteFileHandler,
  move_file: moveFileHandler,
  search_files: searchFilesHandler,
  get_diagnostics: getDiagnosticsHandler,
  go_to_definition: goToDefinitionHandler,
  find_references: findReferencesHandler,
  fetch_url: fetchUrlHandler,
  use_skill: useSkillHandler,
  run_terminal_command: runTerminalCommandHandler,
  git_status: gitStatusHandler,
  git_diff: gitDiffHandler,
  git_add: gitAddHandler,
  git_commit: gitCommitHandler,
  git_branch: gitBranchHandler,
  git_stash: gitStashHandler,
};
