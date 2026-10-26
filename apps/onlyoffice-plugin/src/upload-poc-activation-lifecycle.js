// oxlint-disable prefer-await-to-then -- Publish the shared in-flight promise before activation starts, including ready-event races.
/** A pre-ready fallback never replaces the definitive content-ready attempt. */
export const createUploadPocActivationLifecycle = (activate, onError) => {
  let contentReady = false;
  let completedForReady = false;
  let pending = null;
  const start = () => {
    if (pending) {
      return pending;
    }
    if (completedForReady) {
      return Promise.resolve();
    }
    const readyAtStart = contentReady;
    pending = Promise.resolve()
      .then(activate)
      .catch(onError)
      .finally(() => {
        pending = null;
        completedForReady = readyAtStart;
        if (contentReady && !completedForReady) {
          return start();
        }
      });
    return pending;
  };
  return {
    fallback: start,
    ready: () => {
      contentReady = true;
      return start();
    },
  };
};
