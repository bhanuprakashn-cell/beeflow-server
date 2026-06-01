export async function processJob(job) {
  const payload = JSON.parse(job.payload_json);

  if (payload?.forceFail === true) {
    throw new Error('Forced failure for testing');
  }

  return {
    ok: true,
    synced_at: new Date().toISOString(),
  };
}
