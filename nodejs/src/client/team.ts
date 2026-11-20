/**
 * Team facade — org team / directory invite discovery (loxtep#4807).
 */

import type { TeamDirectoryApi } from './team-directory.js';

export interface TeamFacadeDeps {
  directory: TeamDirectoryApi;
}

export function createTeamFacade(deps: TeamFacadeDeps): {
  directory: TeamDirectoryApi;
} {
  return {
    directory: deps.directory,
  };
}

export type TeamFacade = ReturnType<typeof createTeamFacade>;
