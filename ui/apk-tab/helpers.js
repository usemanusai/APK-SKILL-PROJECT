export function getApkResetPatch() {
  return {
    apkState: null,
    apkFile: null,
    apkManifest: null,
    apkCategories: null,
    apkKeyFiles: null,
    apkMods: [],
    apkAppliedMods: [],
    apkError: null,
    apkAnalysisError: null,
    apkAttempt: 0,
    apkMaxAttempts: 3,
    apkProgressMsg: '',
    apkBuildReport: null,
    apkBuildError: null,
    apkShowFileBrowser: false,
    apkExpandedMods: [],
    pipelineJobId: null,
    pipelineJob: null,
    pipelineLog: '',
    pipelineError: null,
  };
}
