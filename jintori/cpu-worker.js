import { chooseMove } from './cpu.js';

const workerScope = globalThis.self;

workerScope?.addEventListener?.('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'choose') return;

  const { token, state, difficulty } = message;
  try {
    const move = chooseMove(state, difficulty);
    workerScope.postMessage({ token, move });
  } catch (error) {
    workerScope.postMessage({
      token,
      error: {
        code: error?.code ?? 'CPU_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
