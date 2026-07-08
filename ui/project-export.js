// ui/project-export.js - Download all 56 project files as a ZIP
import { showToast, t } from './dom.js';

const ALL_PROJECT_PATHS = [
  // Backend infra
  'backend/.env.example',
  'backend/API_CONTRACT.md',
  'backend/app/__init__.py',
  'backend/app/builders/__init__.py',
  'backend/app/builders/aab_builder.py',
  'backend/app/builders/apk_builder.py',
  'backend/app/builders/container_builder.py',
  'backend/app/cleanup.py',
  'backend/app/commands.py',
  'backend/app/db.py',
  'backend/app/errors.py',
  'backend/app/formats.py',
  'backend/app/main.py',
  'backend/app/pipeline.py',
  'backend/app/schemas.py',
  'backend/app/settings.py',
  'backend/app/signing.py',
  'backend/app/storage.py',
  'backend/app/worker.py',
  'backend/docker-compose.yml',
  'backend/Dockerfile',
  'backend/README.md',
  'backend/requirements.txt',
  'backend/scripts/init_data_dirs.sh',
  'backend/scripts/preflight.sh',
  'backend/scripts/smoke_test.sh',
  // Frontend root
  'index.html',
  'main.js',
  'state.js',
  'styles.css',
  'miniapp.i18n.json',
  // Frontend content
  'content/guides.js',
  // Frontend i18n
  'locales/en.json',
  // Frontend UI
  'ui/ai-analysis.js',
  'ui/apk-parser.js',
  'ui/apk-signer.js',
  'ui/apk-tab/actions.js',
  'ui/apk-tab/analysis-view.js',
  'ui/apk-tab/browser-view.js',
  'ui/apk-tab/helpers.js',
  'ui/apk-tab/mods-view.js',
  'ui/apk-tab/summary-view.js',
  'ui/apk-tab/upload-view.js',
  'ui/apk-tab/chat-controller.js',
  'ui/apk-tab/chat-view.js',
  'ui/skill-md/mcp-setup.js',
  'ui/skill-md/mod-steps.js',
  'ui/skill-md/generator.js',
  'ui/skill-md/mobile-tutorial.js',
  'ui/skill-md/skillmd-workflow.js',
  'ui/apk-workflow.js',
  'ui/dom.js',
  'ui/editor-transformers.js',
  'ui/pipeline-api.js',
  'ui/pipeline-panel-view.js',
  'ui/pipeline-storage.js',
  'ui/rebuild-handoff.js',
  'ui/tab-ai-view.js',
  'ui/tab-apk-view.js',
  'ui/tab-commands-view.js',
  'ui/tab-editor-view.js',
  'ui/tab-guides-view.js',
  'ui/tabs-view.js',
  'ui/project-export.js',
];

export async function downloadProjectZip() {
  const JSZip = window.JSZip;
  if (!JSZip) {
    showToast('JSZip not loaded — cannot create ZIP');
    return;
  }

  showToast('Building project ZIP...');

  const zip = new JSZip();
  let fetched = 0;
  let failed = 0;
  const errors = [];

  for (const path of ALL_PROJECT_PATHS) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        errors.push(`${path} (${response.status})`);
        failed++;
        continue;
      }
      const text = await response.text();
      zip.file(path, text);
      fetched++;
    } catch (error) {
      errors.push(`${path} (${error.message})`);
      failed++;
    }
  }

  if (fetched === 0) {
    showToast('No files could be fetched — try downloading from the workspace directly');
    return;
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'apk-structure-analyzer-full.zip';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  if (failed > 0) {
    console.warn(`ZIP exported: ${fetched} files included, ${failed} failed:`, errors);
    showToast(`Downloaded ${fetched} files (${failed} failed — see console)`);
  } else {
    showToast(`Downloaded all ${fetched} project files as ZIP`);
  }
}
