/**
 * SOLARIS — Report Service (Real-time Streaming)
 * Handles LLM report generation via Backend → Model Service pipeline.
 * Tokens stream in real-time from the LLM via Server-Sent Events.
 */

const BACKEND_URL = 'http://localhost:8000';

// ═══ DOM REFERENCES ═══
let modal, reportBtn, closeBtn, loadingEl, contentEl, footerEl, statsEl;

// ═══ STATE ═══
let isGenerating = false;

/**
 * Initialize the report service — wire up button clicks and modal events.
 */
export function initReportService() {
  modal = document.getElementById('report-modal');
  reportBtn = document.getElementById('report-btn');
  closeBtn = document.getElementById('report-close-btn');
  loadingEl = document.getElementById('report-loading');
  contentEl = document.getElementById('report-content');
  footerEl = document.getElementById('report-footer');
  statsEl = document.getElementById('report-stats');

  if (!modal || !reportBtn) {
    console.warn('[REPORT] Modal or button not found in DOM');
    return;
  }

  reportBtn.addEventListener('click', handleGenerateReport);
  closeBtn.addEventListener('click', closeModal);

  const backdrop = modal.querySelector('.report-modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  console.log('[REPORT] Report service initialized (streaming mode)');
}

/**
 * Open the modal and trigger streaming report generation
 */
async function handleGenerateReport() {
  if (isGenerating) return;

  openModal();
  showLoading();

  isGenerating = true;
  reportBtn.classList.add('loading');

  try {
    await streamReport();
  } catch (err) {
    showError(err.message);
  } finally {
    isGenerating = false;
    reportBtn.classList.remove('loading');
  }
}

/**
 * Stream tokens from the Backend SSE endpoint in real-time
 */
async function streamReport() {
  const resp = await fetch(`${BACKEND_URL}/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: 'istanbul' }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `HTTP ${resp.status}`);
  }

  // Switch from loading to content display
  loadingEl.classList.add('hidden');
  contentEl.textContent = '';
  contentEl.classList.add('typing');
  footerEl.style.display = 'none';

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from the buffer
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6); // Remove "data: " prefix
      try {
        const data = JSON.parse(jsonStr);

        if (data.error) {
          // Error event from backend
          showError(data.error);
          return;
        }

        if (data.done) {
          // Final stats event — typing complete
          contentEl.classList.remove('typing');
          if (data.tokens_generated) {
            statsEl.textContent =
              `⚡ ${data.tokens_generated} tokens · ${data.elapsed_seconds}s · ${data.tokens_per_sec} tok/s · CUDA`;
            footerEl.style.display = 'block';
          }
          return;
        }

        if (data.token !== undefined) {
          // Append token in real-time
          contentEl.textContent += data.token;

          // Auto-scroll to bottom
          const body = document.getElementById('report-body');
          if (body) body.scrollTop = body.scrollHeight;
        }
      } catch (e) {
        // Skip unparseable lines
      }
    }
  }

  // Stream ended without a 'done' event — remove cursor
  contentEl.classList.remove('typing');
}

/**
 * Show an error message in the modal
 */
function showError(message) {
  loadingEl.classList.add('hidden');
  contentEl.classList.remove('typing');
  contentEl.innerHTML = `
    <div class="report-error">
      <span class="report-error-icon">⚠</span>
      <div>${message}</div>
    </div>
  `;
}

/**
 * Show loading state
 */
function showLoading() {
  loadingEl.classList.remove('hidden');
  contentEl.textContent = '';
  contentEl.classList.remove('typing');
  footerEl.style.display = 'none';
}

/**
 * Open the modal
 */
function openModal() {
  modal.classList.remove('hidden');
}

/**
 * Close the modal
 */
function closeModal() {
  modal.classList.add('hidden');
}
